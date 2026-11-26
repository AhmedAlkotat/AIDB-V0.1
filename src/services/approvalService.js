// Approval and new-version creation (decisions 6, 14, 39). Real approval needs a backend that records
// it durably, together with the approved version.
//
//   isMock
//   requestDocumentApproval(documentId)   -> Promise<void>  approves the document AS STORED. The server
//                                            checks ownership / role (39), that every selected page is
//                                            reviewed, that nothing is processing, that the caller holds the
//                                            edit lock (47), and keeps the approved version (14).
//   requestNewEditableVersion(documentId) -> Promise<void>  Admin only, from an approved document: the
//                                            previous version stays, the new one needs a new approval (14).
//
// REPLACEABLE and NOT CONNECTED TO A BACKEND YET: the production service rejects with
// ApprovalNotConnectedError, so nothing is approved and no success is ever reported. Development builds
// use a simulation (src/dev/mockApprovalService.js) reachable only through the `import.meta.env.DEV`
// branch below. Callers never report success unless the service acknowledged it.

import { createMockApprovalService } from '../dev/mockApprovalService.js'

export const APPROVAL_NOT_CONNECTED = 'APPROVAL_NOT_CONNECTED'

export class ApprovalNotConnectedError extends Error {
  constructor() {
    super('Document approval is not connected to a backend yet.')
    this.name = 'ApprovalNotConnectedError'
    this.code = APPROVAL_NOT_CONNECTED
  }
}

const refuse = () => Promise.reject(new ApprovalNotConnectedError())

export const NOT_CONNECTED_APPROVAL = Object.freeze({ isMock: false, requestDocumentApproval: refuse, requestNewEditableVersion: refuse })

export function createApprovalService() {
  if (import.meta.env?.DEV) return createMockApprovalService()
  return NOT_CONNECTED_APPROVAL
}

export const approvalService = createApprovalService()
export const isApprovalServiceConnected = false
