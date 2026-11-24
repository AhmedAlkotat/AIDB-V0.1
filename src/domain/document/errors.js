// Structured errors for the canonical document model. `code` is stable and
// machine-readable (a later UI phase translates it); `message` is a developer
// message in English; `details` carries data such as validation errors or a
// conversion preview.

export const ERROR_CODE = Object.freeze({
  // Operations
  invalidArgument: 'INVALID_ARGUMENT',
  invalidDocument: 'INVALID_DOCUMENT',
  invalidElement: 'INVALID_ELEMENT',
  invalidContent: 'INVALID_CONTENT',
  unknownContentField: 'UNKNOWN_CONTENT_FIELD',
  elementNotFound: 'ELEMENT_NOT_FOUND',
  pageNotFound: 'PAGE_NOT_FOUND',
  pageNotSelected: 'PAGE_NOT_SELECTED',
  duplicateId: 'DUPLICATE_ID',
  indexOutOfRange: 'INDEX_OUT_OF_RANGE',
  wrongElementType: 'WRONG_ELEMENT_TYPE',
  tableCellOutOfRange: 'TABLE_CELL_OUT_OF_RANGE',
  lastTableRow: 'LAST_TABLE_ROW',
  lastTableColumn: 'LAST_TABLE_COLUMN',
  sameType: 'SAME_TYPE',
  confirmationRequired: 'CONFIRMATION_REQUIRED',
  invalidConversion: 'INVALID_CONVERSION',
  reviewNotAllowed: 'REVIEW_NOT_ALLOWED',
  unknownAction: 'UNKNOWN_ACTION',
  malformedJson: 'MALFORMED_JSON',
  // Validation
  malformed: 'MALFORMED',
  unsupportedSchemaVersion: 'UNSUPPORTED_SCHEMA_VERSION',
  missingId: 'MISSING_ID',
  missingField: 'MISSING_FIELD',
  unknownKey: 'UNKNOWN_KEY',
  invalidType: 'INVALID_TYPE',
  invalidValue: 'INVALID_VALUE',
  orderMismatch: 'ORDER_MISMATCH',
  invalidTable: 'INVALID_TABLE',
  invalidSelectedPages: 'INVALID_SELECTED_PAGES',
  pageSelectionMismatch: 'PAGE_SELECTION_MISMATCH',
  invalidReviewState: 'INVALID_REVIEW_STATE',
})

export class DocumentOperationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DocumentOperationError'
    this.code = code
    this.details = details
  }

  // Plain object kept in editor state (errors must stay serializable).
  toPlain() {
    return { code: this.code, message: this.message, details: this.details }
  }
}

export function fail(code, message, details) {
  throw new DocumentOperationError(code, message, details)
}
