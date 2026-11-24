import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { serializeDocument, serializeDocumentPage } from '../src/domain/document/serialization.js'
import { createMockProcessingService } from '../src/services/mockProcessingService.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { canRedo, canUndo, selectReviewProgress } from '../src/state/documentSession/documentSelectors.js'
import { createReviewSession, LEAVE_REASON, SESSION_ERROR, SessionLoadError } from '../src/state/documentSession/reviewSession.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { getPageUiStatus } from '../src/domain/document/pageStatus.js'
import { field, heading, paragraph, table } from './helpers.js'
import { createManualScheduler, deferred, makeSession, makeSnapshot, pageOf, settle } from './sessionHelpers.js'

const add = (session, pageNumber, element) => session.dispatch({ type: ACTION.elementAdded, pageNumber, element })
const edit = (session, pageNumber, elementId, patch) => session.dispatch({ type: ACTION.elementEdited, pageNumber, elementId, patch })
const view = (session) => session.getView()
const textOf = (session, pageNumber, index = 0) => pageOf(session, pageNumber).elements[index].content.text

describe('loading a stored document', () => {
  test('opens on the first selected page, or on the remembered one', () => {
    assert.equal(view(makeSession({ selectedPages: [2, 4, 6], totalPages: 8 }).session).editor.lastVisitedPage, 2)
    assert.equal(view(makeSession({ selectedPages: [2, 4, 6], totalPages: 8, lastVisitedPage: 6 }).session).editor.lastVisitedPage, 6)
    // A remembered page that is not selected is ignored.
    assert.equal(view(makeSession({ selectedPages: [2, 4, 6], totalPages: 8, lastVisitedPage: 3 }).session).editor.lastVisitedPage, 2)
  })

  test('a damaged stored document is refused instead of repaired', () => {
    const snapshot = makeSnapshot()
    snapshot.schemaVersion = '9.9'
    assert.throws(() => makeSession({ snapshot }), (error) => error instanceof SessionLoadError && error.errors[0].code === 'UNSUPPORTED_SCHEMA_VERSION')
  })

  test('a page left "processing" by an earlier session is not shown as running forever', async () => {
    const snapshot = makeSnapshot()
    snapshot.pages[1].processing = { status: 'processing', errorCode: null }
    const { session, store, id } = makeSession({ snapshot })
    assert.deepEqual(pageOf(session, 2).processing, { status: 'failed', errorCode: 'PROCESSING_INTERRUPTED' })
    assert.deepEqual(view(session).processingPages, [])
    await session.flushSave()
    assert.equal(store.get(id).snapshot.pages[1].processing.status, 'failed')
  })
})

describe('inline editing goes through the Phase 1 reducer', () => {
  test('edits never mutate the previous document state', () => {
    const { session, ids } = makeSession()
    const p = paragraph(ids, 'الأصل')
    add(session, 1, p)
    const before = view(session).editor.document
    const snapshot = JSON.stringify(before)
    assert.deepEqual(edit(session, 1, p.id, { text: 'معدل' }), { ok: true })
    assert.notEqual(view(session).editor.document, before)
    assert.equal(JSON.stringify(before), snapshot)
    assert.equal(textOf(session, 1), 'معدل')
  })

  test('headings, paragraphs, fields, tables and cells can all be edited and are labelled manual', () => {
    const { session, ids } = makeSession()
    const [h, p, f, t] = [heading(ids, 'ع'), paragraph(ids, 'ف'), field(ids, 'م', 'ق'), table(ids, [['١', '٢']])]
    for (const element of [h, p, f, t]) add(session, 1, element)
    edit(session, 1, h.id, { text: 'عنوان' })
    edit(session, 1, p.id, { text: 'فقرة' })
    edit(session, 1, f.id, { key: 'مفتاح', value: 'قيمة' })
    session.dispatch({ type: ACTION.tableCellEdited, pageNumber: 1, elementId: t.id, row: 0, column: 1, text: 'خلية' })
    const elements = pageOf(session, 1).elements
    assert.equal(elements[0].content.text, 'عنوان')
    assert.equal(elements[1].content.text, 'فقرة')
    assert.deepEqual(elements[2].content, { key: 'مفتاح', value: 'قيمة' })
    assert.equal(elements[3].content.rows[0].cells[1].text, 'خلية')
    assert.ok(elements.every((element) => element.source.kind === 'manual'))
  })

  test('table rows and columns can be added and removed', () => {
    const { session, ids } = makeSession()
    const t = table(ids, [['أ', 'ب'], ['ج', 'د']])
    add(session, 1, t)
    const grid = () => pageOf(session, 1).elements[0].content.rows.map((row) => row.cells.map((cell) => cell.text))
    session.dispatch({ type: ACTION.tableRowAdded, pageNumber: 1, elementId: t.id })
    session.dispatch({ type: ACTION.tableColumnAdded, pageNumber: 1, elementId: t.id, index: 0 })
    assert.deepEqual(grid(), [['', 'أ', 'ب'], ['', 'ج', 'د'], ['', '', '']])
    session.dispatch({ type: ACTION.tableRowRemoved, pageNumber: 1, elementId: t.id, index: 2 })
    session.dispatch({ type: ACTION.tableColumnRemoved, pageNumber: 1, elementId: t.id, index: 0 })
    assert.deepEqual(grid(), [['أ', 'ب'], ['ج', 'د']])
    session.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(grid()[0].length, 3)
  })

  test('adding between elements, reordering, converting and deleting use the Phase 1 operations', () => {
    const { session, ids } = makeSession()
    const [a, b, c] = [paragraph(ids, 'أ'), paragraph(ids, 'ب'), paragraph(ids, 'ج')]
    add(session, 1, a)
    add(session, 1, c)
    session.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: b, index: 1 })
    assert.deepEqual(pageOf(session, 1).elements.map((e) => e.content.text), ['أ', 'ب', 'ج'])
    session.dispatch({ type: ACTION.elementMoved, pageNumber: 1, elementId: c.id, toIndex: 0 })
    assert.deepEqual(pageOf(session, 1).elements.map((e) => e.content.text), ['ج', 'أ', 'ب'])
    session.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: a.id, targetType: 'heading' })
    assert.equal(pageOf(session, 1).elements[1].type, 'heading')
    session.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: b.id })
    assert.equal(pageOf(session, 1).elements.length, 2)
  })

  test('a lossy type change is refused until it is confirmed, and nothing is lost', () => {
    const { session, ids } = makeSession()
    const t = table(ids, [['أ', 'ب'], ['ج', 'د']])
    add(session, 1, t)
    const result = session.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: t.id, targetType: 'paragraph' })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'CONFIRMATION_REQUIRED')
    assert.equal(result.details.plan.lostData[0].code, 'tableStructure')
    assert.equal(pageOf(session, 1).elements[0].type, 'table')
    assert.equal(session.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: t.id, targetType: 'paragraph', confirmed: true }).ok, true)
  })

  test('actions that are not part of the editing API are refused', () => {
    const { session, ids } = makeSession()
    for (const action of [
      { type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(ids, 'x')] },
      { type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed' },
      { type: 'unknown' },
      null,
      undefined,
    ]) {
      assert.deepEqual(session.dispatch(action), { ok: false, code: SESSION_ERROR.actionNotAllowed })
    }
    assert.equal(pageOf(session, 1).processing.status, 'notProcessed')
  })
})

describe('page navigation and selected pages', () => {
  test('only selected pages can be opened, and the last visited page is remembered', () => {
    const { session, store, id } = makeSession({ selectedPages: [2, 5, 9], totalPages: 12 })
    assert.equal(session.goToPage(5).ok, true)
    assert.equal(view(session).editor.lastVisitedPage, 5)
    assert.equal(store.get(id).lastVisitedPage, 5)
    assert.equal(session.goToPage(4).code, 'PAGE_NOT_SELECTED')
    assert.equal(session.goToPage(99).code, 'PAGE_NOT_FOUND')
    assert.equal(view(session).editor.lastVisitedPage, 5)
    assert.equal(store.get(id).lastVisitedPage, 5)
  })

  test('re-opening the document resumes from the last page', () => {
    const { session, store, id } = makeSession({ selectedPages: [2, 5, 9], totalPages: 12 })
    session.goToPage(9)
    const reopened = createReviewSession({ record: store.get(id), store, processing: createMockProcessingService({ delayMs: 0 }), role: 'employee', autoProcess: false })
    assert.equal(view(reopened).editor.lastVisitedPage, 9)
  })

  test('unselected pages are not counted as pending, failed or unreviewed', () => {
    const { session } = makeSession({ selectedPages: [2, 5], totalPages: 10 })
    const progress = selectReviewProgress(view(session).editor)
    assert.equal(progress.totalPages, 2)
    assert.deepEqual(progress.pagesRequiringReview, [2, 5])
    assert.equal(view(session).editor.document.pages.length, 2)
  })

  test('visiting or editing a page never marks it reviewed', () => {
    const { session, ids } = makeSession()
    session.goToPage(2)
    const p = paragraph(ids, 'نص')
    add(session, 2, p)
    edit(session, 2, p.id, { text: 'تعديل' })
    assert.ok(view(session).editor.document.pages.every((page) => page.review.status === 'notReviewed'))
  })
})

describe('review confirmation', () => {
  test('is refused without valid content, with the reason from Phase 1', () => {
    const { session } = makeSession()
    const result = session.confirmPageReview(1)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'REVIEW_NOT_ALLOWED')
    assert.equal(result.details.reason, 'noContent')
    assert.equal(pageOf(session, 1).review.status, 'notReviewed')
  })

  test('an explicit confirmation marks only that page, and any later change invalidates it', () => {
    const { session, ids } = makeSession()
    const p = paragraph(ids, 'نص')
    add(session, 1, p)
    add(session, 2, paragraph(ids, 'نص ٢'))
    assert.deepEqual(session.confirmPageReview(1), { ok: true })
    assert.equal(pageOf(session, 1).review.status, 'reviewed')
    assert.equal(pageOf(session, 2).review.status, 'notReviewed')

    edit(session, 1, p.id, { text: 'تغيير' })
    assert.equal(pageOf(session, 1).review.status, 'invalidated')
    session.confirmPageReview(1)
    assert.equal(pageOf(session, 1).review.status, 'reviewed')
    assert.equal(selectReviewProgress(view(session).editor).reviewedCount, 1)
  })

  test('undo and redo invalidate the confirmation instead of restoring it', () => {
    const { session, ids } = makeSession()
    const p = paragraph(ids, 'نص')
    add(session, 1, p)
    edit(session, 1, p.id, { text: 'تغيير' })
    session.confirmPageReview(1)
    session.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(pageOf(session, 1).review.status, 'invalidated')
    session.confirmPageReview(1)
    session.dispatch({ type: ACTION.redone, pageNumber: 1 })
    assert.equal(pageOf(session, 1).review.status, 'invalidated')
    assert.equal(canUndo(view(session).editor, 1), true)
  })
})

describe('JSON preview stays in sync with the editor', () => {
  test('always equals the current canonical page, including after undo and redo', () => {
    const { session, ids } = makeSession()
    const p = paragraph(ids, 'قبل')
    add(session, 1, p)
    const json = () => serializeDocumentPage(view(session).editor.document, 1)
    assert.equal(json().pages[0].elements[0].content.text, 'قبل')
    edit(session, 1, p.id, { text: 'بعد' })
    assert.equal(json().pages[0].elements[0].content.text, 'بعد')
    assert.deepEqual(json().pages[0], serializeDocument(view(session).editor.document).pages[0])
    session.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(json().pages[0].elements[0].content.text, 'قبل')
    session.dispatch({ type: ACTION.redone, pageNumber: 1 })
    assert.equal(json().pages[0].elements[0].content.text, 'بعد')
  })

  test('shows table structure and field relationships exactly', () => {
    const { session, ids } = makeSession()
    const t = table(ids, [['البند', 'القيمة']])
    const f = field(ids, 'الاسم', 'سارة')
    add(session, 1, t)
    add(session, 1, f)
    session.dispatch({ type: ACTION.tableRowAdded, pageNumber: 1, elementId: t.id })
    const [tableJson, fieldJson] = serializeDocumentPage(view(session).editor.document, 1).pages[0].elements
    assert.equal(tableJson.content.rows.length, 2)
    assert.deepEqual(fieldJson.content, { key: 'الاسم', value: 'سارة' })
  })
})

describe('undo and redo integration', () => {
  test('work through the session and respect the per-page history', () => {
    const { session, ids } = makeSession()
    const p = paragraph(ids, 'أ')
    add(session, 1, p)
    edit(session, 1, p.id, { text: 'ب' })
    assert.equal(canUndo(view(session).editor, 1), true)
    session.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(textOf(session, 1), 'أ')
    assert.equal(canRedo(view(session).editor, 1), true)
    session.dispatch({ type: ACTION.redone, pageNumber: 1 })
    assert.equal(textOf(session, 1), 'ب')
    // Another page's history is untouched.
    assert.equal(canUndo(view(session).editor, 2), false)
  })
})

describe('autosave states reflect what the storage acknowledged', () => {
  test('unsaved -> saving -> saved, and "saved" only after the store resolves', async () => {
    const scheduler = createManualScheduler()
    const { session, store, ids } = makeSession({ scheduler })
    const save = deferred()
    store.savePages = () => save.promise
    const statuses = []
    session.subscribe(() => {
      const status = view(session).save.status
      if (statuses.at(-1) !== status) statuses.push(status)
    })

    assert.equal(view(session).save.status, 'saved')
    add(session, 1, paragraph(ids, 'نص'))
    assert.equal(view(session).save.status, 'unsaved')
    scheduler.advance(800)
    await settle()
    assert.equal(view(session).save.status, 'saving')
    await settle()
    assert.equal(view(session).save.status, 'saving')
    assert.ok(!statuses.includes('saved'))

    save.resolve()
    await settle()
    assert.equal(view(session).save.status, 'saved')
    assert.deepEqual(statuses, ['unsaved', 'saving', 'saved'])
  })

  test('the stored document really contains the edit after saving', async () => {
    const { session, store, id, ids } = makeSession()
    const p = paragraph(ids, 'محفوظ')
    add(session, 1, p)
    await session.flushSave()
    assert.equal(view(session).save.status, 'saved')
    assert.equal(store.get(id).snapshot.pages[0].elements[0].content.text, 'محفوظ')
  })

  test('a failing storage shows "failed", saves nothing, and recovers on retry', async () => {
    const { session, store, id, ids } = makeSession()
    store.setSimulatedFailure(true)
    add(session, 1, paragraph(ids, 'لن يُحفظ'))
    await session.flushSave()
    assert.equal(view(session).save.status, 'failed')
    assert.ok(view(session).save.error)
    assert.equal(store.get(id).snapshot.pages[0].elements.length, 0)
    assert.equal(session.getNavigationGuard().shouldBlock, true)

    store.setSimulatedFailure(false)
    await session.retrySave()
    assert.equal(view(session).save.status, 'saved')
    assert.equal(store.get(id).snapshot.pages[0].elements.length, 1)
    assert.equal(session.getNavigationGuard().shouldBlock, false)
  })

  test('is described as temporary storage, never as a backend', () => {
    const { session, store } = makeSession()
    assert.equal(view(session).isTemporaryStorage, true)
    assert.equal(store.isDurable, false)
  })

  test('review and undo changes are saved too, but moving between pages is not an edit', async () => {
    const scheduler = createManualScheduler()
    const { session, ids } = makeSession({ scheduler })
    session.goToPage(2)
    assert.equal(view(session).save.status, 'saved')
    add(session, 2, paragraph(ids, 'نص'))
    assert.equal(view(session).save.status, 'unsaved')
    scheduler.advance(800)
    await settle()
    assert.equal(view(session).save.status, 'saved')
    session.confirmPageReview(2)
    assert.equal(view(session).save.status, 'unsaved')
  })
})

describe('text that is typed but not committed yet', () => {
  test('counts as unsaved for the status, the leave guard and approval', async () => {
    const { session, ids } = makeSession({ selectedPages: [1], totalPages: 1 })
    add(session, 1, paragraph(ids, 'نص'))
    session.confirmPageReview(1)
    await session.flushSave()
    assert.equal(session.getEffectiveSaveStatus(), 'saved')
    assert.equal(session.getApprovalEligibility().eligible, true)

    session.setUncommitted('field-1', true)
    assert.equal(view(session).uncommittedCount, 1)
    assert.equal(view(session).save.status, 'saved')
    assert.equal(session.getEffectiveSaveStatus(), 'unsaved')
    assert.deepEqual(session.getNavigationGuard().reasons, [LEAVE_REASON.unsavedChanges])
    assert.deepEqual(session.getApprovalEligibility().blockers, ['unsavedChanges'])

    session.setUncommitted('field-1', false)
    assert.equal(session.getEffectiveSaveStatus(), 'saved')
    assert.equal(session.getNavigationGuard().shouldBlock, false)
  })

  test('keeps counting several inputs and ignores repeated reports', () => {
    const { session } = makeSession()
    session.setUncommitted('a', true)
    session.setUncommitted('a', true)
    session.setUncommitted('b', true)
    assert.equal(view(session).uncommittedCount, 2)
    session.setUncommitted('a', false)
    session.setUncommitted('a', false)
    assert.equal(view(session).uncommittedCount, 1)
  })

  test('a failed save is still reported as failed', async () => {
    const { session, store, ids } = makeSession()
    store.setSimulatedFailure(true)
    add(session, 1, paragraph(ids, 'نص'))
    await session.flushSave()
    session.setUncommitted('a', true)
    assert.equal(session.getEffectiveSaveStatus(), 'failed')
  })
})

describe('leaving the page', () => {
  test('is free when everything is saved and nothing is running', () => {
    const { session } = makeSession()
    assert.deepEqual(session.getNavigationGuard(), { shouldBlock: false, reasons: [] })
    assert.deepEqual(session.getUnloadWarning(), { shouldWarn: false, reasons: [] })
  })

  test('is blocked while changes are not saved', async () => {
    const scheduler = createManualScheduler()
    const { session, ids } = makeSession({ scheduler })
    add(session, 1, paragraph(ids, 'نص'))
    assert.deepEqual(session.getNavigationGuard(), { shouldBlock: true, reasons: [LEAVE_REASON.unsavedChanges] })
    assert.equal(session.getUnloadWarning().shouldWarn, true)
    await session.flushSave()
    assert.equal(session.getNavigationGuard().shouldBlock, false)
  })

  test('with temporary storage the browser still warns after a save, because a reload loses everything', async () => {
    const { session, ids } = makeSession()
    add(session, 1, paragraph(ids, 'نص'))
    await session.flushSave()
    assert.equal(session.getNavigationGuard().shouldBlock, false)
    assert.deepEqual(session.getUnloadWarning(), { shouldWarn: true, reasons: [LEAVE_REASON.temporaryStorage] })
  })

  test('is blocked while a page is processing or a comparison is waiting', async () => {
    const pending = deferred()
    const { session, ids } = makeSession({ processing: { extractPage: () => pending.promise } })
    const run = session.processPage(1)
    assert.deepEqual(session.getNavigationGuard().reasons.includes(LEAVE_REASON.processingActive), true)
    pending.resolve({ elements: [paragraph(ids, 'ai')], attempt: 1, mock: true })
    await run
    assert.equal(session.getNavigationGuard().reasons.includes(LEAVE_REASON.processingActive), false)
  })
})

describe('AI processing states (mock)', () => {
  test('opening a pending page runs the mock extraction and labels its content as AI/mock', async () => {
    const { session } = makeSession({ autoProcess: true })
    assert.equal(pageOf(session, 1).processing.status, 'processing')
    assert.deepEqual(view(session).processingPages, [1])
    await settle()
    assert.equal(pageOf(session, 1).processing.status, 'succeeded')
    assert.equal(getPageUiStatus(pageOf(session, 1)), 'readyForReview')
    assert.ok(pageOf(session, 1).elements.every((element) => element.source.kind === 'ai' && element.source.details.mock === true))
    // The other pages were not touched.
    assert.equal(getPageUiStatus(pageOf(session, 2)), 'pending')
  })

  test('visiting another page processes it once, and never re-runs a finished page', async () => {
    let calls = 0
    const service = createMockProcessingService({ delayMs: 0, shouldFail: () => false })
    const counting = { extractPage: (args) => (calls += 1, service.extractPage(args)) }
    const { session } = makeSession({ processing: counting, autoProcess: true })
    await settle()
    session.goToPage(2)
    await settle()
    session.goToPage(1)
    session.goToPage(2)
    await settle()
    assert.equal(calls, 2)
  })

  test('the page cannot be edited or confirmed while it is processing', async () => {
    const pending = deferred()
    const { session, ids } = makeSession({ processing: { extractPage: () => pending.promise } })
    const run = session.processPage(1)
    assert.equal(getPageUiStatus(pageOf(session, 1)), 'processing')
    assert.equal(add(session, 1, paragraph(ids, 'x')).code, SESSION_ERROR.pageProcessing)
    assert.equal(session.confirmPageReview(1).code, SESSION_ERROR.pageProcessing)
    assert.equal(session.dispatch({ type: ACTION.undone, pageNumber: 1 }).code, SESSION_ERROR.pageProcessing)
    pending.resolve({ elements: [paragraph(ids, 'ai')], attempt: 1, mock: true })
    await run
    assert.equal(add(session, 1, paragraph(ids, 'y')).ok, true)
  })

  test('a failed extraction keeps the page open for manual editing and review', async () => {
    const { session, ids } = makeSession({ shouldFail: ({ pageNumber }) => pageNumber === 2 })
    session.goToPage(2)
    await session.processPage(2)
    assert.deepEqual(pageOf(session, 2).processing, { status: 'failed', errorCode: 'MOCK_OCR_FAILED' })
    assert.equal(getPageUiStatus(pageOf(session, 2)), 'failed')
    assert.equal(session.confirmPageReview(2).details.reason, 'failedWithoutContent')

    add(session, 2, paragraph(ids, 'أدخلته يدويًا'))
    assert.equal(getPageUiStatus(pageOf(session, 2)), 'manualEditing')
    assert.equal(session.confirmPageReview(2).ok, true)
    // Still recorded as a failed AI extraction: manual work is not relabelled a success.
    assert.equal(pageOf(session, 2).processing.status, 'failed')
    assert.equal(pageOf(session, 2).review.status, 'reviewed')
    assert.equal(getPageUiStatus(pageOf(session, 2)), 'reviewed')
  })

  test('retrying a failed page with nothing on it applies the new result directly', async () => {
    const { session } = makeSession({ shouldFail: ({ attempt }) => attempt === 1 })
    await session.processPage(1)
    assert.equal(pageOf(session, 1).processing.status, 'failed')
    await session.processPage(1)
    assert.equal(pageOf(session, 1).processing.status, 'succeeded')
    assert.ok(pageOf(session, 1).elements.length > 0)
    assert.equal(view(session).candidates[1], undefined)
  })

  test('a failed retry never touches existing content', async () => {
    const { session, ids } = makeSession({ shouldFail: ({ attempt }) => attempt >= 2 })
    await session.processPage(1)
    const before = JSON.stringify(pageOf(session, 1).elements)
    await session.processPage(1)
    assert.equal(JSON.stringify(pageOf(session, 1).elements), before)
    assert.equal(pageOf(session, 1).processing.status, 'succeeded')
    assert.deepEqual(view(session).notices[1], { code: 'reprocessFailed', errorCode: 'MOCK_OCR_FAILED' })
    assert.equal(view(session).candidates[1], undefined)
    assert.equal(add(session, 1, paragraph(ids, 'x')).ok, true)
  })
})

describe('reprocessing: compare, then accept or keep', () => {
  // A page extracted once, corrected by the reviewer and confirmed.
  async function reviewedPage() {
    const context = makeSession()
    const { session } = context
    await session.processPage(1)
    const firstParagraph = pageOf(session, 1).elements[1]
    edit(session, 1, firstParagraph.id, { text: 'نص صححه المراجع' })
    session.confirmPageReview(1)
    return { ...context, firstParagraph }
  }

  test('the new result is held as a candidate and the current content is preserved', async () => {
    const { session } = await reviewedPage()
    const before = JSON.stringify(pageOf(session, 1).elements)
    await session.processPage(1)
    const candidate = view(session).candidates[1]
    assert.ok(candidate)
    assert.equal(candidate.attempt, 2)
    assert.equal(JSON.stringify(pageOf(session, 1).elements), before)
    assert.equal(pageOf(session, 1).review.status, 'reviewed')
    assert.equal(pageOf(session, 1).processing.status, 'succeeded')
    assert.notEqual(candidate.elements[0].content.text, pageOf(session, 1).elements[0].content.text)
  })

  test('keeping the current content drops the candidate and changes nothing', async () => {
    const { session } = await reviewedPage()
    const before = JSON.stringify(view(session).editor.document)
    await session.processPage(1)
    assert.equal(session.discardCandidate(1).ok, true)
    assert.equal(view(session).candidates[1], undefined)
    assert.equal(JSON.stringify(view(session).editor.document), before)
    assert.equal(pageOf(session, 1).review.status, 'reviewed')
    assert.deepEqual(view(session).attempts[1].map((a) => a.outcome), ['applied', 'awaitingDecision', 'discarded'])
  })

  test('accepting replaces the content, clears undo/redo, invalidates the review and updates the JSON', async () => {
    const { session } = await reviewedPage()
    assert.equal(canUndo(view(session).editor, 1), true)
    await session.processPage(1)
    const candidate = view(session).candidates[1]
    assert.equal(session.acceptCandidate(1).ok, true)

    assert.equal(view(session).candidates[1], undefined)
    assert.deepEqual(pageOf(session, 1).elements.map((e) => e.id), candidate.elements.map((e) => e.id))
    assert.equal(pageOf(session, 1).review.status, 'invalidated')
    assert.equal(canUndo(view(session).editor, 1), false)
    assert.equal(canRedo(view(session).editor, 1), false)
    assert.equal(serializeDocumentPage(view(session).editor.document, 1).pages[0].elements[0].content.text, candidate.elements[0].content.text)
    assert.equal(pageOf(session, 1).originalExtraction.elements[0].id, candidate.elements[0].id)
    assert.deepEqual(view(session).attempts[1].map((a) => a.outcome), ['applied', 'awaitingDecision', 'accepted'])
  })

  test('undo cannot reverse an accepted replacement', async () => {
    const { session } = await reviewedPage()
    await session.processPage(1)
    session.acceptCandidate(1)
    const after = JSON.stringify(pageOf(session, 1).elements)
    session.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(JSON.stringify(pageOf(session, 1).elements), after)
  })

  test('only the processed page is affected', async () => {
    const { session, ids } = await reviewedPage()
    add(session, 2, paragraph(ids, 'صفحة ثانية'))
    session.confirmPageReview(2)
    await session.processPage(1)
    session.acceptCandidate(1)
    assert.equal(pageOf(session, 2).review.status, 'reviewed')
    assert.equal(textOf(session, 2), 'صفحة ثانية')
  })

  test('there is nothing to accept or keep without a candidate', () => {
    const { session } = makeSession()
    assert.equal(session.acceptCandidate(1).ok, false)
    assert.equal(session.discardCandidate(1).ok, false)
  })

  test('a page with manual content on a failed extraction also compares before replacing', async () => {
    const { session, ids } = makeSession({ shouldFail: ({ attempt }) => attempt === 1 })
    await session.processPage(1)
    add(session, 1, paragraph(ids, 'يدوي'))
    await session.processPage(1)
    assert.ok(view(session).candidates[1])
    assert.equal(textOf(session, 1), 'يدوي')
    assert.equal(pageOf(session, 1).processing.status, 'failed')
  })
})

describe('approval', () => {
  async function fullyReviewed(options = {}) {
    const context = makeSession({ selectedPages: [1, 2], totalPages: 2, ...options })
    for (const pageNumber of [1, 2]) {
      add(context.session, pageNumber, paragraph(context.ids, `نص ${pageNumber}`))
      context.session.confirmPageReview(pageNumber)
    }
    await context.session.flushSave()
    return context
  }

  test('lists what still blocks approval', () => {
    const { session } = makeSession()
    const result = session.getApprovalEligibility()
    assert.equal(result.eligible, false)
    assert.deepEqual(result.blockers, ['pagesNotReviewed'])
  })

  test('changes that are not saved block approval until the store acknowledges them', async () => {
    const scheduler = createManualScheduler()
    const { session, ids } = makeSession({ selectedPages: [1], totalPages: 1, scheduler })
    add(session, 1, paragraph(ids, 'نص'))
    session.confirmPageReview(1)
    assert.deepEqual(session.getApprovalEligibility().blockers, ['unsavedChanges'])
    await session.flushSave()
    assert.equal(session.getApprovalEligibility().eligible, true)
  })

  test('a running extraction blocks approval', async () => {
    const pending = deferred()
    const { session } = makeSession({ selectedPages: [1], totalPages: 1, processing: { extractPage: () => pending.promise } })
    session.processPage(1)
    assert.ok(session.getApprovalEligibility().blockers.includes('processingActive'))
  })

  test('without a backend, requesting approval is refused and nothing is approved', async () => {
    const { session } = await fullyReviewed()
    assert.equal(session.getApprovalEligibility().eligible, true)
    assert.deepEqual(await session.requestApproval(), { ok: false, code: 'APPROVAL_NOT_CONNECTED' })
    assert.equal(view(session).approvalStatus, 'none')
    // Still editable: no approval happened.
    assert.equal(edit(session, 1, pageOf(session, 1).elements[0].id, { text: 'ما زال قابلًا للتعديل' }).ok, true)
  })

  test('an ineligible document cannot even ask for approval', async () => {
    const { session } = makeSession()
    const result = await session.requestApproval()
    assert.equal(result.code, SESSION_ERROR.notEligible)
    assert.deepEqual(result.blockers, ['pagesNotReviewed'])
  })

  test('once an approval service acknowledged it, the document becomes read-only', async () => {
    const approvalService = { requestDocumentApproval: async () => {}, requestNewEditableVersion: async () => {} }
    const { session, ids } = await fullyReviewed({ approvalService })
    assert.deepEqual(await session.requestApproval(), { ok: true, persisted: true })
    assert.equal(view(session).approvalStatus, 'approved')

    const element = pageOf(session, 1).elements[0]
    assert.equal(edit(session, 1, element.id, { text: 'تعديل' }).code, SESSION_ERROR.documentApproved)
    assert.equal(add(session, 1, paragraph(ids, 'x')).code, SESSION_ERROR.documentApproved)
    assert.equal(session.dispatch({ type: ACTION.undone, pageNumber: 1 }).code, SESSION_ERROR.documentApproved)
    assert.equal(session.confirmPageReview(1).code, SESSION_ERROR.documentApproved)
    assert.equal(textOf(session, 1), 'نص 1')
    // Reading is still possible.
    assert.equal(session.goToPage(2).ok, true)
  })

  describe('a document that is already approved', () => {
    test('is read-only for employees', async () => {
      const { session, ids } = makeSession({ approvalStatus: 'approved', role: 'employee' })
      assert.equal(add(session, 1, paragraph(ids, 'x')).code, SESSION_ERROR.documentApproved)
      assert.equal(session.confirmPageReview(1).code, SESSION_ERROR.documentApproved)
      assert.deepEqual(await session.processPage(1), { ok: false })
      assert.equal(pageOf(session, 1).processing.status, 'notProcessed')
      assert.equal(session.getApprovalEligibility().blockers.includes('alreadyApproved'), true)
    })

    test('is read-only for the admin too: the admin may only start a NEW version', async () => {
      const { session, ids } = makeSession({ approvalStatus: 'approved', role: 'orgAdmin' })
      assert.equal(add(session, 1, paragraph(ids, 'x')).code, SESSION_ERROR.documentApproved)
      assert.equal(session.canCreateNewVersion(), true)
    })

    test('a new version is the admin\'s action only, and is not simulated without a backend', async () => {
      const employee = makeSession({ approvalStatus: 'approved', role: 'employee' }).session
      assert.equal(employee.canCreateNewVersion(), false)
      assert.deepEqual(await employee.requestNewVersion(), { ok: false, code: SESSION_ERROR.noPermission })

      const admin = makeSession({ approvalStatus: 'approved', role: 'orgAdmin' }).session
      assert.deepEqual(await admin.requestNewVersion(), { ok: false, code: 'APPROVAL_NOT_CONNECTED' })

      const notApproved = makeSession({ role: 'orgAdmin' }).session
      assert.equal(notApproved.canCreateNewVersion(), false)
    })
  })
})

describe('closing the session', () => {
  test('cancels a running extraction without recording a failure, then stores the document', async () => {
    const pending = deferred()
    const { session, store, id } = makeSession({ processing: { extractPage: () => pending.promise } })
    session.processPage(1)
    assert.equal(pageOf(session, 1).processing.status, 'processing')
    await session.close()
    assert.equal(pageOf(session, 1).processing.status, 'notProcessed')
    assert.equal(store.get(id).snapshot.pages[0].processing.status, 'notProcessed')
    pending.resolve({ elements: [], attempt: 1, mock: true })
    await settle()
    assert.equal(pageOf(session, 1).elements.length, 0)
  })

  test('stores pending edits before it stops', async () => {
    const scheduler = createManualScheduler()
    const { session, store, id, ids } = makeSession({ scheduler })
    add(session, 1, paragraph(ids, 'آخر تعديل'))
    assert.equal(store.get(id).snapshot.pages[0].elements.length, 0)
    await session.close()
    assert.equal(store.get(id).snapshot.pages[0].elements[0].content.text, 'آخر تعديل')
  })

  test('a reprocess that is interrupted returns the page to its earlier status', async () => {
    const context = makeSession()
    await context.session.processPage(1)
    const pending = deferred()
    const status = pageOf(context.session, 1).processing.status
    context.service.extractPage = () => pending.promise
    context.session.processPage(1)
    await context.session.close()
    assert.equal(pageOf(context.session, 1).processing.status, status)
  })
})

describe('closing and re-opening (React StrictMode mounts, unmounts and mounts again)', () => {
  // A service whose every call can be finished (or cancelled) by the test.
  function controllableService() {
    const calls = []
    return {
      calls,
      extractPage({ signal }) {
        const entry = deferred()
        calls.push(entry)
        signal?.addEventListener('abort', () => entry.reject(new DOMException('Cancelled', 'AbortError')))
        return entry.promise
      },
    }
  }

  test('the cancelled first run cannot erase the bookkeeping of the second run', async () => {
    const service = controllableService()
    const { session, ids } = makeSession({ processing: service, autoProcess: true })
    assert.deepEqual(view(session).processingPages, [1])

    session.close() // aborts run #1 and restores the page
    session.open() // starts run #2 for the same page
    await settle() // run #1's rejection is handled now
    assert.equal(service.calls.length, 2)
    assert.deepEqual(view(session).processingPages, [1])
    assert.equal(pageOf(session, 1).processing.status, 'processing')

    // Run #2 is still tracked, so it is not started twice and can be cancelled.
    assert.deepEqual(await session.processPage(1), { ok: false })
    assert.equal(service.calls.length, 2)

    service.calls[1].resolve({ elements: [paragraph(ids, 'نتيجة')], attempt: 2, mock: true })
    await settle()
    assert.equal(pageOf(session, 1).processing.status, 'succeeded')
    assert.equal(pageOf(session, 1).elements.length, 1)
    assert.deepEqual(view(session).processingPages, [])
  })

  test('a cancelled run does not use up an attempt number', async () => {
    const attempts = []
    const service = {
      extractPage: ({ attempt, signal }) => {
        attempts.push(attempt)
        const entry = deferred()
        signal?.addEventListener('abort', () => entry.reject(new DOMException('Cancelled', 'AbortError')))
        return entry.promise
      },
    }
    const { session } = makeSession({ processing: service, autoProcess: true })
    session.close()
    session.open()
    await settle()
    // Both starts are the page's first attempt: the cancelled one did not count.
    assert.deepEqual(attempts, [1, 1])
  })

  test('closing again cancels the second run too', async () => {
    const service = controllableService()
    const { session, ids } = makeSession({ processing: service, autoProcess: true })
    session.close()
    session.open()
    await settle()
    await session.close()
    service.calls[1]?.resolve({ elements: [paragraph(ids, 'متأخرة')], attempt: 2, mock: true })
    await settle()
    assert.equal(pageOf(session, 1).elements.length, 0)
    assert.equal(pageOf(session, 1).processing.status, 'notProcessed')
  })
})

test('every session works on its own store', () => {
  const storeA = createMemoryDocumentStore()
  const storeB = createMemoryDocumentStore()
  const a = makeSession({ store: storeA })
  const b = makeSession({ store: storeB })
  add(a.session, 1, paragraph(a.ids, 'فقط في A'))
  assert.equal(pageOf(b.session, 1).elements.length, 0)
})
