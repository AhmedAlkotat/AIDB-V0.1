// DEVELOPMENT-ONLY simulation of the server's central processing queue (decisions 2, 3, 11, 22-24,
// 35, 38, 40, 45). Not part of production bundles.
//
// It plays the SERVER's part: it owns the work after "Start processing", independently of any
// screen. Leaving the review page (or the whole upload page) never cancels it. It runs the
// (mock) extraction of the selected pages in FIFO order, writes every result into the temporary
// document store, keeps the attempt log and the accepted results, and tells the owner through
// the notification system, without ever navigating anywhere.
//
// SIMULATED, NOT REAL: no durability (a reload forgets the queue), no restart recovery and no
// real resource management. `concurrency` and the delays are development values. The real
// durable queue, its recovery without loss or repetition (24) and the real concurrency (22) are
// the backend's job (Batch E).
//
// Two kinds of job share the one queue:
//   document  every selected page of a document without a successful extraction (the first
//             processing after "Start processing", or a retry without a new upload)
//   page      one page again, requested from the review screen (decision 38). The review session
//             that asked normally waits for the answer (it is "attached"); when it was closed the
//             job is "detached" and the queue itself finishes the job into the store.

import { checkExtractionResult } from '../domain/document/extractionResult.js'
import { hasMeaningfulContent } from '../domain/document/elements.js'
import { getPagesToProcess, WORKFLOW_PHASE } from '../domain/document/lifecycle.js'
import { addAcceptedResult, appendAttempt, ATTEMPT_SCOPE, ATTEMPT_STATUS, ATTEMPT_TRIGGER, nextAttemptNumber, updateAttempt } from '../domain/document/attempts.js'
import { JOB_KIND, JOB_STATE, createQueue, enqueue, getQueuePosition, listJobs, markRunning, pickJobsToStart, removeJob } from '../domain/document/queue.js'
import { NOTIFICATION_TYPE } from '../domain/notification/notification.js'
import { deepClone } from '../domain/document/utils.js'

export const QUEUE_BLOCKED = Object.freeze({ storageFull: 'storageFull' })
export const FORCED_FAILURE_CODE = 'PROCESSING_FAILED'
export const CANCELLED_CODE = 'CANCELLED'

const isAbort = (error) => error?.name === 'AbortError'

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Cancelled', 'AbortError'))
    }, { once: true })
  })
}

export function createMockProcessingQueue({
  store,
  processing, // the (mock) extraction service: extractPage({ documentId, pageNumber, attempt, signal })
  concurrency = 1,
  now = () => new Date(),
  isBlocked = () => null, // () => null | QUEUE_BLOCKED.*  (storage full: jobs wait, then resume)
  notify = () => {},
  recordAudit = () => {},
  recheckMs = 1000,
  startDelayMs = 0, // how long a document waits after its turn came, so "Pending" can be seen before "Processing"
  generateId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
} = {}) {
  let queue = createQueue()
  const controllers = new Map() // jobId -> AbortController of the running job
  const waiters = new Map() // jobId -> { resolve, reject } of an attached page job
  const detached = new Set() // jobIds of page jobs whose session was closed
  const listeners = new Set()
  const flags = { failNextDocument: false }
  let recheckTimer = null

  const iso = () => now().toISOString()
  const emit = () => {
    for (const listener of listeners) listener()
  }
  const setQueue = (next) => {
    queue = next
    emit()
  }

  // ---- store helpers (the queue writes as the server would) -----------------------------------
  const record = (documentId) => store.peek(documentId)
  const pageOf = (rec, pageNumber) => rec.snapshot.pages.find((page) => page.pageNumber === pageNumber)

  async function writePage(documentId, pageNumber, change) {
    const rec = record(documentId)
    if (!rec) return
    const page = pageOf(rec, pageNumber)
    if (!page) return
    await store.savePages(documentId, [change(deepClone(page))])
  }

  const setWorkflow = (documentId, patch) => record(documentId) && store.updateMeta(documentId, { workflow: patch })
  const addAttempt = (documentId, entry) => record(documentId) && store.updateMeta(documentId, { attempts: appendAttempt(record(documentId).attempts, entry) })
  const changeAttempt = (documentId, id, patch) => record(documentId) && store.updateMeta(documentId, { attempts: updateAttempt(record(documentId).attempts, id, patch) })

  // Applies or keeps a successful extraction of one page. A page with nothing on it takes the
  // result; a page with content (typed by hand, or an earlier result) keeps it and the result
  // becomes a candidate the user decides on (decisions 38 and 40). Returns what happened.
  async function acceptResult(documentId, pageNumber, attempt, elements) {
    const rec = record(documentId)
    const checked = checkExtractionResult(rec.snapshot, pageNumber, elements)
    if (!checked.ok) return { outcome: 'invalid', code: checked.code }
    const page = pageOf(rec, pageNumber)
    if (hasMeaningfulContent(page.elements)) {
      store.updateMeta(documentId, { candidates: { ...rec.candidates, [pageNumber]: { attempt, elements: checked.elements, receivedAt: iso() } } })
      return { outcome: 'candidate' }
    }
    await writePage(documentId, pageNumber, (draft) => ({
      ...draft,
      elements: deepClone(checked.elements),
      originalExtraction: { elements: deepClone(checked.elements) },
      processing: { status: 'succeeded', errorCode: null },
    }))
    store.updateMeta(documentId, { resultHistory: addAcceptedResult(record(documentId).resultHistory, pageNumber, { attempt, acceptedAt: iso(), elements: checked.elements }) })
    return { outcome: 'applied' }
  }

  // ---- document jobs ---------------------------------------------------------------------------
  async function runDocumentJob(job, signal) {
    const { documentId } = job
    let rec = record(documentId)
    if (!rec) return
    const trigger = rec.workflow.trigger ?? ATTEMPT_TRIGGER.upload
    const forceFail = flags.failNextDocument
    flags.failNextDocument = false

    if (startDelayMs > 0) {
      try {
        await sleep(startDelayMs, signal)
      } catch {
        // Cancelled (deleted) before it started: nothing was done.
        const left = record(documentId)
        if (left) {
          const anySucceeded = left.snapshot.pages.some((page) => page.processing.status === 'succeeded')
          setWorkflow(documentId, { phase: anySucceeded ? WORKFLOW_PHASE.completed : WORKFLOW_PHASE.failed, errorCode: anySucceeded ? null : CANCELLED_CODE })
        }
        return
      }
    }

    setWorkflow(documentId, { phase: WORKFLOW_PHASE.processing, startedAt: iso(), finishedAt: null, errorCode: null })
    recordAudit({ category: 'processing', action: trigger === ATTEMPT_TRIGGER.retry ? 'processingRetried' : 'processingStarted', actorId: rec.ownerId, subject: rec.name, outcome: 'success' })

    const startedAt = iso()
    const attemptId = generateId('att')
    // One number for the whole run: the pages of this run are on their Nth attempt too.
    const attemptNumber = nextAttemptNumber(rec.attempts, null)
    addAttempt(documentId, { id: attemptId, scope: ATTEMPT_SCOPE.document, attempt: attemptNumber, trigger, status: ATTEMPT_STATUS.cancelled, startedAt })

    let firstError = null
    let cancelled = false
    for (const pageNumber of getPagesToProcess(record(documentId).snapshot.pages)) {
      if (signal.aborted) {
        cancelled = true
        break
      }
      const before = pageOf(record(documentId), pageNumber).processing
      await writePage(documentId, pageNumber, (draft) => ({ ...draft, processing: { status: 'processing', errorCode: null } }))
      try {
        if (forceFail) throw Object.assign(new Error('Simulated failure.'), { code: FORCED_FAILURE_CODE })
        const attempt = Math.max(attemptNumber, nextAttemptNumber(record(documentId).attempts.filter((entry) => entry.id !== attemptId), pageNumber))
        const result = await processing.extractPage({ documentId, pageNumber, attempt, signal })
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        const accepted = await acceptResult(documentId, pageNumber, attempt, result.elements)
        if (accepted.outcome === 'invalid') throw Object.assign(new Error('Invalid extraction result.'), { code: accepted.code })
        if (accepted.outcome === 'candidate') {
          await writePage(documentId, pageNumber, (draft) => ({ ...draft, processing: before }))
        }
      } catch (error) {
        if (isAbort(error)) {
          cancelled = true
          await writePage(documentId, pageNumber, (draft) => ({ ...draft, processing: before }))
          break
        }
        firstError ??= error?.code ?? 'PROCESSING_FAILED'
        // A page that already holds content (typed by hand) keeps it and its earlier status.
        await writePage(documentId, pageNumber, (draft) => ({ ...draft, processing: hasMeaningfulContent(draft.elements) ? before : { status: 'failed', errorCode: error?.code ?? 'PROCESSING_FAILED' } }))
      }
    }

    rec = record(documentId)
    if (!rec) return
    const anySucceeded = rec.snapshot.pages.some((page) => page.processing.status === 'succeeded')
    const phase = anySucceeded ? WORKFLOW_PHASE.completed : WORKFLOW_PHASE.failed
    const errorCode = anySucceeded ? null : (cancelled ? CANCELLED_CODE : (firstError ?? 'PROCESSING_FAILED'))
    const status = cancelled ? ATTEMPT_STATUS.cancelled : (firstError && !anySucceeded ? ATTEMPT_STATUS.failed : ATTEMPT_STATUS.succeeded)
    changeAttempt(documentId, attemptId, { status, finishedAt: iso(), errorCode: cancelled ? CANCELLED_CODE : (firstError ?? null) })
    setWorkflow(documentId, { phase, finishedAt: iso(), errorCode })

    // The owner is told through the notification system, with a link only (decision 3). A
    // document the Admin deleted meanwhile (decision 45) needs no notification.
    if (!cancelled && !rec.deletedAt) {
      notify({ type: anySucceeded ? NOTIFICATION_TYPE.processingCompleted : NOTIFICATION_TYPE.processingFailed, documentId, documentName: rec.name, ownerId: rec.ownerId })
      if (!anySucceeded) recordAudit({ category: 'processing', action: 'processingFailed', actorId: rec.ownerId, subject: rec.name, outcome: 'failure' })
    }
  }

  // ---- page jobs ---------------------------------------------------------------------------------
  async function runPageJob(job, signal) {
    const { documentId, pageNumber } = job
    let result = null
    let failure = null
    try {
      result = await processing.extractPage({ documentId, pageNumber, attempt: job.attempt, signal })
    } catch (error) {
      failure = error
    }

    if (!detached.has(job.id)) {
      // The session that asked (or one that took the job back) is still here: it decides what to do with the answer.
      const waiter = waiters.get(job.id)
      if (failure) waiter?.reject(failure)
      else waiter?.resolve({ ...result, attempt: job.attempt })
      return
    }

    // The session was closed (the user left the page): the queue finishes the job itself.
    const rec = record(documentId)
    if (!rec || isAbort(failure)) return
    const startedAt = job.enqueuedAt
    const entry = { id: generateId('att'), scope: ATTEMPT_SCOPE.page, pageNumber, attempt: job.attempt, trigger: ATTEMPT_TRIGGER.reprocess, startedAt, finishedAt: iso() }
    if (failure) {
      const errorCode = failure?.code ?? 'PROCESSING_FAILED'
      addAttempt(documentId, { ...entry, status: ATTEMPT_STATUS.failed, errorCode })
      if (!hasMeaningfulContent(pageOf(rec, pageNumber).elements)) {
        await writePage(documentId, pageNumber, (draft) => ({ ...draft, processing: { status: 'failed', errorCode } }))
      }
      notify({ type: NOTIFICATION_TYPE.processingFailed, documentId, documentName: rec.name, ownerId: rec.ownerId })
      recordAudit({ category: 'processing', action: 'processingFailed', actorId: rec.ownerId, subject: rec.name, outcome: 'failure' })
      return
    }
    const accepted = await acceptResult(documentId, pageNumber, job.attempt, result.elements)
    addAttempt(documentId, { ...entry, status: accepted.outcome === 'candidate' ? ATTEMPT_STATUS.awaitingDecision : (accepted.outcome === 'applied' ? ATTEMPT_STATUS.succeeded : ATTEMPT_STATUS.failed), errorCode: accepted.outcome === 'invalid' ? accepted.code : null })
    notify({ type: NOTIFICATION_TYPE.processingCompleted, documentId, documentName: rec.name, ownerId: rec.ownerId })
  }

  // ---- the loop -----------------------------------------------------------------------------------
  async function execute(job) {
    const controller = new AbortController()
    controllers.set(job.id, controller)
    try {
      if (job.kind === JOB_KIND.document) await runDocumentJob(job, controller.signal)
      else await runPageJob(job, controller.signal)
    } catch (error) {
      // A job never takes the queue down: whoever waits for it is told, the rest carries on.
      waiters.get(job.id)?.reject(error)
    } finally {
      controllers.delete(job.id)
      waiters.delete(job.id)
      detached.delete(job.id)
      setQueue(removeJob(queue, job.id))
      pump()
    }
  }

  function pump() {
    clearTimeout(recheckTimer)
    recheckTimer = null
    const waiting = queue.jobs.some((job) => job.state === JOB_STATE.queued)
    if (!waiting) return
    if (isBlocked()) {
      // Storage is full (decision 35): nothing new starts; it resumes by itself when space is available.
      recheckTimer = setTimeout(pump, recheckMs)
      recheckTimer.unref?.()
      emit()
      return
    }
    for (const job of pickJobsToStart(queue, concurrency)) {
      setQueue(markRunning(queue, job.id))
      execute(queue.jobs.find((candidate) => candidate.id === job.id))
    }
  }

  // A document that disappeared (moved to the recycle bin or deleted for good) must not keep the
  // queue busy: its running work is stopped safely, what was completed stays in its record, and
  // the other documents are unaffected (decision 45).
  let dropping = false
  function dropDeleted() {
    if (dropping) return
    dropping = true
    try {
      dropDeletedNow()
    } finally {
      dropping = false
    }
  }
  function dropDeletedNow() {
    const gone = [...new Set(queue.jobs.map((job) => job.documentId))].filter((documentId) => !store.get(documentId))
    for (const documentId of gone) cancelDocument(documentId)
  }
  const unsubscribeStore = store.subscribe(dropDeleted)

  function cancelDocument(documentId) {
    for (const job of queue.jobs.filter((candidate) => candidate.documentId === documentId)) {
      controllers.get(job.id)?.abort()
      waiters.get(job.id)?.reject(new DOMException('Cancelled', 'AbortError'))
      waiters.delete(job.id)
    }
    // Waiting jobs simply leave the queue; running ones leave when they notice the abort.
    const waiting = queue.jobs.filter((job) => job.documentId === documentId && job.state === JOB_STATE.queued)
    if (waiting.length > 0) {
      const rec = record(documentId)
      if (rec && rec.workflow.phase === WORKFLOW_PHASE.pending) {
        const anySucceeded = rec.snapshot.pages.some((page) => page.processing.status === 'succeeded')
        setWorkflow(documentId, { phase: anySucceeded ? WORKFLOW_PHASE.completed : WORKFLOW_PHASE.failed, errorCode: anySucceeded ? null : CANCELLED_CODE })
      }
      setQueue({ ...queue, jobs: queue.jobs.filter((job) => !(job.documentId === documentId && job.state === JOB_STATE.queued)) })
    }
  }

  return {
    isMock: true,

    // Puts the whole document (the pages without a successful extraction) in the queue.
    submitDocument({ documentId, trigger = ATTEMPT_TRIGGER.upload }) {
      const queuedAt = iso()
      setWorkflow(documentId, { phase: WORKFLOW_PHASE.pending, queuedAt, startedAt: null, finishedAt: null, errorCode: null, trigger })
      const added = enqueue(queue, { id: generateId('job'), kind: JOB_KIND.document, documentId, enqueuedAt: queuedAt })
      setQueue(added.queue)
      const position = getQueuePosition(queue, added.job.id)
      pump()
      return { jobId: added.job.id, position }
    },

    // One page again. Resolves like the extraction service ({ elements, attempt }) when the queue
    // has run it; rejects with the failure. FIFO with every other job.
    submitPage({ documentId, pageNumber, attempt }) {
      const jobId = generateId('job')
      const promise = new Promise((resolve, reject) => waiters.set(jobId, { resolve, reject }))
      const added = enqueue(queue, { id: jobId, kind: JOB_KIND.page, documentId, pageNumber, attempt, enqueuedAt: iso() })
      setQueue(added.queue)
      pump()
      return promise
    },

    // The session was closed: the job keeps running and the queue finishes it into the store.
    detachPage({ documentId, pageNumber }) {
      for (const job of queue.jobs.filter((candidate) => candidate.kind === JOB_KIND.page && candidate.documentId === documentId && candidate.pageNumber === pageNumber)) {
        detached.add(job.id)
        waiters.delete(job.id)
      }
    },

    getActivePages: (documentId) => queue.jobs.filter((job) => job.kind === JOB_KIND.page && job.documentId === documentId).map((job) => ({ pageNumber: job.pageNumber, state: job.state, attempt: job.attempt })),

    // A reopened session takes over a job that is still running (or waiting).
    adoptPage({ documentId, pageNumber }) {
      const job = queue.jobs.find((candidate) => candidate.kind === JOB_KIND.page && candidate.documentId === documentId && candidate.pageNumber === pageNumber)
      if (!job) return null
      detached.delete(job.id)
      return new Promise((resolve, reject) => waiters.set(job.id, { resolve, reject }))
    },

    cancelDocument,

    // For the queue screens: jobs in service order with their FIFO position (waiting jobs only).
    snapshot: () => ({
      blocked: isBlocked(),
      jobs: listJobs(queue).map((job) => ({ id: job.id, kind: job.kind, documentId: job.documentId, pageNumber: job.pageNumber, state: job.state, position: getQueuePosition(queue, job.id) })),
    }),

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // Development switches (labelled simulation controls).
    dev: {
      failNextDocument(value = true) {
        flags.failNextDocument = Boolean(value)
      },
      isFailNextDocument: () => flags.failNextDocument,
      kick: pump,
    },

    dispose() {
      unsubscribeStore()
      clearTimeout(recheckTimer)
      for (const controller of controllers.values()) controller.abort()
    },
  }
}
