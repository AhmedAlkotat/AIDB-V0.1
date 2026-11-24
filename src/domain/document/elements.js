// Creating canonical elements. Every element has:
//   id        stable unique ID (never derived from position)
//   type      heading | paragraph | table | field | unclassified
//   order     position in the page's reading order (0-based, kept equal to
//             the array index by normalizeOrder)
//   content   type-specific content
//   source    { kind: 'ai' | 'manual', details }  where the content came from
//   location  null, or { x, y, width, height } relative (0..1) page area
//   metadata  extensible JSON object (nothing here is interpreted)
//
// Content by type:
//   heading       { text, level }
//   paragraph     { text }
//   table         { rows: [{ id, cells: [{ id, text }] }] }
//   field         { key, value }
//   unclassified  { text, raw }   raw = any JSON data to preserve, or null

import { fail, ERROR_CODE } from './errors.js'
import { generateId as defaultGenerateId } from './ids.js'
import { ELEMENT_TYPE_LIST, ELEMENT_TYPES, SOURCE_KINDS } from './schema.js'
import { deepClone } from './utils.js'
import { validateElement } from './validation.js'

function invalidTable(message) {
  fail(ERROR_CODE.invalidElement, 'The element is not valid.', {
    errors: [{ code: ERROR_CODE.invalidTable, path: 'content.rows', message }],
  })
}

// Builds table content from a grid. Rows may be arrays of cells or
// { id?, cells } objects; cells may be strings or { id?, text } objects.
// Missing IDs are generated. The result is validated by the caller.
export function createTableContent(grid, { generateId = defaultGenerateId } = {}) {
  if (!Array.isArray(grid) || grid.length === 0) {
    invalidTable('A table needs at least one row.')
  }
  const rows = grid.map((row) => {
    const isRowArray = Array.isArray(row)
    const cellInputs = isRowArray ? row : row?.cells
    if (!Array.isArray(cellInputs)) invalidTable('A table row must be an array of cells or { cells }.')
    return {
      id: (!isRowArray && row.id) || generateId('row'),
      cells: cellInputs.map((cell) => {
        const isCellObject = cell !== null && typeof cell === 'object'
        return { id: (isCellObject && cell.id) || generateId('cell'), text: isCellObject ? cell.text : cell }
      }),
    }
  })
  return { rows }
}

function buildContent(type, input, generateId) {
  const content = deepClone(input ?? {})
  switch (type) {
    case ELEMENT_TYPES.heading:
      return { text: '', level: 1, ...content }
    case ELEMENT_TYPES.paragraph:
      return { text: '', ...content }
    case ELEMENT_TYPES.field:
      return { key: '', value: '', ...content }
    case ELEMENT_TYPES.unclassified:
      return { text: '', raw: null, ...content }
    case ELEMENT_TYPES.table:
      // Unknown extra keys are kept so validation can report them.
      return { ...content, ...createTableContent(content.rows ?? [['']], { generateId }) }
    default:
      return content
  }
}

// Creates and validates an element. `init` may provide id, content, source,
// location and metadata; everything else gets safe defaults. Manually created
// elements default to source.kind = 'manual'.
export function createElement(type, init = {}, { generateId = defaultGenerateId } = {}) {
  if (!ELEMENT_TYPE_LIST.includes(type)) {
    fail(ERROR_CODE.invalidElement, `Unsupported element type "${type}".`, { type })
  }
  const element = {
    id: init.id ?? generateId('el'),
    type,
    order: 0,
    content: buildContent(type, init.content, generateId),
    source: {
      kind: init.source?.kind ?? SOURCE_KINDS.manual,
      details: deepClone(init.source?.details ?? {}),
    },
    location: init.location === undefined ? null : deepClone(init.location),
    metadata: deepClone(init.metadata ?? {}),
  }
  const result = validateElement(element)
  if (!result.valid) fail(ERROR_CODE.invalidElement, 'The element is not valid.', { errors: result.errors })
  return element
}

// Sets every element's `order` to its array index. Returns the SAME array
// when nothing needs to change, so callers can detect "no change" by identity.
export function normalizeOrder(elements) {
  let changed = false
  const next = elements.map((element, index) => {
    if (element.order === index) return element
    changed = true
    return { ...element, order: index }
  })
  return changed ? next : elements
}

// All IDs inside an element: its own, plus table row and cell IDs.
export function collectElementIds(element) {
  const ids = [element.id]
  if (element.type === ELEMENT_TYPES.table && Array.isArray(element.content?.rows)) {
    for (const row of element.content.rows) {
      ids.push(row.id)
      for (const cell of row.cells ?? []) ids.push(cell.id)
    }
  }
  return ids
}

// True when at least one element carries real content: non-blank text, a
// non-blank key or value, a non-blank table cell, or preserved raw data.
// Empty elements and whitespace-only text do not count.
export function hasMeaningfulContent(elements) {
  const filled = (text) => text.trim() !== ''
  return elements.some(({ type, content }) => {
    switch (type) {
      case ELEMENT_TYPES.heading:
      case ELEMENT_TYPES.paragraph:
        return filled(content.text)
      case ELEMENT_TYPES.field:
        return filled(content.key) || filled(content.value)
      case ELEMENT_TYPES.table:
        return content.rows.some((row) => row.cells.some((cell) => filled(cell.text)))
      case ELEMENT_TYPES.unclassified:
        return filled(content.text) || content.raw !== null
      default:
        return false
    }
  })
}

// Plain-text rendering of a table (cells joined by tabs, rows by newlines).
export function tableToText(content) {
  return content.rows.map((row) => row.cells.map((cell) => cell.text).join('\t')).join('\n')
}
