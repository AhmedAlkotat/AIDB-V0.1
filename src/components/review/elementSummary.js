// Short plain-text summaries of canonical elements, for read-only views such as
// the comparison of a re-extraction with the current content.

const MAX_LENGTH = 160

// Anything that is not a string (malformed data) counts as empty text.
const asText = (value) => (typeof value === 'string' ? value : '')
const clip = (text) => (text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text)

const KNOWN_TYPES = new Set(['heading', 'paragraph', 'table', 'field', 'unclassified'])

// Returns { type, text } where `text` is language-neutral content only. Never
// throws: data that does not have the canonical shape gets an empty summary
// (candidates are validated before they are kept, this is the last safety net).
export function summarizeElement(element) {
  try {
    return summarizeKnownElement(element)
  } catch {
    return { type: KNOWN_TYPES.has(element?.type) ? element.type : 'unclassified', text: '' }
  }
}

function summarizeKnownElement(element) {
  const { content } = element
  switch (element.type) {
    case 'heading':
    case 'paragraph':
    case 'unclassified':
      return { type: element.type, text: clip(asText(content.text)) }
    case 'field':
      return { type: element.type, text: clip(`${asText(content.key)}: ${asText(content.value)}`) }
    case 'table': {
      const rows = content.rows.length
      const columns = content.rows[0].cells.length
      const firstRow = content.rows[0].cells.map((cell) => asText(cell.text)).join(' | ')
      return { type: element.type, text: clip(`${rows}×${columns} — ${firstRow}`) }
    }
    default:
      return { type: 'unclassified', text: '' }
  }
}
