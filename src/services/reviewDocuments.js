// Creates a review document from the upload page's processing request (the
// Task 1 request: the complete original file plus the selected page numbers).
// The file is kept in memory next to the record; only plain data goes into the
// canonical snapshot. Frontend-only: nothing is sent anywhere.

import { createDocumentFromRequest } from '../domain/document/document.js'
import { serializeDocument } from '../domain/document/serialization.js'

export function createReviewDocumentFromRequest(store, request) {
  const document = createDocumentFromRequest(request)
  return store.create({
    name: request.fileName,
    file: request.file,
    snapshot: serializeDocument(document, { includeOriginalExtraction: true }),
    kind: 'upload',
    usesMockProcessing: true,
  })
}
