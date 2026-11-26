// Who sees which document, and where a document is listed (frontend policy only).
//
// IMPORTANT: this is a SIMULATION for the interface. The role and the user ID come
// from the demo user (see useCurrentUser); nothing here is enforced by a server, so
// it must never be treated as a security boundary. Real authentication, authorization
// and backend-enforced permissions belong to Task 3 (and P6 in the Phase 2 review).
//
// Rules (approved):
// - an employee sees only the documents they own; an administrator sees all of them (decision 15);
// - the correction queue lists every document that is not approved (Pending, Processing, Ready for
//   Review, Failed, Manual Editing);
// - the archive lists EVERY state except Pending (decision 12, which replaces the earlier
//   "approved only" rule of decision 10): Processing, Ready for Review, Failed, Manual Editing and
//   Approved. Soft-deleted documents are in neither list: the store hides them (decision 43).

import { USER_ROLES } from '../../constants/roles.js'
import { isDocumentApproved } from './approval.js'
import { DOCUMENT_STATE, isArchived } from './lifecycle.js'

// The lifecycle state of a store summary. Summaries from older callers (and tests) carry only the
// approval status: they are either approved or waiting for review.
export const stateOf = (item) => item.state ?? (isDocumentApproved(item.approvalStatus) ? DOCUMENT_STATE.approved : DOCUMENT_STATE.readyForReview)

// `ownerId` is the ID of the user who uploaded the document. A document without an
// owner (legacy or unknown) is visible to administrators only.
export function canViewDocument({ role, userId, ownerId }) {
  if (role === USER_ROLES.orgAdmin) return true
  if (role !== USER_ROLES.employee) return false
  return ownerId !== null && ownerId !== undefined && ownerId === userId
}

// `items` are store summaries ({ approvalStatus, ownerId, ... }).
export function selectVisibleDocuments(items, user) {
  return items.filter((item) => canViewDocument({ role: user.role, userId: user.id, ownerId: item.ownerId }))
}

// Documents still in work: visible and not approved.
export function selectCorrectionQueue(items, user) {
  return selectVisibleDocuments(items, user).filter((item) => stateOf(item) !== DOCUMENT_STATE.approved)
}

// The archive: visible, in every state except Pending (decision 12).
export function selectArchive(items, user) {
  return selectVisibleDocuments(items, user).filter((item) => isArchived(stateOf(item)))
}
