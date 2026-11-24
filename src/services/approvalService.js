// Integration point for REAL document approval and new-version creation.
// NOT CONNECTED in this phase: there is no backend that could record an
// approval durably, so nothing is approved, nothing is stored and no success
// is ever reported. Callers handle ApprovalNotConnectedError and tell the user.
//
// Later phase: replace the bodies with calls to the approval service; keep the
// "reject unless the backend acknowledged" contract.

export const APPROVAL_NOT_CONNECTED = 'APPROVAL_NOT_CONNECTED'

export class ApprovalNotConnectedError extends Error {
  constructor() {
    super('Document approval is not connected to a backend yet.')
    this.name = 'ApprovalNotConnectedError'
    this.code = APPROVAL_NOT_CONNECTED
  }
}

export const isApprovalServiceConnected = false

export function requestDocumentApproval() {
  return Promise.reject(new ApprovalNotConnectedError())
}

export function requestNewEditableVersion() {
  return Promise.reject(new ApprovalNotConnectedError())
}
