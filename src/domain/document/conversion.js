// Changing an element's type without silently losing information.
//
// planConversion() computes the result WITHOUT applying it and reports:
//   lossless              nothing meaningful is lost
//   requiresConfirmation  something would be lost (see `lostData`)
//   preview               the element as it would look after converting
// changeElementType() applies a plan, but refuses a lossy conversion unless
// the caller passes `confirmed: true` (a later UI shows the preview and asks).
//
// The element keeps its ID, source, location and order. Information that has
// no place in the target type is either kept in `metadata`/`raw` (so the
// conversion stays lossless and reversible) or reported in `lostData`.

import { createTableContent, tableToText } from './elements.js'
import { ERROR_CODE, fail } from './errors.js'
import { generateId as defaultGenerateId } from './ids.js'
import { findElementIndex, replaceElementAt } from './elementOperations.js'
import { ELEMENT_TYPE_LIST, ELEMENT_TYPES, HEADING_LEVELS } from './schema.js'
import { isPlainObject } from './utils.js'
import { validateElement } from './validation.js'

// Codes reported in `lostData`.
export const LOST_DATA = Object.freeze({
  tableStructure: 'tableStructure', // rows/columns flattened into text
  fieldRelationship: 'fieldRelationship', // key and value merged into one text
  unclassifiedRaw: 'unclassifiedRaw', // raw data without a place in the target
})

const isNonEmpty = (text) => text.trim() !== ''

function tableGrid(content) {
  return content.rows.map((row) => row.cells.map((cell) => cell.text))
}

// A table is "trivial" when flattening it loses nothing meaningful: every cell
// is empty, or it is a single cell.
function isTrivialTable(content) {
  const grid = tableGrid(content)
  const nonEmpty = grid.flat().filter(isNonEmpty).length
  return nonEmpty === 0 || (grid.length === 1 && grid[0].length === 1)
}

function gridText(grid) {
  return grid.map((row) => row.join('\t')).join('\n')
}

// Text of a key/value pair. Blank (whitespace-only) sides carry no meaning, so
// the other side is returned as is; a blank key can never hide a real value.
function fieldText({ key, value }) {
  const hasKey = isNonEmpty(key)
  const hasValue = isNonEmpty(value)
  if (hasKey && hasValue) return `${key}: ${value}`
  if (hasValue) return value
  if (hasKey) return key
  return value || key
}

// raw shapes written by conversions, recognised so they can be restored.
function isRawKeyValue(raw) {
  const keys = isPlainObject(raw) ? Object.keys(raw).sort() : []
  return keys.length === 2 && keys[0] === 'key' && keys[1] === 'value' && typeof raw.key === 'string' && typeof raw.value === 'string'
}

function isRawGrid(raw) {
  if (!isPlainObject(raw) || Object.keys(raw).length !== 1 || !Array.isArray(raw.rows) || raw.rows.length === 0) return false
  const width = raw.rows[0]?.length
  return raw.rows.every((row) => Array.isArray(row) && row.length === width && width > 0 && row.every((cell) => typeof cell === 'string'))
}

// Plain text for the text-like targets (heading, paragraph).
function toPlainText(element, lostData) {
  const { content } = element
  switch (element.type) {
    case ELEMENT_TYPES.unclassified:
      if (content.raw !== null) lostData.push({ code: LOST_DATA.unclassifiedRaw })
      return content.text
    case ELEMENT_TYPES.field:
      if (isNonEmpty(content.key) && isNonEmpty(content.value)) lostData.push({ code: LOST_DATA.fieldRelationship })
      return fieldText(content)
    case ELEMENT_TYPES.table:
      if (!isTrivialTable(content)) lostData.push({ code: LOST_DATA.tableStructure })
      return tableToText(content)
    default:
      return content.text
  }
}

function headingLevelFrom(metadata) {
  const level = metadata.headingLevel
  return Number.isInteger(level) && level >= HEADING_LEVELS.min && level <= HEADING_LEVELS.max ? level : 1
}

function buildTargetContent(element, targetType, generateId, lostData) {
  const { content } = element
  const isTextLike = element.type === ELEMENT_TYPES.heading || element.type === ELEMENT_TYPES.paragraph

  switch (targetType) {
    case ELEMENT_TYPES.heading:
      return { text: toPlainText(element, lostData), level: headingLevelFrom(element.metadata) }
    case ELEMENT_TYPES.paragraph:
      return { text: toPlainText(element, lostData) }

    case ELEMENT_TYPES.field:
      if (isTextLike) return { key: '', value: content.text }
      if (element.type === ELEMENT_TYPES.unclassified) {
        // raw written by an earlier conversion is restored only while the text
        // still matches it. Edited text wins and the raw data is reported as lost.
        if (isRawKeyValue(content.raw) && content.text === fieldText(content.raw)) {
          return { key: content.raw.key, value: content.raw.value }
        }
        if (content.raw !== null) lostData.push({ code: LOST_DATA.unclassifiedRaw })
        return { key: '', value: content.text }
      }
      // table
      if (content.rows.length === 1 && content.rows[0].cells.length === 2) {
        return { key: content.rows[0].cells[0].text, value: content.rows[0].cells[1].text }
      }
      if (!isTrivialTable(content)) lostData.push({ code: LOST_DATA.tableStructure })
      return { key: '', value: tableToText(content) }

    case ELEMENT_TYPES.table:
      if (isTextLike) return createTableContent([[content.text]], { generateId })
      if (element.type === ELEMENT_TYPES.field) return createTableContent([[content.key, content.value]], { generateId })
      // unclassified
      if (isRawGrid(content.raw) && content.text === gridText(content.raw.rows)) {
        return createTableContent(content.raw.rows, { generateId })
      }
      if (content.raw !== null) lostData.push({ code: LOST_DATA.unclassifiedRaw })
      return createTableContent([[content.text]], { generateId })

    case ELEMENT_TYPES.unclassified:
      // Everything is kept: text for reading, raw for exact restoration.
      if (isTextLike) return { text: content.text, raw: null }
      if (element.type === ELEMENT_TYPES.field) {
        return { text: fieldText(content), raw: { key: content.key, value: content.value } }
      }
      return { text: tableToText(content), raw: { rows: tableGrid(content) } }

    default:
      return fail(ERROR_CODE.invalidArgument, `Unsupported target type "${targetType}".`)
  }
}

// Computes a conversion without applying it.
export function planConversion(element, targetType, { generateId = defaultGenerateId } = {}) {
  if (!ELEMENT_TYPE_LIST.includes(targetType)) {
    fail(ERROR_CODE.invalidArgument, `Unsupported target type "${targetType}".`, { targetType })
  }
  if (element.type === targetType) {
    fail(ERROR_CODE.sameType, 'The element already has this type.', { type: targetType })
  }

  const lostData = []
  const content = buildTargetContent(element, targetType, generateId, lostData)
  // A heading's level is kept in metadata so heading -> other -> heading is lossless.
  const metadata =
    element.type === ELEMENT_TYPES.heading ? { ...element.metadata, headingLevel: element.content.level } : element.metadata
  const preview = { ...element, type: targetType, content, metadata }

  const result = validateElement(preview, { index: element.order })
  if (!result.valid) fail(ERROR_CODE.invalidConversion, 'The conversion produced an invalid element.', { errors: result.errors })

  return {
    from: element.type,
    to: targetType,
    lossless: lostData.length === 0,
    requiresConfirmation: lostData.length > 0,
    lostData,
    preview,
  }
}

// Plan for the element with `id` in a list.
export function previewElementConversion(elements, id, targetType, options) {
  return planConversion(elements[findElementIndex(elements, id)], targetType, options)
}

// Applies a conversion. A lossy conversion throws CONFIRMATION_REQUIRED
// (details.plan holds the preview) unless `confirmed` is true.
export function changeElementType(elements, id, targetType, { confirmed = false, generateId } = {}) {
  const index = findElementIndex(elements, id)
  const plan = planConversion(elements[index], targetType, { generateId })
  if (plan.requiresConfirmation && confirmed !== true) {
    fail(ERROR_CODE.confirmationRequired, 'This conversion would lose information and needs explicit confirmation.', { plan })
  }
  return replaceElementAt(elements, index, plan.preview)
}
