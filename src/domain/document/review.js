// Page review state and progress.
//
// Rules:
// - A page becomes "reviewed" only by an explicit confirmation.
// - Any change to the corrected content of a reviewed page invalidates the
//   confirmation; only a new explicit confirmation makes it reviewed again.
//   (Undo/redo of content counts as a content change, so it can never bring
//   a page back to "reviewed" by itself.)
// - Only SELECTED pages exist in a document, so unselected pages never count.

import { hasMeaningfulContent } from './elements.js'
import { PROCESSING_STATUS, REVIEW_STATUS } from './schema.js'

// Why a page cannot be confirmed yet (the `reason` of REVIEW_NOT_ALLOWED).
export const REVIEW_BLOCKER = Object.freeze({
  processing: 'processing', // processing is still running
  noContent: 'noContent', // nothing to review yet
  failedWithoutContent: 'failedWithoutContent', // extraction failed and nothing was entered manually
})

// Returns null when the page may be confirmed, otherwise a REVIEW_BLOCKER.
// A page needs real content to be reviewed. A page whose extraction failed
// can be confirmed only after valid content was entered manually.
export function getReviewConfirmationBlocker(page) {
  if (page.processing.status === PROCESSING_STATUS.processing) return REVIEW_BLOCKER.processing
  if (hasMeaningfulContent(page.elements)) return null
  return page.processing.status === PROCESSING_STATUS.failed
    ? REVIEW_BLOCKER.failedWithoutContent
    : REVIEW_BLOCKER.noContent
}

export function confirmedReview(at) {
  return { status: REVIEW_STATUS.reviewed, confirmedAt: at }
}

// Returns the same object when the page was not reviewed, so "nothing
// changed" stays detectable by identity.
export function invalidateReview(review) {
  if (review.status !== REVIEW_STATUS.reviewed) return review
  return { status: REVIEW_STATUS.invalidated, confirmedAt: null }
}

export function isPageReviewed(page) {
  return page.review.status === REVIEW_STATUS.reviewed
}

// Progress over the selected pages of a document.
export function getReviewProgress(document) {
  const pageNumbersWhere = (predicate) => document.pages.filter(predicate).map((page) => page.pageNumber)
  const reviewedPages = pageNumbersWhere((page) => page.review.status === REVIEW_STATUS.reviewed)
  const invalidatedPages = pageNumbersWhere((page) => page.review.status === REVIEW_STATUS.invalidated)
  const pagesRequiringReview = pageNumbersWhere((page) => page.review.status !== REVIEW_STATUS.reviewed)
  const totalPages = document.pages.length

  return {
    totalPages,
    reviewedCount: reviewedPages.length,
    reviewedPages,
    requiringReviewCount: pagesRequiringReview.length,
    pagesRequiringReview,
    invalidatedPages,
    percent: totalPages === 0 ? 0 : Math.round((reviewedPages.length / totalPages) * 100),
    isComplete: totalPages > 0 && reviewedPages.length === totalPages,
  }
}
