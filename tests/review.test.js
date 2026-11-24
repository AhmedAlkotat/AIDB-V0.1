import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { hasMeaningfulContent } from '../src/domain/document/elements.js'
import { getReviewConfirmationBlocker, getReviewProgress } from '../src/domain/document/review.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { selectReviewProgress } from '../src/state/documentSession/documentSelectors.js'
import { field, heading, makeDocument, makeEditor, NOW, paragraph, table, unclassified } from './helpers.js'

function editorWithContent(options) {
  const editor = makeEditor(options)
  const pages = {}
  for (const page of editor.state.document.pages) {
    const element = paragraph(editor.generateId, `نص الصفحة ${page.pageNumber}`)
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: page.pageNumber, element })
    pages[page.pageNumber] = element.id
  }
  return { editor, pages }
}

const confirm = (editor, pageNumber, at = NOW) => editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber, at })
const edit = (editor, pageNumber, id, text) =>
  editor.dispatch({ type: ACTION.elementEdited, pageNumber, elementId: id, patch: { text } })

describe('explicit review confirmation', () => {
  test('pages start as not reviewed and opening or editing never confirms them', () => {
    const { editor, pages } = editorWithContent()
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 3 })
    edit(editor, 3, pages[3], 'تعديل')
    for (const page of editor.state.document.pages) {
      assert.deepEqual(page.review, { status: 'notReviewed', confirmedAt: null })
    }
  })

  test('confirming marks only that page as reviewed, with its timestamp', () => {
    const { editor } = editorWithContent()
    confirm(editor, 3)
    assert.deepEqual(editor.page(3).review, { status: 'reviewed', confirmedAt: NOW })
    assert.equal(editor.page(1).review.status, 'notReviewed')
    assert.equal(editor.page(5).review.status, 'notReviewed')
  })

  test('confirming is not undoable and does not enter the history', () => {
    const { editor, pages } = editorWithContent()
    edit(editor, 1, pages[1], 'تعديل')
    const depth = editor.state.histories[1].undo.length
    confirm(editor, 1)
    assert.equal(editor.state.histories[1].undo.length, depth)
    editor.dispatch({ type: ACTION.undone, pageNumber: 1 })
    // undo reverts the content edit, not the confirmation: the confirmation is invalidated instead
    assert.equal(editor.page(1).elements[0].content.text, 'نص الصفحة 1')
    assert.equal(editor.page(1).review.status, 'invalidated')
  })

  test('confirming twice keeps the first timestamp and the same state', () => {
    const { editor } = editorWithContent()
    confirm(editor, 1, NOW)
    const before = editor.state
    assert.equal(confirm(editor, 1, '2026-11-24T00:00:00.000Z'), before)
    assert.equal(editor.page(1).review.confirmedAt, NOW)
  })

  test('rejects missing or invalid timestamps and unselected pages', () => {
    const { editor } = editorWithContent()
    editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber: 1 })
    assert.equal(editor.state.lastError.code, 'INVALID_ARGUMENT')
    confirm(editor, 1, 'not a date')
    assert.equal(editor.state.lastError.code, 'INVALID_ARGUMENT')
    confirm(editor, 2)
    assert.equal(editor.state.lastError.code, 'PAGE_NOT_SELECTED')
    assert.equal(editor.page(1).review.status, 'notReviewed')
  })
})

describe('review invalidation', () => {
  test('any content change invalidates a reviewed page, and only that page', () => {
    const { editor, pages } = editorWithContent()
    confirm(editor, 1)
    confirm(editor, 3)
    edit(editor, 1, pages[1], 'تغيير بعد المراجعة')
    assert.deepEqual(editor.page(1).review, { status: 'invalidated', confirmedAt: null })
    assert.deepEqual(editor.page(3).review, { status: 'reviewed', confirmedAt: NOW })
  })

  test('every kind of content edit invalidates', () => {
    const edits = [
      (editor, id) => editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: id, patch: { text: 'جديد' } }),
      (editor, id, ids) => editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(ids, 'جديد') }),
      (editor, id) => editor.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: id }),
      (editor, id) => editor.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: id, targetType: 'heading' }),
      (editor, id, ids) => {
        const added = table(ids, [['أ']])
        editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: added })
        confirm(editor, 1)
        return editor.dispatch({ type: ACTION.tableCellEdited, pageNumber: 1, elementId: added.id, row: 0, column: 0, text: 'ب' })
      },
    ]
    for (const run of edits) {
      const { editor, pages } = editorWithContent()
      confirm(editor, 1)
      run(editor, pages[1], editor.generateId)
      assert.equal(editor.page(1).review.status, 'invalidated')
    }
  })

  test('reordering invalidates', () => {
    const { editor } = editorWithContent()
    const second = field(editor.generateId)
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: second })
    confirm(editor, 1)
    editor.dispatch({ type: ACTION.elementMoved, pageNumber: 1, elementId: second.id, toIndex: 0 })
    assert.equal(editor.page(1).review.status, 'invalidated')
  })

  test('actions that do not change content never invalidate', () => {
    const { editor, pages } = editorWithContent()
    confirm(editor, 1)
    const reviewed = editor.state
    // same text, same position, navigation, error dismissal, processing status
    assert.equal(edit(editor, 1, pages[1], 'نص الصفحة 1'), reviewed)
    assert.equal(editor.dispatch({ type: ACTION.elementMoved, pageNumber: 1, elementId: pages[1], toIndex: 0 }), reviewed)
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 3 })
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 1 })
    editor.dispatch({ type: ACTION.errorDismissed })
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'succeeded' })
    assert.equal(editor.page(1).review.status, 'reviewed')
  })

  test('undo or redo with nothing to undo or redo does not invalidate', () => {
    const editor = makeEditor()
    // An applied extraction starts the page with an empty history.
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'نتيجة')] })
    confirm(editor, 1)
    assert.equal(editor.page(1).review.status, 'reviewed')
    const reviewed = editor.state
    assert.equal(editor.dispatch({ type: ACTION.undone }), reviewed)
    assert.equal(editor.dispatch({ type: ACTION.redone }), reviewed)
    assert.equal(editor.page(1).review.status, 'reviewed')
  })

  test('rejected operations do not invalidate', () => {
    const { editor, pages } = editorWithContent()
    confirm(editor, 1)
    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: pages[1], patch: { level: 3 } })
    editor.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: 'missing' })
    assert.equal(editor.page(1).review.status, 'reviewed')
  })

  test('undo and redo after a confirmation invalidate it instead of restoring it', () => {
    const { editor, pages } = editorWithContent()
    confirm(editor, 1)
    edit(editor, 1, pages[1], 'تغيير')
    assert.equal(editor.page(1).review.status, 'invalidated')

    // Undo returns the content to exactly what was confirmed ...
    editor.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(editor.page(1).elements[0].content.text, 'نص الصفحة 1')
    // ... but the page is still not reviewed: explicit reconfirmation is required.
    assert.equal(editor.page(1).review.status, 'invalidated')
    editor.dispatch({ type: ACTION.redone, pageNumber: 1 })
    assert.equal(editor.page(1).review.status, 'invalidated')
  })

  test('undo after a new confirmation invalidates it again', () => {
    const { editor, pages } = editorWithContent()
    edit(editor, 1, pages[1], 'تغيير')
    confirm(editor, 1)
    editor.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(editor.page(1).review.status, 'invalidated')
  })

  test('an invalidated page becomes reviewed again only through explicit confirmation', () => {
    const { editor, pages } = editorWithContent()
    confirm(editor, 1)
    edit(editor, 1, pages[1], 'تغيير')
    confirm(editor, 1, '2026-11-24T08:00:00.000Z')
    assert.deepEqual(editor.page(1).review, { status: 'reviewed', confirmedAt: '2026-11-24T08:00:00.000Z' })
  })

  test('a page that was never confirmed stays not reviewed when edited', () => {
    const { editor, pages } = editorWithContent()
    edit(editor, 1, pages[1], 'تغيير')
    assert.equal(editor.page(1).review.status, 'notReviewed')
  })

  test('applying a different AI extraction invalidates; the identical one does not', () => {
    const { editor } = editorWithContent()
    const elements = [paragraph(editor.generateId, 'نتيجة جديدة')]
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements })
    confirm(editor, 1)
    const identical = JSON.parse(JSON.stringify(editor.page(1).elements))
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: identical })
    assert.equal(editor.page(1).review.status, 'reviewed')
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'مختلفة')] })
    assert.equal(editor.page(1).review.status, 'invalidated')
  })
})

describe('review progress', () => {
  test('counts only selected pages; unselected pages are neither unreviewed nor failed', () => {
    const editor = makeEditor({ selectedPages: [2, 4], totalPages: 8 })
    const progress = selectReviewProgress(editor.state)
    assert.equal(progress.totalPages, 2)
    assert.deepEqual(progress.pagesRequiringReview, [2, 4])
    assert.equal(editor.state.document.pages.some((page) => [1, 3, 5, 6, 7, 8].includes(page.pageNumber)), false)
  })

  test('tracks reviewed, requiring-review and invalidated pages with a percentage', () => {
    const { editor, pages } = editorWithContent({ selectedPages: [1, 2, 3, 4], totalPages: 6 })
    assert.deepEqual(selectReviewProgress(editor.state), {
      totalPages: 4,
      reviewedCount: 0,
      reviewedPages: [],
      requiringReviewCount: 4,
      pagesRequiringReview: [1, 2, 3, 4],
      invalidatedPages: [],
      percent: 0,
      isComplete: false,
    })

    confirm(editor, 1)
    confirm(editor, 2)
    confirm(editor, 3)
    edit(editor, 2, pages[2], 'تغيير')
    const progress = selectReviewProgress(editor.state)
    assert.deepEqual(progress.reviewedPages, [1, 3])
    assert.deepEqual(progress.invalidatedPages, [2])
    assert.deepEqual(progress.pagesRequiringReview, [2, 4])
    assert.equal(progress.percent, 50)
    assert.equal(progress.isComplete, false)

    confirm(editor, 2)
    confirm(editor, 4)
    const done = selectReviewProgress(editor.state)
    assert.equal(done.percent, 100)
    assert.equal(done.isComplete, true)
    assert.deepEqual(done.pagesRequiringReview, [])
  })

  test('rounds the percentage and handles a single page', () => {
    const { editor } = editorWithContent({ selectedPages: [1, 2, 3], totalPages: 3 })
    confirm(editor, 1)
    assert.equal(selectReviewProgress(editor.state).percent, 33)
    const { editor: single } = editorWithContent({ selectedPages: [1], totalPages: 1 })
    confirm(single, 1)
    assert.equal(selectReviewProgress(single.state).isComplete, true)
  })

  test('a document with no pages is never complete', () => {
    const document = { ...makeDocument(), pages: [] }
    assert.deepEqual(getReviewProgress(document).percent, 0)
    assert.equal(getReviewProgress(document).isComplete, false)
  })

  test('reviewing one page leaves other pages reviewed state independent', () => {
    const { editor, pages } = editorWithContent()
    confirm(editor, 5)
    edit(editor, 1, pages[1], 'تغيير')
    assert.equal(editor.page(5).review.status, 'reviewed')
    assert.equal(editor.page(1).review.status, 'notReviewed')
    assert.equal(editor.page(3).review.status, 'notReviewed')
  })
})

describe('review confirmation policy', () => {
  const add = (editor, pageNumber, element) => editor.dispatch({ type: ACTION.elementAdded, pageNumber, element })
  const setStatus = (editor, pageNumber, status, errorCode) =>
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber, status, errorCode })

  // Confirming must be rejected, leave the document untouched and say why.
  function expectBlocked(editor, pageNumber, reason) {
    const before = editor.state.document
    const reviewBefore = editor.page(pageNumber).review
    confirm(editor, pageNumber)
    assert.equal(editor.state.lastError.code, 'REVIEW_NOT_ALLOWED')
    assert.equal(editor.state.lastError.details.reason, reason)
    assert.equal(editor.state.document, before)
    assert.equal(editor.page(pageNumber).review, reviewBefore)
    assert.notEqual(editor.page(pageNumber).review.status, 'reviewed')
  }

  test('a page with no content cannot be confirmed, processed or not', () => {
    const editor = makeEditor()
    expectBlocked(editor, 1, 'noContent')
    setStatus(editor, 1, 'succeeded')
    expectBlocked(editor, 1, 'noContent')
    assert.equal(selectReviewProgress(editor.state).reviewedCount, 0)
    assert.equal(selectReviewProgress(editor.state).isComplete, false)
  })

  const blank = [
    ['an empty paragraph', (g) => paragraph(g, '')],
    ['a whitespace-only paragraph', (g) => paragraph(g, '  \n\t ')],
    ['an empty heading', (g) => heading(g, '', 1)],
    ['a field with an empty key and value', (g) => field(g, '', '')],
    ['a field with blank key and value', (g) => field(g, ' ', '\u00a0')],
    ['a table with only blank cells', (g) => table(g, [['', ' '], ['\t', '']])],
    ['an unclassified element with blank text and no raw data', (g) => unclassified(g, '  ', null)],
  ]
  for (const [label, build] of blank) {
    test(`${label} is not content`, () => {
      const editor = makeEditor()
      add(editor, 1, build(editor.generateId))
      expectBlocked(editor, 1, 'noContent')
    })
  }

  test('preserved raw data counts as content even when its text is blank', () => {
    const editor = makeEditor()
    add(editor, 1, unclassified(editor.generateId, '', { label: 'stamp' }))
    confirm(editor, 1)
    assert.equal(editor.page(1).review.status, 'reviewed')
  })

  test('hasMeaningfulContent and getReviewConfirmationBlocker agree', () => {
    const editor = makeEditor()
    assert.equal(hasMeaningfulContent([]), false)
    assert.equal(hasMeaningfulContent([paragraph(editor.generateId, '  '), field(editor.generateId, '', '')]), false)
    assert.equal(hasMeaningfulContent([paragraph(editor.generateId, ''), table(editor.generateId, [['', 'x']])]), true)
    assert.equal(getReviewConfirmationBlocker(editor.page(1)), 'noContent')
    add(editor, 1, paragraph(editor.generateId, 'نص'))
    assert.equal(getReviewConfirmationBlocker(editor.page(1)), null)
  })

  test('a page that is being processed cannot be confirmed, even with content', () => {
    const editor = makeEditor()
    add(editor, 1, paragraph(editor.generateId, 'نص موجود'))
    setStatus(editor, 1, 'processing')
    expectBlocked(editor, 1, 'processing')
    // When processing ends the page can be confirmed.
    setStatus(editor, 1, 'succeeded')
    confirm(editor, 1)
    assert.equal(editor.page(1).review.status, 'reviewed')
  })

  test('a failed page cannot be confirmed until valid content is entered manually', () => {
    const editor = makeEditor()
    setStatus(editor, 1, 'failed', 'OCR_TIMEOUT')
    expectBlocked(editor, 1, 'failedWithoutContent')

    // Blank manual content is not enough.
    add(editor, 1, paragraph(editor.generateId, '   '))
    expectBlocked(editor, 1, 'failedWithoutContent')

    add(editor, 1, paragraph(editor.generateId, 'محتوى أدخلته يدويًا'))
    confirm(editor, 1)
    assert.equal(editor.state.lastError, null)
    assert.equal(editor.page(1).review.status, 'reviewed')
    assert.ok(editor.page(1).elements.every((element) => element.source.kind === 'manual'))
  })

  test('a failed page keeps its failure information and other pages are unaffected', () => {
    const editor = makeEditor()
    setStatus(editor, 1, 'failed', 'OCR_TIMEOUT')
    add(editor, 1, paragraph(editor.generateId, 'يدوي'))
    confirm(editor, 1)
    assert.deepEqual(editor.page(1).processing, { status: 'failed', errorCode: 'OCR_TIMEOUT' })
    expectBlocked(editor, 3, 'noContent')
    expectBlocked(editor, 5, 'noContent')
  })

  test('content that arrived before a later failure still counts', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'نتيجة سابقة')] })
    setStatus(editor, 1, 'failed', 'RETRY_FAILED')
    confirm(editor, 1)
    assert.equal(editor.page(1).review.status, 'reviewed')
  })

  test('a reviewed page edited down to nothing is invalidated and cannot be confirmed again', () => {
    const { editor, pages } = editorWithContent()
    confirm(editor, 1)
    edit(editor, 1, pages[1], '   ')
    assert.equal(editor.page(1).review.status, 'invalidated')
    expectBlocked(editor, 1, 'noContent')
    assert.equal(editor.page(1).review.status, 'invalidated')
    edit(editor, 1, pages[1], 'نص جديد')
    confirm(editor, 1)
    assert.equal(editor.page(1).review.status, 'reviewed')
  })

  test('a rejected confirmation does not mark the page as reviewed or visited', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 3 })
    expectBlocked(editor, 3, 'noContent')
    assert.equal(editor.state.lastVisitedPage, 3)
    assert.deepEqual(selectReviewProgress(editor.state).pagesRequiringReview, [1, 3, 5])
  })

  test('an invalid timestamp is reported before the content rules', () => {
    const editor = makeEditor()
    confirm(editor, 1, 'not a date')
    assert.equal(editor.state.lastError.code, 'INVALID_ARGUMENT')
  })
})
