// The translation key of why a document's processing failed. Codes come from the processing service (the
// development simulation today, the real AI service later); an unknown one reads as a generic failure.
const KNOWN = ['CANCELLED', 'MOCK_OCR_FAILED', 'PROCESSING_FAILED', 'INVALID_EXTRACTION_RESULT', 'PROCESSING_INTERRUPTED']

export const failureMessageKey = (code) => `documents.failure.${KNOWN.includes(code) ? code : 'unknown'}`
