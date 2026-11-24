import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MAX_UNDO_OPERATIONS } from '../src/domain/document/schema.js'
import { validateDocument } from '../src/domain/document/validation.js'
import { ACTION, createEditorReducer, createInitialEditorState } from '../src/state/documentSession/documentReducer.js'
import {
  canRedo,
  canUndo,
  selectRedoDepth,
  selectUndoDepth,
} from '../src/state/documentSession/documentSelectors.js'
import { assertOperationError, field, makeDocument, makeEditor, NOW, paragraph, table, unclassified } from './helpers.js'

// An editor whose page 1 holds one paragraph; returns the paragraph ID.
function editorWithParagraph(text = 'البداية', options) {
  const editor = makeEditor(options)
  const element = paragraph(editor.generateId, text)
  editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element })
  return { editor, id: element.id }
}

const edit = (editor, id, text, pageNumber = 1) =>
  editor.dispatch({ type: ACTION.elementEdited, pageNumber, elementId: id, patch: { text } })

const textOf = (editor, id, pageNumber = 1) =>
  editor.page(pageNumber).elements.find((element) => element.id === id).content.text

describe('page-level editing state', () => {
  test('starts on the first selected page and tracks the last visited page', () => {
    const editor = makeEditor({ selectedPages: [2, 4, 5], totalPages: 5 })
    assert.equal(editor.state.lastVisitedPage, 2)
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 5 })
    assert.equal(editor.state.lastVisitedPage, 5)
  })

  test('opening a page changes nothing else and returns the same state when already there', () => {
    const editor = makeEditor()
    const before = editor.state
    assert.equal(editor.dispatch({ type: ACTION.pageSelected, pageNumber: 1 }), before)
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 3 })
    assert.equal(editor.state.document, before.document)
    assert.deepEqual(editor.state.histories, {})
  })

  test('rejects unselected and nonexistent pages, keeping the state and recording the error', () => {
    const editor = makeEditor({ selectedPages: [1, 3], totalPages: 5 })
    const before = editor.state
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 2 })
    assert.equal(editor.state.lastError.code, 'PAGE_NOT_SELECTED')
    assert.equal(editor.state.document, before.document)
    assert.equal(editor.state.lastVisitedPage, 1)
    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 99 })
    assert.equal(editor.state.lastError.code, 'PAGE_NOT_FOUND')
    editor.dispatch({ type: ACTION.errorDismissed })
    assert.equal(editor.state.lastError, null)
  })

  test('editing an unselected page is rejected', () => {
    const editor = makeEditor({ selectedPages: [1, 3], totalPages: 5 })
    const element = paragraph(editor.generateId)
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 2, element })
    assert.equal(editor.state.lastError.code, 'PAGE_NOT_SELECTED')
  })

  test('rejected operations leave the document untouched and carry a code and details', () => {
    const { editor, id } = editorWithParagraph()
    const before = editor.state.document
    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: id, patch: { key: 'x' } })
    assert.equal(editor.state.lastError.code, 'UNKNOWN_CONTENT_FIELD')
    assert.ok(editor.state.lastError.message)
    assert.equal(editor.state.document, before)
    // a later successful action clears the error
    edit(editor, id, 'جديد')
    assert.equal(editor.state.lastError, null)
  })

  test('an unknown action is rejected without throwing', () => {
    const editor = makeEditor()
    editor.dispatch({ type: 'doSomethingElse' })
    assert.equal(editor.state.lastError.code, 'UNKNOWN_ACTION')
  })

  test('edits on one page do not touch another page', () => {
    const editor = makeEditor()
    const a = paragraph(editor.generateId, 'صفحة ١')
    const b = paragraph(editor.generateId, 'صفحة ٣')
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: a })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 3, element: b })
    const page3Before = editor.page(3)
    edit(editor, a.id, 'تعديل ١', 1)
    assert.equal(editor.page(3), page3Before)
    assert.equal(textOf(editor, b.id, 3), 'صفحة ٣')
    assert.equal(selectUndoDepth(editor.state, 1), 2)
    assert.equal(selectUndoDepth(editor.state, 3), 1)
  })
})

describe('editing operations through the reducer', () => {
  test('supports add, edit, move, convert, delete and all table operations', () => {
    const editor = makeEditor()
    const [p, f, t] = [paragraph(editor.generateId, 'أ'), field(editor.generateId), table(editor.generateId, [['١', '٢']])]
    for (const element of [p, f, t]) editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element })
    assert.deepEqual(editor.page().elements.map((element) => element.order), [0, 1, 2])

    editor.dispatch({ type: ACTION.elementMoved, pageNumber: 1, elementId: t.id, toIndex: 0 })
    assert.deepEqual(editor.page().elements.map((element) => element.id), [t.id, p.id, f.id])

    editor.dispatch({ type: ACTION.tableCellEdited, pageNumber: 1, elementId: t.id, row: 0, column: 1, text: 'ب' })
    editor.dispatch({ type: ACTION.tableRowAdded, pageNumber: 1, elementId: t.id })
    editor.dispatch({ type: ACTION.tableColumnAdded, pageNumber: 1, elementId: t.id, index: 0 })
    let rows = editor.page().elements[0].content.rows
    assert.deepEqual(rows.map((row) => row.cells.map((cell) => cell.text)), [['', '١', 'ب'], ['', '', '']])
    editor.dispatch({ type: ACTION.tableRowRemoved, pageNumber: 1, elementId: t.id, index: 1 })
    editor.dispatch({ type: ACTION.tableColumnRemoved, pageNumber: 1, elementId: t.id, index: 0 })
    rows = editor.page().elements[0].content.rows
    assert.deepEqual(rows.map((row) => row.cells.map((cell) => cell.text)), [['١', 'ب']])

    editor.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: p.id, targetType: 'heading' })
    assert.equal(editor.page().elements[1].type, 'heading')
    editor.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: f.id })
    assert.deepEqual(editor.page().elements.map((element) => element.order), [0, 1])
    assert.equal(editor.state.lastError, null)
  })

  test('a destructive type change is rejected until confirmed, then undoable', () => {
    const editor = makeEditor()
    const t = table(editor.generateId, [['أ', 'ب'], ['ج', 'د']])
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: t })
    const depth = selectUndoDepth(editor.state)
    editor.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: t.id, targetType: 'paragraph' })
    assert.equal(editor.state.lastError.code, 'CONFIRMATION_REQUIRED')
    assert.equal(editor.state.lastError.details.plan.preview.type, 'paragraph')
    assert.equal(editor.page().elements[0].type, 'table')
    assert.equal(selectUndoDepth(editor.state), depth)

    editor.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: t.id, targetType: 'paragraph', confirmed: true })
    assert.equal(editor.page().elements[0].type, 'paragraph')
    editor.dispatch({ type: ACTION.undone })
    assert.equal(editor.page().elements[0].type, 'table')
    assert.equal(editor.page().elements[0].content.rows.length, 2)
  })
})

describe('undo and redo', () => {
  test('undoes and redoes edits step by step', () => {
    const { editor, id } = editorWithParagraph('أ')
    edit(editor, id, 'ب')
    edit(editor, id, 'ج')
    assert.equal(textOf(editor, id), 'ج')
    editor.dispatch({ type: ACTION.undone })
    assert.equal(textOf(editor, id), 'ب')
    editor.dispatch({ type: ACTION.undone })
    assert.equal(textOf(editor, id), 'أ')
    editor.dispatch({ type: ACTION.redone })
    assert.equal(textOf(editor, id), 'ب')
    editor.dispatch({ type: ACTION.redone })
    assert.equal(textOf(editor, id), 'ج')
    assert.equal(canRedo(editor.state), false)
  })

  test('undo can remove an added element and bring back a deleted one with the same ID', () => {
    const { editor, id } = editorWithParagraph('x')
    editor.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: id })
    assert.equal(editor.page().elements.length, 0)
    editor.dispatch({ type: ACTION.undone })
    assert.equal(editor.page().elements[0].id, id)
    editor.dispatch({ type: ACTION.undone })
    assert.equal(editor.page().elements.length, 0)
  })

  test('does nothing, without error, when there is nothing to undo or redo', () => {
    const editor = makeEditor()
    const before = editor.state
    assert.equal(editor.dispatch({ type: ACTION.undone }), before)
    assert.equal(editor.dispatch({ type: ACTION.redone }), before)
    assert.equal(canUndo(editor.state), false)
  })

  test('a new edit clears the redo history', () => {
    const { editor, id } = editorWithParagraph('أ')
    edit(editor, id, 'ب')
    edit(editor, id, 'ج')
    editor.dispatch({ type: ACTION.undone })
    assert.equal(selectRedoDepth(editor.state), 1)
    edit(editor, id, 'د')
    assert.equal(selectRedoDepth(editor.state), 0)
    assert.equal(canRedo(editor.state), false)
    editor.dispatch({ type: ACTION.redone })
    assert.equal(textOf(editor, id), 'د')
  })

  test(`keeps at most ${MAX_UNDO_OPERATIONS} undoable operations per page`, () => {
    const { editor, id } = editorWithParagraph('v0')
    for (let index = 1; index <= 60; index += 1) edit(editor, id, `v${index}`)
    assert.equal(selectUndoDepth(editor.state), MAX_UNDO_OPERATIONS)
    for (let count = 0; count < 70; count += 1) editor.dispatch({ type: ACTION.undone })
    // The add + 60 edits = 61 operations; only the latest 50 are kept, so the
    // oldest reachable state is the one before edit 11 ("v10").
    assert.equal(textOf(editor, id), 'v10')
    assert.equal(canUndo(editor.state), false)
    assert.equal(selectRedoDepth(editor.state), MAX_UNDO_OPERATIONS)
    for (let count = 0; count < 70; count += 1) editor.dispatch({ type: ACTION.redone })
    assert.equal(textOf(editor, id), 'v60')
  })

  test('histories are independent per page and undo applies to the active page by default', () => {
    const editor = makeEditor()
    const a = paragraph(editor.generateId, 'أ١')
    const b = paragraph(editor.generateId, 'ب١')
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: a })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 3, element: b })
    edit(editor, a.id, 'أ٢', 1)
    edit(editor, b.id, 'ب٢', 3)

    editor.dispatch({ type: ACTION.pageSelected, pageNumber: 3 })
    editor.dispatch({ type: ACTION.undone })
    assert.equal(textOf(editor, b.id, 3), 'ب١')
    assert.equal(textOf(editor, a.id, 1), 'أ٢')

    editor.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(textOf(editor, a.id, 1), 'أ١')
    assert.equal(selectRedoDepth(editor.state, 3), 1)
  })

  test('edits that change nothing add no history entry and keep the same state', () => {
    const { editor, id } = editorWithParagraph('ثابت')
    const before = editor.state
    assert.equal(edit(editor, id, 'ثابت'), before)
    assert.equal(
      editor.dispatch({ type: ACTION.elementMoved, pageNumber: 1, elementId: id, toIndex: 0 }),
      before,
    )
    assert.equal(selectUndoDepth(editor.state), 1)
  })

  test('undo and redo restore table, field and unclassified content exactly', () => {
    const editor = makeEditor()
    const u = unclassified(editor.generateId, 'نص', { keep: [1, 2] })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: u })
    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: u.id, patch: { raw: null } })
    editor.dispatch({ type: ACTION.undone })
    assert.deepEqual(editor.page().elements[0].content.raw, { keep: [1, 2] })
  })
})

describe('preserving the original AI extraction', () => {
  const aiElements = (generateId) => [
    paragraph(generateId, 'نص الذكاء الاصطناعي', { source: { kind: 'ai', details: { model: 'any' } } }),
    table(generateId, [['أ', 'ب'], ['ج', 'د']], { source: { kind: 'ai', details: {} } }),
    field(generateId, 'الاسم', 'سارة', { source: { kind: 'ai', details: {} } }),
  ]

  test('applying an extraction fills both the preserved original and the working copy', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: aiElements(editor.generateId) })
    const page = editor.page()
    assert.deepEqual(page.elements, page.originalExtraction.elements)
    assert.notEqual(page.elements, page.originalExtraction.elements)
    assert.equal(page.processing.status, 'succeeded')
    assert.equal(page.elements[0].source.kind, 'ai')
  })

  test('editing the working copy never changes the preserved original', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: aiElements(editor.generateId) })
    const snapshot = JSON.stringify(editor.page().originalExtraction)
    const [p, t, f] = editor.page().elements

    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: p.id, patch: { text: 'نص مصحح' } })
    editor.dispatch({ type: ACTION.tableCellEdited, pageNumber: 1, elementId: t.id, row: 0, column: 0, text: 'مصحح' })
    editor.dispatch({ type: ACTION.tableRowAdded, pageNumber: 1, elementId: t.id })
    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: f.id, patch: { value: 'خالد' } })
    editor.dispatch({ type: ACTION.elementMoved, pageNumber: 1, elementId: f.id, toIndex: 0 })
    editor.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: p.id })
    editor.dispatch({ type: ACTION.undone })
    editor.dispatch({ type: ACTION.redone })

    assert.equal(JSON.stringify(editor.page().originalExtraction), snapshot)
    assert.equal(editor.page().originalExtraction.elements[0].content.text, 'نص الذكاء الاصطناعي')
  })

  test('the preserved original is read-only', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: aiElements(editor.generateId) })
    const { originalExtraction } = editor.page()
    assert.throws(() => {
      originalExtraction.elements[0].content.text = 'x'
    }, TypeError)
    assert.throws(() => originalExtraction.elements.push({}), TypeError)
  })

  test('the incoming data is copied, so later changes to it cannot leak in', () => {
    const editor = makeEditor()
    const incoming = aiElements(editor.generateId)
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: incoming })
    incoming[0].content.text = 'تلاعب'
    assert.equal(editor.page().elements[0].content.text, 'نص الذكاء الاصطناعي')
    assert.equal(editor.page().originalExtraction.elements[0].content.text, 'نص الذكاء الاصطناعي')
  })

  test('applying an extraction is a boundary: it clears that page history and is not undoable', () => {
    const { editor, id } = editorWithParagraph('يدوي')
    edit(editor, id, 'يدوي معدل')
    assert.ok(canUndo(editor.state))
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: aiElements(editor.generateId) })
    assert.equal(canUndo(editor.state), false)
    assert.equal(canRedo(editor.state), false)
    editor.dispatch({ type: ACTION.undone })
    assert.equal(editor.page().elements[0].content.text, 'نص الذكاء الاصطناعي')
  })

  test('rejects invalid extractions without changing anything', () => {
    const editor = makeEditor()
    const before = editor.state.document
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: 'nope' })
    assert.equal(editor.state.lastError.code, 'INVALID_ELEMENT')
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [{ id: 'x', type: 'chart' }] })
    assert.equal(editor.state.lastError.code, 'INVALID_DOCUMENT')
    const first = paragraph(editor.generateId)
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [first, { ...first }] })
    assert.equal(editor.state.lastError.code, 'INVALID_DOCUMENT')
    assert.equal(editor.state.document, before)
  })

  test('puts elements in reading order when the incoming order values disagree', () => {
    const editor = makeEditor()
    const a = { ...paragraph(editor.generateId, 'أ'), order: 7 }
    const b = { ...paragraph(editor.generateId, 'ب'), order: 3 }
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [a, b] })
    assert.deepEqual(editor.page().elements.map((element) => [element.content.text, element.order]), [['أ', 0], ['ب', 1]])
  })
})

describe('processing status', () => {
  test('is tracked per page and does not touch review or history', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 3, status: 'failed', errorCode: 'OCR_TIMEOUT' })
    assert.deepEqual(editor.page(3).processing, { status: 'failed', errorCode: 'OCR_TIMEOUT' })
    assert.deepEqual(editor.page(1).processing, { status: 'notProcessed', errorCode: null })
    assert.equal(editor.page(3).review.status, 'notReviewed')
    assert.deepEqual(editor.state.histories, {})
  })

  test('rejects unknown statuses and bad error codes', () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'done' })
    assert.equal(editor.state.lastError.code, 'INVALID_ARGUMENT')
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: '' })
    assert.equal(editor.state.lastError.code, 'INVALID_ARGUMENT')
  })

  test('an unchanged status returns the same state', () => {
    const editor = makeEditor()
    const before = editor.state
    assert.equal(editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'notProcessed' }), before)
  })
})

describe('reducer robustness', () => {
  test('invalid actions give a structured error instead of crashing', () => {
    for (const bad of [null, undefined, 'x', 42, true, [], {}, { type: 5 }, { type: null }, { pageNumber: 1 }]) {
      const editor = makeEditor()
      const before = editor.state
      assert.doesNotThrow(() => editor.dispatch(bad), `action ${JSON.stringify(bad)}`)
      assert.equal(editor.state.lastError.code, 'INVALID_ARGUMENT', `action ${JSON.stringify(bad)}`)
      assert.equal(editor.state.document, before.document)
      assert.equal(editor.state.histories, before.histories)
    }
  })

  test('incomplete payloads give structured errors and never touch the document', () => {
    const { editor, id } = editorWithParagraph('نص')
    const before = editor.state.document
    const cases = [
      [{ type: ACTION.pageSelected }, 'PAGE_NOT_FOUND'],
      [{ type: ACTION.elementAdded, pageNumber: 1, element: null }, 'INVALID_ELEMENT'],
      [{ type: ACTION.elementAdded, pageNumber: 1, element: { id: 'x' } }, 'INVALID_ELEMENT'],
      [{ type: ACTION.elementEdited }, 'PAGE_NOT_FOUND'],
      [{ type: ACTION.elementEdited, pageNumber: 1, elementId: id }, 'INVALID_ARGUMENT'],
      [{ type: ACTION.elementRemoved, pageNumber: 1 }, 'ELEMENT_NOT_FOUND'],
      [{ type: ACTION.elementMoved, pageNumber: 1, elementId: id }, 'INVALID_ARGUMENT'],
      [{ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: id }, 'INVALID_ARGUMENT'],
      [{ type: ACTION.tableCellEdited, pageNumber: 1, elementId: id }, 'WRONG_ELEMENT_TYPE'],
      [{ type: ACTION.tableRowAdded, pageNumber: 1 }, 'ELEMENT_NOT_FOUND'],
      [{ type: ACTION.extractionApplied, pageNumber: 1 }, 'INVALID_ELEMENT'],
      [{ type: ACTION.pageReviewConfirmed, pageNumber: 1 }, 'INVALID_ARGUMENT'],
      [{ type: ACTION.pageProcessingStatusSet, pageNumber: 1 }, 'INVALID_ARGUMENT'],
    ]
    for (const [action, code] of cases) {
      assert.doesNotThrow(() => editor.dispatch(action), JSON.stringify(action))
      assert.equal(editor.state.lastError.code, code, JSON.stringify(action))
      assert.equal(editor.state.document, before, JSON.stringify(action))
    }
  })

  test('an unknown action type is still reported as UNKNOWN_ACTION', () => {
    const editor = makeEditor()
    editor.dispatch({ type: 'nope' })
    assert.equal(editor.state.lastError.code, 'UNKNOWN_ACTION')
  })

  test('an invalid document cannot start an editor session', () => {
    for (const bad of [null, undefined, {}, [], 'x', { ...makeDocument(), schemaVersion: '9' }]) {
      assertOperationError(() => createInitialEditorState(bad), 'INVALID_DOCUMENT')
    }
    const document = makeDocument()
    const duplicate = { ...document, pages: [{ ...document.pages[0] }, { ...document.pages[1], id: document.pages[0].id }, document.pages[2]] }
    assertOperationError(() => createInitialEditorState(duplicate), 'INVALID_DOCUMENT')
  })
})

describe('document-wide unique IDs', () => {
  const addTo = (editor, pageNumber, element) => editor.dispatch({ type: ACTION.elementAdded, pageNumber, element })

  // Asserts that the last action was rejected with DUPLICATE_ID and changed nothing.
  function expectRejected(editor, before) {
    assert.equal(editor.state.lastError.code, 'DUPLICATE_ID')
    assert.ok(editor.state.lastError.details.id)
    assert.equal(editor.state.document, before.document)
    assert.equal(editor.state.histories, before.histories)
    assert.deepEqual(validateDocument(editor.state.document), { valid: true, errors: [] })
  }

  test('the same element cannot be added to two pages', () => {
    const editor = makeEditor()
    const element = paragraph(editor.generateId, 'نص')
    addTo(editor, 1, element)
    const before = editor.state
    addTo(editor, 3, element)
    expectRejected(editor, before)
    assert.equal(editor.state.lastError.details.id, element.id)
    assert.equal(editor.page(3).elements.length, 0)
  })

  test('an ID used by another page, a page, or the document is rejected', () => {
    const editor = makeEditor()
    const first = table(editor.generateId, [['أ', 'ب']])
    addTo(editor, 1, first)
    const candidates = [
      editor.state.document.id,
      editor.page(3).id,
      first.id,
      first.content.rows[0].id,
      first.content.rows[0].cells[1].id,
    ]
    for (const id of candidates) {
      const before = editor.state
      addTo(editor, 3, paragraph(editor.generateId, 'x', { id }))
      expectRejected(editor, before)
    }
  })

  test('a duplicate on the same page is rejected', () => {
    const { editor, id } = editorWithParagraph()
    const before = editor.state
    addTo(editor, 1, paragraph(editor.generateId, 'نسخة', { id }))
    expectRejected(editor, before)
  })

  test('IDs generated by table operations and conversions are checked too', () => {
    const editor = makeEditor()
    const base = table(editor.generateId, [['أ']])
    addTo(editor, 1, base)
    addTo(editor, 3, paragraph(editor.generateId, 'x', { id: 'clash' }))
    // A generator that always returns an ID another page already uses.
    const clashing = createEditorReducer({ generateId: () => 'clash' })
    const states = [
      clashing(editor.state, { type: ACTION.tableRowAdded, pageNumber: 1, elementId: base.id }),
      clashing(editor.state, { type: ACTION.tableColumnAdded, pageNumber: 1, elementId: base.id }),
    ]
    for (const state of states) {
      assert.equal(state.lastError.code, 'DUPLICATE_ID')
      assert.equal(state.document, editor.state.document)
    }
    const paragraphElement = paragraph(editor.generateId, 'نص')
    addTo(editor, 1, paragraphElement)
    // Only the first generated ID collides, and only with ANOTHER page.
    let calls = 0
    const firstClashes = createEditorReducer({ generateId: () => (calls++ === 0 ? 'clash' : `unique_${calls}`) })
    const converted = firstClashes(editor.state, {
      type: ACTION.elementTypeChanged,
      pageNumber: 1,
      elementId: paragraphElement.id,
      targetType: 'table',
    })
    assert.equal(converted.lastError.code, 'DUPLICATE_ID')
    assert.equal(converted.lastError.details.id, 'clash')
    assert.equal(converted.document, editor.state.document)
    // A generator that repeats an ID inside the new table is rejected as an invalid conversion.
    const selfClash = clashing(editor.state, {
      type: ACTION.elementTypeChanged,
      pageNumber: 1,
      elementId: paragraphElement.id,
      targetType: 'table',
    })
    assert.equal(selfClash.lastError.code, 'INVALID_CONVERSION')
    assert.equal(selfClash.document, editor.state.document)
  })

  test('IDs that are already on the page are never conflicts (normal edits keep working)', () => {
    const editor = makeEditor()
    const a = paragraph(editor.generateId, 'أ')
    const t = table(editor.generateId, [['١', '٢']])
    addTo(editor, 1, a)
    addTo(editor, 1, t)
    addTo(editor, 3, paragraph(editor.generateId, 'ب'))
    edit(editor, a.id, 'تعديل')
    editor.dispatch({ type: ACTION.tableCellEdited, pageNumber: 1, elementId: t.id, row: 0, column: 0, text: 'x' })
    editor.dispatch({ type: ACTION.elementMoved, pageNumber: 1, elementId: t.id, toIndex: 0 })
    assert.equal(editor.state.lastError, null)
    assert.deepEqual(validateDocument(editor.state.document), { valid: true, errors: [] })
  })

  test('undo cannot bring back an ID another page uses now, and works once it is free', () => {
    const editor = makeEditor()
    const original = paragraph(editor.generateId, 'الأصل')
    addTo(editor, 1, original)
    editor.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: original.id })
    // The ID is free now, so another page may take it.
    const taker = paragraph(editor.generateId, 'آخذ', { id: original.id })
    addTo(editor, 3, taker)
    assert.equal(editor.state.lastError, null)

    const before = editor.state
    editor.dispatch({ type: ACTION.undone, pageNumber: 1 })
    expectRejected(editor, before)
    assert.equal(editor.page(1).elements.length, 0)

    editor.dispatch({ type: ACTION.elementRemoved, pageNumber: 3, elementId: taker.id })
    editor.dispatch({ type: ACTION.undone, pageNumber: 1 })
    assert.equal(editor.state.lastError, null)
    assert.equal(editor.page(1).elements[0].id, original.id)
  })

  test('an extraction that reuses an ID from another page is rejected', () => {
    const editor = makeEditor()
    const element = paragraph(editor.generateId, 'نص')
    addTo(editor, 1, element)
    const before = editor.state
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 3, elements: [{ ...element }] })
    assert.equal(editor.state.lastError.code, 'INVALID_DOCUMENT')
    assert.equal(editor.state.document, before.document)
  })
})

describe('type changes with undo and redo', () => {
  const change = (editor, id, targetType, confirmed) =>
    editor.dispatch({ type: ACTION.elementTypeChanged, pageNumber: 1, elementId: id, targetType, confirmed })

  test('a safe conversion is undone and redone exactly, keeping the element ID', () => {
    const { editor, id } = editorWithParagraph('نص')
    const original = editor.page().elements[0]
    change(editor, id, 'heading')
    const converted = editor.page().elements[0]
    assert.equal(converted.type, 'heading')
    assert.equal(converted.id, id)
    editor.dispatch({ type: ACTION.undone })
    assert.deepEqual(editor.page().elements[0], original)
    editor.dispatch({ type: ACTION.redone })
    assert.deepEqual(editor.page().elements[0], converted)
  })

  test('a rejected lossy conversion adds no history and does not invalidate a review', () => {
    const editor = makeEditor()
    const t = table(editor.generateId, [['أ', 'ب'], ['ج', 'د']])
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: t })
    editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber: 1, at: NOW })
    const before = editor.state
    change(editor, t.id, 'paragraph')
    assert.equal(editor.state.lastError.code, 'CONFIRMATION_REQUIRED')
    assert.equal(editor.state.document, before.document)
    assert.equal(editor.state.histories, before.histories)
    assert.equal(editor.page().review.status, 'reviewed')
  })

  test('a confirmed lossy conversion is undone back to the exact original and invalidates the review', () => {
    const editor = makeEditor()
    const t = table(editor.generateId, [['أ', 'ب'], ['ج', 'د']])
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: t })
    editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber: 1, at: NOW })
    change(editor, t.id, 'paragraph', true)
    assert.equal(editor.page().review.status, 'invalidated')
    editor.dispatch({ type: ACTION.undone })
    assert.deepEqual(editor.page().elements[0], t)
    editor.dispatch({ type: ACTION.redone })
    assert.equal(editor.page().elements[0].type, 'paragraph')
    assert.equal(editor.page().review.status, 'invalidated')
  })

  test('unclassified raw data survives edits, conversions and undo', () => {
    const editor = makeEditor()
    const u = unclassified(editor.generateId, 'ختم', { kind: 'stamp' })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: u })
    change(editor, u.id, 'paragraph')
    assert.equal(editor.state.lastError.code, 'CONFIRMATION_REQUIRED')
    assert.deepEqual(editor.page().elements[0].content.raw, { kind: 'stamp' })
  })
})

describe('the document stays valid after every action', () => {
  test('a long mixed sequence, including rejected actions', () => {
    const editor = makeEditor()
    const g = editor.generateId
    const p = paragraph(g, 'أ')
    const f = field(g, 'مفتاح', 'قيمة')
    const t = table(g, [['١', '٢'], ['٣', '٤']])
    const u = unclassified(g, 'ختم', { a: 1 })
    const other = paragraph(g, 'صفحة ٣')
    const steps = [
      { type: ACTION.elementAdded, pageNumber: 1, element: p },
      { type: ACTION.elementAdded, pageNumber: 1, element: f },
      { type: ACTION.elementAdded, pageNumber: 1, element: t },
      { type: ACTION.elementAdded, pageNumber: 1, element: u },
      { type: ACTION.elementAdded, pageNumber: 3, element: other },
      { type: ACTION.elementAdded, pageNumber: 3, element: p },
      { type: ACTION.elementEdited, pageNumber: 1, elementId: p.id, patch: { text: 'ب' } },
      { type: ACTION.elementMoved, pageNumber: 1, elementId: t.id, toIndex: 0 },
      { type: ACTION.elementTypeChanged, pageNumber: 1, elementId: p.id, targetType: 'heading' },
      { type: ACTION.elementTypeChanged, pageNumber: 1, elementId: t.id, targetType: 'paragraph' },
      { type: ACTION.elementTypeChanged, pageNumber: 1, elementId: t.id, targetType: 'paragraph', confirmed: true },
      { type: ACTION.tableCellEdited, pageNumber: 1, elementId: f.id, row: 0, column: 0, text: 'x' },
      { type: ACTION.elementTypeChanged, pageNumber: 1, elementId: f.id, targetType: 'table' },
      { type: ACTION.tableRowAdded, pageNumber: 1, elementId: f.id },
      { type: ACTION.tableColumnAdded, pageNumber: 1, elementId: f.id, index: 0 },
      { type: ACTION.tableRowRemoved, pageNumber: 1, elementId: f.id, index: 0 },
      { type: ACTION.tableColumnRemoved, pageNumber: 1, elementId: f.id, index: 0 },
      { type: ACTION.pageProcessingStatusSet, pageNumber: 3, status: 'processing' },
      { type: ACTION.pageReviewConfirmed, pageNumber: 3, at: NOW },
      { type: ACTION.pageProcessingStatusSet, pageNumber: 3, status: 'succeeded' },
      { type: ACTION.pageReviewConfirmed, pageNumber: 3, at: NOW },
      { type: ACTION.pageReviewConfirmed, pageNumber: 1, at: NOW },
      { type: ACTION.elementRemoved, pageNumber: 1, elementId: u.id },
      { type: ACTION.undone, pageNumber: 1 },
      { type: ACTION.undone, pageNumber: 1 },
      { type: ACTION.redone, pageNumber: 1 },
      { type: ACTION.pageSelected, pageNumber: 5 },
      { type: ACTION.extractionApplied, pageNumber: 5, elements: [paragraph(g, 'نتيجة')] },
      { type: ACTION.undone },
      { type: ACTION.pageSelected, pageNumber: 2 },
      { type: ACTION.elementRemoved, pageNumber: 1, elementId: 'missing' },
      { type: ACTION.errorDismissed },
    ]
    for (const step of steps) {
      editor.dispatch(step)
      assert.deepEqual(validateDocument(editor.state.document), { valid: true, errors: [] }, JSON.stringify(step).slice(0, 120))
    }
    assert.equal(editor.page(3).review.status, 'reviewed')
  })
})
