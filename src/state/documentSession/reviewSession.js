// Review session: everything the review page needs, without React.
//
// It COMPOSES the Phase 1 pieces instead of replacing them:
//   - the canonical document and every edit go through the Phase 1 reducer
//     (createEditorReducer / ACTION); the session never mutates the document;
//   - the autosave controller hands the serialized pages that CHANGED to the
//     configured store (never the whole document) and reports only what the
//     store acknowledged;
//   - the (mock) processing service feeds Phase 1's `extractionApplied`;
//   - approval rules are the pure functions of domain/document/approval.js.
//
// The session adds only UI-level state that is NOT part of the canonical model:
// save status, which pages are processing, pending re-extraction candidates
// (the "compare before replacing" step), the attempt history, the edit lock and the
// document's approval status. That state lives in memory with the session.
//
// Batch D: the session no longer OWNS processing. Page (re)processing goes to the central
// queue through the `processing` port; when the port `survivesSessionClose` (the queue
// simulation does), leaving the screen does NOT cancel the work (decision 2): the session
// hands the running pages over (`detach`) and the queue finishes them into the store; a
// reopened session takes them back (`adopt`). Ports without that flag (the plain mock used by
// older tests) are cancelled on close as before.

import { canEditDocument, canCreateNewVersion, getApprovalEligibility, isDocumentApproved, APPROVAL_STATUS } from '../../domain/document/approval.js'
import { addAcceptedResult, appendAttempt, ATTEMPT_SCOPE, ATTEMPT_STATUS, ATTEMPT_TRIGGER, nextAttemptNumber, updateAttempt } from '../../domain/document/attempts.js'
import { findPage } from '../../domain/document/document.js'
import { hasMeaningfulContent } from '../../domain/document/elements.js'
import { checkExtractionResult, INVALID_EXTRACTION_RESULT } from '../../domain/document/extractionResult.js'
import { generateId as defaultGenerateId } from '../../domain/document/ids.js'
import { PROCESSING_STATUS } from '../../domain/document/schema.js'
import { SAVE_STATUS } from '../../domain/document/saveStatus.js'
import { parseDocumentJson, serializeDocument, serializePage } from '../../domain/document/serialization.js'
import { validateElements } from '../../domain/document/validation.js'
import { createAutosaveController } from '../../services/autosaveController.js'
import { approvalService as defaultApprovalService, ApprovalNotConnectedError } from '../../services/approvalService.js'
import { WORKFLOW_ERROR } from '../../services/workflowErrors.js'
import { ACTION, createEditorReducer, createInitialEditorState } from './documentReducer.js'

// Reasons shown when leaving the page would lose or interrupt work.
export const LEAVE_REASON = Object.freeze({
  unsavedChanges: 'unsavedChanges',
  processingActive: 'processingActive',
  pendingComparison: 'pendingComparison',
  temporaryStorage: 'temporaryStorage',
})

export const SESSION_ERROR = Object.freeze({
  documentApproved: 'DOCUMENT_APPROVED',
  pageProcessing: 'PAGE_PROCESSING',
  actionNotAllowed: 'ACTION_NOT_ALLOWED',
  notEligible: 'NOT_ELIGIBLE',
  noPermission: 'NO_PERMISSION',
  approvalPending: 'APPROVAL_PENDING',
  // Another user holds the document's edit lock, or this user's lock ended (decision 47).
  lockNotHeld: 'LOCK_NOT_HELD',
  // Text typed but not committed was saved to the page while the user was deciding:
  // the content they compared is not the current content any more.
  pendingEditsCommitted: 'PENDING_EDITS_COMMITTED',
})

export class SessionLoadError extends Error {
  constructor(errors) {
    super('The saved document could not be loaded.')
    this.name = 'SessionLoadError'
    this.errors = errors
  }
}

const CONTENT_ACTIONS = new Set([
  ACTION.elementAdded,
  ACTION.elementEdited,
  ACTION.elementRemoved,
  ACTION.elementMoved,
  ACTION.elementTypeChanged,
  ACTION.tableCellEdited,
  ACTION.tableRowAdded,
  ACTION.tableRowRemoved,
  ACTION.tableColumnAdded,
  ACTION.tableColumnRemoved,
])
const HISTORY_ACTIONS = new Set([ACTION.undone, ACTION.redone])
// Actions the UI may dispatch. Processing actions go through the session's own
// methods so the processing state, candidates and autosave stay consistent.
const PUBLIC_ACTIONS = new Set([...CONTENT_ACTIONS, ...HISTORY_ACTIONS, ACTION.pageSelected, ACTION.pageReviewConfirmed, ACTION.errorDismissed])

export function createReviewSession({
  record,
  store,
  processing,
  role,
  generateId = defaultGenerateId,
  now = () => new Date(),
  autosaveOptions,
  approvalService = defaultApprovalService,
  autoProcess = true,
  userId, // the signed-in user's id; with the record's owner it decides who may approve (decision 39)
  lockService = null, // the document edit lock (decision 47); without one the session may always edit
}) {
  // ---- load the stored document (validated; nothing is repaired) -----------
  const parsed = parseDocumentJson(JSON.stringify(record.snapshot))
  if (!parsed.ok) throw new SessionLoadError(parsed.errors)

  const reducer = createEditorReducer({ generateId })
  let editor = createInitialEditorState(parsed.document)
  // The page objects the store is known to hold. A page whose object differs from
  // this one has changed since it was last stored, and only those pages are saved.
  const persistedPages = new Map(parsed.document.pages.map((page) => [page.pageNumber, page]))

  // A page left "processing" by a previous session can no longer finish. This
  // session never writes that transient status to the store (see persist()), so
  // it only comes from other writers. A page that already holds a successful
  // extraction is restored as succeeded (its content, corrections and review are
  // untouched); a page without one is marked failed so it can be retried.
  // Pages the queue is still working on are NOT interrupted: the session takes them back in open().
  const stillRunning = new Set((processing.getActivePages?.(record.id) ?? []).map((job) => job.pageNumber))
  let recovered = false
  for (const page of editor.document.pages) {
    if (page.processing.status === PROCESSING_STATUS.processing && !stillRunning.has(page.pageNumber)) {
      const hadExtraction = page.originalExtraction !== null && page.originalExtraction !== undefined
      editor = reducer(editor, {
        type: ACTION.pageProcessingStatusSet,
        pageNumber: page.pageNumber,
        status: hadExtraction ? PROCESSING_STATUS.succeeded : PROCESSING_STATUS.failed,
        errorCode: hadExtraction ? null : 'PROCESSING_INTERRUPTED',
      })
      recovered = true
    }
  }
  const remembered = record.lastVisitedPage
  if (remembered !== null && remembered !== undefined && editor.document.selectedPages.includes(remembered)) {
    editor = reducer(editor, { type: ACTION.pageSelected, pageNumber: remembered })
  }

  // ---- state ---------------------------------------------------------------
  const listeners = new Set()
  const controllers = new Map() // pageNumber -> AbortController of the running extraction
  const statusBeforeProcessing = new Map() // pageNumber -> { status, errorCode } to restore if the run is cancelled
  const pendingFlushers = new Map() // key -> function that commits that input's typed text (see setUncommitted)
  const attemptCounts = {}
  const attemptEntryIds = new Map() // 'page:attempt' -> id of the stored attempt entry (so a decision updates it)
  const uncommitted = new Set() // keys of inputs whose typed text was not committed to the document yet
  let closed = false
  let recoveryPending = recovered // the recovered state still has to be stored (done in open(), never at creation)

  // A result that arrived while no session was open waits in the record for the user's decision
  // (decision 40: only an undecided result; a rejected one is never kept). It is shown again here.
  const initialCandidates = {}
  for (const [key, candidate] of Object.entries(record.candidates ?? {})) {
    const pageNumber = Number(key)
    const checked = checkExtractionResult(editor.document, pageNumber, candidate?.elements)
    if (!checked.ok) continue
    initialCandidates[pageNumber] = { attempt: candidate.attempt, elements: checked.elements, receivedAt: candidate.receivedAt }
    const waiting = (record.attempts ?? []).find((entry) => entry.pageNumber === pageNumber && entry.attempt === candidate.attempt && entry.status === ATTEMPT_STATUS.awaitingDecision)
    if (waiting) attemptEntryIds.set(`${pageNumber}:${candidate.attempt}`, waiting.id)
  }

  const ownsDocument = userId === undefined ? true : record.ownerId === userId
  let view = {
    editor,
    save: { status: SAVE_STATUS.saved, error: null },
    processingPages: [], // page numbers with a running extraction
    candidates: initialCandidates, // pageNumber -> { attempt, elements, receivedAt }
    attempts: {}, // pageNumber -> [{ attempt, outcome, at }]
    notices: {}, // pageNumber -> { code, errorCode? } last processing notice
    approvalStatus: record.approval?.status ?? APPROVAL_STATUS.none,
    approvalPending: false, // an approval request is in flight: the document must not change
    // The edit lock (decision 47): null without a lock service; otherwise
    //   { status: 'checking' | 'held' | 'readOnly' | 'lost' | 'available', holderName, expiresAt }
    lock: lockService ? { status: 'checking', holderName: null, expiresAt: null } : null,
    lastSavedAt: null, // when the storage last acknowledged a save of this session's edits
    role,
    hasEdits: false,
    uncommittedCount: 0,
    isTemporaryStorage: !store.isDurable,
  }

  function setView(patch) {
    view = { ...view, ...patch }
    for (const listener of listeners) listener()
  }

  // ---- autosave --------------------------------------------------------------
  // Stores only the pages that changed since they were last stored. A page is
  // marked as stored only after the store acknowledged it, so a failed or still
  // running save never hides a change: the next save sends it again. A store
  // without savePages gets the whole document (older stores keep working).
  //
  // "processing" is a transient state of THIS session (the run cannot continue
  // after a reload), so it is never written: while a run is active the page is
  // stored with the status it had before the run. Otherwise a page that was
  // already extracted would come back as failed if the tab died mid-run.
  function storable(page) {
    const before = statusBeforeProcessing.get(page.pageNumber)
    if (page.processing.status !== PROCESSING_STATUS.processing || !before) return page
    return { ...page, processing: { status: before.status, errorCode: before.errorCode } }
  }

  async function persist() {
    const { document } = view.editor
    const changed = document.pages.filter((page) => persistedPages.get(page.pageNumber) !== page)
    if (changed.length === 0) return
    await assertLock() // the server checks the lock on every save (decision 47)
    if (typeof store.savePages === 'function') {
      for (const page of changed) {
        const check = validateElements(page.elements)
        if (!check.valid) throw new Error(`Page ${page.pageNumber} is not valid and was not saved.`)
      }
      await store.savePages(record.id, changed.map((page) => serializePage(storable(page), true)))
      for (const page of changed) persistedPages.set(page.pageNumber, page)
    } else {
      await store.saveDraft(record.id, serializeDocument({ ...document, pages: document.pages.map(storable) }, { includeOriginalExtraction: true }))
      for (const page of document.pages) persistedPages.set(page.pageNumber, page)
    }
  }

  const autosave = createAutosaveController({ ...autosaveOptions, save: persist })
  autosave.subscribe((save) => {
    const justSaved = save.status === SAVE_STATUS.saved && view.hasEdits && view.save.status !== SAVE_STATUS.saved
    setView({ save: { status: save.status, error: save.error }, ...(justSaved ? { lastSavedAt: now().toISOString() } : {}) })
  })

  function applyToEditor(action) {
    const before = view.editor
    const after = reducer(before, action)
    if (after === before) return after
    const documentChanged = after.document !== before.document
    // Flag the change as unsaved BEFORE publishing the new document, so nobody
    // can ever observe changed content together with a "saved" status.
    if (documentChanged) autosave.markDirty()
    setView({ editor: after, hasEdits: view.hasEdits || documentChanged })
    return after
  }

  const getPage = (pageNumber) => findPage(view.editor.document, pageNumber)
  const isApproved = () => isDocumentApproved(view.approvalStatus)

  // ---- the edit lock (decision 47) -----------------------------------------------------------
  // One editor at a time. Without a lock service the session may always edit (older callers).
  let leaseMs = null // the lease the service gave at the last (re)acquire: renewal starts at half of it
  let renewing = false
  const lockStatus = () => (lockService ? view.lock.status : 'held')
  const canEditNow = () => lockStatus() === 'held'

  function setLock(patch) {
    if (lockService) setView({ lock: { ...view.lock, ...patch } })
  }

  // The service said this user no longer holds the lock: editing stops, what was saved stays.
  function applyLockLoss(error) {
    const heldByOther = error?.code === WORKFLOW_ERROR.lockHeld
    setLock({ status: heldByOther ? 'readOnly' : 'lost', expiresAt: null })
  }

  async function assertLock() {
    if (!lockService || isApproved()) return
    try {
      await lockService.assertHeld(record.id)
    } catch (error) {
      if (error?.code === WORKFLOW_ERROR.lockHeld || error?.code === WORKFLOW_ERROR.lockLost) applyLockLoss(error)
      throw error
    }
  }

  async function acquireLock() {
    if (!lockService || isApproved()) return { ok: true }
    try {
      const outcome = await lockService.acquire(record.id)
      if (closed) {
        if (outcome.granted) lockService.release(record.id).catch(() => {})
        return { ok: false }
      }
      if (outcome.granted) {
        leaseMs = Math.max(1, new Date(outcome.lock.expiresAt).getTime() - now().getTime())
        setLock({ status: 'held', holderName: outcome.lock.holderName, expiresAt: outcome.lock.expiresAt })
        return { ok: true }
      }
      setLock({ status: 'readOnly', holderName: outcome.lock.holderName, expiresAt: outcome.lock.expiresAt })
      return { ok: false, code: SESSION_ERROR.lockNotHeld }
    } catch {
      // The lock service could not be reached: nothing may be edited without it.
      setLock({ status: 'lost', holderName: null, expiresAt: null })
      return { ok: false, code: SESSION_ERROR.lockNotHeld }
    }
  }

  // Edits keep the lock alive; it is renewed when half of the lease is gone (the lease itself is the service's).
  async function renewLockIfNeeded() {
    if (!lockService || renewing || lockStatus() !== 'held' || leaseMs === null) return
    const remaining = new Date(view.lock.expiresAt).getTime() - now().getTime()
    if (remaining > leaseMs / 2) return
    renewing = true
    try {
      const { lock } = await lockService.renew(record.id)
      setLock({ expiresAt: lock.expiresAt })
    } catch (error) {
      applyLockLoss(error)
    } finally {
      renewing = false
    }
  }

  let unsubscribeLock = null
  function watchLock() {
    if (!lockService || unsubscribeLock) return
    unsubscribeLock = lockService.subscribe(record.id, (lock) => {
      if (closed) return
      const mine = lock && (userId === undefined || lock.holderId === userId)
      if (lock && !mine) setLock({ status: 'readOnly', holderName: lock.holderName, expiresAt: lock.expiresAt })
      else if (!lock && lockStatus() === 'held') setLock({ status: 'lost', holderName: null, expiresAt: null }) // the lease ended
      else if (!lock && lockStatus() === 'readOnly') setLock({ status: 'available', holderName: null, expiresAt: null }) // the other editor left
    })
  }

  // ---- attempts and accepted results (decisions 11 and 40) ----------------------------------------
  // Attempt entries carry metadata only (never content) and are kept in the store, independent of the
  // audit log. A decision on a waiting candidate updates the same entry.
  const STATUS_OF_OUTCOME = {
    failed: ATTEMPT_STATUS.failed,
    awaitingDecision: ATTEMPT_STATUS.awaitingDecision,
    applied: ATTEMPT_STATUS.succeeded,
    accepted: ATTEMPT_STATUS.accepted,
    discarded: ATTEMPT_STATUS.rejected,
  }

  function storedAttempts() {
    return (typeof store.peek === 'function' ? store.peek(record.id)?.attempts : null) ?? []
  }

  function persistAttempt(pageNumber, attempt, outcome, extra = {}) {
    if (typeof store.updateMeta !== 'function') return
    const status = STATUS_OF_OUTCOME[outcome]
    const key = `${pageNumber}:${attempt}`
    const attempts = storedAttempts()
    const existingId = attemptEntryIds.get(key)
    const finishedAt = now().toISOString()
    try {
      if (existingId && attempts.some((entry) => entry.id === existingId)) {
        store.updateMeta(record.id, { attempts: updateAttempt(attempts, existingId, { status, finishedAt, ...extra }) })
      } else {
        const id = generateId('att')
        attemptEntryIds.set(key, id)
        store.updateMeta(record.id, {
          attempts: appendAttempt(attempts, { id, scope: ATTEMPT_SCOPE.page, pageNumber, attempt, trigger: ATTEMPT_TRIGGER.reprocess, status, startedAt: extra.startedAt ?? finishedAt, finishedAt, errorCode: extra.errorCode ?? null, actorId: userId ?? null }),
        })
      }
    } catch {
      // Bookkeeping only: it never blocks the user's work.
    }
  }

  function persistAcceptedResult(pageNumber, attempt, elements) {
    if (typeof store.updateMeta !== 'function' || typeof store.peek !== 'function') return
    try {
      store.updateMeta(record.id, { resultHistory: addAcceptedResult(store.peek(record.id).resultHistory, pageNumber, { attempt, acceptedAt: now().toISOString(), elements }) })
    } catch {
      // Bookkeeping only.
    }
  }

  function clearStoredCandidate(pageNumber) {
    if (typeof store.updateMeta !== 'function' || typeof store.peek !== 'function') return
    const stored = store.peek(record.id)?.candidates ?? {}
    if (!(pageNumber in stored)) return
    const { [pageNumber]: _removed, ...rest } = stored
    store.updateMeta(record.id, { candidates: rest })
  }

  // A result that waits for the user's decision is kept in the record too, so leaving the screen (or the page
  // closing) at that moment never loses it. It is removed as soon as the user decides (removeCandidate) and
  // only an UNDECIDED result is ever kept here: a rejected one is dropped for good (decision 40).
  function persistCandidate(pageNumber, candidate) {
    if (typeof store.updateMeta !== 'function' || typeof store.peek !== 'function') return
    try {
      store.updateMeta(record.id, { candidates: { ...(store.peek(record.id)?.candidates ?? {}), [pageNumber]: candidate } })
    } catch {
      // Bookkeeping only.
    }
  }

  const startedAtOf = new Map() // pageNumber -> when the running attempt started

  function recordAttempt(pageNumber, attempt, outcome, extra) {
    const list = view.attempts[pageNumber] ?? []
    setView({ attempts: { ...view.attempts, [pageNumber]: [...list, { attempt, outcome, at: now().toISOString() }] } })
    persistAttempt(pageNumber, attempt, outcome, { startedAt: startedAtOf.get(pageNumber), ...extra })
  }

  function setNotice(pageNumber, notice) {
    const next = { ...view.notices }
    if (notice) next[pageNumber] = notice
    else delete next[pageNumber]
    setView({ notices: next })
  }

  // Text that was typed but not committed yet (inputs commit after a short pause
  // or on blur). Actions that depend on the page content commit it first, so they
  // never act on stale content and the typed text is never lost. Returns how many
  // inputs had pending text.
  function commitPendingEdits() {
    const flushers = [...pendingFlushers.values()]
    for (const flush of flushers) flush()
    return flushers.length
  }

  // The next attempt number of a page: after every attempt this session ran AND every one already stored.
  function nextAttempt(pageNumber) {
    return Math.max(attemptCounts[pageNumber] ?? 0, nextAttemptNumber(storedAttempts(), pageNumber) - 1) + 1
  }

  // The status a page has in the store (a page the queue is processing shows "processing" there,
  // which says nothing about what it was before).
  function statusOnDisk(pageNumber) {
    const stored = typeof store.peek === 'function' ? store.peek(record.id)?.snapshot.pages.find((page) => page.pageNumber === pageNumber) : null
    const status = stored?.processing.status
    return status && status !== PROCESSING_STATUS.processing ? stored.processing : { status: PROCESSING_STATUS.notProcessed, errorCode: null }
  }

  // ---- processing (through the queue port) -------------------------------------------------------
  async function processPage(pageNumber) {
    if (!getPage(pageNumber) || controllers.has(pageNumber) || isApproved() || view.approvalPending || closed) return { ok: false }
    if (!canEditNow()) return { ok: false, code: SESSION_ERROR.lockNotHeld }
    commitPendingEdits()
    if (lockService) {
      try {
        await assertLock() // the server checks the lock on every re-processing (decision 47)
      } catch {
        return { ok: false, code: SESSION_ERROR.lockNotHeld }
      }
      if (controllers.has(pageNumber) || closed) return { ok: false }
    }
    const attempt = nextAttempt(pageNumber)
    return runExtraction(pageNumber, attempt, (signal) => processing.extractPage({ documentId: record.id, pageNumber, attempt, signal }))
  }

  // Waits for a page the queue was already working on when this session opened.
  function adoptRun(pageNumber, attempt, promise) {
    return runExtraction(pageNumber, attempt, () => promise)
  }

  async function runExtraction(pageNumber, attempt, start) {
    const page = getPage(pageNumber)
    const wasRunning = page.processing.status === PROCESSING_STATUS.processing
    const previous = wasRunning ? statusOnDisk(pageNumber) : page.processing
    const previousStatus = previous.status
    const previousErrorCode = previous.errorCode
    const controller = new AbortController()
    controllers.set(pageNumber, controller)
    statusBeforeProcessing.set(pageNumber, { status: previousStatus, errorCode: previousErrorCode })
    startedAtOf.set(pageNumber, now().toISOString())
    setNotice(pageNumber, null)
    applyToEditor({ type: ACTION.pageProcessingStatusSet, pageNumber, status: PROCESSING_STATUS.processing })
    setView({ processingPages: [...controllers.keys()] })

    let outcome
    try {
      outcome = { result: await start(controller.signal) }
    } catch (error) {
      outcome = { error }
    }
    // A run that was cancelled (the session was closed, perhaps re-opened since)
    // must not touch the bookkeeping of a newer run of the same page.
    const isCurrentRun = controllers.get(pageNumber) === controller
    if (isCurrentRun) {
      controllers.delete(pageNumber)
      statusBeforeProcessing.delete(pageNumber)
    }
    if (closed || controller.signal.aborted || !isCurrentRun) return { ok: false }
    // Only a run that really finished uses up its attempt number.
    attemptCounts[pageNumber] = attempt
    setView({ processingPages: [...controllers.keys()] })

    const hasContent = hasMeaningfulContent(getPage(pageNumber).elements)

    // A result is only used if the service succeeded AND the result is valid (a
    // list of canonical elements with unique IDs that do not clash with the rest
    // of the document). Nothing is repaired and nothing invalid is ever applied
    // to the page or kept as a candidate.
    let failure = outcome.error ? { errorCode: outcome.error.code ?? 'PROCESSING_FAILED', error: outcome.error } : null
    let elements = null
    if (!failure) {
      const checked = checkExtractionResult(view.editor.document, pageNumber, outcome.result?.elements)
      if (checked.ok) elements = checked.elements
      else failure = { errorCode: INVALID_EXTRACTION_RESULT, error: Object.assign(new Error('The extraction result is not valid.'), checked) }
    }
    if (!failure && !hasContent) {
      // Nothing to protect on the page: apply the result (Phase 1 re-validates it).
      const after = applyToEditor({ type: ACTION.extractionApplied, pageNumber, elements })
      if (after.lastError) {
        failure = { errorCode: INVALID_EXTRACTION_RESULT, error: Object.assign(new Error(after.lastError.message), after.lastError) }
      }
    }

    if (failure) {
      // Existing content and corrections are untouched (the current result is always kept when a
      // re-processing fails, decision 38). Without content the page is marked failed (never left
      // "processing"); with content its previous status is restored and the user is told.
      if (hasContent) {
        applyToEditor({ type: ACTION.pageProcessingStatusSet, pageNumber, status: previousStatus, errorCode: previousErrorCode })
        setNotice(pageNumber, { code: 'reprocessFailed', errorCode: failure.errorCode })
      } else {
        applyToEditor({ type: ACTION.pageProcessingStatusSet, pageNumber, status: PROCESSING_STATUS.failed, errorCode: failure.errorCode })
      }
      recordAttempt(pageNumber, attempt, 'failed', { errorCode: failure.errorCode })
      return { ok: false, error: failure.error }
    }

    if (hasContent) {
      // Never replace existing content automatically: keep the (validated) candidate for comparison.
      applyToEditor({ type: ACTION.pageProcessingStatusSet, pageNumber, status: previousStatus, errorCode: previousErrorCode })
      const candidate = { attempt, elements, receivedAt: now().toISOString() }
      setView({ candidates: { ...view.candidates, [pageNumber]: candidate } })
      persistCandidate(pageNumber, candidate)
      recordAttempt(pageNumber, attempt, 'awaitingDecision')
    } else {
      recordAttempt(pageNumber, attempt, 'applied')
      persistAcceptedResult(pageNumber, attempt, elements)
    }
    return { ok: true }
  }

  function removeCandidate(pageNumber) {
    const next = { ...view.candidates }
    delete next[pageNumber]
    setView({ candidates: next })
    clearStoredCandidate(pageNumber) // never left behind in the record once decided
  }

  function maybeAutoProcess(pageNumber) {
    const page = getPage(pageNumber)
    if (!autoProcess || !page || isApproved() || closed) return
    if (page.processing.status === PROCESSING_STATUS.notProcessed && !hasMeaningfulContent(page.elements)) {
      processPage(pageNumber)
    }
  }

  // ---- the public API ----------------------------------------------------------
  const session = {
    getView: () => view,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // Phase 1 editing, history, review and navigation actions. Never mutates the
    // document directly. Returns { ok: true } or { ok: false, code, details? }.
    dispatch(action) {
      if (!action || !PUBLIC_ACTIONS.has(action.type)) return { ok: false, code: SESSION_ERROR.actionNotAllowed }
      const changesContent = CONTENT_ACTIONS.has(action.type) || HISTORY_ACTIONS.has(action.type) || action.type === ACTION.pageReviewConfirmed
      if (changesContent) {
        if (!canEditDocument({ approvalStatus: view.approvalStatus })) return { ok: false, code: SESSION_ERROR.documentApproved }
        // While an approval request is in flight the document must not change, or the
        // approval could cover content nobody reviewed.
        if (view.approvalPending) return { ok: false, code: SESSION_ERROR.approvalPending }
        // Only the editor who holds the document's lock may change it (decision 47).
        if (!canEditNow()) return { ok: false, code: SESSION_ERROR.lockNotHeld }
        const target = action.pageNumber ?? view.editor.lastVisitedPage
        if (getPage(target)?.processing.status === PROCESSING_STATUS.processing) return { ok: false, code: SESSION_ERROR.pageProcessing }
      }
      const after = applyToEditor(action)
      if (after.lastError) return { ok: false, code: after.lastError.code, details: after.lastError.details }
      if (changesContent) renewLockIfNeeded()
      return { ok: true }
    },

    goToPage(pageNumber) {
      const result = session.dispatch({ type: ACTION.pageSelected, pageNumber })
      if (result.ok) {
        store.setLastVisitedPage(record.id, pageNumber)
        maybeAutoProcess(pageNumber)
      }
      return result
    },

    // Explicit human confirmation ("تمت مراجعة الصفحة"). Phase 1 decides if it is allowed.
    // Text still being typed is committed first, so the confirmation covers exactly
    // what the reviewer sees (never an older committed version of it).
    confirmPageReview(pageNumber = view.editor.lastVisitedPage) {
      commitPendingEdits()
      return session.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber, at: now().toISOString() })
    },

    // Starts (or retries / repeats) the mock extraction of a page.
    processPage,

    // Replaces the page content with the pending candidate. Phase 1 clears that
    // page's undo/redo history and invalidates its review if the content changed.
    acceptCandidate(pageNumber) {
      const candidate = view.candidates[pageNumber]
      if (!candidate || isApproved()) return { ok: false, code: SESSION_ERROR.actionNotAllowed }
      if (view.approvalPending) return { ok: false, code: SESSION_ERROR.approvalPending }
      // A run that is still going would overwrite the result of this acceptance
      // (it restores the status it started from) and replace this candidate.
      if (controllers.has(pageNumber) || getPage(pageNumber)?.processing.status === PROCESSING_STATUS.processing) {
        return { ok: false, code: SESSION_ERROR.pageProcessing }
      }
      // Typed-but-uncommitted text is committed BEFORE anything is replaced, so it can
      // never be lost to a failed edit of an element that no longer exists. If it
      // changed the page, the comparison the user decided on is out of date: nothing
      // is replaced and they must look at it again.
      const contentBefore = getPage(pageNumber).elements
      commitPendingEdits()
      if (getPage(pageNumber).elements !== contentBefore) return { ok: false, code: SESSION_ERROR.pendingEditsCommitted }
      if (!canEditNow()) return { ok: false, code: SESSION_ERROR.lockNotHeld }
      const after = applyToEditor({ type: ACTION.extractionApplied, pageNumber, elements: candidate.elements })
      if (after.lastError) return { ok: false, code: after.lastError.code, details: after.lastError.details }
      removeCandidate(pageNumber)
      recordAttempt(pageNumber, candidate.attempt, 'accepted')
      // The accepted result is kept in full, the earlier ones too (decision 40).
      persistAcceptedResult(pageNumber, candidate.attempt, candidate.elements)
      return { ok: true }
    },

    // Keeps the current content; the candidate is dropped.
    discardCandidate(pageNumber) {
      const candidate = view.candidates[pageNumber]
      if (!candidate) return { ok: false, code: SESSION_ERROR.actionNotAllowed }
      // A rejected result is dropped for good: only the fact that it was rejected stays (decision 40).
      removeCandidate(pageNumber)
      recordAttempt(pageNumber, candidate.attempt, 'discarded')
      return { ok: true }
    },

    dismissNotice: (pageNumber) => setNotice(pageNumber, null),

    // ---- saving ------------------------------------------------------------------
    flushSave: () => autosave.flush(),
    retrySave: () => autosave.retry(),

    // The explicit "Save draft" button (decision 13): commits typed text, then saves everything now.
    // SAVING IS NOT APPROVAL: nothing about the approval status changes. Resolves with the save state.
    async saveDraft() {
      commitPendingEdits()
      const state = await autosave.flush()
      return { ok: state.status === SAVE_STATUS.saved, status: state.status }
    },

    // Inputs report text that was typed but not committed to the document yet.
    // Until it is committed the work counts as unsaved.
    // `commit` (optional) commits that input's text; it is what commitPendingEdits calls.
    setUncommitted(key, isPending, commit) {
      if (isPending && typeof commit === 'function') pendingFlushers.set(key, commit)
      else if (!isPending) pendingFlushers.delete(key)
      const had = uncommitted.has(key)
      if (isPending === had) return
      if (isPending) uncommitted.add(key)
      else uncommitted.delete(key)
      setView({ uncommittedCount: uncommitted.size })
    },

    // The status to show and to rely on: "saved" only when the storage
    // acknowledged everything AND no typed text is still waiting to be committed.
    getEffectiveSaveStatus() {
      return view.save.status === SAVE_STATUS.saved && view.uncommittedCount > 0 ? SAVE_STATUS.unsaved : view.save.status
    },

    // ---- leaving the page --------------------------------------------------------
    // In-app navigation is blocked while work could be lost or interrupted.
    getNavigationGuard() {
      const reasons = []
      if (session.getEffectiveSaveStatus() !== SAVE_STATUS.saved) reasons.push(LEAVE_REASON.unsavedChanges)
      // Processing the queue owns goes on after leaving (decision 2): it is no reason to stay.
      if (view.processingPages.length > 0 && !processing.survivesSessionClose) reasons.push(LEAVE_REASON.processingActive)
      if (Object.keys(view.candidates).length > 0) reasons.push(LEAVE_REASON.pendingComparison)
      return { shouldBlock: reasons.length > 0, reasons }
    },

    // Closing or reloading the tab. With a temporary (non-durable) store any edit
    // is lost, even when the store acknowledged it, so the browser warns too.
    getUnloadWarning() {
      const { reasons } = session.getNavigationGuard()
      const all = [...reasons]
      if (view.isTemporaryStorage && view.hasEdits) all.push(LEAVE_REASON.temporaryStorage)
      return { shouldWarn: all.length > 0, reasons: all }
    },

    // ---- approval ----------------------------------------------------------------
    getApprovalEligibility() {
      return getApprovalEligibility({
        document: view.editor.document,
        saveStatus: session.getEffectiveSaveStatus(),
        activeProcessingCount: view.processingPages.length,
        role: view.role,
        approvalStatus: view.approvalStatus,
        isOwner: ownsDocument,
        holdsLock: canEditNow() || isApproved(),
      })
    },

    canCreateNewVersion: () => canCreateNewVersion({ role: view.role, approvalStatus: view.approvalStatus }),

    // Never reports success unless the approval service acknowledged it.
    //
    // While the request is in flight the document is frozen (edits are refused),
    // so what gets approved is exactly what was checked. A failed request changes
    // nothing. After the service acknowledged the approval it is also written to
    // the store, so reopening the document finds it approved (`persisted` says
    // whether that write succeeded; the service's acknowledgement is what counts).
    async requestApproval() {
      if (view.approvalPending) return { ok: false, code: SESSION_ERROR.approvalPending }
      const eligibility = session.getApprovalEligibility()
      if (!eligibility.eligible) return { ok: false, code: SESSION_ERROR.notEligible, blockers: eligibility.blockers }

      setView({ approvalPending: true })
      try {
        await approvalService.requestDocumentApproval(record.id)
      } catch (error) {
        setView({ approvalPending: false })
        if (error?.code === WORKFLOW_ERROR.lockHeld || error?.code === WORKFLOW_ERROR.lockLost) applyLockLoss(error)
        return { ok: false, code: error instanceof ApprovalNotConnectedError || typeof error?.code === 'string' ? error.code : 'APPROVAL_FAILED' }
      }

      let persisted = false
      try {
        if (typeof store.setApprovalStatus === 'function') {
          await store.setApprovalStatus(record.id, APPROVAL_STATUS.approved)
          persisted = true
        }
      } catch {
        persisted = false
      }
      setView({ approvalStatus: APPROVAL_STATUS.approved, approvalPending: false })
      // Editing is over: the document's lock is released (saved work is untouched).
      if (lockService) {
        lockService.release(record.id).catch(() => {})
        setLock({ status: 'available', holderName: null, expiresAt: null })
      }
      return { ok: true, persisted }
    },

    async requestNewVersion() {
      if (!session.canCreateNewVersion()) return { ok: false, code: SESSION_ERROR.noPermission }
      try {
        await approvalService.requestNewEditableVersion(record.id)
      } catch (error) {
        return { ok: false, code: error instanceof ApprovalNotConnectedError || typeof error?.code === 'string' ? error.code : 'VERSION_FAILED' }
      }
      // The approved version stays in the history; the document is now an editable NEW version that needs
      // its own approval (decision 14). Editing it needs the lock like any other editing.
      try {
        if (typeof store.setApprovalStatus === 'function') await store.setApprovalStatus(record.id, APPROVAL_STATUS.none)
      } catch {
        // The service already acknowledged the new version; the store write is only the local copy.
      }
      setView({ approvalStatus: APPROVAL_STATUS.none })
      if (lockService) {
        setLock({ status: 'checking' })
        await acquireLock()
      }
      return { ok: true }
    },

    // "Start editing" after another editor left or this user's lock ended: takes the lock again and
    // retries a save that was refused because of it. Saved work is untouched.
    async requestEditLock() {
      const outcome = await acquireLock()
      if (outcome.ok) autosave.retry()
      return outcome
    },

    // Starts the session: the first page opens like any other (a pending page is
    // processed). Creating a session has no side effects; calling open() again
    // after close() is allowed (React StrictMode mounts, unmounts and mounts again).
    open() {
      closed = false
      // Storing the recovered state is a side effect, so it happens here and not when
      // the session is created (a discarded duplicate session, e.g. under React
      // StrictMode, must not leave a scheduled write behind).
      if (recoveryPending) {
        recoveryPending = false
        autosave.markDirty()
      }
      watchLock()
      if (lockService) {
        // Editing needs the lock; until it is known the document is read-only. A page the queue is
        // still working on is taken back (decision 2), and an untouched page starts when it is opened.
        acquireLock().then(() => maybeAutoProcess(view.editor.lastVisitedPage))
      } else {
        maybeAutoProcess(view.editor.lastVisitedPage)
      }
      for (const job of processing.getActivePages?.(record.id) ?? []) {
        const waiting = processing.adopt?.({ documentId: record.id, pageNumber: job.pageNumber })
        if (waiting && getPage(job.pageNumber) && !controllers.has(job.pageNumber)) adoptRun(job.pageNumber, job.attempt ?? nextAttempt(job.pageNumber), waiting)
      }
    },

    // Leaving the page. Cancels running extractions (their pages return to the
    // status they had before, so an interrupted run is never saved as a failure)
    // and gives pending changes a last chance to be stored.
    async close() {
      if (closed) return
      closed = true
      commitPendingEdits()
      if (processing.survivesSessionClose) {
        // Decision 2: leaving this screen does not cancel the work. The queue keeps the running
        // pages and finishes them into the store (apply, or keep as a candidate for the next visit).
        for (const pageNumber of controllers.keys()) processing.detach?.({ documentId: record.id, pageNumber })
      }
      // Aborting only makes THIS session stop waiting; a queue's own job does not listen to this signal.
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
      for (const [pageNumber, before] of statusBeforeProcessing) {
        applyToEditor({ type: ACTION.pageProcessingStatusSet, pageNumber, status: before.status, errorCode: before.errorCode })
      }
      statusBeforeProcessing.clear()
      setView({ processingPages: [] })
      // Stop listening at once (the session may be opened again right away, as React StrictMode does), and
      // release the lock only if it was NOT reopened meanwhile: the new run then owns it.
      unsubscribeLock?.()
      unsubscribeLock = null
      await autosave.flush()
      if (closed && lockService && lockStatus() === 'held') await lockService.release(record.id).catch(() => {})
    },
  }

  return session
}
