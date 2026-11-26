// Figures and activity for the role-based dashboards, computed from document summaries
// (the items of documentStore.list(), already restricted to what the signed-in user may see
// with selectVisibleDocuments: an employee's own documents, all documents for the Admin).
// Pure functions. The figures follow the six approved states (decision 12): a document is Pending,
// Processing, Ready for Review, Failed, Manual Editing or Approved; "needs correction" is every
// document that is not approved yet.

import { stateOf } from '../document/access.js'
import { DOCUMENT_STATE, DOCUMENT_STATE_LIST } from '../document/lifecycle.js'

export function getDocumentStats(items) {
  const byState = Object.fromEntries(DOCUMENT_STATE_LIST.map((state) => [state, 0]))
  for (const item of items) byState[stateOf(item)] += 1
  const approved = byState[DOCUMENT_STATE.approved]
  return { total: items.length, approved, needsCorrection: items.length - approved, byState }
}

// The most recently changed documents first.
export function getRecentDocuments(items, limit = 5) {
  return [...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit)
}
