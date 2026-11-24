// Structural validation of the canonical model. It reports structured errors
// ({ code, path, message, details? }) and NEVER repairs, drops or rewrites
// data. This is schema validation only; it does not judge whether extracted
// text is correct.

import { ERROR_CODE } from './errors.js'
import {
  ELEMENT_TYPE_LIST,
  ELEMENT_TYPES,
  HEADING_LEVELS,
  PROCESSING_STATUS_LIST,
  REVIEW_STATUS,
  REVIEW_STATUS_LIST,
  SOURCE_KIND_LIST,
  SUPPORTED_SCHEMA_VERSIONS,
} from './schema.js'
import { isJsonValue, isPlainObject } from './utils.js'

const DOCUMENT_KEYS = ['schemaVersion', 'id', 'file', 'selectedPages', 'pages']
const FILE_KEYS = ['name', 'size', 'mimeType', 'lastModified', 'totalPages']
const PAGE_KEYS = ['id', 'pageNumber', 'processing', 'review', 'originalExtraction', 'elements']
const PROCESSING_KEYS = ['status', 'errorCode']
const REVIEW_KEYS = ['status', 'confirmedAt']
const EXTRACTION_KEYS = ['elements']
const ELEMENT_KEYS = ['id', 'type', 'order', 'content', 'source', 'location', 'metadata']
const SOURCE_KEYS = ['kind', 'details']
const LOCATION_KEYS = ['x', 'y', 'width', 'height']
const CONTENT_KEYS = {
  [ELEMENT_TYPES.heading]: ['text', 'level'],
  [ELEMENT_TYPES.paragraph]: ['text'],
  [ELEMENT_TYPES.table]: ['rows'],
  [ELEMENT_TYPES.field]: ['key', 'value'],
  [ELEMENT_TYPES.unclassified]: ['text', 'raw'],
}

function createReporter() {
  const errors = []
  return {
    errors,
    add(code, path, message, details) {
      errors.push(details === undefined ? { code, path, message } : { code, path, message, details })
    },
  }
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0
// Paths are relative to the validated root; the document root itself is ''.
const join = (path, key) => (path === '' ? key : `${path}.${key}`)

// Reports unknown and missing keys. Returns false when `value` is not an object.
function checkObject(value, path, keys, report) {
  if (!isPlainObject(value)) {
    report.add(ERROR_CODE.malformed, path, 'Expected an object.')
    return false
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) report.add(ERROR_CODE.unknownKey, join(path, key), `Unknown key "${key}".`)
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) report.add(ERROR_CODE.missingField, join(path, key), `Missing required key "${key}".`)
  }
  return true
}

function claimId(registry, id, path, report) {
  if (!isNonEmptyString(id)) {
    report.add(ERROR_CODE.missingId, path, 'An ID must be a non-empty string.')
    return
  }
  const firstPath = registry.get(id)
  if (firstPath !== undefined) {
    report.add(ERROR_CODE.duplicateId, path, `Duplicate ID "${id}".`, { id, firstPath })
    return
  }
  registry.set(id, path)
}

function validateString(value, path, report, label) {
  if (typeof value !== 'string') report.add(ERROR_CODE.invalidValue, path, `${label} must be a string.`)
}

function validateTable(content, path, report, registry) {
  const { rows } = content
  if (!Array.isArray(rows) || rows.length === 0) {
    report.add(ERROR_CODE.invalidTable, `${path}.rows`, 'A table needs at least one row.')
    return
  }
  let columnCount = null
  rows.forEach((row, rowIndex) => {
    const rowPath = `${path}.rows[${rowIndex}]`
    if (!checkObject(row, rowPath, ['id', 'cells'], report)) return
    if (Object.hasOwn(row, 'id')) claimId(registry, row.id, `${rowPath}.id`, report)
    if (!Array.isArray(row.cells) || row.cells.length === 0) {
      report.add(ERROR_CODE.invalidTable, `${rowPath}.cells`, 'A table row needs at least one cell.')
      return
    }
    columnCount ??= row.cells.length
    if (row.cells.length !== columnCount) {
      report.add(ERROR_CODE.invalidTable, `${rowPath}.cells`, 'All table rows must have the same number of cells.', {
        expected: columnCount,
        actual: row.cells.length,
      })
    }
    row.cells.forEach((cell, cellIndex) => {
      const cellPath = `${rowPath}.cells[${cellIndex}]`
      if (!checkObject(cell, cellPath, ['id', 'text'], report)) return
      if (Object.hasOwn(cell, 'id')) claimId(registry, cell.id, `${cellPath}.id`, report)
      if (Object.hasOwn(cell, 'text')) validateString(cell.text, `${cellPath}.text`, report, 'Cell text')
    })
  })
}

function validateContent(type, content, path, report, registry) {
  if (!checkObject(content, path, CONTENT_KEYS[type], report)) return
  const has = (key) => Object.hasOwn(content, key)
  switch (type) {
    case ELEMENT_TYPES.heading:
      if (has('text')) validateString(content.text, `${path}.text`, report, 'Heading text')
      if (has('level') && !(Number.isInteger(content.level) && content.level >= HEADING_LEVELS.min && content.level <= HEADING_LEVELS.max)) {
        report.add(ERROR_CODE.invalidValue, `${path}.level`, `Heading level must be an integer from ${HEADING_LEVELS.min} to ${HEADING_LEVELS.max}.`)
      }
      break
    case ELEMENT_TYPES.paragraph:
      if (has('text')) validateString(content.text, `${path}.text`, report, 'Paragraph text')
      break
    case ELEMENT_TYPES.field:
      if (has('key')) validateString(content.key, `${path}.key`, report, 'Field key')
      if (has('value')) validateString(content.value, `${path}.value`, report, 'Field value')
      break
    case ELEMENT_TYPES.unclassified:
      if (has('text')) validateString(content.text, `${path}.text`, report, 'Unclassified text')
      if (has('raw') && !isJsonValue(content.raw)) {
        report.add(ERROR_CODE.invalidValue, `${path}.raw`, 'Unclassified raw data must be JSON-compatible (use null for none).')
      }
      break
    case ELEMENT_TYPES.table:
      if (has('rows')) validateTable(content, path, report, registry)
      break
    default:
      break
  }
}

function validateSource(source, path, report) {
  if (!checkObject(source, path, SOURCE_KEYS, report)) return
  if (Object.hasOwn(source, 'kind') && !SOURCE_KIND_LIST.includes(source.kind)) {
    report.add(ERROR_CODE.invalidValue, `${path}.kind`, `Source kind must be one of: ${SOURCE_KIND_LIST.join(', ')}.`)
  }
  if (Object.hasOwn(source, 'details') && !(isPlainObject(source.details) && isJsonValue(source.details))) {
    report.add(ERROR_CODE.invalidValue, `${path}.details`, 'Source details must be a JSON-compatible object.')
  }
}

function validateLocation(location, path, report) {
  if (location === null) return
  if (!checkObject(location, path, LOCATION_KEYS, report)) return
  for (const key of LOCATION_KEYS) {
    if (!Object.hasOwn(location, key)) continue
    const value = location[key]
    if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) {
      report.add(ERROR_CODE.invalidValue, `${path}.${key}`, 'Location values are relative page coordinates from 0 to 1.')
    }
  }
}

function validateElementInto(element, path, report, { index, registry }) {
  if (!checkObject(element, path, ELEMENT_KEYS, report)) return
  const has = (key) => Object.hasOwn(element, key)

  if (has('id')) claimId(registry, element.id, `${path}.id`, report)
  if (has('order')) {
    if (!isNonNegativeInteger(element.order)) {
      report.add(ERROR_CODE.invalidValue, `${path}.order`, 'Order must be a non-negative integer.')
    } else if (index !== undefined && element.order !== index) {
      report.add(ERROR_CODE.orderMismatch, `${path}.order`, 'Order must equal the element position.', {
        expected: index,
        actual: element.order,
      })
    }
  }
  if (has('source')) validateSource(element.source, `${path}.source`, report)
  if (has('location')) validateLocation(element.location, `${path}.location`, report)
  if (has('metadata') && !(isPlainObject(element.metadata) && isJsonValue(element.metadata))) {
    report.add(ERROR_CODE.invalidValue, `${path}.metadata`, 'Metadata must be a JSON-compatible object.')
  }
  if (has('type')) {
    if (!ELEMENT_TYPE_LIST.includes(element.type)) {
      report.add(ERROR_CODE.invalidType, `${path}.type`, `Unsupported element type. Supported: ${ELEMENT_TYPE_LIST.join(', ')}.`, {
        type: element.type,
      })
    } else if (has('content')) {
      validateContent(element.type, element.content, `${path}.content`, report, registry)
    }
  }
}

function validateElementsInto(elements, path, report, { checkOrder, registry }) {
  if (!Array.isArray(elements)) {
    report.add(ERROR_CODE.malformed, path, 'Elements must be an array.')
    return
  }
  elements.forEach((element, index) => {
    validateElementInto(element, `${path}[${index}]`, report, { index: checkOrder ? index : undefined, registry })
  })
}

const toResult = (report) => ({ valid: report.errors.length === 0, errors: report.errors })

// Validates one element. `index` (optional) also checks `order === index`.
export function validateElement(element, { index } = {}) {
  const report = createReporter()
  validateElementInto(element, 'element', report, { index, registry: new Map() })
  return toResult(report)
}

// Validates an ordered element list (IDs unique across the list, including
// table rows and cells).
export function validateElements(elements, { path = 'elements', checkOrder = true } = {}) {
  const report = createReporter()
  validateElementsInto(elements, path, report, { checkOrder, registry: new Map() })
  return toResult(report)
}

function validatePage(page, path, report, registry) {
  if (!checkObject(page, path, PAGE_KEYS, report)) return
  const has = (key) => Object.hasOwn(page, key)

  if (has('id')) claimId(registry, page.id, `${path}.id`, report)
  if (has('pageNumber') && !(Number.isInteger(page.pageNumber) && page.pageNumber >= 1)) {
    report.add(ERROR_CODE.invalidValue, `${path}.pageNumber`, 'Page number must be a positive integer (original PDF numbering).')
  }

  if (has('processing') && checkObject(page.processing, `${path}.processing`, PROCESSING_KEYS, report)) {
    const { status, errorCode } = page.processing
    if (Object.hasOwn(page.processing, 'status') && !PROCESSING_STATUS_LIST.includes(status)) {
      report.add(ERROR_CODE.invalidValue, `${path}.processing.status`, `Processing status must be one of: ${PROCESSING_STATUS_LIST.join(', ')}.`)
    }
    if (Object.hasOwn(page.processing, 'errorCode') && errorCode !== null && !isNonEmptyString(errorCode)) {
      report.add(ERROR_CODE.invalidValue, `${path}.processing.errorCode`, 'Error code must be null or a non-empty string.')
    }
  }

  if (has('review') && checkObject(page.review, `${path}.review`, REVIEW_KEYS, report)) {
    const { status, confirmedAt } = page.review
    if (Object.hasOwn(page.review, 'status') && !REVIEW_STATUS_LIST.includes(status)) {
      report.add(ERROR_CODE.invalidReviewState, `${path}.review.status`, `Review status must be one of: ${REVIEW_STATUS_LIST.join(', ')}.`)
    } else if (Object.hasOwn(page.review, 'confirmedAt')) {
      const isReviewed = status === REVIEW_STATUS.reviewed
      const isDate = typeof confirmedAt === 'string' && !Number.isNaN(Date.parse(confirmedAt))
      if (isReviewed && !isDate) {
        report.add(ERROR_CODE.invalidReviewState, `${path}.review.confirmedAt`, 'A reviewed page needs a valid confirmation time.')
      }
      if (!isReviewed && confirmedAt !== null) {
        report.add(ERROR_CODE.invalidReviewState, `${path}.review.confirmedAt`, 'Only a reviewed page can have a confirmation time.')
      }
    }
  }

  if (has('originalExtraction') && page.originalExtraction !== null) {
    const extractionPath = `${path}.originalExtraction`
    if (checkObject(page.originalExtraction, extractionPath, EXTRACTION_KEYS, report) && Object.hasOwn(page.originalExtraction, 'elements')) {
      // Preserved AI output has its own ID scope: it intentionally shares IDs
      // with the working copy it was copied into.
      validateElementsInto(page.originalExtraction.elements, `${extractionPath}.elements`, report, {
        checkOrder: true,
        registry: new Map(),
      })
    }
  }

  if (has('elements')) validateElementsInto(page.elements, `${path}.elements`, report, { checkOrder: true, registry })
}

function validateFile(file, report) {
  if (!checkObject(file, 'file', FILE_KEYS, report)) return null
  const has = (key) => Object.hasOwn(file, key)
  if (has('name') && !isNonEmptyString(file.name)) report.add(ERROR_CODE.invalidValue, 'file.name', 'File name must be a non-empty string.')
  if (has('size') && !isNonNegativeInteger(file.size)) report.add(ERROR_CODE.invalidValue, 'file.size', 'File size must be a non-negative integer.')
  if (has('mimeType') && typeof file.mimeType !== 'string') report.add(ERROR_CODE.invalidValue, 'file.mimeType', 'MIME type must be a string.')
  if (has('lastModified') && file.lastModified !== null && !(Number.isFinite(file.lastModified) && file.lastModified >= 0)) {
    report.add(ERROR_CODE.invalidValue, 'file.lastModified', 'Last modified must be null or a non-negative number.')
  }
  if (has('totalPages') && !(Number.isInteger(file.totalPages) && file.totalPages >= 1)) {
    report.add(ERROR_CODE.invalidValue, 'file.totalPages', 'Total pages must be a positive integer.')
    return null
  }
  return Number.isInteger(file.totalPages) ? file.totalPages : null
}

function validateSelectedPages(selectedPages, totalPages, report) {
  if (!Array.isArray(selectedPages) || selectedPages.length === 0) {
    report.add(ERROR_CODE.invalidSelectedPages, 'selectedPages', 'At least one page must be selected.')
    return false
  }
  let isValid = true
  selectedPages.forEach((page, index) => {
    const inRange = Number.isInteger(page) && page >= 1 && (totalPages === null || page <= totalPages)
    if (!inRange) {
      isValid = false
      report.add(ERROR_CODE.invalidSelectedPages, `selectedPages[${index}]`, 'Selected pages must be integers within the document page range.', {
        page,
        totalPages,
      })
    } else if (index > 0 && page <= selectedPages[index - 1]) {
      isValid = false
      report.add(ERROR_CODE.invalidSelectedPages, `selectedPages[${index}]`, 'Selected pages must be unique and in ascending order.', { page })
    }
  })
  return isValid
}

// Validates a complete document. Returns { valid, errors }.
export function validateDocument(document) {
  const report = createReporter()
  if (!isPlainObject(document)) {
    report.add(ERROR_CODE.malformed, '', 'A document must be an object.')
    return toResult(report)
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(document.schemaVersion)) {
    report.add(
      ERROR_CODE.unsupportedSchemaVersion,
      'schemaVersion',
      `Unsupported schema version. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`,
      { schemaVersion: document.schemaVersion ?? null },
    )
    // The shape of an unknown version cannot be judged.
    return toResult(report)
  }

  checkObject(document, '', DOCUMENT_KEYS, report)
  const registry = new Map()
  if (Object.hasOwn(document, 'id')) claimId(registry, document.id, 'id', report)

  const totalPages = Object.hasOwn(document, 'file') ? validateFile(document.file, report) : null
  const selectionIsValid = Object.hasOwn(document, 'selectedPages')
    ? validateSelectedPages(document.selectedPages, totalPages, report)
    : false

  if (Object.hasOwn(document, 'pages')) {
    if (!Array.isArray(document.pages)) {
      report.add(ERROR_CODE.malformed, 'pages', 'Pages must be an array.')
    } else {
      document.pages.forEach((page, index) => validatePage(page, `pages[${index}]`, report, registry))

      if (selectionIsValid) {
        const pageNumbers = document.pages.map((page) => page?.pageNumber)
        const missing = document.selectedPages.filter((page) => !pageNumbers.includes(page))
        const extra = pageNumbers.filter((page) => Number.isInteger(page) && !document.selectedPages.includes(page))
        const isDuplicated = new Set(pageNumbers).size !== pageNumbers.length
        const isAscending = pageNumbers.every((page, index) => index === 0 || page > pageNumbers[index - 1])
        if (missing.length > 0 || extra.length > 0 || isDuplicated || !isAscending) {
          report.add(
            ERROR_CODE.pageSelectionMismatch,
            'pages',
            'Pages must match the selected pages exactly: one record per selected page, in ascending order.',
            { missing, extra, duplicated: isDuplicated },
          )
        }
      }
    }
  }

  return toResult(report)
}
