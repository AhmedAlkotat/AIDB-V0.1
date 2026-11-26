// Creates a review document from the upload page's processing request (the
// Task 1 request: the complete original file plus the selected page numbers).
// The file is kept in memory next to the record; only plain data goes into the
// canonical snapshot. Frontend-only: nothing is sent anywhere.

import { createDocumentFromRequest } from '../domain/document/document.js'
import { serializeDocument } from '../domain/document/serialization.js'

// `ownerId` is the uploading user, so each user's documents can be listed separately.
// `workflow` (optional) is the document-level processing state the record starts in: a document
// registered by "Start processing" starts Pending (decision 41); without it the record starts as
// an already processed one (older callers). `documentType` / `template` are what the processing
// recognised, when it recognised anything (an unknown layout is fine).
export function createReviewDocumentFromRequest(store, request, { ownerId = null, workflow, documentType = null, template = null } = {}) {
  const document = createDocumentFromRequest(request)
  return store.create({
    name: request.fileName,
    file: request.file,
    snapshot: serializeDocument(document, { includeOriginalExtraction: true }),
    kind: 'upload',
    ownerId,
    usesMockProcessing: true,
    workflow,
    documentType,
    template,
  })
}
