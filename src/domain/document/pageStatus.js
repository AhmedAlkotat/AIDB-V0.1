// The status a reviewer sees for a page. AI processing status and human review
// status stay separate in the canonical model; this derives ONE label for lists
// and badges without merging them:
//
//   pending         not processed yet and nothing entered
//   processing      the AI extraction is running
//   readyForReview  extraction succeeded, waiting for the human
//   failed          extraction failed and no content exists yet
//   manualEditing   content exists but did not come from a successful
//                   extraction (failed extraction, or typed before processing).
//                   A manually completed page is NEVER relabelled "succeeded".
//   reviewed        the reviewer explicitly confirmed it

import { hasMeaningfulContent } from './elements.js'
import { PROCESSING_STATUS, REVIEW_STATUS } from './schema.js'

export const PAGE_UI_STATUS = Object.freeze({
  pending: 'pending',
  processing: 'processing',
  readyForReview: 'readyForReview',
  failed: 'failed',
  manualEditing: 'manualEditing',
  reviewed: 'reviewed',
})

export function getPageUiStatus(page) {
  const aiStatus = page.processing.status
  if (aiStatus === PROCESSING_STATUS.processing) return PAGE_UI_STATUS.processing
  if (page.review.status === REVIEW_STATUS.reviewed) return PAGE_UI_STATUS.reviewed

  const hasContent = hasMeaningfulContent(page.elements)
  if (aiStatus === PROCESSING_STATUS.succeeded) return PAGE_UI_STATUS.readyForReview
  if (aiStatus === PROCESSING_STATUS.failed) return hasContent ? PAGE_UI_STATUS.manualEditing : PAGE_UI_STATUS.failed
  return hasContent ? PAGE_UI_STATUS.manualEditing : PAGE_UI_STATUS.pending
}
