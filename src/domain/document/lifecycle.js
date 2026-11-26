// The six approved document states (decision 12; decision 10 is superseded by it) and how a
// document moves between them. Pure rules, no UI and no storage.
//
//   Pending          registered after "Start processing"; waiting in the central FIFO queue
//   Processing       the queue is extracting the selected pages
//   Ready for Review extraction finished (at least one page succeeded); waiting for the human
//   Failed           processing ended and no page was extracted; the user may retry (decision 11)
//   Manual Editing   processing failed and the user is entering the content by hand (decision 11)
//   Approved         explicitly approved by an authorised user (decisions 6 and 39)
//
// The state is DERIVED from three facts the store keeps: the approval status, the workflow
// phase of the document-level processing (the queue's view) and the content of the pages. It is
// never stored on its own, so the lists, the dashboard and the review header can never disagree.
//
// Archive (decision 12): every state is listed in the archive EXCEPT Pending. The correction
// queue lists every document that is not approved. Soft-deleted documents appear in neither
// (the store hides them, decision 43).

import { hasMeaningfulContent } from './elements.js'

export const DOCUMENT_STATE = Object.freeze({
  pending: 'pending',
  processing: 'processing',
  readyForReview: 'readyForReview',
  failed: 'failed',
  manualEditing: 'manualEditing',
  approved: 'approved',
})
export const DOCUMENT_STATE_LIST = Object.freeze(Object.values(DOCUMENT_STATE))

// What the queue knows about the document-level processing run.
export const WORKFLOW_PHASE = Object.freeze({
  pending: 'pending', // queued, not started
  processing: 'processing', // being extracted
  completed: 'completed', // finished with at least one successful page
  failed: 'failed', // finished with no successful page (or cancelled before any)
})

export const DEFAULT_WORKFLOW = Object.freeze({
  phase: WORKFLOW_PHASE.completed,
  queuedAt: null,
  startedAt: null,
  finishedAt: null,
  errorCode: null,
})

// Pages are serialized pages ({ elements, ... }); only their content matters here.
function hasManualContent(pages) {
  return pages.some((page) => page.elements.length > 0 && hasMeaningfulContent(page.elements))
}

export function getDocumentState({ approvalStatus, workflow = DEFAULT_WORKFLOW, pages = [] }) {
  if (approvalStatus === 'approved') return DOCUMENT_STATE.approved
  switch (workflow.phase) {
    case WORKFLOW_PHASE.pending:
      return DOCUMENT_STATE.pending
    case WORKFLOW_PHASE.processing:
      return DOCUMENT_STATE.processing
    case WORKFLOW_PHASE.failed:
      return hasManualContent(pages) ? DOCUMENT_STATE.manualEditing : DOCUMENT_STATE.failed
    default:
      return DOCUMENT_STATE.readyForReview
  }
}

// Allowed moves (decision 12 + 11 + 14). "approved -> readyForReview" is the Admin's new
// editable version (decision 14); "failed/manualEditing -> processing" is a retry without a
// new upload (decision 11).
const TRANSITIONS = Object.freeze({
  [DOCUMENT_STATE.pending]: [DOCUMENT_STATE.processing],
  [DOCUMENT_STATE.processing]: [DOCUMENT_STATE.readyForReview, DOCUMENT_STATE.failed],
  [DOCUMENT_STATE.readyForReview]: [DOCUMENT_STATE.approved],
  [DOCUMENT_STATE.failed]: [DOCUMENT_STATE.processing, DOCUMENT_STATE.manualEditing],
  [DOCUMENT_STATE.manualEditing]: [DOCUMENT_STATE.processing, DOCUMENT_STATE.approved],
  [DOCUMENT_STATE.approved]: [DOCUMENT_STATE.readyForReview],
})

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) === true
}

export const isArchived = (state) => state !== DOCUMENT_STATE.pending
export const isInCorrectionQueue = (state) => state !== DOCUMENT_STATE.approved

// A document the queue still owes work to: a delete must cancel or wait for it (decision 45).
export const isBeingProcessed = (state) => state === DOCUMENT_STATE.pending || state === DOCUMENT_STATE.processing

// The review screen can edit the content only in these states. Pending/Processing show the
// processing status instead (the content does not exist yet); Approved is read-only for
// everyone until the Admin creates a new version (decision 14).
export const isReviewable = (state) =>
  state === DOCUMENT_STATE.readyForReview || state === DOCUMENT_STATE.failed || state === DOCUMENT_STATE.manualEditing

export const STATE_TONE = Object.freeze({
  [DOCUMENT_STATE.pending]: 'neutral',
  [DOCUMENT_STATE.processing]: 'info',
  [DOCUMENT_STATE.readyForReview]: 'info',
  [DOCUMENT_STATE.failed]: 'danger',
  [DOCUMENT_STATE.manualEditing]: 'warning',
  [DOCUMENT_STATE.approved]: 'success',
})

// Pages a (re)try of the whole document still has to extract: those without a successful
// extraction. Pages that already succeeded are kept (completed results are preserved), and a
// page the user already filled in by hand is never overwritten: its new result becomes a
// candidate the user decides on (decisions 38 and 40).
export function getPagesToProcess(pages) {
  return pages.filter((page) => page.processing.status !== 'succeeded').map((page) => page.pageNumber)
}
