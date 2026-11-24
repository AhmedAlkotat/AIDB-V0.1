// Error codes (Phase 1 domain errors and review-session refusals) that have a
// dedicated Arabic message under review.errors.*. Anything else falls back to
// the generic message, so an unexpected code never shows a raw key.

const KNOWN_ERROR_CODES = new Set([
  'DOCUMENT_APPROVED',
  'APPROVAL_PENDING',
  'PENDING_EDITS_COMMITTED',
  'INVALID_DOCUMENT',
  'PAGE_PROCESSING',
  'CONFIRMATION_REQUIRED',
  'REVIEW_NOT_ALLOWED',
  'DUPLICATE_ID',
  'ELEMENT_NOT_FOUND',
  'PAGE_NOT_SELECTED',
  'INVALID_CONVERSION',
  'LAST_TABLE_ROW',
  'LAST_TABLE_COLUMN',
])

export function getErrorMessageKey(code) {
  return KNOWN_ERROR_CODES.has(code) ? `review.errors.${code}` : 'review.errors.generic'
}
