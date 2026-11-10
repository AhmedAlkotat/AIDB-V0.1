// Integration point for AI document processing (OCR, classification,
// extraction). NOT CONNECTED in this phase: no request is sent, nothing is
// processed or stored, and no result is ever fabricated.
//
// Later phase: replace the body of submitDocumentForProcessing with the real
// API call (e.g. POST multipart/form-data) and resolve with the server's
// response. Callers already handle ProcessingNotConnectedError separately.

export const PROCESSING_NOT_CONNECTED = 'PROCESSING_NOT_CONNECTED'

export class ProcessingNotConnectedError extends Error {
  constructor() {
    super('AI document processing is not connected yet.')
    this.name = 'ProcessingNotConnectedError'
    this.code = PROCESSING_NOT_CONNECTED
  }
}

export const isProcessingServiceConnected = false

export function submitDocumentForProcessing(file) {
  if (!(file instanceof Blob)) {
    return Promise.reject(new TypeError('submitDocumentForProcessing expects a File.'))
  }
  return Promise.reject(new ProcessingNotConnectedError())
}
