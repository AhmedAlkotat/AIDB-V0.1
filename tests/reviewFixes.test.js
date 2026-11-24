// Regression tests for the fixes M-1 .. M-5 of the independent review:
//   M-1  invalid extraction results are never applied; the page never sticks on "processing"
//   M-2  invalid candidates are never kept; the comparison view cannot crash
//   M-3  a refused "accept" is reported and never looks like success
//   M-4  the document is frozen while an approval request is pending; approval is persisted
//   M-5  autosave stores only the pages that changed

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDocument } from '../src/domain/document/document.js'
import { createElement } from '../src/domain/document/elements.js'
import { checkExtractionResult, EXTRACTION_PROBLEM } from '../src/domain/document/extractionResult.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'
import { getPageUiStatus } from '../src/domain/document/pageStatus.js'
import { getReviewProgress } from '../src/domain/document/review.js'
import { parseDocumentJson, serializeDocument, serializePage } from '../src/domain/document/serialization.js'
import { validateDocument } from '../src/domain/document/validation.js'
import { runAcceptCandidate } from '../src/components/review/acceptFlow.js'
import { summarizeElement } from '../src/components/review/elementSummary.js'
import { createMemoryDocumentStore, StorageError } from '../src/services/documentStore.js'
import { createMockProcessingService } from '../src/services/mockProcessingService.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { canUndo } from '../src/state/documentSession/documentSelectors.js'
import { createReviewSession, SESSION_ERROR } from '../src/state/documentSession/reviewSession.js'
import { FILE, paragraph } from './helpers.js'
import { createManualScheduler, deferred, makeSession, makeSnapshot, pageOf, settle } from './sessionHelpers.js'

const view = (session) => session.getView()
const add = (session, pageNumber, element) => session.dispatch({ type: ACTION.elementAdded, pageNumber, element })
const edit = (session, pageNumber, elementId, patch) => session.dispatch({ type: ACTION.elementEdited, pageNumber, elementId, patch })

// Elements as an AI service would return them (IDs from their own generator).
function serviceElements(ids, count = 1, text = 'نتيجة') {
  return Array.from({ length: count }, (_, index) =>
    createElement('paragraph', { content: { text: `${text} ${index + 1}` }, source: { kind: 'ai', details: { mock: false } } }, { generateId: ids }),
  )
}

// A service that answers each call with the next prepared result.
function scriptedService(...results) {
  const calls = []
  return {
    calls,
    extractPage: async (args) => {
      calls.push(args)
      const next = results[Math.min(calls.length - 1, results.length - 1)]
      return typeof next === 'function' ? next(args) : next
    },
  }
}

// ======================================================================= M-1
describe('M-1: invalid extraction results are never applied', () => {
  test('duplicate element IDs: the page is marked failed (not stuck on processing) and stays editable', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const [duplicate] = serviceElements(ids)
    const service = scriptedService({ elements: [duplicate, { ...duplicate }] })
    const { session, ids: sessionIds } = makeSession({ processing: service })

    const result = await session.processPage(1)
    assert.equal(result.ok, false)
    assert.deepEqual(pageOf(session, 1).processing, { status: 'failed', errorCode: 'INVALID_EXTRACTION_RESULT' })
    assert.deepEqual(view(session).processingPages, [])
    assert.equal(getPageUiStatus(pageOf(session, 1)), 'failed')
    assert.equal(pageOf(session, 1).elements.length, 0)
    assert.equal(pageOf(session, 1).originalExtraction, null)
    assert.deepEqual(validateDocument(view(session).editor.document), { valid: true, errors: [] })
    // The page is usable: a manual element can be added and nothing says "processing".
    assert.equal(add(session, 1, paragraph(sessionIds, 'يدوي')).ok, true)
  })

  test('the user can retry and a valid result is then applied', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const [duplicate] = serviceElements(ids)
    const service = scriptedService({ elements: [duplicate, { ...duplicate }] }, () => ({ elements: serviceElements(ids, 2, 'صالحة') }))
    const { session } = makeSession({ processing: service })
    await session.processPage(1)
    assert.equal(pageOf(session, 1).processing.status, 'failed')
    const retry = await session.processPage(1)
    assert.equal(retry.ok, true)
    assert.deepEqual(pageOf(session, 1).processing, { status: 'succeeded', errorCode: null })
    assert.equal(pageOf(session, 1).elements.length, 2)
    assert.equal(view(session).attempts[1].map((a) => a.outcome).join(), 'failed,applied')
  })

  test('duplicate table row/cell IDs, unknown types, bad content and non-list results are all rejected', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const table = createElement('table', { content: { rows: [['أ', 'ب']] } }, { generateId: ids })
    const sameCell = { ...table, content: { rows: [{ id: 'r1', cells: [{ id: 'c1', text: 'أ' }, { id: 'c1', text: 'ب' }] }] } }
    const unknownType = { ...serviceElements(ids)[0], type: 'chart' }
    const badContent = { ...serviceElements(ids)[0], content: { text: 42 } }
    const noRows = { ...table, content: { rows: [] } }
    const candidates = {
      'duplicate cell IDs': { elements: [sameCell] },
      'unknown element type': { elements: [unknownType] },
      'wrong content type': { elements: [badContent] },
      'a table without rows': { elements: [noRows] },
      'a result that is not a list': { elements: 'not a list' },
      'a result without elements': {},
      'no result at all': undefined,
      'null elements': { elements: null },
      'a list with non-objects': { elements: [1, 'x', null] },
    }
    for (const [label, result] of Object.entries(candidates)) {
      const { session } = makeSession({ processing: scriptedService(result) })
      const outcome = await session.processPage(1)
      assert.equal(outcome.ok, false, label)
      assert.deepEqual(pageOf(session, 1).processing, { status: 'failed', errorCode: 'INVALID_EXTRACTION_RESULT' }, label)
      assert.equal(pageOf(session, 1).elements.length, 0, label)
      assert.deepEqual(view(session).processingPages, [], label)
    }
  })

  test('an ID already used on another page is rejected and the other page is untouched', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const clashing = createElement('paragraph', { id: 'used-on-page-2', content: { text: 'نتيجة' } }, { generateId: ids })
    const { session } = makeSession({ processing: scriptedService({ elements: [clashing] }) })
    add(session, 2, createElement('paragraph', { id: 'used-on-page-2', content: { text: 'صفحة ٢' } }))
    const before = JSON.stringify(pageOf(session, 2))
    const result = await session.processPage(1)
    assert.equal(result.ok, false)
    assert.equal(pageOf(session, 1).processing.errorCode, 'INVALID_EXTRACTION_RESULT')
    assert.equal(JSON.stringify(pageOf(session, 2)), before)
    assert.deepEqual(validateDocument(view(session).editor.document), { valid: true, errors: [] })
  })

  test('a failed reprocess with an invalid result keeps the content, corrections, review and undo history', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const service = scriptedService(() => ({ elements: serviceElements(ids, 2) }), () => {
      const [first] = serviceElements(ids)
      return { elements: [first, { ...first }] }
    })
    const { session } = makeSession({ processing: service, selectedPages: [1, 2], totalPages: 2 })
    await session.processPage(1)
    const corrected = pageOf(session, 1).elements[0]
    edit(session, 1, corrected.id, { text: 'تصحيح المراجع' })
    session.confirmPageReview(1)
    const before = JSON.stringify(pageOf(session, 1))

    const result = await session.processPage(1)
    assert.equal(result.ok, false)
    assert.equal(JSON.stringify(pageOf(session, 1)), before)
    assert.equal(pageOf(session, 1).review.status, 'reviewed')
    assert.equal(pageOf(session, 1).processing.status, 'succeeded')
    assert.equal(canUndo(view(session).editor, 1), true)
    assert.equal(view(session).candidates[1], undefined)
    assert.deepEqual(view(session).notices[1], { code: 'reprocessFailed', errorCode: 'INVALID_EXTRACTION_RESULT' })
    assert.equal(view(session).attempts[1].at(-1).outcome, 'failed')
    assert.deepEqual(view(session).processingPages, [])
  })

  test('manual content on a failed page survives an invalid retry and the page stays failed', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const service = scriptedService(() => { throw Object.assign(new Error('down'), { code: 'MOCK_OCR_FAILED' }) }, { elements: 'garbage' })
    const { session } = makeSession({ processing: service })
    await session.processPage(1)
    add(session, 1, createElement('paragraph', { content: { text: 'أدخلته يدويًا' } }, { generateId: ids }))
    await session.processPage(1)
    assert.equal(pageOf(session, 1).elements[0].content.text, 'أدخلته يدويًا')
    assert.equal(pageOf(session, 1).processing.status, 'failed')
    assert.equal(getPageUiStatus(pageOf(session, 1)), 'manualEditing')
    assert.equal(view(session).candidates[1], undefined)
  })

  test('a valid result is applied as a copy: later changes by the service cannot reach the page', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const [shared] = serviceElements(ids)
    const { session } = makeSession({ processing: scriptedService({ elements: [{ ...shared, order: 9 }] }) })
    await session.processPage(1)
    shared.content.text = 'تلاعب'
    assert.equal(pageOf(session, 1).elements[0].content.text, 'نتيجة 1')
    assert.equal(pageOf(session, 1).elements[0].order, 0)
    assert.equal(pageOf(session, 1).originalExtraction.elements[0].content.text, 'نتيجة 1')
  })

  test('checkExtractionResult explains why a result was rejected', () => {
    const ids = createSequentialIdGenerator(50_000)
    const { session } = makeSession()
    const document = view(session).editor.document
    const [element] = serviceElements(ids)
    assert.equal(checkExtractionResult(document, 1, [element]).ok, true)
    assert.equal(checkExtractionResult(document, 1, 'x').problem, EXTRACTION_PROBLEM.notAList)
    assert.equal(checkExtractionResult(document, 1, [{ ...element, type: 'chart' }]).problem, EXTRACTION_PROBLEM.invalidElements)
    const duplicated = checkExtractionResult(document, 1, [element, { ...element }])
    assert.equal(duplicated.problem, EXTRACTION_PROBLEM.invalidElements)
    assert.ok(duplicated.errors.some((error) => error.code === 'DUPLICATE_ID'))
    // The input is never modified.
    const input = [{ ...element, order: 5 }]
    checkExtractionResult(document, 1, input)
    assert.equal(input[0].order, 5)
  })
})

// ======================================================================= M-2
describe('M-2: invalid candidates are never kept', () => {
  async function pageWithContent(service) {
    const context = makeSession({ processing: service, selectedPages: [1, 2], totalPages: 2 })
    add(context.session, 1, paragraph(context.ids, 'محتوى موجود'))
    return context
  }

  test('an invalid result for a page that has content is not stored as a candidate', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const [duplicate] = serviceElements(ids)
    const { session } = await pageWithContent(scriptedService({ elements: [duplicate, { ...duplicate }] }))
    const result = await session.processPage(1)
    assert.equal(result.ok, false)
    assert.deepEqual(Object.keys(view(session).candidates), [])
    assert.equal(pageOf(session, 1).elements[0].content.text, 'محتوى موجود')
    assert.equal(view(session).notices[1].errorCode, 'INVALID_EXTRACTION_RESULT')
    assert.deepEqual(view(session).processingPages, [])
  })

  test('a candidate whose IDs clash with another page is not stored', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const clashing = createElement('paragraph', { id: 'clash', content: { text: 'جديد' } }, { generateId: ids })
    const { session } = await pageWithContent(scriptedService({ elements: [clashing] }))
    add(session, 2, createElement('paragraph', { id: 'clash', content: { text: 'صفحة ٢' } }))
    await session.processPage(1)
    assert.equal(view(session).candidates[1], undefined)
    assert.equal(view(session).notices[1].errorCode, 'INVALID_EXTRACTION_RESULT')
  })

  test('a valid candidate is stored as an independent copy', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const [element] = serviceElements(ids)
    const { session } = await pageWithContent(scriptedService({ elements: [element] }))
    await session.processPage(1)
    assert.equal(view(session).candidates[1].elements[0].content.text, 'نتيجة 1')
    element.content.text = 'تلاعب'
    assert.equal(view(session).candidates[1].elements[0].content.text, 'نتيجة 1')
  })

  test('the comparison view cannot crash on malformed elements', () => {
    const malformed = [
      null,
      undefined,
      'text',
      42,
      {},
      { type: 'table' },
      { type: 'table', content: { rows: [] } },
      { type: 'table', content: { rows: [{ cells: [] }] } },
      { type: 'field', content: null },
      { type: 'paragraph', content: { text: 5 } },
      { type: 'heading' },
      { type: 'chart', content: {} },
    ]
    for (const element of malformed) {
      const summary = summarizeElement(element)
      assert.ok(['heading', 'paragraph', 'table', 'field', 'unclassified'].includes(summary.type), JSON.stringify(element))
      assert.equal(typeof summary.text, 'string')
    }
  })

  test('well-formed elements are still summarised correctly', () => {
    const ids = createSequentialIdGenerator(1)
    const make = (type, content) => createElement(type, { content }, { generateId: ids })
    assert.deepEqual(summarizeElement(make('paragraph', { text: 'نص' })), { type: 'paragraph', text: 'نص' })
    assert.deepEqual(summarizeElement(make('field', { key: 'ك', value: 'ق' })), { type: 'field', text: 'ك: ق' })
    assert.match(summarizeElement(make('table', { rows: [['أ', 'ب'], ['ج', 'د']] })).text, /^2×2 — أ \| ب$/)
  })
})

// ======================================================================= M-3
describe('M-3: a refused "accept" is reported and never looks like success', () => {
  test('the dialog flow closes only on success', () => {
    assert.deepEqual(runAcceptCandidate(() => ({ ok: true })), { closeDialog: true, errorCode: null })
    assert.deepEqual(runAcceptCandidate(() => ({ ok: false, code: 'INVALID_DOCUMENT' })), { closeDialog: false, errorCode: 'INVALID_DOCUMENT' })
    assert.deepEqual(runAcceptCandidate(() => ({ ok: false })), { closeDialog: false, errorCode: 'UNKNOWN' })
    // Anything that is not an explicit success keeps the dialog open.
    assert.deepEqual(runAcceptCandidate(() => undefined), { closeDialog: false, errorCode: 'UNKNOWN' })
    assert.deepEqual(runAcceptCandidate(() => null), { closeDialog: false, errorCode: 'UNKNOWN' })
    assert.deepEqual(runAcceptCandidate(() => ({ ok: 'yes' })), { closeDialog: false, errorCode: 'UNKNOWN' })
    assert.deepEqual(runAcceptCandidate(() => { throw new Error('boom') }), { closeDialog: false, errorCode: 'UNKNOWN' })
  })

  // A candidate that was valid when stored, but whose ID was taken afterwards.
  async function candidateThenClash() {
    const ids = createSequentialIdGenerator(50_000)
    const candidate = createElement('paragraph', { id: 'cand-id', content: { text: 'نتيجة جديدة' } }, { generateId: ids })
    const context = makeSession({ processing: scriptedService({ elements: [candidate] }), selectedPages: [1, 2], totalPages: 2 })
    add(context.session, 2, paragraph(context.ids, 'محتوى الصفحة ٢'))
    await context.session.processPage(2)
    assert.ok(view(context.session).candidates[2])
    const clash = createElement('paragraph', { id: 'cand-id', content: { text: 'أخذ المعرّف' } })
    assert.equal(add(context.session, 1, clash).ok, true)
    return { ...context, clash }
  }

  test('accepting a candidate the document now refuses fails explicitly and changes nothing', async () => {
    const { session } = await candidateThenClash()
    const before = JSON.stringify(pageOf(session, 2))
    const result = session.acceptCandidate(2)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_DOCUMENT')
    assert.ok(result.details.errors.some((error) => error.code === 'DUPLICATE_ID'))
    assert.ok(view(session).candidates[2], 'the candidate stays pending so the user can still decide')
    assert.equal(JSON.stringify(pageOf(session, 2)), before)
    assert.equal(canUndo(view(session).editor, 2), true, 'undo history is not cleared by a refused accept')
    assert.ok(!view(session).attempts[2].some((attempt) => attempt.outcome === 'accepted'))
    assert.deepEqual(validateDocument(view(session).editor.document), { valid: true, errors: [] })
  })

  test('the UI flow keeps the dialog open for that refusal, and closes once accepting works', async () => {
    const { session, clash } = await candidateThenClash()
    const refused = runAcceptCandidate(() => session.acceptCandidate(2))
    assert.deepEqual({ closeDialog: refused.closeDialog, errorCode: refused.errorCode }, { closeDialog: false, errorCode: 'INVALID_DOCUMENT' })

    // The user resolves the clash; accepting then succeeds.
    session.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: clash.id })
    const accepted = runAcceptCandidate(() => session.acceptCandidate(2))
    assert.deepEqual(accepted, { closeDialog: true, errorCode: null })
    assert.equal(pageOf(session, 2).elements[0].content.text, 'نتيجة جديدة')
    assert.equal(view(session).candidates[2], undefined)
    assert.equal(view(session).attempts[2].at(-1).outcome, 'accepted')
  })

  test('accepting while an approval request is pending is refused, and the candidate stays', async () => {
    const ids = createSequentialIdGenerator(50_000)
    const slow = deferred()
    const approvalService = { requestDocumentApproval: () => slow.promise, requestNewEditableVersion: async () => {} }
    const { session, ids: sessionIds } = makeSession({
      processing: scriptedService({ elements: serviceElements(ids, 1, 'مرشح') }),
      approvalService,
      selectedPages: [1],
      totalPages: 1,
    })
    add(session, 1, paragraph(sessionIds, 'محتوى'))
    session.confirmPageReview(1)
    await session.processPage(1)
    await session.flushSave()
    assert.ok(view(session).candidates[1])

    const request = session.requestApproval()
    const refused = session.acceptCandidate(1)
    assert.deepEqual({ ok: refused.ok, code: refused.code }, { ok: false, code: SESSION_ERROR.approvalPending })
    assert.ok(view(session).candidates[1])
    assert.equal(pageOf(session, 1).elements[0].content.text, 'محتوى')
    slow.reject(new Error('cancelled'))
    await request
  })
})

// ======================================================================= M-4
describe('M-4: approval freezes the document and is persisted', () => {
  async function approvable(options = {}) {
    const context = makeSession({ selectedPages: [1, 2], totalPages: 2, ...options })
    for (const pageNumber of [1, 2]) {
      add(context.session, pageNumber, paragraph(context.ids, `نص ${pageNumber}`))
      context.session.confirmPageReview(pageNumber)
    }
    await context.session.flushSave()
    assert.equal(context.session.getApprovalEligibility().eligible, true)
    return context
  }
  const slowService = () => {
    const calls = { approve: 0 }
    const pending = deferred()
    return { calls, pending, requestDocumentApproval: () => { calls.approve += 1; return pending.promise }, requestNewEditableVersion: async () => {} }
  }

  test('edits, undo, review changes, accepting and processing are refused while the request is pending', async () => {
    const service = slowService()
    const { session, ids } = await approvable({ approvalService: service })
    const element = pageOf(session, 1).elements[0]

    const request = session.requestApproval()
    assert.equal(view(session).approvalPending, true)
    assert.equal(edit(session, 1, element.id, { text: 'تعديل أثناء الطلب' }).code, SESSION_ERROR.approvalPending)
    assert.equal(add(session, 1, paragraph(ids, 'x')).code, SESSION_ERROR.approvalPending)
    assert.equal(session.dispatch({ type: ACTION.undone, pageNumber: 1 }).code, SESSION_ERROR.approvalPending)
    assert.equal(session.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: element.id }).code, SESSION_ERROR.approvalPending)
    assert.equal(session.confirmPageReview(1).code, SESSION_ERROR.approvalPending)
    assert.deepEqual(await session.processPage(1), { ok: false })
    // Reading is still possible.
    assert.equal(session.goToPage(2).ok, true)
    assert.equal(pageOf(session, 1).elements[0].content.text, 'نص 1')

    service.pending.resolve()
    assert.deepEqual(await request, { ok: true, persisted: true })
  })

  test('what is approved is exactly what was checked: every page is still reviewed afterwards', async () => {
    const service = slowService()
    const { session } = await approvable({ approvalService: service })
    const request = session.requestApproval()
    edit(session, 1, pageOf(session, 1).elements[0].id, { text: 'محاولة تعديل' })
    service.pending.resolve()
    await request
    assert.equal(view(session).approvalStatus, 'approved')
    assert.equal(getReviewProgress(view(session).editor.document).isComplete, true)
    assert.equal(pageOf(session, 1).elements[0].content.text, 'نص 1')
  })

  test('a second request while one is pending is refused and the service is called once', async () => {
    const service = slowService()
    const { session } = await approvable({ approvalService: service })
    const first = session.requestApproval()
    const second = await session.requestApproval()
    assert.deepEqual(second, { ok: false, code: SESSION_ERROR.approvalPending })
    service.pending.resolve()
    await first
    assert.equal(service.calls.approve, 1)
  })

  test('a failed request marks nothing as approved, stores nothing and unfreezes the document', async () => {
    const service = slowService()
    const { session, store, id, ids } = await approvable({ approvalService: service })
    const request = session.requestApproval()
    service.pending.reject(new Error('server said no'))
    assert.deepEqual(await request, { ok: false, code: 'APPROVAL_FAILED' })
    assert.equal(view(session).approvalPending, false)
    assert.equal(view(session).approvalStatus, 'none')
    assert.equal(store.get(id).approval.status, 'none')
    assert.equal(add(session, 1, paragraph(ids, 'يمكن التعديل مجددًا')).ok, true)
  })

  test('without a backend the request is refused, nothing is approved and the document stays editable', async () => {
    const { session, store, id, ids } = await approvable()
    assert.deepEqual(await session.requestApproval(), { ok: false, code: 'APPROVAL_NOT_CONNECTED' })
    assert.equal(view(session).approvalPending, false)
    assert.equal(view(session).approvalStatus, 'none')
    assert.equal(store.get(id).approval.status, 'none')
    assert.equal(add(session, 1, paragraph(ids, 'x')).ok, true)
  })

  test('an ineligible request never freezes the document', async () => {
    const { session, ids } = makeSession({ selectedPages: [1], totalPages: 1 })
    assert.equal((await session.requestApproval()).code, SESSION_ERROR.notEligible)
    assert.equal(view(session).approvalPending, false)
    assert.equal(add(session, 1, paragraph(ids, 'x')).ok, true)
  })

  test('after success the approval is persisted: reopening finds an approved, read-only document', async () => {
    const approvalService = { requestDocumentApproval: async () => {}, requestNewEditableVersion: async () => {} }
    const { session, store, id } = await approvable({ approvalService })
    assert.deepEqual(await session.requestApproval(), { ok: true, persisted: true })
    assert.equal(store.get(id).approval.status, 'approved')
    assert.equal(store.list()[0].approvalStatus, 'approved')

    const reopened = createReviewSession({ record: store.get(id), store, processing: createMockProcessingService({ delayMs: 0 }), role: 'employee', autoProcess: false })
    assert.equal(reopened.getView().approvalStatus, 'approved')
    const edited = reopened.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: reopened.getView().editor.document.pages[0].elements[0].id, patch: { text: 'x' } })
    assert.equal(edited.code, SESSION_ERROR.documentApproved)
  })

  test('the service decides: approval counts even if writing it to the store fails, and the result says so', async () => {
    const approvalService = { requestDocumentApproval: async () => {}, requestNewEditableVersion: async () => {} }
    const { session, store } = await approvable({ approvalService })
    store.setApprovalStatus = async () => { throw new StorageError('STORAGE_UNAVAILABLE', 'down') }
    assert.deepEqual(await session.requestApproval(), { ok: true, persisted: false })
    assert.equal(view(session).approvalStatus, 'approved')
    assert.equal(view(session).approvalPending, false)
  })

  test('a store that cannot persist approval reports persisted: false', async () => {
    const approvalService = { requestDocumentApproval: async () => {}, requestNewEditableVersion: async () => {} }
    const { session, store } = await approvable({ approvalService })
    store.setApprovalStatus = undefined
    assert.deepEqual(await session.requestApproval(), { ok: true, persisted: false })
  })

  test('the store validates approval updates', async () => {
    const store = createMemoryDocumentStore()
    const id = store.create({ name: 'م', snapshot: makeSnapshot() })
    let notified = 0
    store.subscribe(() => { notified += 1 })
    await store.setApprovalStatus(id, 'approved')
    assert.equal(store.get(id).approval.status, 'approved')
    assert.equal(notified, 1)
    await assert.rejects(store.setApprovalStatus(id, 'maybe'), (error) => error.code === 'INVALID_APPROVAL_STATUS')
    await assert.rejects(store.setApprovalStatus('missing', 'approved'), (error) => error.code === 'DOCUMENT_NOT_FOUND')
    assert.equal(store.get(id).approval.status, 'approved')
  })
})

// ======================================================================= M-5
describe('M-5: autosave stores only the pages that changed', () => {
  // A store that records which pages every save contained.
  function spyStore() {
    const store = createMemoryDocumentStore()
    const saves = []
    const fullSaves = []
    const savePages = store.savePages
    const saveDraft = store.saveDraft
    store.savePages = (id, pages) => {
      saves.push(pages.map((page) => page.pageNumber))
      return savePages(id, pages)
    }
    store.saveDraft = (id, snapshot) => {
      fullSaves.push(snapshot.pages.length)
      return saveDraft(id, snapshot)
    }
    return { store, saves, fullSaves }
  }

  const livePersisted = (session, store, id) => ({
    live: serializeDocument(view(session).editor.document, { includeOriginalExtraction: true }),
    stored: store.get(id).snapshot,
  })

  test('an edit stores only its page, never the whole document', async () => {
    const { store, saves, fullSaves } = spyStore()
    const { session, id, ids } = makeSession({ store, selectedPages: [1, 2, 3, 4, 5], totalPages: 5 })
    add(session, 3, paragraph(ids, 'تعديل في الصفحة ٣'))
    await session.flushSave()
    assert.deepEqual(saves, [[3]])
    assert.deepEqual(fullSaves, [])
    const { live, stored } = livePersisted(session, store, id)
    assert.deepEqual(stored, live)
  })

  test('nothing is stored when nothing changed', async () => {
    const { store, saves } = spyStore()
    const { session } = makeSession({ store })
    session.goToPage(2)
    await session.flushSave()
    assert.deepEqual(saves, [])
    assert.equal(view(session).save.status, 'saved')
  })

  test('several pages edited in one save window are stored together, once, in document order', async () => {
    const scheduler = createManualScheduler()
    const { store, saves } = spyStore()
    const { session, ids } = makeSession({ store, scheduler, selectedPages: [1, 2, 3, 4], totalPages: 4 })
    add(session, 4, paragraph(ids, 'د'))
    add(session, 2, paragraph(ids, 'ب'))
    edit(session, 2, pageOf(session, 2).elements[0].id, { text: 'ب معدّل' })
    scheduler.advance(800)
    await settle()
    assert.deepEqual(saves, [[2, 4]])
  })

  test('review confirmation, extraction and undo are stored consistently (including the preserved original)', async () => {
    const { store, saves } = spyStore()
    const { session, id, ids } = makeSession({ store, selectedPages: [1, 2, 3], totalPages: 3 })
    await session.processPage(1)
    const first = pageOf(session, 1).elements[0]
    edit(session, 1, first.id, { text: 'صحّحه المراجع' })
    session.confirmPageReview(1)
    add(session, 2, paragraph(ids, 'يدوي'))
    session.dispatch({ type: ACTION.undone, pageNumber: 2 })
    await session.flushSave()
    assert.ok(saves.length >= 1)
    const { live, stored } = livePersisted(session, store, id)
    assert.deepEqual(stored, live)
    assert.equal(stored.pages[0].originalExtraction.elements.length, 5)
    assert.equal(stored.pages[2].elements.length, 0)
  })

  test('reopening restores exactly what was saved, and the reopened session saves only its own changes', async () => {
    const { store, saves } = spyStore()
    const { session, id, ids } = makeSession({ store, selectedPages: [1, 2, 3], totalPages: 3 })
    add(session, 1, paragraph(ids, 'ا'))
    add(session, 3, paragraph(ids, 'ج'))
    session.confirmPageReview(3)
    await session.flushSave()
    const stored = store.get(id)
    assert.equal(parseDocumentJson(JSON.stringify(stored.snapshot)).ok, true)

    const reopened = createReviewSession({ record: stored, store, processing: createMockProcessingService({ delayMs: 0 }), role: 'employee', autoProcess: false, autosaveOptions: { delayMs: 0, maxWaitMs: 0, retryDelaysMs: [] } })
    assert.deepEqual(serializeDocument(reopened.getView().editor.document, { includeOriginalExtraction: true }), stored.snapshot)
    saves.length = 0
    await reopened.flushSave()
    assert.deepEqual(saves, [], 'opening a document stores nothing')
    reopened.dispatch({ type: ACTION.elementAdded, pageNumber: 2, element: paragraph(ids, 'ب') })
    await reopened.flushSave()
    assert.deepEqual(saves, [[2]])
    assert.deepEqual(serializeDocument(reopened.getView().editor.document, { includeOriginalExtraction: true }), store.get(id).snapshot)
  })

  test('a failed save keeps the pages marked as unsaved and the retry sends them again', async () => {
    const { store, saves } = spyStore()
    const { session, id, ids } = makeSession({ store, selectedPages: [1, 2, 3], totalPages: 3 })
    store.setSimulatedFailure(true)
    add(session, 2, paragraph(ids, 'لن يُحفظ بعد'))
    await session.flushSave()
    assert.equal(view(session).save.status, 'failed')
    assert.equal(store.get(id).snapshot.pages[1].elements.length, 0)

    store.setSimulatedFailure(false)
    await session.retrySave()
    assert.equal(view(session).save.status, 'saved')
    assert.deepEqual(saves, [[2], [2]])
    const { live, stored } = livePersisted(session, store, id)
    assert.deepEqual(stored, live)
  })

  test('changes made while a save is in flight are not marked as stored and go out with the next save', async () => {
    const { store, saves } = spyStore()
    const { session, id, ids } = makeSession({ store, selectedPages: [1, 2, 3], totalPages: 3 })
    const realSavePages = store.savePages
    const gate = deferred()
    let first = true
    store.savePages = async (docId, pages) => {
      if (first) {
        first = false
        await gate.promise
      }
      return realSavePages(docId, pages)
    }
    add(session, 1, paragraph(ids, 'ا'))
    await settle()
    assert.equal(view(session).save.status, 'saving')
    // While page 1 is being stored: page 1 changes again and page 3 is edited.
    add(session, 1, paragraph(ids, 'ا٢'))
    add(session, 3, paragraph(ids, 'ج'))
    assert.equal(session.getEffectiveSaveStatus(), 'saving')
    gate.resolve()
    await settle()
    await session.flushSave()
    assert.equal(view(session).save.status, 'saved')
    const { live, stored } = livePersisted(session, store, id)
    assert.deepEqual(stored, live)
    assert.deepEqual(saves[0], [1])
    assert.deepEqual(saves[1], [1, 3])
  })

  test('older stores without savePages still work: the whole document is stored', async () => {
    const base = createMemoryDocumentStore()
    const fullSaves = []
    const saveDraft = base.saveDraft
    base.saveDraft = (id, snapshot) => {
      fullSaves.push(snapshot.pages.length)
      return saveDraft(id, snapshot)
    }
    base.savePages = undefined // a store from before partial saves existed
    const { session, id, ids } = makeSession({ store: base, selectedPages: [1, 2], totalPages: 2 })
    add(session, 2, paragraph(ids, 'قديم'))
    await session.flushSave()
    assert.deepEqual(fullSaves, [2])
    assert.equal(base.get(id).snapshot.pages[1].elements.length, 1)
    add(session, 1, paragraph(ids, 'جديد'))
    await session.flushSave()
    assert.deepEqual(fullSaves, [2, 2])
    assert.deepEqual(base.get(id).snapshot, serializeDocument(view(session).editor.document, { includeOriginalExtraction: true }))
  })

  test('documents stored before this change load and save normally (same snapshot format)', async () => {
    const store = createMemoryDocumentStore()
    const snapshot = makeSnapshot({ selectedPages: [1, 2, 3], totalPages: 3 })
    const id = store.create({ name: 'قديم', snapshot })
    const session = createReviewSession({ record: store.get(id), store, processing: createMockProcessingService({ delayMs: 0 }), role: 'employee', autoProcess: false, autosaveOptions: { delayMs: 0, maxWaitMs: 0, retryDelaysMs: [] } })
    session.open()
    session.dispatch({ type: ACTION.elementAdded, pageNumber: 2, element: createElement('paragraph', { content: { text: 'نص' } }) })
    await session.flushSave()
    const after = store.get(id).snapshot
    assert.deepEqual(after.pages[0], snapshot.pages[0])
    assert.deepEqual(after.pages[2], snapshot.pages[2])
    assert.equal(after.pages[1].elements.length, 1)
    assert.deepEqual({ ...after, pages: [] }, { ...snapshot, pages: [] })
  })

  test('a page left "processing" by an earlier session is recovered and only that page is stored', async () => {
    const { store, saves } = spyStore()
    const snapshot = makeSnapshot({ selectedPages: [1, 2, 3], totalPages: 3 })
    snapshot.pages[1].processing = { status: 'processing', errorCode: null }
    const { session, id } = makeSession({ store, snapshot })
    await session.flushSave()
    assert.deepEqual(saves, [[2]])
    assert.equal(store.get(id).snapshot.pages[1].processing.status, 'failed')
  })

  test('the store writes pages all-or-nothing and rejects pages that do not match', async () => {
    const store = createMemoryDocumentStore()
    const snapshot = makeSnapshot({ selectedPages: [1, 2, 3], totalPages: 3 })
    const id = store.create({ name: 'م', snapshot })
    const ids = createSequentialIdGenerator(900)
    const changed = (pageNumber, text) => {
      const page = structuredClone(snapshot.pages.find((p) => p.pageNumber === pageNumber))
      page.elements = [{ ...createElement('paragraph', { content: { text } }, { generateId: ids }), order: 0 }]
      return page
    }

    await store.savePages(id, [changed(2, 'ب')])
    assert.equal(store.get(id).snapshot.pages[1].elements[0].content.text, 'ب')
    assert.deepEqual(store.get(id).snapshot.pages[0], snapshot.pages[0])

    // one bad page: nothing at all is written
    const before = JSON.stringify(store.get(id).snapshot)
    await assert.rejects(store.savePages(id, [changed(1, 'أ'), { ...changed(3, 'ج'), pageNumber: 99 }]), (e) => e instanceof StorageError && e.code === 'PAGE_MISMATCH')
    await assert.rejects(store.savePages(id, [{ ...changed(1, 'أ'), id: 'another-page-id' }]), (e) => e.code === 'PAGE_MISMATCH')
    await assert.rejects(store.savePages(id, 'not a list'), (e) => e.code === 'PAGE_MISMATCH')
    await assert.rejects(store.savePages('missing', [changed(1, 'أ')]), (e) => e.code === 'DOCUMENT_NOT_FOUND')
    assert.equal(JSON.stringify(store.get(id).snapshot), before)

    store.setSimulatedFailure(true)
    await assert.rejects(store.savePages(id, [changed(1, 'أ')]), (e) => e.code === 'STORAGE_UNAVAILABLE')
    assert.equal(JSON.stringify(store.get(id).snapshot), before)
  })

  test('the store keeps its own copy of saved pages', async () => {
    const store = createMemoryDocumentStore()
    const snapshot = makeSnapshot({ selectedPages: [1], totalPages: 1 })
    const id = store.create({ name: 'م', snapshot })
    const page = structuredClone(snapshot.pages[0])
    await store.savePages(id, [page])
    page.elements.push('تلاعب')
    assert.equal(store.get(id).snapshot.pages[0].elements.length, 0)
  })

  test('serializePage matches the page entry of the full serialization', () => {
    const { session, ids } = makeSession({ selectedPages: [1, 2], totalPages: 2 })
    add(session, 2, paragraph(ids, 'نص'))
    const document = view(session).editor.document
    assert.deepEqual(serializePage(document.pages[1], true), serializeDocument(document, { includeOriginalExtraction: true }).pages[1])
    assert.equal('originalExtraction' in serializePage(document.pages[1], false), false)
  })

  test('a 1,000-page document: an edit stores one page, not a thousand', async () => {
    const ids = createSequentialIdGenerator(100_000)
    const document = createDocument({ file: FILE, totalPages: 1000 }, { generateId: ids })
    for (const page of document.pages) {
      page.elements = Array.from({ length: 4 }, (_, index) => ({
        ...createElement('paragraph', { content: { text: `نص ${page.pageNumber}-${index}` } }, { generateId: ids }),
        order: index,
      }))
    }
    const snapshot = serializeDocument(document, { includeOriginalExtraction: true })
    const { store, saves, fullSaves } = spyStore()
    let payloadBytes = 0
    const savePages = store.savePages
    store.savePages = (docId, pages) => {
      payloadBytes = JSON.stringify(pages).length
      return savePages(docId, pages)
    }
    const { session, id, ids: sessionIds } = makeSession({ store, snapshot })
    const started = performance.now()
    add(session, 500, paragraph(sessionIds, 'تعديل واحد'))
    await session.flushSave()
    const elapsed = performance.now() - started

    assert.deepEqual(saves, [[500]])
    assert.deepEqual(fullSaves, [])
    assert.ok(payloadBytes < 5_000, `payload was ${payloadBytes} bytes`)
    assert.ok(elapsed < 1_000, `edit + save took ${Math.round(elapsed)}ms`)
    assert.equal(store.get(id).snapshot.pages[499].elements.length, 5)
    assert.equal(store.get(id).snapshot.pages.length, 1000)
  })
})
