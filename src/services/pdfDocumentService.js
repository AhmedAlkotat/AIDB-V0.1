// Keeps ONE PDF open and renders ONE page at a time onto a canvas, for the
// review page. It reuses the PDF.js dependency and lazy loader of
// pdfMetadataService (bundled locally, works offline).
//
// Large PDFs: the document is parsed once (pages are loaded on demand), only
// the page being shown is rendered, a new render cancels the previous one, and
// the canvas is capped to a maximum number of pixels. Rotation and zoom are
// DISPLAY ONLY: the file is never modified.

import { loadPdfjs } from './pdfMetadataService.js'

const MAX_CANVAS_PIXELS = 16_000_000
const MAX_OUTPUT_SCALE = 2

export const PDF_OPEN_ERROR = Object.freeze({
  encrypted: 'encrypted',
  invalid: 'invalid',
  failed: 'failed',
})

function toOpenError(error) {
  const code =
    error?.name === 'PasswordException'
      ? PDF_OPEN_ERROR.encrypted
      : error?.name === 'InvalidPDFException' || error?.name === 'FormatError'
        ? PDF_OPEN_ERROR.invalid
        : PDF_OPEN_ERROR.failed
  return Object.assign(new Error(`Could not open the PDF (${code}).`, { cause: error }), { code })
}

// Pixel ratio for the canvas: sharp on high-DPI screens, but never above the pixel budget.
export function getOutputScale(viewportWidth, viewportHeight, devicePixelRatio = 1) {
  let scale = Math.min(Math.max(devicePixelRatio, 1), MAX_OUTPUT_SCALE)
  const pixels = viewportWidth * viewportHeight * scale * scale
  if (pixels > MAX_CANVAS_PIXELS) scale = Math.max(0.5, Math.sqrt(MAX_CANVAS_PIXELS / (viewportWidth * viewportHeight)))
  return scale
}

// Resolves { numPages, getPageSize, renderPage, destroy }.
export async function openPdfDocument(file) {
  let task
  let pdf
  try {
    const pdfjs = await loadPdfjs()
    const data = new Uint8Array(await file.arrayBuffer())
    task = pdfjs.getDocument({ data, useWasm: false, enableXfa: false })
    pdf = await task.promise
  } catch (error) {
    task?.destroy()
    throw toOpenError(error)
  }

  let generation = 0
  let activeRender = null

  return {
    numPages: pdf.numPages,

    // Size of a page at scale 1 for the given display rotation (for fitting).
    async getPageSize(pageNumber, rotation = 0) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 })
      return { width: viewport.width, height: viewport.height }
    },

    // Renders into `canvas`. Resolves { width, height } (CSS pixels), or null when
    // a newer render replaced this one.
    async renderPage({ pageNumber, canvas, scale, rotation = 0, devicePixelRatio = 1 }) {
      generation += 1
      const mine = generation
      activeRender?.cancel()
      const page = await pdf.getPage(pageNumber)
      if (mine !== generation) return null

      const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
      // A canvas 2D context draws text in the direction it INHERITS from the page
      // (`ctx.direction` defaults to "inherit"). In the Arabic interface that is rtl, and
      // PDF.js, which positions every glyph itself, then gets its text runs laid out right to
      // left: Arabic letters come apart and spacing is wrong. The page image is LTR geometry
      // by definition (the PDF's own text direction is already in the glyph positions).
      canvas.dir = 'ltr'
      canvas.style.direction = 'ltr'
      // For diagnostics and the browser checks: the exact scale this render used.
      canvas.dataset.renderScale = String(scale)
      const outputScale = getOutputScale(viewport.width, viewport.height, devicePixelRatio)
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      const renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      })
      activeRender = renderTask
      try {
        await renderTask.promise
      } catch (error) {
        if (error?.name === 'RenderingCancelledException') return null
        throw error
      } finally {
        if (activeRender === renderTask) activeRender = null
        page.cleanup()
      }
      return mine === generation ? { width: viewport.width, height: viewport.height } : null
    },

    destroy() {
      generation += 1
      activeRender?.cancel()
      return task.destroy()
    },
  }
}
