// Search inside the extracted content of ONE page (never the whole document).
//
// Matching is deliberately flexible for Arabic and happens ONLY here: the
// stored text, the original extraction and the JSON are never normalized.
// Both the query and the searched text go through the same normalization:
//   - diacritics (tashkeel) and tatweel are ignored;
//   - alef variants (أ إ آ ٱ) -> alef (ا);
//   - alef maqsura (ى) -> yaa (ي);
//   - taa marbuta (ة) -> haa (ه);
//   - hamza on waw (ؤ) -> waw (و), hamza on yaa (ئ) -> yaa (ي);
//   - Arabic-Indic digits -> ASCII digits, and Latin case is ignored.
// A bare hamza (ء) is NOT changed. Match ranges refer to the ORIGINAL
// text so they can be highlighted exactly.

const ALEF_VARIANTS = /[آأإٱ]/
const DIACRITICS = /[ً-ٰٟۖ-ۭ]/
const TATWEEL = 'ـ'

function normalizeChar(char) {
  if (char === TATWEEL || DIACRITICS.test(char)) return ''
  if (ALEF_VARIANTS.test(char)) return 'ا'
  if (char === 'ى') return 'ي' // alef maqsura -> yaa
  if (char === 'ة') return 'ه' // taa marbuta -> haa
  if (char === 'ؤ') return 'و' // hamza on waw -> waw
  if (char === 'ئ') return 'ي' // hamza on yaa -> yaa
  const code = char.charCodeAt(0)
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660)
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0)
  return char.toLowerCase()
}

// Normalized text plus, for each normalized character, its index in the original.
function normalizeWithMap(text) {
  let normalized = ''
  const map = []
  for (let index = 0; index < text.length; index += 1) {
    const piece = normalizeChar(text[index])
    for (const char of piece) {
      normalized += char
      map.push(index)
    }
  }
  return { normalized, map }
}

export function normalizeForSearch(text) {
  return normalizeWithMap(text).normalized
}

// Non-overlapping [{ start, end }] ranges (end exclusive) in the ORIGINAL text.
export function findTextMatches(text, query) {
  const needle = normalizeForSearch(query.trim())
  if (needle === '') return []
  const { normalized, map } = normalizeWithMap(text)
  const ranges = []
  let from = 0
  while (from <= normalized.length - needle.length) {
    const at = normalized.indexOf(needle, from)
    if (at === -1) break
    ranges.push({ start: map[at], end: map[at + needle.length - 1] + 1 })
    from = at + needle.length
  }
  return ranges
}

// Searchable text fields of an element: [{ field, text }].
// `field` identifies the input: 'text', 'key', 'value', or `cell:<cellId>`.
export function getElementSearchFields(element) {
  const { content } = element
  switch (element.type) {
    case 'heading':
    case 'paragraph':
      return [{ field: 'text', text: content.text }]
    case 'field':
      return [
        { field: 'key', text: content.key },
        { field: 'value', text: content.value },
      ]
    case 'table':
      return content.rows.flatMap((row) => row.cells.map((cell) => ({ field: `cell:${cell.id}`, text: cell.text })))
    case 'unclassified':
      return [{ field: 'text', text: content.text }]
    default:
      return []
  }
}

// Searches one page's elements. Returns
//   { query, total, matchedElementIds: Set, byElement: { [id]: { count, fields: { [field]: ranges } } } }
export function searchPageElements(elements, query) {
  const result = { query, total: 0, matchedElementIds: new Set(), byElement: {} }
  if (typeof query !== 'string' || query.trim() === '') return result

  for (const element of elements) {
    const fields = {}
    let count = 0
    for (const { field, text } of getElementSearchFields(element)) {
      const ranges = findTextMatches(text, query)
      if (ranges.length > 0) {
        fields[field] = ranges
        count += ranges.length
      }
    }
    if (count > 0) {
      result.byElement[element.id] = { count, fields }
      result.matchedElementIds.add(element.id)
      result.total += count
    }
  }
  return result
}

// Splits text into [{ text, match }] segments for highlighting.
export function splitByRanges(text, ranges) {
  const segments = []
  let cursor = 0
  for (const { start, end } of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false })
    segments.push({ text: text.slice(start, end), match: true })
    cursor = end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false })
  return segments
}
