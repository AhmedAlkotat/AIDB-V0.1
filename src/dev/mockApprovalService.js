// DEVELOPMENT-ONLY mock of the approval backend (see services/approvalService.js). Not part of production
// bundles. It plays the SERVER's part (decisions 6, 14, 39, 47): ownership and role are checked, the
// prerequisites are checked again, the approved version is kept, and an Admin's new version needs a new
// approval. Approval itself is SIMULATED: nothing is recorded anywhere durable.

import { APPROVAL_STATUS } from '../domain/document/approval.js'
import { DOCUMENT_STATE } from '../domain/document/lifecycle.js'
import { canApprove, canCreateNewVersion, canView } from '../domain/document/permissions.js'
import { getReviewProgress } from '../domain/document/review.js'
import { appendApprovedVersion } from '../domain/document/versions.js'
import { editLockService as sharedLockService } from '../services/editLockService.js'
import { SYSTEM_ERROR } from '../services/systemErrors.js'
import { WORKFLOW_ERROR, workflowError } from '../services/workflowErrors.js'
import { getMockContext } from './mockContext.js'

export function createMockApprovalService({ context = getMockContext(), store = context.documents, lockService = sharedLockService } = {}) {
  const ctx = context

  function find(actor, documentId) {
    const item = store.list().find((candidate) => candidate.id === documentId)
    if (!item || !canView(actor, item)) throw workflowError(SYSTEM_ERROR.notFound)
    return item
  }

  return {
    isMock: true,

    requestDocumentApproval: (documentId) =>
      ctx.run(ctx.requireUser, async (actor) => {
        const item = find(actor, documentId)
        if (!canApprove(actor, item)) throw workflowError(SYSTEM_ERROR.forbidden)
        if (item.state === DOCUMENT_STATE.approved) throw workflowError(WORKFLOW_ERROR.invalidState)
        // The server checks the lock on approval too (decision 47).
        await lockService.assertHeld(documentId)
        const record = store.get(documentId)
        const progress = getReviewProgress(record.snapshot)
        const stillProcessing = record.snapshot.pages.some((page) => page.processing.status === 'processing')
        if (!progress.isComplete || stillProcessing) throw workflowError(WORKFLOW_ERROR.notEligible)

        const versions = appendApprovedVersion(record.versions, { snapshot: record.snapshot, approvedAt: ctx.now().toISOString(), approvedBy: actor.id, approvedByName: actor.displayName })
        store.updateMeta(documentId, { versions, candidates: {} })
        await store.setApprovalStatus(documentId, APPROVAL_STATUS.approved)
        // Editing is over: the approving user's lock is released (the saved work is untouched).
        await lockService.release(documentId).catch(() => {})
        const isReapproval = versions.length > 1
        ctx.recordAudit({ category: isReapproval ? 'approvedEdits' : 'approval', action: isReapproval ? 'reapproved' : 'approved', actor, subject: record.name, outcome: 'success' })
      }),

    requestNewEditableVersion: (documentId) =>
      ctx.run(ctx.requireUser, async (actor) => {
        const item = find(actor, documentId)
        if (!canCreateNewVersion(actor, item)) throw workflowError(SYSTEM_ERROR.forbidden)
        await store.setApprovalStatus(documentId, APPROVAL_STATUS.none)
        ctx.recordAudit({ category: 'approvedEdits', action: 'newVersionCreated', actor, subject: item.name, outcome: 'success' })
      }),
  }
}
