// Pure structured-editing operations on an ordered list of elements.
//
// Every function takes the current `elements` array and returns a NEW array
// (never mutating its input). When an operation would change nothing it returns
// the SAME array, which lets state management skip history and review
// invalidation. Invalid requests throw DocumentOperationError with a stable
// `code` and `details`.

import { collectElementIds, normalizeOrder } from './elements.js'
import { ERROR_CODE, fail } from './errors.js'
import { generateId as defaultGenerateId } from './ids.js'
import { ELEMENT_TYPES, HEADING_LEVELS } from './schema.js'
import { deepEqual, isJsonValue } from './utils.js'
import { validateElement } from './validation.js'

// Editable content fields per type. Table content is edited with the table
// operations below (cell/row/column), never by replacing `rows` wholesale.
const EDITABLE_FIELDS = {
  [ELEMENT_TYPES.heading]: ['text', 'level'],
  [ELEMENT_TYPES.paragraph]: ['text'],
  [ELEMENT_TYPES.field]: ['key', 'value'],
  [ELEMENT_TYPES.unclassified]: ['text', 'raw'],
  [ELEMENT_TYPES.table]: [],
}

export function findElementIndex(elements, id) {
  const index = elements.findIndex((element) => element.id === id)
  if (index === -1) fail(ERROR_CODE.elementNotFound, `No element with ID "${id}".`, { id })
  return index
}

export function replaceElementAt(elements, index, element) {
  return elements.map((current, position) => (position === index ? element : current))
}

function requireInteger(value, name) {
  if (!Number.isInteger(value)) fail(ERROR_CODE.invalidArgument, `${name} must be an integer.`, { [name]: value })
}

export function insertElement(elements, element, index = elements.length) {
  requireInteger(index, 'index')
  if (index < 0 || index > elements.length) {
    fail(ERROR_CODE.indexOutOfRange, 'Insert index is out of range.', { index, length: elements.length })
  }
  const result = validateElement(element)
  if (!result.valid) fail(ERROR_CODE.invalidElement, 'The element is not valid.', { errors: result.errors })

  const existing = new Set(elements.flatMap(collectElementIds))
  const duplicate = collectElementIds(element).find((id) => existing.has(id))
  if (duplicate !== undefined) fail(ERROR_CODE.duplicateId, `ID "${duplicate}" is already used on this page.`, { id: duplicate })

  return normalizeOrder([...elements.slice(0, index), element, ...elements.slice(index)])
}

function validateFieldValue(type, field, value) {
  const isText = typeof value === 'string'
  switch (field) {
    case 'text':
    case 'key':
    case 'value':
      if (!isText) fail(ERROR_CODE.invalidContent, `"${field}" must be a string.`, { field })
      break
    case 'level':
      if (!(Number.isInteger(value) && value >= HEADING_LEVELS.min && value <= HEADING_LEVELS.max)) {
        fail(ERROR_CODE.invalidContent, `Heading level must be an integer from ${HEADING_LEVELS.min} to ${HEADING_LEVELS.max}.`, { field })
      }
      break
    case 'raw':
      if (!isJsonValue(value)) fail(ERROR_CODE.invalidContent, 'Raw data must be JSON-compatible (use null for none).', { field })
      break
    default:
      fail(ERROR_CODE.unknownContentField, `Unknown content field "${field}" for ${type}.`, { field })
  }
}

// Edits content fields of heading, paragraph, field or unclassified elements.
// `patch` lists only the fields to change, e.g. { text: '...' } or
// { key: '...', value: '...' }.
export function editElement(elements, id, patch) {
  const index = findElementIndex(elements, id)
  const element = elements[index]
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    fail(ERROR_CODE.invalidArgument, 'A patch must be an object of content fields.')
  }
  if (element.type === ELEMENT_TYPES.table) {
    fail(ERROR_CODE.wrongElementType, 'Use the table operations to edit table content.', { id, type: element.type })
  }
  const allowed = EDITABLE_FIELDS[element.type]
  for (const [field, value] of Object.entries(patch)) {
    if (!allowed.includes(field)) {
      fail(ERROR_CODE.unknownContentField, `"${field}" is not an editable field of ${element.type}.`, { field, type: element.type })
    }
    validateFieldValue(element.type, field, value)
  }
  const content = { ...element.content, ...patch }
  if (deepEqual(content, element.content)) return elements
  return replaceElementAt(elements, index, { ...element, content })
}

export function removeElement(elements, id) {
  const index = findElementIndex(elements, id)
  return normalizeOrder(elements.filter((_, position) => position !== index))
}

// Moves an element to `toIndex` (its position after the move).
export function moveElement(elements, id, toIndex) {
  const fromIndex = findElementIndex(elements, id)
  requireInteger(toIndex, 'toIndex')
  if (toIndex < 0 || toIndex >= elements.length) {
    fail(ERROR_CODE.indexOutOfRange, 'Target index is out of range.', { toIndex, length: elements.length })
  }
  if (toIndex === fromIndex) return elements
  const next = [...elements]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return normalizeOrder(next)
}

// ---- Tables -------------------------------------------------------------

function getTable(elements, id) {
  const index = findElementIndex(elements, id)
  const element = elements[index]
  if (element.type !== ELEMENT_TYPES.table) {
    fail(ERROR_CODE.wrongElementType, 'This operation needs a table element.', { id, type: element.type })
  }
  return { index, element, rows: element.content.rows, columnCount: element.content.rows[0].cells.length }
}

function withRows(elements, index, element, rows) {
  return replaceElementAt(elements, index, { ...element, content: { ...element.content, rows } })
}

function requireCellInRange(table, row, column) {
  requireInteger(row, 'row')
  requireInteger(column, 'column')
  if (row < 0 || row >= table.rows.length || column < 0 || column >= table.columnCount) {
    fail(ERROR_CODE.tableCellOutOfRange, 'Table cell is out of range.', {
      row,
      column,
      rowCount: table.rows.length,
      columnCount: table.columnCount,
    })
  }
}

export function setTableCell(elements, id, { row, column, text }) {
  const table = getTable(elements, id)
  requireCellInRange(table, row, column)
  if (typeof text !== 'string') fail(ERROR_CODE.invalidContent, 'Cell text must be a string.', { row, column })
  if (table.rows[row].cells[column].text === text) return elements
  const rows = table.rows.map((current, rowIndex) =>
    rowIndex !== row
      ? current
      : { ...current, cells: current.cells.map((cell, cellIndex) => (cellIndex === column ? { ...cell, text } : cell)) },
  )
  return withRows(elements, table.index, table.element, rows)
}

// Inserts an empty row at `index` (default: end).
export function addTableRow(elements, id, { index } = {}, { generateId = defaultGenerateId } = {}) {
  const table = getTable(elements, id)
  const at = index ?? table.rows.length
  requireInteger(at, 'index')
  if (at < 0 || at > table.rows.length) {
    fail(ERROR_CODE.indexOutOfRange, 'Row index is out of range.', { index: at, rowCount: table.rows.length })
  }
  const newRow = {
    id: generateId('row'),
    cells: Array.from({ length: table.columnCount }, () => ({ id: generateId('cell'), text: '' })),
  }
  return withRows(elements, table.index, table.element, [...table.rows.slice(0, at), newRow, ...table.rows.slice(at)])
}

export function removeTableRow(elements, id, { index }) {
  const table = getTable(elements, id)
  requireInteger(index, 'index')
  if (index < 0 || index >= table.rows.length) {
    fail(ERROR_CODE.indexOutOfRange, 'Row index is out of range.', { index, rowCount: table.rows.length })
  }
  if (table.rows.length === 1) fail(ERROR_CODE.lastTableRow, 'A table must keep at least one row.', { id })
  return withRows(elements, table.index, table.element, table.rows.filter((_, rowIndex) => rowIndex !== index))
}

// Inserts an empty column at `index` (default: end).
export function addTableColumn(elements, id, { index } = {}, { generateId = defaultGenerateId } = {}) {
  const table = getTable(elements, id)
  const at = index ?? table.columnCount
  requireInteger(at, 'index')
  if (at < 0 || at > table.columnCount) {
    fail(ERROR_CODE.indexOutOfRange, 'Column index is out of range.', { index: at, columnCount: table.columnCount })
  }
  const rows = table.rows.map((row) => ({
    ...row,
    cells: [...row.cells.slice(0, at), { id: generateId('cell'), text: '' }, ...row.cells.slice(at)],
  }))
  return withRows(elements, table.index, table.element, rows)
}

export function removeTableColumn(elements, id, { index }) {
  const table = getTable(elements, id)
  requireInteger(index, 'index')
  if (index < 0 || index >= table.columnCount) {
    fail(ERROR_CODE.indexOutOfRange, 'Column index is out of range.', { index, columnCount: table.columnCount })
  }
  if (table.columnCount === 1) fail(ERROR_CODE.lastTableColumn, 'A table must keep at least one column.', { id })
  const rows = table.rows.map((row) => ({ ...row, cells: row.cells.filter((_, cellIndex) => cellIndex !== index) }))
  return withRows(elements, table.index, table.element, rows)
}
