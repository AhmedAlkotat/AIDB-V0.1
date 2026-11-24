// Canonical document model: constants (Task 2 / Phase 1).
//
// The canonical model is the single source of truth for a document being
// reviewed. It is provider-independent: nothing here depends on a particular
// OCR/AI response format. Adapters (a later phase) translate provider output
// into this shape.
//
// Schema versioning: SCHEMA_VERSION is bumped whenever the shape changes in a
// way old code cannot read. Validation rejects versions that are not listed in
// SUPPORTED_SCHEMA_VERSIONS; a later phase adds migrations next to this list.

export const SCHEMA_VERSION = '0.1'
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([SCHEMA_VERSION])

export const ELEMENT_TYPES = Object.freeze({
  heading: 'heading',
  paragraph: 'paragraph',
  table: 'table',
  field: 'field',
  unclassified: 'unclassified',
})
export const ELEMENT_TYPE_LIST = Object.freeze(Object.values(ELEMENT_TYPES))

// Where an element's content came from.
export const SOURCE_KINDS = Object.freeze({
  ai: 'ai',
  manual: 'manual',
})
export const SOURCE_KIND_LIST = Object.freeze(Object.values(SOURCE_KINDS))

export const PROCESSING_STATUS = Object.freeze({
  notProcessed: 'notProcessed',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed',
})
export const PROCESSING_STATUS_LIST = Object.freeze(Object.values(PROCESSING_STATUS))

// notReviewed: never confirmed. reviewed: explicitly confirmed and unchanged
// since. invalidated: was confirmed, then the content changed; it needs an
// explicit new confirmation (it never returns to "reviewed" by itself).
export const REVIEW_STATUS = Object.freeze({
  notReviewed: 'notReviewed',
  reviewed: 'reviewed',
  invalidated: 'invalidated',
})
export const REVIEW_STATUS_LIST = Object.freeze(Object.values(REVIEW_STATUS))

export const HEADING_LEVELS = Object.freeze({ min: 1, max: 6 })

// Maximum number of undoable operations kept per page.
export const MAX_UNDO_OPERATIONS = 50
