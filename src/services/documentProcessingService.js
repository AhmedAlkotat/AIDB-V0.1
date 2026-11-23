// Integration point for AI document processing (OCR, classification,
// extraction). NOT CONNECTED in this phase: no request is sent, nothing is
// processed or stored, and no result is ever fabricated.
//
// Later phase: replace the body of submitDocumentForProcessing with the real
// API call (e.g. POST multipart/form-data with `request.file` plus the page
// selection as a field) and resolve with the server's response. Callers
// already handle ProcessingNotConnectedError separately. API keys must stay on
// the backend, never in this frontend code.

import { PAGE_SELECTION_MODE } from '../utils/pageSelection.js'

export const PROCESSING_NOT_CONNECTED = 'PROCESSING_NOT_CONNECTED'

export class ProcessingNotConnectedError extends Error {
  constructor() {
    super('AI document processing is not connected yet.')
    this.name = 'ProcessingNotConnectedError'
    this.code = PROCESSING_NOT_CONNECTED
  }
}

export const isProcessingServiceConnected = false

function isValidPageList(pages, totalPages) {
  return (
    Array.isArray(pages) &&
    pages.length > 0 &&
    pages.every(
      (page, index) =>
        Number.isInteger(page) && page >= 1 && page <= totalPages && (index === 0 || page > pages[index - 1]),
    )
  )
}

// Builds the frontend processing request.
//
// - `file`: the ORIGINAL selected File, passed through unchanged. For PDFs it
//   is always the complete document, even when only some pages are selected.
// - `pageSelection.pages`: the 1-based page numbers to process, sorted and
//   unique, stored separately from the file. Pages not listed are simply not
//   requested; they are not failures.
// - Images are single-page documents (totalPages = 1, pages = [1]).
//
// Shape:
// {
//   file, fileName, mimeType, fileSize,
//   documentKind: 'pdf' | 'image',
//   totalPages,
//   pageSelection: { mode: 'all' | 'selected', pages: number[] },
// }
export function createProcessingRequest({ file, documentKind, totalPages, mode, pages }) {
  if (!(file instanceof Blob)) throw new TypeError('createProcessingRequest expects a File.')
  if (documentKind !== 'pdf' && documentKind !== 'image') {
    throw new TypeError('createProcessingRequest expects documentKind "pdf" or "image".')
  }
  if (!Number.isInteger(totalPages) || totalPages < 1 || (documentKind === 'image' && totalPages !== 1)) {
    throw new RangeError('createProcessingRequest received an invalid page count.')
  }
  if (!Object.values(PAGE_SELECTION_MODE).includes(mode)) {
    throw new TypeError('createProcessingRequest received an invalid page selection mode.')
  }
  if (!isValidPageList(pages, totalPages)) {
    throw new RangeError('createProcessingRequest received an invalid page list.')
  }
  if (mode === PAGE_SELECTION_MODE.all && pages.length !== totalPages) {
    throw new RangeError('"all" mode must list every page.')
  }

  return Object.freeze({
    file,
    fileName: file.name ?? '',
    mimeType: file.type ?? '',
    fileSize: file.size,
    documentKind,
    totalPages,
    pageSelection: Object.freeze({ mode, pages: Object.freeze([...pages]) }),
  })
}

export function submitDocumentForProcessing(request) {
  if (!(request?.file instanceof Blob)) {
    return Promise.reject(new TypeError('submitDocumentForProcessing expects a processing request.'))
  }
  return Promise.reject(new ProcessingNotConnectedError())
}
