import { ACCEPTED_DOCUMENT_TYPES } from '../constants/upload.js'

// Validation error codes. The UI maps each code to a translated message.
export const FILE_ERROR = Object.freeze({
  unsupportedType: 'unsupportedType',
  tooLarge: 'tooLarge',
  empty: 'empty',
  multiple: 'multiple',
})

export function getFileExtension(fileName) {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : ''
}

// Returns the matching accepted type, or null. The extension must be
// supported; when the browser reports a MIME type it must agree with it
// (some systems report an empty type, which is tolerated).
export function findDocumentType(file) {
  const extension = getFileExtension(file.name)
  const type = ACCEPTED_DOCUMENT_TYPES.find((entry) => entry.extension === extension)
  if (!type) return null
  if (file.type && !type.mimeTypes.includes(file.type.toLowerCase())) return null
  return type
}

// Validates a single document. Returns { valid: true, type } or
// { valid: false, error } where `error` is one of FILE_ERROR. `maxSizeBytes` is the Admin's
// limit (decision 36), read from the settings service by the caller; there is no built-in
// default, so without a limit only the type and the emptiness are checked.
export function validateDocumentFile(file, maxSizeBytes) {
  const type = findDocumentType(file)
  if (!type) return { valid: false, error: FILE_ERROR.unsupportedType }
  if (file.size === 0) return { valid: false, error: FILE_ERROR.empty }
  if (Number.isFinite(maxSizeBytes) && file.size > maxSizeBytes) return { valid: false, error: FILE_ERROR.tooLarge }
  return { valid: true, type }
}

// Splits a byte count into a display value and unit (B, KB, MB, GB or TB; the larger units are for
// storage and backup sizes, uploads stay far below them).
export function getFileSizeParts(bytes) {
  if (bytes < 1024) return { value: bytes, unit: 'B' }
  if (bytes < 1024 ** 2) return { value: bytes / 1024, unit: 'KB' }
  if (bytes < 1024 ** 3) return { value: bytes / 1024 ** 2, unit: 'MB' }
  if (bytes < 1024 ** 4) return { value: bytes / 1024 ** 3, unit: 'GB' }
  return { value: bytes / 1024 ** 4, unit: 'TB' }
}

// Standard PDF "open parameters" (originally defined by Adobe) asking the
// viewer to start with its side panel (thumbnails/outline) closed:
// - navpanes=0  → honoured by Chromium-based viewers (Chrome, Edge) and Acrobat
// - pagemode=none → honoured by PDF.js (Firefox)
// Viewers that do not support them simply ignore the fragment. Page
// navigation, scrolling and zoom remain the viewer's own controls.
export const PDF_VIEWER_PARAMS = '#navpanes=0&pagemode=none'

export function getPdfViewerUrl(url) {
  return `${url}${PDF_VIEWER_PARAMS}`
}
