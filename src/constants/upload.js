// Upload rules for the Upload Document page. Kept in one place so the backend
// integration (later phase) can share or replace them.

// NOTE: the maximum file size and the maximum number of selected pages are NOT constants: the Admin
// sets them (decisions 36 and 48) and the screens read them from the system settings service
// (hooks/useUploadLimits.js, utils/uploadLimits.js).

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
