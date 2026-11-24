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

// URL of the review page of one document.
export const reviewPath = (documentId) => `/corrections/review/${encodeURIComponent(documentId)}`
