// Figures and activity for the role-based dashboards, computed from document summaries
// (the items of documentStore.list(), already restricted to what the signed-in user may see
// with selectVisibleDocuments: an employee's own documents, all documents for the Admin).
// Pure functions; they invent no business statuses: a document is either approved or still
// waiting for review.

import { isDocumentApproved } from '../document/approval.js'

export function getDocumentStats(items) {
  const approved = items.filter((item) => isDocumentApproved(item.approvalStatus)).length
  return { total: items.length, approved, needsCorrection: items.length - approved }
}

// The most recently changed documents first.
export function getRecentDocuments(items, limit = 5) {
  return [...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit)
}
