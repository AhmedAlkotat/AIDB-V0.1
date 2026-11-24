// Document approval rules (frontend policy only).
//
// IMPORTANT: this decides whether approval COULD be requested. Real approval
// needs a backend that records it durably; none exists yet, so the UI never
// shows a document as approved because of anything computed here (see
// approvalService.js). `approvalStatus` comes from the stored record.
//
// Rules:
// - Approval needs: every selected page reviewed, every change saved by the
//   configured storage, no AI processing underway, and a permitted role.
// - An approved document is immutable for EVERYONE, employees included.
//   Only an organisation admin may start a new editable version.

import { ALL_ROLES, USER_ROLES } from '../../constants/roles.js'
import { getReviewProgress } from './review.js'
import { SAVE_STATUS } from './saveStatus.js'

export const APPROVAL_STATUS = Object.freeze({
  none: 'none',
  approved: 'approved',
})

// Why approval is not possible yet.
export const APPROVAL_BLOCKER = Object.freeze({
  alreadyApproved: 'alreadyApproved',
  pagesNotReviewed: 'pagesNotReviewed',
  unsavedChanges: 'unsavedChanges',
  processingActive: 'processingActive',
  noPermission: 'noPermission',
})

export function canRoleApprove(role) {
  return ALL_ROLES.includes(role)
}

export function isDocumentApproved(approvalStatus) {
  return approvalStatus === APPROVAL_STATUS.approved
}

// Content may be edited only while the document is not approved.
export function canEditDocument({ approvalStatus }) {
  return !isDocumentApproved(approvalStatus)
}

// Only the admin may start a new editable version, and only of an approved document.
export function canCreateNewVersion({ role, approvalStatus }) {
  return isDocumentApproved(approvalStatus) && role === USER_ROLES.orgAdmin
}

export function getApprovalEligibility({ document, saveStatus, activeProcessingCount = 0, role, approvalStatus }) {
  const progress = getReviewProgress(document)
  const blockers = []
  if (isDocumentApproved(approvalStatus)) blockers.push(APPROVAL_BLOCKER.alreadyApproved)
  if (!progress.isComplete) blockers.push(APPROVAL_BLOCKER.pagesNotReviewed)
  if (saveStatus !== SAVE_STATUS.saved) blockers.push(APPROVAL_BLOCKER.unsavedChanges)
  if (activeProcessingCount > 0) blockers.push(APPROVAL_BLOCKER.processingActive)
  if (!canRoleApprove(role)) blockers.push(APPROVAL_BLOCKER.noPermission)

  return {
    eligible: blockers.length === 0,
    blockers,
    reviewedCount: progress.reviewedCount,
    totalPages: progress.totalPages,
  }
}
