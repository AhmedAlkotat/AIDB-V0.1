// Single place for application URLs.
export const ROUTES = Object.freeze({
  login: '/login',
  logout: '/logout',
  dashboard: '/',
  upload: '/upload',
  archive: '/archive',
  corrections: '/corrections',
  reviewDocument: '/corrections/review/:documentId',
  templates: '/templates',
  settings: '/settings',
  notifications: '/notifications',
  adminEmployees: '/admin/employees',
  adminRecycleBin: '/admin/recycle-bin',
  adminBackups: '/admin/backups',
  adminAuditLog: '/admin/audit-log',
  adminStorage: '/admin/storage',
  adminSettings: '/admin/settings',
})

// Where "back" goes from a document's review page: an approved document came from the
// archive, a pending one from the correction queue.
export const backFromReviewPath = (isApproved) => (isApproved ? ROUTES.archive : ROUTES.corrections)

// URL of the review page of one document.
export const reviewPath = (documentId) => `/corrections/review/${encodeURIComponent(documentId)}`
