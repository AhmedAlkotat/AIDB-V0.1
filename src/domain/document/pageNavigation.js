// Navigation over the SELECTED pages of a document. Unselected pages are never
// reachable and never counted. All functions work on the sorted
// `document.selectedPages` array, so they stay fast for 1,000-page documents
// (binary search, no per-page rendering or mounting).

export const NAVIGATION = Object.freeze({ previous: -1, next: 1 })

// Index of `pageNumber` in the ascending `selectedPages`, or -1.
export function getSelectedPageIndex(selectedPages, pageNumber) {
  let low = 0
  let high = selectedPages.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const value = selectedPages[middle]
    if (value === pageNumber) return middle
    if (value < pageNumber) low = middle + 1
    else high = middle - 1
  }
  return -1
}

// The neighbouring selected page, or null at either end.
export function getAdjacentPage(selectedPages, pageNumber, direction) {
  const index = getSelectedPageIndex(selectedPages, pageNumber)
  if (index === -1) return null
  return selectedPages[index + direction] ?? null
}

function toAsciiDigits(text) {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0)
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660))
  })
}

// Validates typed "go to page" input (original PDF page number; Arabic digits
// accepted). Returns { ok: true, pageNumber } or { ok: false, reason } with
// reason 'empty' | 'invalid' | 'notSelected'.
export function resolvePageJump(selectedPages, input) {
  const text = toAsciiDigits(String(input ?? '')).trim()
  if (text === '') return { ok: false, reason: 'empty' }
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'invalid' }
  const pageNumber = Number(text)
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) return { ok: false, reason: 'invalid' }
  if (getSelectedPageIndex(selectedPages, pageNumber) === -1) return { ok: false, reason: 'notSelected' }
  return { ok: true, pageNumber }
}

// A window of the selected pages for list views: { pages, from, to, total, pageCount }.
export function getPageListWindow(selectedPages, windowIndex, windowSize = 50) {
  const total = selectedPages.length
  const pageCount = Math.max(1, Math.ceil(total / windowSize))
  const safeIndex = Math.min(Math.max(0, windowIndex), pageCount - 1)
  const from = safeIndex * windowSize
  const to = Math.min(total, from + windowSize)
  return { pages: selectedPages.slice(from, to), from, to, total, pageCount, windowIndex: safeIndex }
}
