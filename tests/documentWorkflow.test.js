// Batch D: the document workflow against the development mocks. The mocks play the SERVER: upload
// registration with its checks (35, 36, 41, 48), the central FIFO queue and background processing
// (2, 3, 11, 22, 23, 45), the edit lock (47), approval and versions (6, 14, 39), export (8, 46), and the
// audit and notification events (3, 31). Nothing here is real processing, storage or security: it checks
// that the frontend behaves as the decisions require against a server that follows them.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMockAccountStore, MOCK_SESSION_KEY } from '../src/dev/mockAccountStore.js'
import { createMockApprovalService } from '../src/dev/mockApprovalService.js'
import { createMockContext } from '../src/dev/mockContext.js'
import { createMockDocumentWorkflowService } from '../src/dev/mockDocumentWorkflowService.js'
import { createMockEditLockService, SIMULATED_EDITOR } from '../src/dev/mockEditLockService.js'
import { createMockExportService } from '../src/dev/mockExportService.js'
import { createMockRecycleBinService } from '../src/dev/mockRecycleBinService.js'
import { createMockSettingsService } from '../src/dev/mockSettingsService.js'
import { createMockTemplateService } from '../src/dev/mockTemplateService.js'
import { classifyByName } from '../src/dev/mockClassification.js'
import { createMockSystemState } from '../src/dev/mockSystemState.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { createReviewSession, SESSION_ERROR } from '../src/state/documentSession/reviewSession.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { createProcessingRequest } from '../src/services/documentProcessingService.js'
import { createMockProcessingService } from '../src/services/mockProcessingService.js'
import { makeSnapshot } from './sessionHelpers.js'
import { NOT_CONNECTED_APPROVAL, createApprovalService } from '../src/services/approvalService.js'
import { NOT_CONNECTED_EDIT_LOCK, createEditLockService } from '../src/services/editLockService.js'
import { NOT_CONNECTED_EXPORT, createExportService } from '../src/services/exportService.js'
import { NOT_CONNECTED_PAGE_PROCESSING, NOT_CONNECTED_WORKFLOW, createDocumentWorkflowService } from '../src/services/documentWorkflowService.js'
import { NOT_CONNECTED_TEMPLATES, createTemplateService } from '../src/services/templateService.js'
import { SYSTEM_ERROR, SystemError } from '../src/services/systemErrors.js'
import { WORKFLOW_ERROR } from '../src/services/workflowErrors.js'
import { paragraph } from './helpers.js'

const memoryStorage = () => {
  const data = new Map()
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error instanceof SystemError && error.code === code, `expected ${code}`)
const tick = () => new Promise((resolve) => setImmediate(resolve))
async function until(condition, { timeout = 3000 } = {}) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting for the condition')
    await tick()
  }
}

// One mock "server": clock, session, accounts, system state, temporary store, workflow, approval, lock, export.
function world({ actor = 'employee', concurrency = 1, shouldFail = () => false, processing, engineOptions = { recheckMs: 5, startDelayMs: 15 }, leaseMs } = {}) {
  const storage = memoryStorage()
  const clock = { time: new Date('2026-06-01T12:00:00.000Z') }
  const now = () => new Date(clock.time)
  const accountStore = createMockAccountStore({ storage, now: () => clock.time.toISOString() })
  const system = createMockSystemState({ storage, now })
  const documents = createMemoryDocumentStore({ now: () => clock.time.toISOString() })
  const context = createMockContext({ storage, latencyMs: 0, accountStore, system, documents, now })
  const signInAs = (identifier) => (identifier ? storage.setItem(MOCK_SESSION_KEY, JSON.stringify({ identifier })) : storage.removeItem(MOCK_SESSION_KEY))
  signInAs(actor)
  const extraction = processing ?? createMockProcessingService({ delayMs: 0, shouldFail, generateId: createSequentialIdGenerator(5000) })
  const lock = createMockEditLockService({ context, ...(leaseMs ? { leaseMs } : {}) })
  const workflow = createMockDocumentWorkflowService({ context, store: documents, processing: extraction, concurrency, engineOptions })
  return {
    storage, clock, accountStore, system, documents, context, signInAs, extraction, lock, workflow,
    approval: createMockApprovalService({ context, store: documents, lockService: lock }),
    exporter: createMockExportService({ context, store: documents }),
    settings: createMockSettingsService({ context }),
    recycleBin: createMockRecycleBinService({ context }),
    templates: createMockTemplateService({ context }),
    audit: () => system.read().audit,
    notifications: () => system.read().notifications,
  }
}

const pdf = (name = 'scan.pdf', size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const request = ({ name, totalPages = 3, pages, size } = {}) =>
  createProcessingRequest({ file: pdf(name, size), documentKind: 'pdf', totalPages, mode: pages ? 'selected' : 'all', pages: pages ?? Array.from({ length: totalPages }, (_, index) => index + 1) })
const summaryOf = (w, id) => w.documents.list().find((item) => item.id === id)
const stateOf = (w, id) => summaryOf(w, id)?.state
const settled = (w, id, states = ['readyForReview', 'failed']) => until(() => states.includes(stateOf(w, id)))

describe('upload registration (decisions 1, 35, 36, 41, 48)', () => {
  test('the document is registered Pending for its owner, stored with the complete original and the selected pages, and queued', async () => {
    const w = world()
    const { documentId, queuePosition } = await w.workflow.registerDocument(request({ name: 'تقرير.pdf', totalPages: 8, pages: [2, 4, 7] }))
    const stored = w.documents.get(documentId)
    assert.equal(stored.ownerId, 'demo-employee')
    assert.equal(stored.name, 'تقرير.pdf')
    assert.ok(stored.file instanceof Blob)
    assert.equal(stored.snapshot.file.totalPages, 8) // the original is complete
    assert.deepEqual(stored.snapshot.selectedPages, [2, 4, 7]) // unselected pages are simply not part of it
    assert.deepEqual(stored.snapshot.pages.map((entry) => entry.pageNumber), [2, 4, 7])
    assert.equal(queuePosition, 1)
    assert.equal(stateOf(w, documentId), 'pending')
    await settled(w, documentId)
  })

  test('one document per registration: the stored record is one document', async () => {
    const w = world()
    await w.workflow.registerDocument(request())
    assert.equal(w.documents.list().length, 1)
  })

  test('the server checks the Admin file-size limit again (36) and the selected page limit again (48)', async () => {
    const w = world({ actor: 'admin' })
    await w.settings.updateSection('uploads', { maxFileSizeMb: 1, maxSelectedPages: 2 })
    w.signInAs('employee')
    await rejectsWith(w.workflow.registerDocument(request({ size: 2 * 1024 * 1024 })), WORKFLOW_ERROR.fileTooLarge)
    await rejectsWith(w.workflow.registerDocument(request({ totalPages: 5 })), WORKFLOW_ERROR.tooManyPages)
    assert.equal(w.documents.list().length, 0) // nothing was stored
    const ok = await w.workflow.registerDocument(request({ totalPages: 5, pages: [1, 2] }))
    assert.ok(ok.documentId)
    await settled(w, ok.documentId)
  })

  test('storage full: uploads are refused with a clear code, nothing is stored, and the existing documents are untouched', async () => {
    const w = world()
    const first = await w.workflow.registerDocument(request())
    await settled(w, first.documentId)
    w.system.update((draft) => void (draft.storage.scenario = 'full'))
    assert.deepEqual(await w.workflow.getUploadAvailability(), { available: false, reason: 'storageFull' })
    await rejectsWith(w.workflow.registerDocument(request()), WORKFLOW_ERROR.storageFull)
    assert.equal(w.documents.list().length, 1)
    assert.equal(stateOf(w, first.documentId), 'readyForReview') // never deleted because the disk is full
    w.system.update((draft) => void (draft.storage.scenario = 'normal'))
    assert.equal((await w.workflow.getUploadAvailability()).available, true)
  })

  test('not enough space for THIS document gives its own message', async () => {
    const w = world()
    w.workflow.dev.setInsufficientSpace(true)
    await rejectsWith(w.workflow.registerDocument(request()), WORKFLOW_ERROR.insufficientStorage)
    assert.equal((await w.workflow.getUploadAvailability()).available, true) // uploads are not blocked in general
    w.workflow.dev.setInsufficientSpace(false)
    const ok = await w.workflow.registerDocument(request())
    await settled(w, ok.documentId)
  })

  test('nobody signed in: refused as a server would; a refused upload is audited as a failure', async () => {
    const w = world({ actor: null })
    await rejectsWith(w.workflow.registerDocument(request()), SYSTEM_ERROR.forbidden)
    await rejectsWith(w.workflow.getQueue(), SYSTEM_ERROR.forbidden)
    w.signInAs('employee')
    w.system.update((draft) => void (draft.storage.scenario = 'full'))
    await rejectsWith(w.workflow.registerDocument(request({ name: 'x.pdf' })), WORKFLOW_ERROR.storageFull)
    assert.ok(w.audit().some((entry) => entry.category === 'uploads' && entry.outcome === 'failure' && entry.subject === 'x.pdf'))
  })

  test('uploads and processing events are audited with names only, and the category switches are respected (31)', async () => {
    const w = world()
    const { documentId } = await w.workflow.registerDocument(request({ name: 'عقد.pdf' }))
    await settled(w, documentId)
    const entries = w.audit()
    assert.ok(entries.some((entry) => entry.category === 'uploads' && entry.action === 'documentUploaded' && entry.subject === 'عقد.pdf'))
    assert.ok(entries.some((entry) => entry.category === 'processing' && entry.action === 'processingStarted'))
    // no password and no document content: only name-like subjects
    const text = JSON.stringify(entries.filter((entry) => entry.subject === 'عقد.pdf'))
    assert.ok(!/password|كلمة|عنوان الصفحة|نص عربي/.test(text))
    // switching the category off stops FUTURE entries
    w.signInAs('admin')
    const current = (await w.settings.getSettings()).audit
    await w.settings.updateSection('audit', { ...current, categories: { ...current.categories, uploads: false, processing: false } })
    const before = w.audit().length
    w.signInAs('employee')
    const second = await w.workflow.registerDocument(request({ name: 'ثان.pdf' }))
    await settled(w, second.documentId)
    assert.equal(w.audit().length, before)
  })
})

describe('the central queue and background processing (decisions 2, 3, 22, 23)', () => {
  test('a document goes Pending -> Processing -> Ready for Review and its owner is told, with a link and no redirect', async () => {
    const w = world()
    const { documentId } = await w.workflow.registerDocument(request({ name: 'فاتورة.pdf' }))
    const seen = new Set([stateOf(w, documentId)])
    w.documents.subscribe(() => seen.add(stateOf(w, documentId)))
    await settled(w, documentId)
    assert.ok(seen.has('processing'))
    assert.equal(stateOf(w, documentId), 'readyForReview')
    const record = w.documents.get(documentId)
    assert.ok(record.snapshot.pages.every((entry) => entry.processing.status === 'succeeded' && entry.elements.length > 0))
    assert.ok(record.snapshot.pages.every((entry) => entry.originalExtraction.elements.length === entry.elements.length))
    const notification = w.notifications().find((entry) => entry.documentId === documentId)
    assert.equal(notification.type, 'processingCompleted')
    assert.equal(notification.ownerId, 'demo-employee')
    assert.equal(notification.documentName, 'فاتورة.pdf')
    // a notification only offers a link: it carries no target to navigate to by itself
    assert.ok(!('redirect' in notification) && !('url' in notification))
  })

  test('the work needs no screen: nothing but the queue moves the document along', async () => {
    const w = world()
    const { documentId } = await w.workflow.registerDocument(request())
    // no review session is ever created in this test
    await settled(w, documentId)
    assert.equal(w.documents.get(documentId).snapshot.pages.length, 3)
  })

  test('FIFO: the document that arrived first is processed first, whoever owns it (no priority by role)', async () => {
    const order = []
    const service = createMockProcessingService({ delayMs: 0, shouldFail: () => false })
    const logging = { extractPage: async (call) => (order.push(call.documentId), service.extractPage(call)), forceFailure: service.forceFailure }
    const w = world({ processing: logging })
    const first = await w.workflow.registerDocument(request({ name: 'أول.pdf', totalPages: 2 }))
    w.signInAs('admin')
    const second = await w.workflow.registerDocument(request({ name: 'ثان.pdf', totalPages: 2 }))
    await settled(w, first.documentId)
    await settled(w, second.documentId)
    assert.deepEqual(order, [first.documentId, first.documentId, second.documentId, second.documentId])
  })

  test('each user sees the FIFO position of their own jobs only; the Admin sees all', async () => {
    const w = world({ shouldFail: () => false, processing: { extractPage: () => new Promise(() => {}), forceFailure() {} } }) // never finishes: the queue stays full
    const a = await w.workflow.registerDocument(request({ name: 'أ.pdf' }))
    const b = await w.workflow.registerDocument(request({ name: 'ب.pdf' }))
    w.signInAs('admin')
    const c = await w.workflow.registerDocument(request({ name: 'ج.pdf' }))
    const adminView = await w.workflow.getQueue()
    assert.deepEqual(adminView.jobs.map((job) => [job.documentId, job.state, job.position]), [[a.documentId, 'running', null], [b.documentId, 'queued', 1], [c.documentId, 'queued', 2]])
    w.signInAs('employee')
    const employeeView = await w.workflow.getQueue()
    assert.deepEqual(employeeView.jobs.map((job) => job.documentId), [a.documentId, b.documentId]) // not the Admin's document
    assert.equal(summaryOf(w, c.documentId).state, 'pending')
    assert.equal(summaryOf(w, b.documentId).state, 'pending')
    await until(() => stateOf(w, a.documentId) === 'processing') // it was Pending for a moment after its turn
  })

  test('with more resources several documents run at the same time, still starting in arrival order', async () => {
    const starts = []
    const release = []
    const processing = { extractPage: (call) => new Promise((resolve) => (starts.push(call.documentId), release.push(() => resolve({ elements: [], attempt: 1 })))), forceFailure() {} }
    const w = world({ concurrency: 2, processing })
    const a = await w.workflow.registerDocument(request({ totalPages: 1 }))
    const b = await w.workflow.registerDocument(request({ totalPages: 1 }))
    const c = await w.workflow.registerDocument(request({ totalPages: 1 }))
    await until(() => starts.length === 2)
    assert.deepEqual(starts, [a.documentId, b.documentId])
    assert.equal(stateOf(w, c.documentId), 'pending')
  })

  test('navigating away never cancels a run: the queue outlives every screen', async () => {
    const w = world()
    const { documentId } = await w.workflow.registerDocument(request({ totalPages: 4 }))
    // a screen that subscribes and goes away again must not matter
    const unsubscribe = w.workflow.subscribe(() => {})
    unsubscribe()
    await settled(w, documentId)
    assert.equal(w.documents.get(documentId).snapshot.pages.filter((entry) => entry.processing.status === 'succeeded').length, 4)
  })
})

describe('failure, retry and manual entry (decision 11)', () => {
  test('a page that fails does not fail the document: the others are kept and the page can be handled', async () => {
    const w = world({ shouldFail: ({ pageNumber, attempt }) => pageNumber === 2 && attempt === 1 })
    const { documentId } = await w.workflow.registerDocument(request({ totalPages: 3 }))
    await settled(w, documentId)
    assert.equal(stateOf(w, documentId), 'readyForReview')
    const pages = w.documents.get(documentId).snapshot.pages
    assert.deepEqual(pages.map((entry) => entry.processing.status), ['succeeded', 'failed', 'succeeded'])
    assert.equal(pages[1].processing.errorCode, 'MOCK_OCR_FAILED')
  })

  test('when nothing could be extracted the document is Failed, its owner is told, and the failure is audited', async () => {
    const w = world({ shouldFail: () => true })
    const { documentId } = await w.workflow.registerDocument(request({ name: 'تالف.pdf' }))
    await settled(w, documentId)
    assert.equal(stateOf(w, documentId), 'failed')
    assert.equal(summaryOf(w, documentId).failureCode, 'MOCK_OCR_FAILED')
    assert.equal(w.notifications().find((entry) => entry.documentId === documentId).type, 'processingFailed')
    assert.ok(w.audit().some((entry) => entry.action === 'processingFailed' && entry.outcome === 'failure' && entry.subject === 'تالف.pdf'))
    // the original is still there for a retry or for manual entry
    assert.ok(w.documents.get(documentId).file)
  })

  test('retry needs NO new upload: the same document is processed again, and every attempt is logged', async () => {
    let failing = true
    const w = world({ shouldFail: () => failing })
    const { documentId } = await w.workflow.registerDocument(request())
    await settled(w, documentId)
    assert.equal(stateOf(w, documentId), 'failed')
    failing = false
    await w.workflow.retryDocument(documentId)
    assert.equal(stateOf(w, documentId), 'pending') // back in the queue
    assert.equal(w.documents.list().length, 1) // no second document, no re-upload
    await settled(w, documentId)
    assert.equal(stateOf(w, documentId), 'readyForReview')
    const attempts = w.documents.get(documentId).attempts.filter((entry) => entry.scope === 'document')
    assert.deepEqual(attempts.map((entry) => [entry.attempt, entry.trigger, entry.status]), [[1, 'upload', 'failed'], [2, 'retry', 'succeeded']])
    assert.ok(attempts.every((entry) => entry.startedAt && entry.finishedAt))
    assert.ok(w.audit().some((entry) => entry.action === 'processingRetried'))
  })

  test('a retry is refused for a document that is not failed, for another user, and when storage is full', async () => {
    const w = world({ shouldFail: () => false })
    const ok = await w.workflow.registerDocument(request())
    await settled(w, ok.documentId)
    await rejectsWith(w.workflow.retryDocument(ok.documentId), WORKFLOW_ERROR.invalidState)
    await rejectsWith(w.workflow.retryDocument('nope'), SYSTEM_ERROR.notFound)

    const failing = world({ shouldFail: () => true })
    const bad = await failing.workflow.registerDocument(request())
    await settled(failing, bad.documentId)
    failing.signInAs('disabled') // a different employee (and a deactivated account): cannot even see it
    await rejectsWith(failing.workflow.retryDocument(bad.documentId), SYSTEM_ERROR.forbidden)
    failing.signInAs('admin')
    failing.system.update((draft) => void (draft.storage.scenario = 'full'))
    await rejectsWith(failing.workflow.retryDocument(bad.documentId), WORKFLOW_ERROR.storageFull)
  })

  test('manual entry after a failure makes the document Manual Editing; a retry never overwrites what was typed', async () => {
    let failing = true
    const w = world({ shouldFail: () => failing })
    const { documentId } = await w.workflow.registerDocument(request({ totalPages: 2 }))
    await settled(w, documentId)
    const ids = createSequentialIdGenerator(9000)
    const typed = paragraph(ids, 'كتبته بيدي')
    const record = w.documents.get(documentId)
    const firstPage = record.snapshot.pages[0]
    await w.documents.savePages(documentId, [{ ...firstPage, elements: [typed] }])
    assert.equal(stateOf(w, documentId), 'manualEditing')

    failing = false
    await w.workflow.retryDocument(documentId)
    await settled(w, documentId, ['readyForReview', 'failed', 'manualEditing'])
    await until(() => summaryOf(w, documentId).workflowPhase === 'completed')
    const after = w.documents.get(documentId)
    assert.equal(after.snapshot.pages[0].elements[0].content.text, 'كتبته بيدي') // untouched
    assert.equal(after.snapshot.pages[1].processing.status, 'succeeded') // the untouched page took the result
    // the new result for the typed page waits for the user's decision, as a candidate
    assert.equal(Object.keys(after.candidates).length, 1)
    assert.ok(after.candidates[firstPage.pageNumber].elements.length > 0)
  })
})

describe('deleting during processing (decision 45)', () => {
  test('the Admin deleting a document being processed stops it safely: completed pages stay, other documents are unaffected', async () => {
    const gates = []
    const base = createMockProcessingService({ delayMs: 0, shouldFail: () => false })
    const processing = {
      forceFailure: base.forceFailure,
      extractPage: (call) =>
        new Promise((resolve, reject) => {
          const entry = { call, finish: () => resolve(base.extractPage({ ...call, signal: undefined })) }
          call.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))
          gates.push(entry)
        }),
    }
    const w = world({ processing })
    const first = await w.workflow.registerDocument(request({ name: 'يُحذف.pdf', totalPages: 3 }))
    const second = await w.workflow.registerDocument(request({ name: 'يبقى.pdf', totalPages: 2 }))
    await until(() => gates.length === 1)
    gates[0].finish() // page 1 of the first document completes
    await until(() => gates.length === 2)
    assert.equal(summaryOf(w, first.documentId).processedCount, 1)

    w.signInAs('admin')
    const result = await w.recycleBin.moveToBin(first.documentId)
    assert.equal(result.cancelledProcessing, true)
    await until(() => w.documents.listTrashed().length === 1)
    // the second document starts and finishes normally
    await until(() => gates.length === 3)
    gates[2].finish()
    await until(() => gates.length === 4)
    gates[3].finish()
    await settled(w, second.documentId)
    assert.equal(stateOf(w, second.documentId), 'readyForReview')
    // the deleted document kept its completed result and was not notified about
    const trashed = w.documents.listTrashed()[0]
    assert.equal(trashed.id, first.documentId)
    assert.equal(trashed.processedCount, 1)
    assert.equal(w.documents.peek(first.documentId).workflow.phase, 'completed')
    assert.equal(w.notifications().filter((entry) => entry.documentId === first.documentId).length, 0)
    assert.equal(w.workflow.engine.snapshot().jobs.length, 0)
  })

  test('deleting a document that is only waiting removes it from the queue; nothing else changes', async () => {
    const w = world({ processing: { extractPage: () => new Promise(() => {}), forceFailure() {} } })
    const running = await w.workflow.registerDocument(request())
    const waiting = await w.workflow.registerDocument(request())
    w.signInAs('admin')
    assert.deepEqual(await w.recycleBin.moveToBin(waiting.documentId), { cancelledProcessing: true })
    const jobs = (await w.workflow.getQueue()).jobs
    assert.deepEqual(jobs.map((job) => job.documentId), [running.documentId])
    await until(() => stateOf(w, running.documentId) === 'processing')
  })

  test('an employee cannot delete, not even their own document (42)', async () => {
    const w = world({ shouldFail: () => false })
    const { documentId } = await w.workflow.registerDocument(request())
    await settled(w, documentId)
    await rejectsWith(w.recycleBin.moveToBin(documentId), SYSTEM_ERROR.forbidden)
    assert.equal(w.documents.list().length, 1)
  })
})

describe('storage full pauses the queue and it resumes (decision 35)', () => {
  test('no new processing starts while the disk is full, nothing is deleted, and work resumes when space is available', async () => {
    const w = world()
    const done = await w.workflow.registerDocument(request({ totalPages: 1 }))
    await settled(w, done.documentId)

    w.system.update((draft) => void (draft.storage.scenario = 'full'))
    // a document that is already stored and waits for its turn (registered before the disk filled up)
    const waitingId = w.documents.create({ name: 'ينتظر.pdf', snapshot: makeSnapshot({ selectedPages: [1, 2], totalPages: 2 }), ownerId: 'demo-employee', workflow: { phase: 'pending' } })
    w.workflow.engine.submitDocument({ documentId: waitingId })
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(w.workflow.engine.snapshot().blocked, 'storageFull')
    assert.equal(stateOf(w, waitingId), 'pending') // nothing started
    assert.equal(stateOf(w, done.documentId), 'readyForReview') // existing work is protected, never deleted

    w.system.update((draft) => void (draft.storage.scenario = 'normal'))
    await settled(w, waitingId)
    assert.equal(w.workflow.engine.snapshot().blocked, null)
  })
})

describe('background page jobs outlive the review screen (decisions 2, 38, 40)', () => {
  const setup = async ({ typed = false } = {}) => {
    const w = world({ shouldFail: () => false })
    const { documentId } = await w.workflow.registerDocument(request({ totalPages: 2 }))
    await settled(w, documentId)
    const record = w.documents.get(documentId)
    if (typed) {
      const ids = createSequentialIdGenerator(7000)
      await w.documents.savePages(documentId, [{ ...record.snapshot.pages[0], elements: [paragraph(ids, 'صححته بيدي')], review: { status: 'notReviewed', confirmedAt: null } }])
    }
    return { w, documentId }
  }

  test('a page the user asked to reprocess finishes after the screen was closed; its content waits as a candidate for the next visit', async () => {
    const { w, documentId } = await setup()
    const port = w.workflow.pageProcessing
    let delivered = false
    port.extractPage({ documentId, pageNumber: 1, attempt: 2 }).then(() => (delivered = true), () => {})
    port.detach({ documentId, pageNumber: 1 }) // the screen was closed
    await until(() => w.workflow.engine.snapshot().jobs.length === 0)
    assert.equal(delivered, false) // nobody waits any more
    const record = w.documents.get(documentId)
    // the page held a result already, so the new one is NOT applied: it waits for a decision
    assert.equal(Object.keys(record.candidates).length, 1)
    assert.equal(record.attempts.at(-1).status, 'awaitingDecision')
    assert.ok(w.notifications().some((entry) => entry.documentId === documentId && entry.type === 'processingCompleted'))
  })

  test('an empty page takes a detached result directly, and the accepted result is kept in the history', async () => {
    const w = world({ shouldFail: () => true })
    const { documentId } = await w.workflow.registerDocument(request({ totalPages: 1 }))
    await settled(w, documentId)
    w.extraction.forceFailure(1, 0)
    const ok = createMockProcessingService({ delayMs: 0 })
    const port = createMockDocumentWorkflowService({ context: w.context, store: w.documents, processing: ok, engineOptions: { recheckMs: 5 } }).pageProcessing
    port.extractPage({ documentId, pageNumber: 1, attempt: 2 }).catch(() => {})
    port.detach({ documentId, pageNumber: 1 })
    await until(() => w.documents.get(documentId).snapshot.pages[0].processing.status === 'succeeded')
    const record = w.documents.get(documentId)
    assert.ok(record.snapshot.pages[0].elements.length > 0)
    assert.equal(record.resultHistory[1].length, 1)
    assert.equal(record.candidates[1], undefined)
  })

  test('a failed detached run keeps the current content and is logged with its reason', async () => {
    const { w, documentId } = await setup({ typed: true })
    const failing = createMockProcessingService({ delayMs: 0, shouldFail: () => true })
    const port = createMockDocumentWorkflowService({ context: w.context, store: w.documents, processing: failing, engineOptions: { recheckMs: 5 } }).pageProcessing
    port.extractPage({ documentId, pageNumber: 1, attempt: 3 }).catch(() => {})
    port.detach({ documentId, pageNumber: 1 })
    await until(() => w.documents.get(documentId).attempts.some((entry) => entry.status === 'failed'))
    const record = w.documents.get(documentId)
    assert.equal(record.snapshot.pages[0].elements[0].content.text, 'صححته بيدي')
    assert.equal(record.attempts.at(-1).errorCode, 'MOCK_OCR_FAILED')
    assert.deepEqual(record.candidates, {})
  })
})

describe('review session on the queue port', () => {
  async function opened({ typed = false, actor = 'employee', lockService = null } = {}) {
    const w = world({ actor, shouldFail: () => false })
    const owner = await (async () => {
      w.signInAs('employee')
      const { documentId } = await w.workflow.registerDocument(request({ totalPages: 2 }))
      await settled(w, documentId)
      w.signInAs(actor)
      return documentId
    })()
    const session = (documentId = owner, options = {}) => {
      const s = createReviewSession({
        record: w.documents.get(documentId),
        store: w.documents,
        processing: w.workflow.pageProcessing,
        role: actor === 'admin' ? 'orgAdmin' : 'employee',
        userId: actor === 'admin' ? 'demo-admin' : 'demo-employee',
        lockService,
        approvalService: w.approval,
        generateId: createSequentialIdGenerator(20_000),
        now: () => w.clock.time,
        autosaveOptions: { delayMs: 0, maxWaitMs: 0, retryDelaysMs: [] },
        autoProcess: false,
        ...options,
      })
      s.open()
      return s
    }
    void typed
    return { w, id: owner, session }
  }

  // A processing service whose answers the test releases by hand (after an ordinary first run).
  const gatedProcessing = () => {
    const base = createMockProcessingService({ delayMs: 0, shouldFail: () => false, generateId: createSequentialIdGenerator(30_000) })
    const gates = []
    let gated = false
    return {
      gates,
      forceFailure: base.forceFailure,
      open: () => (gated = true),
      extractPage: (call) => (gated ? new Promise((resolve) => gates.push(() => resolve(base.extractPage({ ...call, signal: undefined })))) : base.extractPage(call)),
    }
  }

  test('closing the session does not cancel the run (decision 2): the queue finishes it and the result waits for the next visit', async () => {
    const gated = gatedProcessing()
    const w = world({ processing: gated })
    const { documentId: id } = await w.workflow.registerDocument(request({ totalPages: 2 }))
    await settled(w, id)
    gated.open()
    const open = () => {
      const s = createReviewSession({ record: w.documents.get(id), store: w.documents, processing: w.workflow.pageProcessing, role: 'employee', userId: 'demo-employee', generateId: createSequentialIdGenerator(21_000), now: () => w.clock.time, autosaveOptions: { delayMs: 0, maxWaitMs: 0, retryDelaysMs: [] }, autoProcess: false })
      s.open()
      return s
    }
    const first = open()
    first.processPage(1)
    await until(() => gated.gates.length === 1)
    assert.deepEqual(first.getView().processingPages, [1])
    // leaving the page with a run in progress is no reason to stay (nothing is lost)
    assert.equal(first.getNavigationGuard().reasons.includes('processingActive'), false)
    await first.close()
    assert.deepEqual(w.workflow.pageProcessing.getActivePages(id).map((job) => job.pageNumber), [1]) // the queue still has it
    gated.gates[0]() // the answer arrives while nobody is looking
    await until(() => w.workflow.engine.snapshot().jobs.length === 0)
    // page 1 already had a result: the new one is a candidate that waits for the user's decision
    const record = w.documents.get(id)
    assert.deepEqual(Object.keys(record.candidates), ['1'])
    assert.equal(record.attempts.at(-1).status, 'awaitingDecision')

    // the next visit shows it again; rejecting it keeps the current content and stores NO content of the rejected result
    const second = open()
    assert.equal(Object.keys(second.getView().candidates).length, 1)
    const current = second.getView().editor.document.pages[0].elements
    assert.equal(second.discardCandidate(1).ok, true)
    assert.deepEqual(second.getView().editor.document.pages[0].elements, current)
    const after = w.documents.get(id)
    assert.deepEqual(after.candidates, {})
    assert.equal(after.attempts.at(-1).status, 'rejected')
    assert.ok(!JSON.stringify(after.attempts).includes('عنوان الصفحة')) // the attempt log holds no content
    await second.close()
  })

  test('a reopened session takes a run that is still going back, and accepting the result keeps every accepted result', async () => {
    const gated = gatedProcessing()
    const w = world({ processing: gated })
    const { documentId: id } = await w.workflow.registerDocument(request({ totalPages: 2 }))
    await settled(w, id)
    gated.open()
    const make = () => {
      const s = createReviewSession({ record: w.documents.get(id), store: w.documents, processing: w.workflow.pageProcessing, role: 'employee', userId: 'demo-employee', generateId: createSequentialIdGenerator(22_000), now: () => w.clock.time, autosaveOptions: { delayMs: 0, maxWaitMs: 0, retryDelaysMs: [] }, autoProcess: false })
      s.open()
      return s
    }
    const first = make()
    first.processPage(1)
    await until(() => gated.gates.length === 1)
    await first.close()

    const second = make() // opened while the queue is still working on page 1
    assert.deepEqual(second.getView().processingPages, [1])
    assert.equal(second.getView().editor.document.pages[0].processing.status, 'processing') // not marked as interrupted
    gated.gates[0]()
    await until(() => Object.keys(second.getView().candidates).length === 1)
    assert.equal(second.getView().processingPages.length, 0)
    assert.equal(second.acceptCandidate(1).ok, true)
    assert.equal(w.documents.get(id).resultHistory[1].length, 2) // the first result and the accepted one, both in full
    assert.deepEqual(w.documents.get(id).candidates, {})
    await second.close()
  })

  test('without the lock service the session edits as before; with it, only the holder may change anything (47)', async () => {
    const { w, id, session } = await opened({ lockService: null })
    const free = session()
    assert.equal(free.getView().lock, null)
    assert.equal(free.dispatch({ type: ACTION.elementAdded, element: paragraph(createSequentialIdGenerator(50_000), 'نص'), pageNumber: 1, index: 0 }).ok, true)

    const lock = createMockEditLockService({ context: w.context })
    const guarded = session(id, { lockService: lock })
    assert.equal(guarded.getView().lock.status, 'checking')
    assert.equal(guarded.dispatch({ type: ACTION.undone }).code, SESSION_ERROR.lockNotHeld) // read-only until the lock is known
    await until(() => guarded.getView().lock.status === 'held')
    assert.equal(guarded.dispatch({ type: ACTION.elementAdded, element: paragraph(createSequentialIdGenerator(51_000), 'نص ٢'), pageNumber: 1, index: 0 }).ok, true)
    await guarded.close()
  })

  test('another editor holds the lock: the session is read-only with the editor name; saved work is kept; it can start editing after they leave', async () => {
    const { w, id, session } = await opened()
    const lock = createMockEditLockService({ context: w.context })
    lock.dev.simulateOtherEditor(id)
    const s = session(id, { lockService: lock })
    await until(() => s.getView().lock.status === 'readOnly')
    assert.equal(s.getView().lock.holderName, SIMULATED_EDITOR.name)
    assert.equal(s.dispatch({ type: ACTION.elementAdded, element: paragraph(createSequentialIdGenerator(52_000), 'ا'), pageNumber: 1, index: 0 }).code, SESSION_ERROR.lockNotHeld)
    assert.equal(s.confirmPageReview(1).code, SESSION_ERROR.lockNotHeld)
    assert.equal((await s.processPage(1)).code, SESSION_ERROR.lockNotHeld) // no reprocessing either
    assert.equal(s.getApprovalEligibility().blockers.includes('editLock'), true) // nor approval
    lock.dev.releaseOtherEditor(id)
    await until(() => s.getView().lock.status === 'available')
    assert.equal((await s.requestEditLock()).ok, true)
    assert.equal(s.getView().lock.status, 'held')
    assert.equal(s.dispatch({ type: ACTION.elementAdded, element: paragraph(createSequentialIdGenerator(53_000), 'الآن'), pageNumber: 1, index: 0 }).ok, true)
    await s.close()
  })

  test('the lock ends while editing: the server refuses the save, the saved changes stay, and retaking the lock saves the rest', async () => {
    const { w, id, session } = await opened()
    const lock = createMockEditLockService({ context: w.context })
    const s = session(id, { lockService: lock })
    await until(() => s.getView().lock.status === 'held')
    const ids = createSequentialIdGenerator(54_000)
    s.dispatch({ type: ACTION.elementAdded, element: paragraph(ids, 'محفوظ'), pageNumber: 1, index: 0 })
    assert.equal((await s.saveDraft()).ok, true)
    assert.equal(w.documents.get(id).snapshot.pages[0].elements[0].content.text, 'محفوظ')

    lock.dev.simulateOtherEditor(id) // the lease ended and a colleague took over
    await until(() => s.getView().lock.status === 'readOnly')
    // typing is refused now, so nothing newer exists; what was saved stays
    assert.equal(s.dispatch({ type: ACTION.elementAdded, element: paragraph(ids, 'جديد'), pageNumber: 1, index: 0 }).ok, false)
    assert.equal(w.documents.get(id).snapshot.pages[0].elements[0].content.text, 'محفوظ')

    // a lock that simply ended (nobody took it) is "lost", and the server refuses a stale save
    lock.dev.releaseOtherEditor(id)
    await until(() => s.getView().lock.status === 'available')
    await s.requestEditLock()
    s.dispatch({ type: ACTION.elementAdded, element: paragraph(ids, 'غير محفوظ بعد'), pageNumber: 1, index: 0 })
    lock.dev.expire(id)
    await until(() => s.getView().lock.status === 'lost')
    const outcome = await s.saveDraft()
    assert.equal(outcome.ok, false)
    assert.equal(w.documents.get(id).snapshot.pages[0].elements.some((element) => element.content.text === 'غير محفوظ بعد'), false)
    assert.equal(s.getEffectiveSaveStatus() !== 'saved', true) // the unsaved change is NOT reported as saved
    await s.requestEditLock()
    await until(() => s.getEffectiveSaveStatus() === 'saved')
    assert.ok(w.documents.get(id).snapshot.pages[0].elements.some((element) => element.content.text === 'غير محفوظ بعد'))
    await s.close()
  })

  test('closing releases the lock, so the next editor can take it at once', async () => {
    const { w, id, session } = await opened()
    const lock = createMockEditLockService({ context: w.context })
    const s = session(id, { lockService: lock })
    await until(() => s.getView().lock.status === 'held')
    await s.close()
    assert.equal(lock.dev.getLock(id), null)
  })

  test('the Save draft button saves and never approves (13)', async () => {
    const { w, id, session } = await opened()
    const s = session()
    s.dispatch({ type: ACTION.elementAdded, element: paragraph(createSequentialIdGenerator(55_000), 'مسودة'), pageNumber: 1, index: 0 })
    assert.notEqual(s.getEffectiveSaveStatus(), 'saved')
    const outcome = await s.saveDraft()
    assert.deepEqual(outcome, { ok: true, status: 'saved' })
    assert.equal(s.getView().approvalStatus, 'none')
    assert.equal(w.documents.get(id).approval.status, 'none')
    assert.ok(s.getView().lastSavedAt)
  })
})

describe('approval and versions (decisions 6, 14, 39)', () => {
  async function approvable(actor = 'employee') {
    const w = world({ shouldFail: () => false })
    w.signInAs('employee')
    const { documentId } = await w.workflow.registerDocument(request({ name: 'عقد.pdf', totalPages: 2 }))
    await settled(w, documentId)
    for (const page of w.documents.get(documentId).snapshot.pages) {
      await w.documents.savePages(documentId, [{ ...page, review: { status: 'reviewed', confirmedAt: '2026-06-01T12:00:00.000Z' } }])
    }
    w.signInAs(actor)
    return { w, id: documentId }
  }

  test('an employee approves their own document: the approved version is kept, the audit has an entry, nothing was automatic', async () => {
    const { w, id } = await approvable()
    assert.equal(stateOf(w, id), 'readyForReview') // finished processing is not approval (6)
    await w.lock.acquire(id)
    await w.approval.requestDocumentApproval(id)
    assert.equal(stateOf(w, id), 'approved')
    const record = w.documents.get(id)
    assert.equal(record.versions.length, 1)
    assert.equal(record.versions[0].approvedByName, 'موظف تجريبي')
    assert.ok(record.versions[0].approvedAt)
    assert.ok(w.audit().some((entry) => entry.category === 'approval' && entry.action === 'approved' && entry.subject === 'عقد.pdf'))
  })

  test('another employee cannot approve it (not even see it); the Admin approves any; there is no reviewer role', async () => {
    const { w, id } = await approvable('disabled')
    await rejectsWith(w.approval.requestDocumentApproval(id), SYSTEM_ERROR.forbidden) // a deactivated/other account
    w.signInAs('admin')
    await w.lock.acquire(id)
    await w.approval.requestDocumentApproval(id)
    assert.equal(stateOf(w, id), 'approved')
  })

  test('the server checks the lock and the prerequisites again on approval', async () => {
    const { w, id } = await approvable()
    await rejectsWith(w.approval.requestDocumentApproval(id), WORKFLOW_ERROR.lockLost) // never took the lock
    w.lock.dev.simulateOtherEditor(id)
    await rejectsWith(w.approval.requestDocumentApproval(id), WORKFLOW_ERROR.lockHeld)
    w.lock.dev.releaseOtherEditor(id)
    // a page that is not reviewed any more
    await w.lock.acquire(id)
    const page = w.documents.get(id).snapshot.pages[0]
    await w.documents.savePages(id, [{ ...page, review: { status: 'invalidated', confirmedAt: null } }])
    await rejectsWith(w.approval.requestDocumentApproval(id), WORKFLOW_ERROR.notEligible)
    assert.equal(stateOf(w, id), 'readyForReview')
  })

  test('an approved document cannot be approved again; only the Admin creates a new version, which needs a new approval and keeps the old one', async () => {
    const { w, id } = await approvable()
    await w.lock.acquire(id)
    await w.approval.requestDocumentApproval(id)
    await rejectsWith(w.approval.requestDocumentApproval(id), WORKFLOW_ERROR.invalidState)
    await rejectsWith(w.approval.requestNewEditableVersion(id), SYSTEM_ERROR.forbidden) // the owner cannot

    w.signInAs('admin')
    await w.approval.requestNewEditableVersion(id)
    assert.equal(stateOf(w, id), 'readyForReview') // editable again, needs a new approval
    assert.equal(summaryOf(w, id).versionCount, 1) // the approved version is still there
    assert.ok(w.audit().some((entry) => entry.category === 'approvedEdits' && entry.action === 'newVersionCreated'))

    await w.lock.acquire(id)
    await w.approval.requestDocumentApproval(id)
    const record = w.documents.get(id)
    assert.deepEqual(record.versions.map((version) => version.number), [1, 2])
    assert.equal(record.versions[1].approvedByName, 'مدير تجريبي')
    assert.ok(w.audit().some((entry) => entry.category === 'approvedEdits' && entry.action === 'reapproved'))
    // the history is independent of the audit log: dropping the whole log changes nothing
    w.system.update((draft) => void (draft.audit = []))
    assert.equal(w.documents.getMeta(id).versions.length, 2)
  })

  test('an approved version can be opened later with exactly the content that was approved', async () => {
    const { w, id } = await approvable()
    await w.lock.acquire(id)
    await w.approval.requestDocumentApproval(id)
    const approvedText = w.documents.get(id).snapshot.pages[0].elements[0].content.text
    w.signInAs('admin')
    await w.approval.requestNewEditableVersion(id)
    const page = w.documents.get(id).snapshot.pages[0]
    await w.documents.savePages(id, [{ ...page, elements: [{ ...page.elements[0], content: { text: 'تعديل المدير' } }] }])
    assert.equal(w.documents.getVersion(id, 1).snapshot.pages[0].elements[0].content.text, approvedText)
    assert.equal(w.documents.getVersion(id, 9), null)
  })

  test('the audit category switch of approval is respected', async () => {
    const { w, id } = await approvable()
    w.signInAs('admin')
    const current = (await w.settings.getSettings()).audit
    await w.settings.updateSection('audit', { ...current, categories: { ...current.categories, approval: false } })
    await w.lock.acquire(id)
    const before = w.audit().filter((entry) => entry.category === 'approval').length // (the seeded sample entries)
    await w.approval.requestDocumentApproval(id)
    assert.equal(w.audit().filter((entry) => entry.category === 'approval').length, before)
    assert.equal(stateOf(w, id), 'approved') // the approval itself still happened: only its log entry is off
  })
})

describe('export (decisions 8, 46)', () => {
  async function approved({ pages = [1, 2, 3], totalPages = 6 } = {}) {
    const w = world({ shouldFail: () => false })
    const { documentId } = await w.workflow.registerDocument(request({ name: 'تقرير.pdf', totalPages, pages }))
    await settled(w, documentId)
    for (const page of w.documents.get(documentId).snapshot.pages) {
      await w.documents.savePages(documentId, [{ ...page, review: { status: 'reviewed', confirmedAt: '2026-06-01T12:00:00.000Z' } }])
    }
    await w.lock.acquire(documentId)
    await w.approval.requestDocumentApproval(documentId)
    return { w, id: documentId }
  }

  test('JSON is a real file of the approved results: selected pages only, original order, source page numbers', async () => {
    const { w, id } = await approved({ pages: [2, 4, 5], totalPages: 6 })
    const result = await w.exporter.exportDocument({ documentId: id, format: 'json' })
    assert.equal(result.fileName, 'تقرير.json')
    assert.ok(result.blob instanceof Blob)
    const data = JSON.parse(await result.blob.text())
    assert.deepEqual(data.pages.map((entry) => entry.sourcePage), [2, 4, 5])
    assert.equal(data.file.totalPages, 6)
    assert.equal(data.pages[0].elements.length > 0, true)
    assert.ok(!JSON.stringify(data).includes('"source"'))
  })

  test('Word, Excel and PDF are NOT faked: no file is created, and the result says it is a simulation', async () => {
    const { w, id } = await approved()
    for (const format of ['docx', 'xlsx', 'pdf']) {
      const result = await w.exporter.exportDocument({ documentId: id, format })
      assert.equal(result.simulated, true)
      assert.equal(result.blob, undefined)
      assert.equal(result.pageCount, 3)
      assert.deepEqual(result.sourcePages, [1, 2, 3])
    }
    await rejectsWith(w.exporter.exportDocument({ documentId: id, format: 'exe' }), SYSTEM_ERROR.invalidInput)
  })

  test('only approved results are exported: a document never approved cannot be, a draft of a new version does not hide the approved one', async () => {
    const w = world({ shouldFail: () => false })
    const { documentId } = await w.workflow.registerDocument(request())
    await settled(w, documentId)
    await rejectsWith(w.exporter.exportDocument({ documentId, format: 'json' }), SYSTEM_ERROR.forbidden)

    const { w: ok, id } = await approved()
    const before = JSON.parse(await (await ok.exporter.exportDocument({ documentId: id, format: 'json' })).blob.text())
    ok.signInAs('admin')
    await ok.approval.requestNewEditableVersion(id)
    const page = ok.documents.get(id).snapshot.pages[0]
    await ok.documents.savePages(id, [{ ...page, elements: [{ ...page.elements[0], content: { text: 'مسودة غير معتمدة' } }] }])
    const during = JSON.parse(await (await ok.exporter.exportDocument({ documentId: id, format: 'json' })).blob.text())
    assert.deepEqual(during, before) // still the approved version
    assert.ok(!JSON.stringify(during).includes('مسودة غير معتمدة'))
  })

  test('another employee cannot export or download the original; the owner and the Admin can download the complete original', async () => {
    const { w, id } = await approved()
    w.signInAs('disabled')
    await rejectsWith(w.exporter.exportDocument({ documentId: id, format: 'json' }), SYSTEM_ERROR.forbidden)
    await rejectsWith(w.exporter.getOriginal(id), SYSTEM_ERROR.forbidden)
    w.signInAs('employee')
    const original = await w.exporter.getOriginal(id)
    assert.equal(original.fileName, 'تقرير.pdf')
    assert.ok(original.blob instanceof Blob)
    w.signInAs('admin')
    assert.ok((await w.exporter.getOriginal(id)).blob)
  })

  test('a failed export is reported (not silently ignored) and the next one works', async () => {
    const { w, id } = await approved()
    w.exporter.dev.failNextExport()
    await assert.rejects(w.exporter.exportDocument({ documentId: id, format: 'json' }), SystemError)
    assert.ok((await w.exporter.exportDocument({ documentId: id, format: 'json' })).blob)
  })
})

describe('templates and classification (the decisions define no template management)', () => {
  test('an unknown layout is accepted and processed: it simply has no template and no type', async () => {
    assert.deepEqual(classifyByName('scan-007.pdf'), { documentType: null, template: null })
    const w = world({ shouldFail: () => false })
    const { documentId } = await w.workflow.registerDocument(request({ name: 'scan-007.pdf' }))
    await settled(w, documentId)
    const item = summaryOf(w, documentId)
    assert.equal(item.state, 'readyForReview') // never rejected for matching no template
    assert.equal(item.template, null)
    assert.equal(item.documentType, null)
  })

  test('the class is the functional nature of the document, never the file extension', () => {
    for (const name of ['scan.pdf', 'photo.png', 'image.JPG', 'doc.docx', 'a.id']) assert.equal(classifyByName(name).documentType, null, name)
    assert.equal(classifyByName('شهادة تخرج.pdf').documentType, 'certificate')
    assert.equal(classifyByName('طلب إجازة.jpg').documentType, 'administrativeRequest')
    assert.equal(classifyByName('contract-2026.pdf').documentType, 'contract')
  })

  test('a recognised layout is remembered with the document, and the catalogue is read only', async () => {
    const w = world({ shouldFail: () => false })
    const { documentId } = await w.workflow.registerDocument(request({ name: 'فاتورة المورد.pdf' }))
    await settled(w, documentId)
    assert.equal(summaryOf(w, documentId).documentType, 'invoice')
    assert.ok(summaryOf(w, documentId).template.name)
    const list = await w.templates.list()
    assert.ok(list.length >= 1)
    assert.deepEqual(Object.keys(w.templates).sort(), ['isMock', 'list']) // no create/update/delete/train
    w.signInAs(null)
    await rejectsWith(w.templates.list(), SYSTEM_ERROR.forbidden)
  })
})

describe('production services are "not connected" and invent nothing', () => {
  test('each replaceable service refuses without a backend (Node has no import.meta.env, like a production build)', async () => {
    assert.equal(createDocumentWorkflowService(), NOT_CONNECTED_WORKFLOW)
    assert.equal(createApprovalService(), NOT_CONNECTED_APPROVAL)
    assert.equal(createEditLockService(), NOT_CONNECTED_EDIT_LOCK)
    assert.equal(createExportService(), NOT_CONNECTED_EXPORT)
    assert.equal(createTemplateService(), NOT_CONNECTED_TEMPLATES)
    for (const service of [NOT_CONNECTED_WORKFLOW, NOT_CONNECTED_EDIT_LOCK, NOT_CONNECTED_EXPORT, NOT_CONNECTED_TEMPLATES]) assert.equal(service.isMock, false)
    await rejectsWith(NOT_CONNECTED_WORKFLOW.registerDocument(), SYSTEM_ERROR.notConnected)
    await rejectsWith(NOT_CONNECTED_WORKFLOW.getUploadAvailability(), SYSTEM_ERROR.notConnected)
    await rejectsWith(NOT_CONNECTED_EDIT_LOCK.acquire(), SYSTEM_ERROR.notConnected)
    await rejectsWith(NOT_CONNECTED_EXPORT.exportDocument(), SYSTEM_ERROR.notConnected)
    await rejectsWith(NOT_CONNECTED_TEMPLATES.list(), SYSTEM_ERROR.notConnected)
    await assert.rejects(NOT_CONNECTED_APPROVAL.requestDocumentApproval(), (error) => error.code === 'APPROVAL_NOT_CONNECTED')
    await rejectsWith(NOT_CONNECTED_PAGE_PROCESSING.extractPage(), SYSTEM_ERROR.notConnected)
    assert.equal(NOT_CONNECTED_PAGE_PROCESSING.survivesSessionClose, false)
    assert.equal(NOT_CONNECTED_WORKFLOW.dev, undefined) // no simulation switches in production
    assert.equal(NOT_CONNECTED_EDIT_LOCK.dev, undefined)
  })
})
