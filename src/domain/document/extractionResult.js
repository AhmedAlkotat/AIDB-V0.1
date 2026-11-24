// Checking an extraction result (from the mock service today, from the real AI
// adapter later) BEFORE it is applied to a page or kept as a candidate.
//
// The result is untrusted: it must be a list of canonical elements, every ID
// (element, table row, table cell) must be unique inside the list, and no new ID
// may already be used elsewhere in the document. Nothing is repaired: an invalid
// result is rejected as a whole.

import { findIdConflict } from './document.js'
import { normalizeOrder } from './elements.js'
import { deepClone, isPlainObject } from './utils.js'
import { validateElements } from './validation.js'

export const INVALID_EXTRACTION_RESULT = 'INVALID_EXTRACTION_RESULT'

export const EXTRACTION_PROBLEM = Object.freeze({
  notAList: 'notAList',
  invalidElements: 'invalidElements',
  idConflict: 'idConflict',
})

// Returns { ok: true, elements } (a normalized COPY, so the producer cannot change
// it afterwards), or { ok: false, code, problem, errors?, id? }.
export function checkExtractionResult(document, pageNumber, elements) {
  if (!Array.isArray(elements) || !elements.every(isPlainObject)) {
    return { ok: false, code: INVALID_EXTRACTION_RESULT, problem: EXTRACTION_PROBLEM.notAList }
  }

  let copy
  try {
    copy = normalizeOrder(deepClone(elements))
  } catch {
    return { ok: false, code: INVALID_EXTRACTION_RESULT, problem: EXTRACTION_PROBLEM.invalidElements, errors: [] }
  }

  const result = validateElements(copy)
  if (!result.valid) {
    return { ok: false, code: INVALID_EXTRACTION_RESULT, problem: EXTRACTION_PROBLEM.invalidElements, errors: result.errors }
  }

  const page = document.pages.find((candidate) => candidate.pageNumber === pageNumber)
  const conflict = findIdConflict(document, pageNumber, page ? page.elements : [], copy)
  if (conflict !== null) {
    return { ok: false, code: INVALID_EXTRACTION_RESULT, problem: EXTRACTION_PROBLEM.idConflict, id: conflict }
  }

  return { ok: true, elements: copy }
}
