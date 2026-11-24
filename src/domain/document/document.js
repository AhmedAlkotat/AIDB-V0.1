// Creating the canonical document and its page records.
//
// Document shape:
//   {
//     schemaVersion, id,
//     file:          { name, size, mimeType, lastModified, totalPages },
//     selectedPages: [original PDF page numbers, ascending],
//     pages: [ one record per SELECTED page, ascending ]
//   }
// Page record:
//   {
//     id, pageNumber (original PDF numbering),
//     processing:         { status, errorCode },
//     review:             { status, confirmedAt },
//     originalExtraction: null | { elements }   preserved AI output (read-only)
//     elements:           corrected working content, in reading order
//   }
// Pages that were not selected have no record: they are neither failed nor
// unreviewed, they are simply outside this document's scope. Images are
// single-page documents (totalPages 1).

import { collectElementIds } from './elements.js'
import { ERROR_CODE, fail } from './errors.js'
import { generateId as defaultGenerateId } from './ids.js'
import { PROCESSING_STATUS, REVIEW_STATUS, SCHEMA_VERSION } from './schema.js'
import { validateDocument } from './validation.js'

export function createPage(pageNumber, { generateId = defaultGenerateId } = {}) {
  return {
    id: generateId('page'),
    pageNumber,
    processing: { status: PROCESSING_STATUS.notProcessed, errorCode: null },
    review: { status: REVIEW_STATUS.notReviewed, confirmedAt: null },
    originalExtraction: null,
    elements: [],
  }
}

// `file`: { name, size, mimeType, lastModified? }. `selectedPages` defaults to
// every page. Invalid input is rejected, never repaired.
export function createDocument({ id, file, totalPages, selectedPages }, { generateId = defaultGenerateId } = {}) {
  const pages = selectedPages ?? (Number.isInteger(totalPages) && totalPages >= 1
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : selectedPages)

  const document = {
    schemaVersion: SCHEMA_VERSION,
    id: id ?? generateId('doc'),
    file: {
      name: file?.name,
      size: file?.size,
      mimeType: file?.mimeType ?? '',
      lastModified: file?.lastModified ?? null,
      totalPages,
    },
    selectedPages: Array.isArray(pages) ? [...pages] : pages,
    pages: Array.isArray(pages) ? pages.map((pageNumber) => createPage(pageNumber, { generateId })) : [],
  }

  const result = validateDocument(document)
  if (!result.valid) fail(ERROR_CODE.invalidDocument, 'The document is not valid.', { errors: result.errors })
  return document
}

// Builds a document from the frontend processing request of Task 1
// (createProcessingRequest): the original file's metadata plus the selected
// page numbers. Only plain fields are read; the File itself is not stored.
export function createDocumentFromRequest(request, options) {
  return createDocument(
    {
      file: {
        name: request?.fileName,
        size: request?.fileSize,
        mimeType: request?.mimeType,
        lastModified: request?.file?.lastModified,
      },
      totalPages: request?.totalPages,
      selectedPages: request?.pageSelection?.pages,
    },
    options,
  )
}

export function findPage(document, pageNumber) {
  return document.pages.find((page) => page.pageNumber === pageNumber)
}

// Returns the page record, or throws PAGE_NOT_SELECTED / PAGE_NOT_FOUND.
export function requirePage(document, pageNumber) {
  const page = Number.isInteger(pageNumber) ? findPage(document, pageNumber) : undefined
  if (page) return page
  const isInDocument = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= document.file.totalPages
  if (isInDocument) {
    fail(ERROR_CODE.pageNotSelected, `Page ${pageNumber} was not selected for processing.`, { pageNumber })
  }
  return fail(ERROR_CODE.pageNotFound, `Page ${pageNumber} does not exist in this document.`, { pageNumber })
}

// Checks the IDs a page edit would introduce against the WHOLE document (its
// own ID, every page ID, and the working elements of all other pages), and
// inside the page itself. `previousElements` -> `nextElements` is the edit.
// Returns the first conflicting ID, or null. IDs that were already on the page
// are never conflicts, so ordinary typing does no document-wide scan.
export function findIdConflict(document, pageNumber, previousElements, nextElements) {
  const nextIds = nextElements.flatMap(collectElementIds)
  const seen = new Set()
  for (const id of nextIds) {
    if (seen.has(id)) return id
    seen.add(id)
  }

  const before = new Set(previousElements.flatMap(collectElementIds))
  const added = nextIds.filter((id) => !before.has(id))
  if (added.length === 0) return null

  const taken = new Set([document.id])
  for (const page of document.pages) {
    taken.add(page.id)
    if (page.pageNumber !== pageNumber) {
      for (const id of page.elements.flatMap(collectElementIds)) taken.add(id)
    }
  }
  return added.find((id) => taken.has(id)) ?? null
}

export function replacePage(document, pageNumber, nextPage) {
  return {
    ...document,
    pages: document.pages.map((page) => (page.pageNumber === pageNumber ? nextPage : page)),
  }
}
