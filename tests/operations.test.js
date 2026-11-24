import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  addTableColumn,
  addTableRow,
  editElement,
  insertElement,
  moveElement,
  removeElement,
  removeTableColumn,
  removeTableRow,
  setTableCell,
} from '../src/domain/document/elementOperations.js'
import { validateElements } from '../src/domain/document/validation.js'
import { assertOperationError, field, heading, makeIds, paragraph, table, unclassified } from './helpers.js'

const LONG_ARABIC = `${'بسم الله الرحمن الرحيم. هذا نص عربي طويل لاختبار التحرير والحفظ دون اقتطاع. '.repeat(400)}ﷺ — ١٢٣٤٥٦٧٨٩٠ — English mixed، ونصٌّ مُشَكَّلٌ.`

function deepFreezeForTest(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreezeForTest)
  }
  return value
}

describe('insert / delete / reorder', () => {
  test('inserts at the end, at an index, and keeps order consistent', () => {
    const ids = makeIds()
    const a = paragraph(ids, 'أ')
    const b = paragraph(ids, 'ب')
    const c = paragraph(ids, 'ج')
    let elements = insertElement([], a)
    elements = insertElement(elements, c)
    elements = insertElement(elements, b, 1)
    assert.deepEqual(elements.map((element) => element.content.text), ['أ', 'ب', 'ج'])
    assert.deepEqual(elements.map((element) => element.order), [0, 1, 2])
    assert.ok(validateElements(elements).valid)
  })

  test('never mutates its input', () => {
    const ids = makeIds()
    const original = deepFreezeForTest([paragraph(ids, 'أ'), table(ids)])
    const extra = paragraph(ids, 'ب')
    // Frozen input: any mutation would throw in strict mode.
    insertElement(original, extra, 0)
    editElement(original, original[0].id, { text: 'تغيير' })
    removeElement(original, original[0].id)
    moveElement(original, original[0].id, 1)
    setTableCell(original, original[1].id, { row: 0, column: 0, text: 'x' })
    addTableRow(original, original[1].id)
    addTableColumn(original, original[1].id)
    removeTableRow(original, original[1].id, { index: 0 })
    removeTableColumn(original, original[1].id, { index: 0 })
    assert.equal(original[0].content.text, 'أ')
  })

  test('rejects duplicate IDs, including table row and cell IDs', () => {
    const ids = makeIds()
    const a = paragraph(ids, 'أ')
    assertOperationError(() => insertElement([a], { ...paragraph(ids, 'ب'), id: a.id }), 'DUPLICATE_ID')
    const t = table(ids)
    const clash = paragraph(ids, 'ج', { id: t.content.rows[0].cells[0].id })
    assertOperationError(() => insertElement([t], clash), 'DUPLICATE_ID')
  })

  test('rejects an out-of-range or non-integer index and an invalid element', () => {
    const ids = makeIds()
    const a = paragraph(ids)
    assertOperationError(() => insertElement([], a, 1), 'INDEX_OUT_OF_RANGE')
    assertOperationError(() => insertElement([], a, -1), 'INDEX_OUT_OF_RANGE')
    assertOperationError(() => insertElement([], a, 0.5), 'INVALID_ARGUMENT')
    assertOperationError(() => insertElement([], { id: 'x', type: 'paragraph' }), 'INVALID_ELEMENT')
  })

  test('removes an element and renumbers the rest', () => {
    const ids = makeIds()
    const [a, b, c] = [paragraph(ids, 'أ'), paragraph(ids, 'ب'), paragraph(ids, 'ج')]
    const elements = removeElement(insertAll([a, b, c]), b.id)
    assert.deepEqual(elements.map((element) => [element.id, element.order]), [[a.id, 0], [c.id, 1]])
    assertOperationError(() => removeElement(elements, 'missing'), 'ELEMENT_NOT_FOUND')
  })

  test('reorders elements, keeping IDs stable', () => {
    const ids = makeIds()
    const [a, b, c] = [paragraph(ids, 'أ'), paragraph(ids, 'ب'), paragraph(ids, 'ج')]
    const start = insertAll([a, b, c])
    assert.deepEqual(moveElement(start, a.id, 2).map((element) => element.id), [b.id, c.id, a.id])
    assert.deepEqual(moveElement(start, c.id, 0).map((element) => element.id), [c.id, a.id, b.id])
    assert.deepEqual(moveElement(start, c.id, 0).map((element) => element.order), [0, 1, 2])
  })

  test('a move to the same position returns the same array; bad targets are rejected', () => {
    const ids = makeIds()
    const start = insertAll([paragraph(ids), paragraph(ids)])
    assert.equal(moveElement(start, start[0].id, 0), start)
    assertOperationError(() => moveElement(start, start[0].id, 2), 'INDEX_OUT_OF_RANGE')
    assertOperationError(() => moveElement(start, start[0].id, -1), 'INDEX_OUT_OF_RANGE')
    assertOperationError(() => moveElement(start, 'missing', 0), 'ELEMENT_NOT_FOUND')
  })
})

function insertAll(elements) {
  return elements.reduce((list, element) => insertElement(list, element), [])
}

describe('editing content', () => {
  test('edits a long Arabic paragraph without truncation or normalization', () => {
    const ids = makeIds()
    const start = insertAll([paragraph(ids, 'قصير')])
    const next = editElement(start, start[0].id, { text: LONG_ARABIC })
    assert.equal(next[0].content.text, LONG_ARABIC)
    assert.ok(next[0].content.text.length > 20000)
    assert.equal(start[0].content.text, 'قصير')
    assert.equal(next[0].id, start[0].id)
  })

  test('edits heading text and level', () => {
    const ids = makeIds()
    const start = insertAll([heading(ids, 'عنوان', 2)])
    const next = editElement(start, start[0].id, { text: 'عنوان جديد', level: 3 })
    assert.deepEqual(next[0].content, { text: 'عنوان جديد', level: 3 })
    assertOperationError(() => editElement(start, start[0].id, { level: 0 }), 'INVALID_CONTENT')
    assertOperationError(() => editElement(start, start[0].id, { level: 'a' }), 'INVALID_CONTENT')
  })

  test('edits field keys and values independently, preserving the pairing', () => {
    const ids = makeIds()
    const start = insertAll([field(ids, 'رقم الهوية', '123')])
    const keyOnly = editElement(start, start[0].id, { key: 'رقم الجواز' })
    assert.deepEqual(keyOnly[0].content, { key: 'رقم الجواز', value: '123' })
    const valueOnly = editElement(start, start[0].id, { value: '٤٥٦' })
    assert.deepEqual(valueOnly[0].content, { key: 'رقم الهوية', value: '٤٥٦' })
    const both = editElement(start, start[0].id, { key: 'ك', value: 'ق' })
    assert.deepEqual(both[0].content, { key: 'ك', value: 'ق' })
  })

  test('preserves and edits unclassified content including raw data', () => {
    const ids = makeIds()
    const raw = { label: 'ختم', points: [1, 2, { deep: true }] }
    const start = insertAll([unclassified(ids, 'نص ما', raw)])
    const textEdited = editElement(start, start[0].id, { text: 'نص معدل' })
    assert.deepEqual(textEdited[0].content.raw, raw)
    const rawEdited = editElement(start, start[0].id, { raw: { label: 'توقيع' } })
    assert.deepEqual(rawEdited[0].content, { text: 'نص ما', raw: { label: 'توقيع' } })
    assert.deepEqual(editElement(start, start[0].id, { raw: null })[0].content.raw, null)
    assertOperationError(() => editElement(start, start[0].id, { raw: undefined }), 'INVALID_CONTENT')
    assertOperationError(() => editElement(start, start[0].id, { raw: { f() {} } }), 'INVALID_CONTENT')
  })

  test('returns the same array when the edit changes nothing', () => {
    const ids = makeIds()
    const start = insertAll([paragraph(ids, 'ثابت'), field(ids), unclassified(ids, 'x', { a: [1] })])
    assert.equal(editElement(start, start[0].id, { text: 'ثابت' }), start)
    assert.equal(editElement(start, start[1].id, { key: 'الاسم', value: 'أحمد' }), start)
    assert.equal(editElement(start, start[2].id, { raw: { a: [1] } }), start)
    assert.equal(editElement(start, start[0].id, {}), start)
  })

  test('rejects wrong fields, wrong types, tables and unknown elements', () => {
    const ids = makeIds()
    const start = insertAll([paragraph(ids), table(ids)])
    assertOperationError(() => editElement(start, start[0].id, { key: 'x' }), 'UNKNOWN_CONTENT_FIELD')
    assertOperationError(() => editElement(start, start[0].id, { text: 5 }), 'INVALID_CONTENT')
    assertOperationError(() => editElement(start, start[1].id, { rows: [] }), 'WRONG_ELEMENT_TYPE')
    assertOperationError(() => editElement(start, 'missing', { text: 'x' }), 'ELEMENT_NOT_FOUND')
    assertOperationError(() => editElement(start, start[0].id, null), 'INVALID_ARGUMENT')
    assertOperationError(() => editElement(start, start[0].id, ['text']), 'INVALID_ARGUMENT')
  })
})

describe('table operations', () => {
  const build = () => {
    const ids = makeIds()
    const elements = insertAll([table(ids, [['الاسم', 'العمر'], ['سارة', '٣٠'], ['خالد', '٤٠']])])
    return { elements, id: elements[0].id, ids }
  }
  const grid = (elements) => elements[0].content.rows.map((row) => row.cells.map((cell) => cell.text))

  test('updates a cell, keeping row and cell IDs', () => {
    const { elements, id } = build()
    const next = setTableCell(elements, id, { row: 1, column: 1, text: '٣١' })
    assert.deepEqual(grid(next), [['الاسم', 'العمر'], ['سارة', '٣١'], ['خالد', '٤٠']])
    assert.equal(next[0].content.rows[1].cells[1].id, elements[0].content.rows[1].cells[1].id)
    assert.equal(next[0].content.rows[1].id, elements[0].content.rows[1].id)
    assert.deepEqual(grid(elements)[1], ['سارة', '٣٠'])
    assert.equal(setTableCell(elements, id, { row: 1, column: 1, text: '٣٠' }), elements)
  })

  test('rejects out-of-range cells and invalid text', () => {
    const { elements, id } = build()
    assertOperationError(() => setTableCell(elements, id, { row: 3, column: 0, text: 'x' }), 'TABLE_CELL_OUT_OF_RANGE')
    assertOperationError(() => setTableCell(elements, id, { row: 0, column: 2, text: 'x' }), 'TABLE_CELL_OUT_OF_RANGE')
    assertOperationError(() => setTableCell(elements, id, { row: -1, column: 0, text: 'x' }), 'TABLE_CELL_OUT_OF_RANGE')
    assertOperationError(() => setTableCell(elements, id, { row: 0, column: 0, text: 5 }), 'INVALID_CONTENT')
    assertOperationError(() => setTableCell(elements, id, { row: 0.5, column: 0, text: 'x' }), 'INVALID_ARGUMENT')
  })

  test('adds rows at the end and at an index with the right width and fresh IDs', () => {
    const { elements, id, ids } = build()
    const atEnd = addTableRow(elements, id, {}, { generateId: ids })
    assert.deepEqual(grid(atEnd)[3], ['', ''])
    const atStart = addTableRow(elements, id, { index: 0 }, { generateId: ids })
    assert.deepEqual(grid(atStart)[0], ['', ''])
    assert.equal(atStart[0].content.rows[1].cells[0].text, 'الاسم')
    assert.ok(validateElements(atStart).valid)
    assertOperationError(() => addTableRow(elements, id, { index: 4 }, { generateId: ids }), 'INDEX_OUT_OF_RANGE')
  })

  test('removes rows but never the last one', () => {
    const { elements, id } = build()
    const removed = removeTableRow(elements, id, { index: 1 })
    assert.deepEqual(grid(removed), [['الاسم', 'العمر'], ['خالد', '٤٠']])
    const single = removeTableRow(removeTableRow(elements, id, { index: 0 }), id, { index: 0 })
    assertOperationError(() => removeTableRow(single, id, { index: 0 }), 'LAST_TABLE_ROW')
    assertOperationError(() => removeTableRow(elements, id, { index: 3 }), 'INDEX_OUT_OF_RANGE')
  })

  test('adds columns at the end and at an index across every row', () => {
    const { elements, id, ids } = build()
    const atEnd = addTableColumn(elements, id, {}, { generateId: ids })
    assert.deepEqual(grid(atEnd), [['الاسم', 'العمر', ''], ['سارة', '٣٠', ''], ['خالد', '٤٠', '']])
    const atStart = addTableColumn(elements, id, { index: 0 }, { generateId: ids })
    assert.deepEqual(grid(atStart)[1], ['', 'سارة', '٣٠'])
    assert.ok(validateElements(atStart).valid)
    assertOperationError(() => addTableColumn(elements, id, { index: 3 }, { generateId: ids }), 'INDEX_OUT_OF_RANGE')
  })

  test('removes columns but never the last one', () => {
    const { elements, id } = build()
    const removed = removeTableColumn(elements, id, { index: 0 })
    assert.deepEqual(grid(removed), [['العمر'], ['٣٠'], ['٤٠']])
    assertOperationError(() => removeTableColumn(removed, id, { index: 0 }), 'LAST_TABLE_COLUMN')
    assertOperationError(() => removeTableColumn(elements, id, { index: 2 }), 'INDEX_OUT_OF_RANGE')
  })

  test('rejects table operations on non-table elements', () => {
    const ids = makeIds()
    const elements = insertAll([paragraph(ids)])
    assertOperationError(() => setTableCell(elements, elements[0].id, { row: 0, column: 0, text: 'x' }), 'WRONG_ELEMENT_TYPE')
    assertOperationError(() => addTableRow(elements, elements[0].id), 'WRONG_ELEMENT_TYPE')
    assertOperationError(() => addTableColumn(elements, 'missing'), 'ELEMENT_NOT_FOUND')
  })

  test('preserves rows, columns and cell values through a sequence of operations', () => {
    const { elements, id, ids } = build()
    let next = addTableColumn(elements, id, { index: 1 }, { generateId: ids })
    next = setTableCell(next, id, { row: 0, column: 1, text: 'المدينة' })
    next = addTableRow(next, id, {}, { generateId: ids })
    next = setTableCell(next, id, { row: 3, column: 0, text: 'منى' })
    assert.deepEqual(grid(next), [
      ['الاسم', 'المدينة', 'العمر'],
      ['سارة', '', '٣٠'],
      ['خالد', '', '٤٠'],
      ['منى', '', ''],
    ])
    assert.ok(validateElements(next).valid)
  })
})
