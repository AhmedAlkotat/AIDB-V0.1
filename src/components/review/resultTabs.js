// The four approved result tabs of the review (decision 4): Texts, Tables, Fields and JSON.
//
// Every tab works on the SAME page content (the canonical document); nothing is copied, so the
// JSON can never differ from what the other tabs show. Which elements a tab shows:
//   texts   headings and paragraphs, plus any content the model could not classify (it is never lost:
//           it stays on the page, in this tab and in the JSON)
//   tables  tables
//   fields  fields (key and value)
//   json    the read-only JSON of the current page
export const RESULT_TABS = Object.freeze([
  { id: 'texts', types: ['heading', 'paragraph', 'unclassified'] },
  { id: 'tables', types: ['table'] },
  { id: 'fields', types: ['field'] },
  { id: 'json', types: null },
])
