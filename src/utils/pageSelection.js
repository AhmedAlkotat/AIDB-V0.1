// Page selection for multi-page documents (pure functions, no UI).
//
// Users type page numbers and ranges such as "1-3, 5, 8". Arabic-Indic
// digits ("١-٣، ٥") and the Arabic comma are accepted too. Page numbers are
// 1-based. The result is always a sorted list of unique pages.

// Error codes. The UI maps each code to a translated message.
export const PAGE_SELECTION_ERROR = Object.freeze({
  empty: 'empty',
  invalidFormat: 'invalidFormat',
  outOfRange: 'outOfRange',
  reversedRange: 'reversedRange',
  duplicate: 'duplicate',
})

export const PAGE_SELECTION_MODE = Object.freeze({
  all: 'all',
  selected: 'selected',
})

// Arabic-Indic (U+0660–0669) and Extended Arabic-Indic / Persian
// (U+06F0–06F9) digits → ASCII digits.
function toAsciiDigits(text) {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0)
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660))
  })
}

// Hyphen, minus sign, en dash, em dash → "-"; Arabic comma/semicolon → ",".
function normalizeSeparators(text) {
  return text
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[،؛;，]/g, ',')
}

const NUMBER_PATTERN = /^\d+$/

// Parses `input` for a document with `totalPages` pages. Returns
//   { ok: true, pages: number[] }          (sorted, unique, 1..totalPages)
//   { ok: false, error, page?, token? }    (`error` is a PAGE_SELECTION_ERROR)
// The first problem found is reported, in the order the user typed it.
export function parsePageSelection(input, totalPages) {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new RangeError('parsePageSelection expects a positive integer page count.')
  }

  const normalized = normalizeSeparators(toAsciiDigits(String(input ?? '')))
    // "1 - 3" → "1-3" so the space does not split the range.
    .replace(/\s*-\s*/g, '-')
    .trim()
  if (normalized === '') return { ok: false, error: PAGE_SELECTION_ERROR.empty }

  const tokens = normalized.split(/[\s,]+/).filter(Boolean)
  if (tokens.length === 0) return { ok: false, error: PAGE_SELECTION_ERROR.empty }

  const seen = new Set()
  for (const token of tokens) {
    const parts = token.split('-')
    if (parts.length > 2 || !parts.every((part) => NUMBER_PATTERN.test(part))) {
      return { ok: false, error: PAGE_SELECTION_ERROR.invalidFormat, token }
    }

    const start = Number(parts[0])
    const end = parts.length === 2 ? Number(parts[1]) : start
    // Checked before expanding so "1-999999999" cannot allocate a huge list.
    for (const page of [start, end]) {
      if (page < 1 || page > totalPages) {
        return { ok: false, error: PAGE_SELECTION_ERROR.outOfRange, page, token }
      }
    }
    if (start > end) {
      return { ok: false, error: PAGE_SELECTION_ERROR.reversedRange, token }
    }

    for (let page = start; page <= end; page += 1) {
      if (seen.has(page)) {
        return { ok: false, error: PAGE_SELECTION_ERROR.duplicate, page, token }
      }
      seen.add(page)
    }
  }

  return { ok: true, pages: [...seen].sort((a, b) => a - b) }
}

// [1, 2, …, totalPages]
export function getAllPages(totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
}

// Groups sorted unique pages into ranges: [1,2,3,5] → [[1,3],[5,5]].
export function groupPageRanges(pages) {
  const ranges = []
  for (const page of pages) {
    const last = ranges.at(-1)
    if (last && page === last[1] + 1) last[1] = page
    else ranges.push([page, page])
  }
  return ranges
}

// Readable summary, e.g. "1–3, 5". `formatNumber` localizes the digits and
// `separator` is the list separator of the current language.
export function formatPageRanges(pages, { formatNumber = String, separator = ', ' } = {}) {
  return groupPageRanges(pages)
    .map(([start, end]) => (start === end ? formatNumber(start) : `${formatNumber(start)}–${formatNumber(end)}`))
    .join(separator)
}
