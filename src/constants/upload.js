// Upload rules for the Upload Document page. Kept in one place so the backend
// integration (later phase) can share or replace them.

const DEFAULT_MAX_UPLOAD_SIZE_MB = 10

// The limit can be overridden at build time with VITE_MAX_UPLOAD_SIZE_MB
// (e.g. in a .env.local file). Invalid or missing values fall back to 10 MB.
function readMaxUploadSizeMb() {
  const configured = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_SIZE_MB
}

export const MAX_UPLOAD_SIZE_MB = readMaxUploadSizeMb()
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

// One document per upload operation in this phase.
export const MAX_FILES_PER_UPLOAD = 1

// Accepted formats. `kind` drives the preview; `labelKey` is the translated
// file-type name shown to the user.
export const ACCEPTED_DOCUMENT_TYPES = Object.freeze([
  { extension: 'pdf', mimeTypes: ['application/pdf'], kind: 'pdf', labelKey: 'upload.fileTypes.pdf' },
  { extension: 'jpg', mimeTypes: ['image/jpeg', 'image/pjpeg'], kind: 'image', labelKey: 'upload.fileTypes.jpeg' },
  { extension: 'jpeg', mimeTypes: ['image/jpeg', 'image/pjpeg'], kind: 'image', labelKey: 'upload.fileTypes.jpeg' },
  { extension: 'png', mimeTypes: ['image/png'], kind: 'image', labelKey: 'upload.fileTypes.png' },
])

// Display names of the supported formats, e.g. for "PDF, JPG, JPEG, PNG".
export const SUPPORTED_FORMAT_NAMES = Object.freeze(
  ACCEPTED_DOCUMENT_TYPES.map((type) => type.extension.toUpperCase()),
)

// Value for the file input's `accept` attribute.
export const FILE_INPUT_ACCEPT = [
  ...ACCEPTED_DOCUMENT_TYPES.map((type) => `.${type.extension}`),
  ...new Set(ACCEPTED_DOCUMENT_TYPES.flatMap((type) => type.mimeTypes)),
].join(',')
