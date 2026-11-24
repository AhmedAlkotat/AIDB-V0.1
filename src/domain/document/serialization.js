// JSON serialization of the canonical document.
//
// The corrected canonical model is the ONLY source of truth: JSON is always
// generated from it on demand and parsed back through full validation. There
// is no separate editable JSON representation. Serialization is pure and
// deterministic (fixed key order, no timestamps of its own).
//
// By default the output holds the corrected working content only. Pass
// { includeOriginalExtraction: true } to also include the preserved AI output.

import { ERROR_CODE, fail } from './errors.js'
import { deepClone } from './utils.js'
import { validateDocument } from './validation.js'

function serializeElement(element) {
  return {
    id: element.id,
    type: element.type,
    order: element.order,
    content: deepClone(element.content),
    source: { kind: element.source.kind, details: deepClone(element.source.details) },
    location: deepClone(element.location),
    metadata: deepClone(element.metadata),
  }
}

// One page record as plain JSON (also used to persist only the pages that changed).
export function serializePage(page, includeOriginalExtraction) {
  const serialized = {
    id: page.id,
    pageNumber: page.pageNumber,
    processing: { status: page.processing.status, errorCode: page.processing.errorCode },
    review: { status: page.review.status, confirmedAt: page.review.confirmedAt },
    elements: page.elements.map(serializeElement),
  }
  if (includeOriginalExtraction) {
    serialized.originalExtraction =
      page.originalExtraction === null ? null : { elements: page.originalExtraction.elements.map(serializeElement) }
  }
  return serialized
}

// Returns a plain JSON-compatible object (deep copy). Throws
// INVALID_DOCUMENT when the document does not pass validation, so invalid
// data is never silently exported.
export function serializeDocument(document, { includeOriginalExtraction = false } = {}) {
  const result = validateDocument(document)
  if (!result.valid) fail(ERROR_CODE.invalidDocument, 'Cannot serialize an invalid document.', { errors: result.errors })

  return {
    schemaVersion: document.schemaVersion,
    id: document.id,
    file: { ...document.file },
    selectedPages: [...document.selectedPages],
    pages: document.pages.map((page) => serializePage(page, includeOriginalExtraction)),
  }
}

// The canonical document restricted to ONE selected page: the same envelope and
// element shape as serializeDocument, with `pages` holding only that page. It is
// derived from the live state on every call (no separate copy) and skips the
// document-wide validation, so a 1,000-page document stays cheap to preview.
// The editor state is valid by construction (the reducer only produces valid
// documents), so nothing invalid can be shown here.
export function serializeDocumentPage(document, pageNumber, { includeOriginalExtraction = false } = {}) {
  const page = document.pages.find((candidate) => candidate.pageNumber === pageNumber)
  if (!page) fail(ERROR_CODE.pageNotFound, `Page ${pageNumber} is not part of this document.`, { pageNumber })
  return {
    schemaVersion: document.schemaVersion,
    id: document.id,
    file: { ...document.file },
    selectedPages: [...document.selectedPages],
    pages: [serializePage(page, includeOriginalExtraction)],
  }
}

export function stringifyDocument(document, { includeOriginalExtraction = false, space = 2 } = {}) {
  return JSON.stringify(serializeDocument(document, { includeOriginalExtraction }), null, space)
}

// Parses JSON text back into a canonical document and validates it. Never
// repairs data. Returns { ok: true, document } or { ok: false, errors }.
// A page without "originalExtraction" (the default output) loads as `null`.
export function parseDocumentJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [{ code: ERROR_CODE.malformedJson, path: '', message: error.message }] }
  }

  if (data !== null && typeof data === 'object' && Array.isArray(data.pages)) {
    data = {
      ...data,
      pages: data.pages.map((page) =>
        page !== null && typeof page === 'object' && !Object.hasOwn(page, 'originalExtraction')
          ? { ...page, originalExtraction: null }
          : page,
      ),
    }
  }

  const result = validateDocument(data)
  return result.valid ? { ok: true, document: data } : { ok: false, errors: result.errors }
}
