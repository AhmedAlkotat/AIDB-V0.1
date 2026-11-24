// Stable identifiers for documents, pages, elements, table rows and cells.
// IDs are opaque: they never encode position, so they survive edits,
// reordering, undo/redo and JSON round trips.
//
// Generating an ID is impure, so functions that create IDs take an optional
// `generateId` (prefix) => string. Tests inject a sequential generator.

export function generateId(prefix = 'id') {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}_${uuid}`
  // crypto.randomUUID needs a secure context (https or localhost).
  const random = Math.random().toString(36).slice(2, 12)
  return `${prefix}_${Date.now().toString(36)}${random}`
}

// Deterministic generator for tests: doc_1, el_2, el_3, ...
export function createSequentialIdGenerator(start = 1) {
  let next = start
  return (prefix = 'id') => {
    const id = `${prefix}_${next}`
    next += 1
    return id
  }
}
