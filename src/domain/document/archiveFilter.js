// Search and filters of the archive (decision 9): by document type, date and status, plus a text search on
// the name. Pure functions over store summaries (already limited to what the user may see and to the
// archive's states, see access.js).
//
// "Type" is the kind of document the processing recognised (an invoice, a contract ...). The approved
// decisions do not list the types, so the filter offers the types that exist in the data plus
// "unclassified" (nothing recognised); see docs/batch-d-document-management.md, open questions.
// "Date" is the UPLOAD date (when the document was registered), a day range, inclusive, local time.

import { stateOf } from './access.js'
import { DOCUMENT_STATE } from './lifecycle.js'

// Every state the archive lists (decision 12: all of them except Pending).
export const ARCHIVE_STATES = Object.freeze([
  DOCUMENT_STATE.processing,
  DOCUMENT_STATE.readyForReview,
  DOCUMENT_STATE.failed,
  DOCUMENT_STATE.manualEditing,
  DOCUMENT_STATE.approved,
])

export const UNCLASSIFIED = 'unclassified'

export const EMPTY_FILTERS = Object.freeze({ query: '', type: 'all', state: 'all', from: '', to: '' })

export const hasActiveFilters = (filters) => Object.keys(EMPTY_FILTERS).some((key) => filters[key] !== EMPTY_FILTERS[key])

// The document types present in `items`, sorted, with "unclassified" last when some document has none.
export function availableTypes(items) {
  const types = [...new Set(items.map((item) => item.documentType).filter(Boolean))].sort()
  return items.some((item) => !item.documentType) ? [...types, UNCLASSIFIED] : types
}

export function filterDocuments(items, { query = '', type = 'all', state = 'all', from = '', to = '' } = {}) {
  const needle = String(query).trim().toLowerCase()
  const start = from ? new Date(`${from}T00:00:00`).getTime() : null
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : null
  return items
    .filter((item) => {
      if (needle !== '' && !String(item.name).toLowerCase().includes(needle)) return false
      if (type !== 'all' && (item.documentType ?? UNCLASSIFIED) !== type) return false
      if (state !== 'all' && stateOf(item) !== state) return false
      const at = new Date(item.createdAt).getTime()
      if (start !== null && at < start) return false
      if (end !== null && at > end) return false
      return true
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}
