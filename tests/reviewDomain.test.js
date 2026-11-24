import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  APPROVAL_BLOCKER,
  canCreateNewVersion,
  canEditDocument,
  canRoleApprove,
  getApprovalEligibility,
} from '../src/domain/document/approval.js'
import { createDocument } from '../src/domain/document/document.js'
import { getAdjacentPage, getPageListWindow, getSelectedPageIndex, NAVIGATION, resolvePageJump } from '../src/domain/document/pageNavigation.js'
import { getPageUiStatus, PAGE_UI_STATUS } from '../src/domain/document/pageStatus.js'
import { findTextMatches, normalizeForSearch, searchPageElements, splitByRanges } from '../src/domain/document/search.js'
import { parseDocumentJson, serializeDocument, serializeDocumentPage } from '../src/domain/document/serialization.js'
import { validateElements } from '../src/domain/document/validation.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { buildMockElements, createMockProcessingService, MOCK_TAG, MockProcessingError } from '../src/services/mockProcessingService.js'
import { assertOperationError, field, FILE, heading, makeEditor, makeIds, NOW, paragraph, table } from './helpers.js'

describe('page status (AI processing and human review stay separate)', () => {
  const page = (processing, review = 'notReviewed', elements = []) => ({
    processing: { status: processing, errorCode: null },
    review: { status: review, confirmedAt: review === 'reviewed' ? NOW : null },
    elements,
  })
  const content = [{ type: 'paragraph', content: { text: 'نص' } }]

  test('maps every combination to one reviewer-facing status', () => {
    assert.equal(getPageUiStatus(page('notProcessed')), PAGE_UI_STATUS.pending)
    assert.equal(getPageUiStatus(page('processing')), PAGE_UI_STATUS.processing)
    assert.equal(getPageUiStatus(page('succeeded', 'notReviewed', content)), PAGE_UI_STATUS.readyForReview)
    assert.equal(getPageUiStatus(page('failed')), PAGE_UI_STATUS.failed)
    assert.equal(getPageUiStatus(page('failed', 'notReviewed', content)), PAGE_UI_STATUS.manualEditing)
    assert.equal(getPageUiStatus(page('notProcessed', 'notReviewed', content)), PAGE_UI_STATUS.manualEditing)
    assert.equal(getPageUiStatus(page('succeeded', 'reviewed', content)), PAGE_UI_STATUS.reviewed)
    assert.equal(getPageUiStatus(page('failed', 'reviewed', content)), PAGE_UI_STATUS.reviewed)
    assert.equal(getPageUiStatus(page('succeeded', 'invalidated', content)), PAGE_UI_STATUS.readyForReview)
  })

  test('processing always wins, even over a stale review', () => {
    assert.equal(getPageUiStatus(page('processing', 'reviewed', content)), PAGE_UI_STATUS.processing)
  })

  test('blank content does not count as manual content', () => {
    assert.equal(getPageUiStatus(page('failed', 'notReviewed', [{ type: 'paragraph', content: { text: '   ' } }])), PAGE_UI_STATUS.failed)
  })

  test('a manually completed failed page is not relabelled as a successful extraction', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: 'X' })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'يدوي') })
    assert.equal(getPageUiStatus(editor.page(1)), PAGE_UI_STATUS.manualEditing)
    assert.equal(editor.page(1).processing.status, 'failed')
  })
})

describe('approval rules', () => {
  const documentWith = (reviewed) => {
    const editor = makeEditor({ selectedPages: [1, 2], totalPages: 2 })
    for (const page of editor.state.document.pages) {
      editor.dispatch({ type: ACTION.elementAdded, pageNumber: page.pageNumber, element: paragraph(editor.generateId, 'نص') })
    }
    for (const pageNumber of reviewed) editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber, at: NOW })
    return editor.state.document
  }
  const eligibility = (overrides = {}) =>
    getApprovalEligibility({ document: documentWith([1, 2]), saveStatus: 'saved', activeProcessingCount: 0, role: 'employee', approvalStatus: 'none', ...overrides })

  test('is eligible only when every condition holds', () => {
    assert.deepEqual(eligibility(), { eligible: true, blockers: [], reviewedCount: 2, totalPages: 2 })
  })

  test('reports each blocker separately', () => {
    assert.deepEqual(eligibility({ document: documentWith([1]) }).blockers, [APPROVAL_BLOCKER.pagesNotReviewed])
    for (const saveStatus of ['unsaved', 'saving', 'failed']) {
      assert.deepEqual(eligibility({ saveStatus }).blockers, [APPROVAL_BLOCKER.unsavedChanges], saveStatus)
    }
    assert.deepEqual(eligibility({ activeProcessingCount: 1 }).blockers, [APPROVAL_BLOCKER.processingActive])
    assert.deepEqual(eligibility({ role: 'visitor' }).blockers, [APPROVAL_BLOCKER.noPermission])
    assert.deepEqual(eligibility({ approvalStatus: 'approved' }).blockers, [APPROVAL_BLOCKER.alreadyApproved])
  })

  test('several blockers are all listed', () => {
    const result = eligibility({ document: documentWith([]), saveStatus: 'failed', activeProcessingCount: 2, role: 'x' })
    assert.equal(result.eligible, false)
    assert.deepEqual(result.blockers, ['pagesNotReviewed', 'unsavedChanges', 'processingActive', 'noPermission'])
  })

  test('unselected pages never block approval', () => {
    const editor = makeEditor({ selectedPages: [2], totalPages: 9 })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 2, element: paragraph(editor.generateId, 'نص') })
    editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber: 2, at: NOW })
    assert.equal(eligibility({ document: editor.state.document }).eligible, true)
  })

  test('approved documents cannot be edited by anyone; only the admin can start a new version', () => {
    assert.equal(canEditDocument({ approvalStatus: 'none' }), true)
    assert.equal(canEditDocument({ approvalStatus: 'approved' }), false)
    assert.equal(canCreateNewVersion({ role: 'orgAdmin', approvalStatus: 'approved' }), true)
    assert.equal(canCreateNewVersion({ role: 'employee', approvalStatus: 'approved' }), false)
    assert.equal(canCreateNewVersion({ role: 'orgAdmin', approvalStatus: 'none' }), false)
    assert.equal(canRoleApprove('employee'), true)
    assert.equal(canRoleApprove(undefined), false)
  })
})

describe('search within the current page', () => {
  test('ignores diacritics, tatweel, alef and ya variants, case, and maps Arabic digits', () => {
    // Taa marbuta is searched as haa (approved flexible Arabic search, L7), so the normalized form ends in haa.
    assert.equal(normalizeForSearch('الْعَرَبِيَّةُ'), 'العربيه')
    assert.equal(findTextMatches('اللُّغَةُ العَرَبِيَّةُ جميلة', 'العربية').length, 1)
    assert.equal(findTextMatches('أحمد إبراهيم آدم', 'احمد').length, 1)
    assert.equal(findTextMatches('أحمد إبراهيم آدم', 'ابراهيم').length, 1)
    assert.equal(findTextMatches('على موسى', 'علي').length, 1)
    assert.equal(findTextMatches('كتــــاب', 'كتاب').length, 1)
    assert.equal(findTextMatches('رقم ١٢٣٤', '1234').length, 1)
    assert.equal(findTextMatches('Invoice NO', 'invoice').length, 1)
  })

  test('returns exact ranges in the ORIGINAL text, including diacritics inside the match', () => {
    const text = 'قال الْعَرَبِيُّ كلمة'
    const [match] = findTextMatches(text, 'العربي')
    // The diacritics INSIDE the match are kept; the ones after its last letter are not.
    assert.equal(text.slice(match.start, match.end), 'الْعَرَبِي')
    assert.deepEqual(splitByRanges('abcabc', [{ start: 0, end: 3 }, { start: 3, end: 6 }]).map((s) => s.match), [true, true])
  })

  test('finds several non-overlapping matches and ignores empty queries', () => {
    assert.equal(findTextMatches('نعم نعم نعم', 'نعم').length, 3)
    assert.deepEqual(findTextMatches('نص', ''), [])
    assert.deepEqual(findTextMatches('نص', '   '), [])
    assert.deepEqual(findTextMatches('نص', 'غير موجود'), [])
  })

  test('searches headings, paragraphs, field keys and values, table cells and unclassified text of ONE page', () => {
    const g = makeIds()
    const elements = [
      heading(g, 'تقرير سنوي'),
      paragraph(g, 'هذا تقرير مفصل عن السنة'),
      field(g, 'نوع التقرير', 'سنوي'),
      table(g, [['البند', 'تقرير'], ['أ', 'ب']]),
      { ...paragraph(g, 'لا علاقة'), type: 'unclassified', content: { text: 'تقرير مجهول', raw: null } },
      paragraph(g, 'نص آخر'),
    ]
    const result = searchPageElements(elements, 'تقرير')
    assert.equal(result.total, 5)
    assert.equal(result.matchedElementIds.size, 5)
    assert.equal(result.matchedElementIds.has(elements[5].id), false)
    assert.deepEqual(Object.keys(result.byElement[elements[2].id].fields), ['key'])
    assert.ok(Object.keys(result.byElement[elements[3].id].fields)[0].startsWith('cell:'))
    assert.equal(searchPageElements(elements, '').total, 0)
  })

  test('only the elements passed in are searched (no cross-page matches)', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'كلمة نادرة') })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 3, element: paragraph(editor.generateId, 'نص عادي') })
    assert.equal(searchPageElements(editor.page(1).elements, 'نادرة').total, 1)
    assert.equal(searchPageElements(editor.page(3).elements, 'نادرة').total, 0)
  })
})

describe('page navigation over selected pages', () => {
  const selected = [2, 5, 6, 9, 40]

  test('moves between selected pages only and stops at the ends', () => {
    assert.equal(getAdjacentPage(selected, 2, NAVIGATION.next), 5)
    assert.equal(getAdjacentPage(selected, 5, NAVIGATION.previous), 2)
    assert.equal(getAdjacentPage(selected, 9, NAVIGATION.next), 40)
    assert.equal(getAdjacentPage(selected, 2, NAVIGATION.previous), null)
    assert.equal(getAdjacentPage(selected, 40, NAVIGATION.next), null)
    assert.equal(getAdjacentPage(selected, 3, NAVIGATION.next), null)
  })

  test('jump validates the typed page number against the selected pages', () => {
    assert.deepEqual(resolvePageJump(selected, '9'), { ok: true, pageNumber: 9 })
    assert.deepEqual(resolvePageJump(selected, ' ٩ '), { ok: true, pageNumber: 9 })
    assert.deepEqual(resolvePageJump(selected, '۴۰'), { ok: true, pageNumber: 40 })
    assert.deepEqual(resolvePageJump(selected, '3'), { ok: false, reason: 'notSelected' })
    assert.deepEqual(resolvePageJump(selected, '99'), { ok: false, reason: 'notSelected' })
    assert.deepEqual(resolvePageJump(selected, ''), { ok: false, reason: 'empty' })
    for (const bad of ['abc', '1.5', '-2', '0', '1e3', '٣-٥']) {
      assert.equal(resolvePageJump(selected, bad).ok, false, bad)
    }
  })

  test('a 1,000-page document with a selection counts and navigates only the selected pages', () => {
    const everyThird = Array.from({ length: 334 }, (_, index) => index * 3 + 1)
    const document = createDocument({ file: FILE, totalPages: 1000, selectedPages: everyThird }, { generateId: makeIds() })
    assert.equal(document.pages.length, 334)
    assert.equal(getSelectedPageIndex(everyThird, 1000), 333)
    assert.equal(getSelectedPageIndex(everyThird, 2), -1)
    assert.equal(getAdjacentPage(everyThird, 1, NAVIGATION.next), 4)
    assert.equal(resolvePageJump(everyThird, '2').reason, 'notSelected')
  })

  test('a fully selected 1,000-page document stays fast to navigate and to list', () => {
    const all = Array.from({ length: 1000 }, (_, index) => index + 1)
    const started = performance.now()
    for (let page = 1; page <= 1000; page += 1) getAdjacentPage(all, page, NAVIGATION.next)
    assert.ok(performance.now() - started < 200)

    const window = getPageListWindow(all, 3, 50)
    assert.equal(window.pages.length, 50)
    assert.equal(window.pages[0], 151)
    assert.equal(window.pageCount, 20)
    assert.equal(getPageListWindow(all, 99, 50).windowIndex, 19)
    assert.equal(getPageListWindow([], 0).pageCount, 1)
  })

  test('creating and validating a 1,000-page document is fast', () => {
    const started = performance.now()
    const document = createDocument({ file: FILE, totalPages: 1000 }, { generateId: makeIds() })
    const text = JSON.stringify(serializeDocument(document))
    assert.equal(parseDocumentJson(text).ok, true)
    assert.ok(performance.now() - started < 1500, `took ${performance.now() - started}ms`)
  })
})

describe('JSON of the current page comes from the live canonical data', () => {
  test('reflects every edit, undo and redo, and equals the page in the full serialization', () => {
    const editor = makeEditor()
    const p = paragraph(editor.generateId, 'قبل')
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: p })
    const json = () => serializeDocumentPage(editor.state.document, 1)
    assert.equal(json().pages[0].elements[0].content.text, 'قبل')

    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: p.id, patch: { text: 'بعد' } })
    assert.equal(json().pages[0].elements[0].content.text, 'بعد')
    assert.deepEqual(json().pages[0], serializeDocument(editor.state.document).pages[0])

    editor.dispatch({ type: ACTION.undone })
    assert.equal(json().pages[0].elements[0].content.text, 'قبل')
    editor.dispatch({ type: ACTION.redone })
    assert.equal(json().pages[0].elements[0].content.text, 'بعد')
  })

  test('contains only the requested page, keeps the envelope, and returns a copy', () => {
    const editor = makeEditor()
    const json = serializeDocumentPage(editor.state.document, 3)
    assert.deepEqual(json.pages.map((page) => page.pageNumber), [3])
    assert.deepEqual(json.selectedPages, [1, 3, 5])
    assert.equal(json.id, editor.state.document.id)
    json.pages[0].elements.push('x')
    json.selectedPages.push(9)
    assert.equal(editor.page(3).elements.length, 0)
    assert.deepEqual(editor.state.document.selectedPages, [1, 3, 5])
    assertOperationError(() => serializeDocumentPage(editor.state.document, 2), 'PAGE_NOT_FOUND')
  })

  test('can include the preserved original extraction', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'ai')] })
    assert.equal(serializeDocumentPage(editor.state.document, 1).pages[0].originalExtraction, undefined)
    assert.equal(serializeDocumentPage(editor.state.document, 1, { includeOriginalExtraction: true }).pages[0].originalExtraction.elements.length, 1)
  })
})

describe('mock processing service', () => {
  const service = (options) => createMockProcessingService({ delayMs: 0, ...options })

  test('every result is valid canonical content clearly marked as mock', async () => {
    const { elements, mock } = await service().extractPage({ pageNumber: 1, attempt: 1 })
    assert.equal(mock, true)
    assert.deepEqual(validateElements(elements, { checkOrder: false }), { valid: true, errors: [] })
    assert.deepEqual(elements.map((element) => element.type), ['heading', 'paragraph', 'field', 'table', 'unclassified'])
    for (const element of elements) {
      assert.equal(element.source.kind, 'ai')
      assert.equal(element.source.details.mock, true)
    }
    assert.ok(elements[0].content.text.includes(MOCK_TAG))
    assert.ok(elements[1].content.text.includes(MOCK_TAG))
  })

  test('is deterministic for a page and attempt, and differs between attempts', async () => {
    const text = async (attempt) => (await service({ generateId: makeIds() }).extractPage({ pageNumber: 2, attempt })).elements.map((e) => JSON.stringify(e.content)).join('|')
    assert.equal(await text(1), await text(1))
    assert.notEqual(await text(1), await text(2))
  })

  test('pages 4, 8, ... fail the first attempt and succeed on retry; others never fail', async () => {
    const mock = service()
    await assert.rejects(mock.extractPage({ pageNumber: 4, attempt: 1 }), (error) => error instanceof MockProcessingError && error.code === 'MOCK_OCR_FAILED')
    assert.equal((await mock.extractPage({ pageNumber: 4, attempt: 2 })).attempt, 2)
    assert.ok((await mock.extractPage({ pageNumber: 3, attempt: 1 })).elements.length > 0)
  })

  test('failures can be forced for demonstrations', async () => {
    const mock = service({ shouldFail: () => false })
    mock.forceFailure(7, 2)
    await assert.rejects(mock.extractPage({ pageNumber: 7, attempt: 1 }), MockProcessingError)
    await assert.rejects(mock.extractPage({ pageNumber: 7, attempt: 2 }), MockProcessingError)
    assert.ok((await mock.extractPage({ pageNumber: 7, attempt: 3 })).elements.length > 0)
  })

  test('can be cancelled', async () => {
    const controller = new AbortController()
    const pending = createMockProcessingService({ delayMs: 10_000 }).extractPage({ pageNumber: 1, attempt: 1, signal: controller.signal })
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    const already = new AbortController()
    already.abort()
    await assert.rejects(service().extractPage({ pageNumber: 1, attempt: 1, signal: already.signal }), { name: 'AbortError' })
  })

  test('buildMockElements gives fresh IDs each time', () => {
    const a = buildMockElements(1, 1)
    const b = buildMockElements(1, 1)
    assert.notEqual(a[0].id, b[0].id)
  })
})
