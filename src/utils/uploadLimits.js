// The Admin's upload limits (decisions 36 and 48), applied to what the user picks. The numbers
// come from the system settings service (`settingsService.getLimits()`), never from a constant
// in the code: the Admin changes them, and the server checks them again (this is only the
// interface's early answer).

export const LIMIT_ERROR = Object.freeze({
  fileTooLarge: 'fileTooLarge',
  tooManyPages: 'tooManyPages',
})

export const BYTES_PER_MB = 1024 * 1024
export const mbToBytes = (megabytes) => megabytes * BYTES_PER_MB

// `limits` = { maxFileSizeMb, maxSelectedPages }. Returns null when fine, otherwise
// { code, max } so the screen can name the limit in its message.
export function checkFileSize(sizeBytes, limits) {
  if (!limits || !Number.isFinite(limits.maxFileSizeMb)) return null
  return sizeBytes > mbToBytes(limits.maxFileSizeMb) ? { code: LIMIT_ERROR.fileTooLarge, max: limits.maxFileSizeMb } : null
}

// The page limit counts the pages SELECTED for processing, independent of the file size and of
// the number of pages the PDF has (decision 48).
export function checkSelectedPageCount(selectedCount, limits) {
  if (!limits || !Number.isFinite(limits.maxSelectedPages)) return null
  return selectedCount > limits.maxSelectedPages ? { code: LIMIT_ERROR.tooManyPages, max: limits.maxSelectedPages, selected: selectedCount } : null
}
