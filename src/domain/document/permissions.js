// Who may do what with a document (decisions 14, 15, 39, 42, 46). Pure rules.
//
// IMPORTANT: these only SHAPE the interface (which buttons are offered). The backend must
// enforce every one of them again on every call (decision 15: "the server enforces the
// permissions"); the development mocks play that part in src/dev/.
//
//   view / open / view the original   an employee: own documents; the Admin: all (15)
//   approve                           an employee: own documents; the Admin: all (39); no separate reviewer role
//   edit                              never an approved document (14); otherwise own (employee) / all (Admin)
//   create a new version              the Admin only, only from an approved document (14)
//   delete (move to the recycle bin)  the Admin only (42); an employee never, even for own documents
//   retry processing / manual entry   whoever may edit the document (11)
//   export                            whoever may view it, approved results only (8, 46)

import { USER_ROLES } from '../../constants/roles.js'
import { canViewDocument } from './access.js'
import { DOCUMENT_STATE, isBeingProcessed, isReviewable } from './lifecycle.js'

const isAdmin = (role) => role === USER_ROLES.orgAdmin

// `actor` is { role, id }; `document` is a store summary ({ ownerId, state, versionCount, ... }).
export function canView(actor, document) {
  return canViewDocument({ role: actor.role, userId: actor.id, ownerId: document.ownerId })
}

export function canApprove(actor, document) {
  return canView(actor, document) && (isAdmin(actor.role) || actor.role === USER_ROLES.employee)
}

export function canEditContent(actor, document) {
  if (document.state === DOCUMENT_STATE.approved) return false
  return canView(actor, document)
}

export function canCreateNewVersion(actor, document) {
  return isAdmin(actor.role) && document.state === DOCUMENT_STATE.approved
}

export function canDelete(actor) {
  return isAdmin(actor.role)
}

export function canRetryProcessing(actor, document) {
  return (document.state === DOCUMENT_STATE.failed || document.state === DOCUMENT_STATE.manualEditing) && canView(actor, document)
}

// Export needs an approved version to exist; a draft of a new version does not hide it.
export function canExport(actor, document) {
  return canView(actor, document) && (document.versionCount ?? 0) > 0
}

export function canViewVersionHistory(actor, document) {
  return canView(actor, document) && (document.versionCount ?? 0) > 0
}

// The row actions of a document list, derived from one place so the queue, the archive and the
// dashboard agree. `open` says what the main button does: 'review' (editor), 'status'
// (processing status only), 'readOnly' (approved).
export function getDocumentActions(actor, document) {
  const visible = canView(actor, document)
  if (!visible) return { open: null, retry: false, manualEntry: false, delete: false, export: false, versions: false, newVersion: false }
  let open = 'status'
  if (isReviewable(document.state)) open = 'review'
  else if (document.state === DOCUMENT_STATE.approved) open = 'readOnly'
  return {
    open,
    retry: canRetryProcessing(actor, document),
    manualEntry: document.state === DOCUMENT_STATE.failed && canEditContent(actor, document),
    delete: canDelete(actor),
    // Deleting something the queue still owes work to cancels or waits for that work (45).
    deleteCancelsProcessing: isBeingProcessed(document.state),
    export: canExport(actor, document),
    versions: canViewVersionHistory(actor, document),
    newVersion: canCreateNewVersion(actor, document),
  }
}
