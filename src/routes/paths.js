// Single place for application URLs.
export const ROUTES = Object.freeze({
  dashboard: '/',
  upload: '/upload',
  archive: '/archive',
  corrections: '/corrections',
  reviewDocument: '/corrections/review/:documentId',
  templates: '/templates',
  settings: '/settings',
})

// Where "back" goes from a document's review page: an approved document came from the
// archive, a pending one from the correction queue.
export const backFromReviewPath = (isApproved) => (isApproved ? ROUTES.archive : ROUTES.corrections)

// URL of the review page of one document.
export const reviewPath = (documentId) => `/corrections/review/${encodeURIComponent(documentId)}`
