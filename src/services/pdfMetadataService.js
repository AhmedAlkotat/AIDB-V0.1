// Reads PDF metadata (currently the page count) locally in the browser with
// Mozilla PDF.js. Nothing is uploaded: the file's bytes are copied into
// memory and parsed in a Web Worker. The original File is never modified.
//
// Offline: both PDF.js and its worker are bundled by Vite (the `?url` import
// emits the worker as a local asset). No CDN or network request is used.
// PDF.js is loaded lazily, only when a PDF is selected, so it does not add to
// the initial page load.
//
// The "legacy" PDF.js build is used on purpose: the modern build needs newer
// JavaScript features (e.g. Uint8Array.prototype.toHex, Chrome 140+) and
// fails on older browsers, while the legacy build includes the polyfills.

export const PDF_METADATA_ERROR = Object.freeze({
  // Password-protected: blocked in this phase.
  encrypted: 'encrypted',
  // Not a readable PDF (corrupt, truncated, or renamed file).
  invalid: 'invalid',
  // Unexpected problem (e.g. the PDF reader failed to load). Can be retried.
  failed: 'failed',
})

export class PdfMetadataError extends Error {
  constructor(code, cause) {
    super(`Could not read PDF metadata (${code}).`, { cause })
    this.name = 'PdfMetadataError'
    this.code = code
  }
}

function createAbortError() {
  return new DOMException('PDF metadata reading was cancelled.', 'AbortError')
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
}

// Maps PDF.js exceptions (re-created on the main thread, so compared by
// name) to PDF_METADATA_ERROR codes.
function toMetadataError(error) {
  if (error instanceof PdfMetadataError) return error
  switch (error?.name) {
    case 'PasswordException':
      return new PdfMetadataError(PDF_METADATA_ERROR.encrypted, error)
    case 'InvalidPDFException':
    case 'FormatError':
      return new PdfMetadataError(PDF_METADATA_ERROR.invalid, error)
    default:
      return new PdfMetadataError(PDF_METADATA_ERROR.failed, error)
  }
}

// Core logic, independent of how PDF.js is loaded (so it can also run under
// Node for testing). `pdfjs` is the PDF.js module.
export async function readPdfPageCountWith(pdfjs, file, { signal } = {}) {
  if (!(file instanceof Blob)) throw new TypeError('readPdfPageCount expects a File.')
  if (signal?.aborted) throw createAbortError()

  // A copy: PDF.js transfers this buffer to its worker.
  const data = new Uint8Array(await file.arrayBuffer())
  if (signal?.aborted) throw createAbortError()

  const loadingTask = pdfjs.getDocument({
    data,
    // Only metadata is needed: no fonts, images, scripts or XFA forms.
    useWasm: false,
    enableXfa: false,
    stopAtErrors: false,
  })
  const cancel = () => loadingTask.destroy()
  signal?.addEventListener('abort', cancel, { once: true })

  try {
    const pdf = await loadingTask.promise
    if (signal?.aborted) throw createAbortError()
    const pageCount = pdf.numPages
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new PdfMetadataError(PDF_METADATA_ERROR.invalid)
    }
    return { pageCount }
  } catch (error) {
    if (signal?.aborted) throw createAbortError()
    throw toMetadataError(error)
  } finally {
    signal?.removeEventListener('abort', cancel)
    // Releases the document and terminates its worker.
    loadingTask.destroy()
  }
}

let pdfjsPromise = null

function loadPdfjs() {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
    .then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
    .catch((error) => {
      // Allow a later retry (e.g. after a failed chunk load).
      pdfjsPromise = null
      throw error
    })
  return pdfjsPromise
}

// Returns { pageCount }. Rejects with PdfMetadataError, or with an
// AbortError when `signal` is aborted (e.g. the file was replaced).
export async function readPdfPageCount(file, options = {}) {
  let pdfjs
  try {
    pdfjs = await loadPdfjs()
  } catch (error) {
    throw new PdfMetadataError(PDF_METADATA_ERROR.failed, error)
  }
  return readPdfPageCountWith(pdfjs, file, options)
}
