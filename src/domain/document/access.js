// Who sees which document, and where a document is listed (frontend policy only).
//
// IMPORTANT: this is a SIMULATION for the interface. The role and the user ID come
// from the demo user (see useCurrentUser); nothing here is enforced by a server, so
// it must never be treated as a security boundary. Real authentication, authorization
// and backend-enforced permissions belong to Task 3 (and P6 in the Phase 2 review).
//
// Rules (approved):
// - an employee sees only the documents they own; an administrator sees all of them;
// - a document that is not approved is "pending": it belongs to the correction queue
//   and NEVER to the archive;
// - an approved document belongs to the archive and leaves the correction queue.

import { USER_ROLES } from '../../constants/roles.js'
import { isDocumentApproved } from './approval.js'

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

// Documents waiting for human review: visible and not approved.
export function selectCorrectionQueue(items, user) {
  return selectVisibleDocuments(items, user).filter((item) => !isDocumentApproved(item.approvalStatus))
}

// The archive: visible and approved. Pending documents never appear here.
export function selectArchive(items, user) {
  return selectVisibleDocuments(items, user).filter((item) => isDocumentApproved(item.approvalStatus))
}
