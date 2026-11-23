import { useCallback, useEffect, useState } from 'react'
import { isAbortError, readPdfPageCount } from '../services/pdfMetadataService.js'

export const PDF_PAGE_COUNT_STATUS = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  error: 'error',
})

// Reads the page count of `file` (a PDF File, or null for none).
// Returns { status, pageCount, errorCode, retry } where `status` is one of
// PDF_PAGE_COUNT_STATUS and `errorCode` one of PDF_METADATA_ERROR.
// When `file` changes, the previous read is cancelled and its result
// ignored, so a slow read can never overwrite a newer file's state.
export function usePdfPageCount(file) {
  const [attempt, setAttempt] = useState(0)
  // Result of the last finished read, tagged with the file and attempt it
  // belongs to. Anything else means a read is in progress.
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!file) return undefined
    const controller = new AbortController()

    readPdfPageCount(file, { signal: controller.signal })
      .then(({ pageCount }) => {
        setResult({ file, attempt, status: PDF_PAGE_COUNT_STATUS.ready, pageCount, errorCode: null })
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return
        setResult({ file, attempt, status: PDF_PAGE_COUNT_STATUS.error, pageCount: null, errorCode: error.code })
      })

    return () => controller.abort()
  }, [file, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  if (!file) {
    return { status: PDF_PAGE_COUNT_STATUS.idle, pageCount: null, errorCode: null, retry }
  }
  if (!result || result.file !== file || result.attempt !== attempt) {
    return { status: PDF_PAGE_COUNT_STATUS.loading, pageCount: null, errorCode: null, retry }
  }
  return { status: result.status, pageCount: result.pageCount, errorCode: result.errorCode, retry }
}
