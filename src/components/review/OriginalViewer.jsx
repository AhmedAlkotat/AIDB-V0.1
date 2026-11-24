import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { openPdfDocument } from '../../services/pdfDocumentService.js'
import { Icon } from '../common/Icon.jsx'
import { getImageLayout } from './imageLayout.js'
import { PreviewMessage } from '../upload/PreviewMessage.jsx'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
const RENDER_DELAY_MS = 90

const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

// Opens the PDF once and releases it when the file changes or the viewer goes away.
function usePdfDocument(file, isPdf) {
  const [state, setState] = useState({ status: 'loading', doc: null, error: null })

  useEffect(() => {
    if (!file || !isPdf) return undefined
    let cancelled = false
    let opened = null
    openPdfDocument(file).then(
      (doc) => {
        if (cancelled) {
          doc.destroy()
          return
        }
        opened = doc
        setState({ status: 'ready', doc, error: null })
      },
      (error) => {
        if (!cancelled) setState({ status: 'error', doc: null, error })
      },
    )
    return () => {
      cancelled = true
      opened?.destroy()
      setState({ status: 'loading', doc: null, error: null })
    }
  }, [file, isPdf])

  return state
}

// Points an <img> at the file through a temporary object URL, released afterwards.
function useImageFile(imageRef, file, enabled) {
  useEffect(() => {
    const image = imageRef.current
    if (!file || !enabled || !image) return undefined
    const url = URL.createObjectURL(file)
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [imageRef, file, enabled])
}

// The ORIGINAL page next to the editor. Shows one page at a time (a PDF is parsed
// once and only the visible page is rendered), with zoom, pan (drag or
// scroll), reset and a display-only rotation. Nothing here changes the file.
export function OriginalViewer({ file, pageNumber }) {
  const { t } = useTranslation()
  const isPdf = Boolean(file) && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
  const pdf = usePdfDocument(file, isPdf)

  const containerRef = useRef(null)
  const imageRef = useRef(null)
  useImageFile(imageRef, file, Boolean(file) && !isPdf)
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [renderState, setRenderState] = useState('idle') // idle | rendering | ready | error
  const [isGrabbing, setIsGrabbing] = useState(false)
  const [naturalSize, setNaturalSize] = useState(null) // { file, width, height } of the loaded image

  const resetView = useCallback(() => {
    setZoom(1)
    setRotation(0)
    const container = containerRef.current
    if (container) {
      container.scrollLeft = 0
      container.scrollTop = 0
    }
  }, [])

  // A new page starts from the fitted view (the display rotation is kept: a
  // scan that is sideways is usually sideways on every page).
  const [shownPage, setShownPage] = useState(pageNumber)
  if (shownPage !== pageNumber) {
    setShownPage(pageNumber)
    setZoom(1)
  }
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.scrollLeft = 0
      container.scrollTop = 0
    }
  }, [pageNumber])

  // Follow the size of the panel (it can be resized with the divider).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    let timer = null
    const observer = new ResizeObserver(([entry]) => {
      clearTimeout(timer)
      timer = setTimeout(() => setContainerWidth(Math.floor(entry.contentRect.width)), 120)
    })
    observer.observe(container)
    setContainerWidth(Math.floor(container.clientWidth))
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  // Render the current page (fit-to-width x zoom). A newer request cancels the old one.
  useEffect(() => {
    const doc = pdf.doc
    const canvas = canvasRef.current
    if (!doc || !canvas || containerWidth <= 0) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        setRenderState('rendering')
        const base = await doc.getPageSize(pageNumber, rotation)
        if (cancelled) return
        const fitScale = Math.max(0.1, (containerWidth - 32) / base.width)
        const size = await doc.renderPage({
          pageNumber,
          canvas,
          scale: fitScale * zoom,
          rotation,
          devicePixelRatio: window.devicePixelRatio || 1,
        })
        if (!cancelled && size) setRenderState('ready')
      } catch {
        if (!cancelled) setRenderState('error')
      }
    }, RENDER_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pdf.doc, pageNumber, zoom, rotation, containerWidth])

  function handlePointerDown(event) {
    const container = containerRef.current
    if (event.button !== 0 || !container) return
    if (container.scrollWidth <= container.clientWidth && container.scrollHeight <= container.clientHeight) return
    dragRef.current = { x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop }
    container.setPointerCapture(event.pointerId)
    setIsGrabbing(true)
  }

  function handlePointerMove(event) {
    const drag = dragRef.current
    const container = containerRef.current
    if (!drag || !container) return
    container.scrollLeft = drag.left - (event.clientX - drag.x)
    container.scrollTop = drag.top - (event.clientY - drag.y)
  }

  function endDrag(event) {
    if (!dragRef.current) return
    dragRef.current = null
    setIsGrabbing(false)
    containerRef.current?.releasePointerCapture?.(event.pointerId)
  }

  function renderBody() {
    if (!file) {
      return <PreviewMessage icon="fileWarning" title={t('review.viewer.noFileTitle')} text={t('review.viewer.noFileText')} />
    }
    if (isPdf && pdf.status === 'error') {
      return (
        <PreviewMessage
          icon="fileWarning"
          title={t('review.viewer.errorTitle')}
          text={t(`review.viewer.errors.${pdf.error?.code ?? 'failed'}`)}
        />
      )
    }
    if (isPdf) {
      return (
        <div className="original-viewer__page">
          <canvas ref={canvasRef} aria-label={t('review.viewer.canvasLabel', { page: pageNumber })} role="img" />
        </div>
      )
    }
    // The box reserved for the picture has the size of the ROTATED image (see imageLayout.js);
    // until the image has loaded its size is unknown and it is shown unrotated at fit width.
    const natural = naturalSize?.file === file ? naturalSize : null
    const fitWidth = Math.max(0, containerWidth - 32)
    const layout = natural
      ? getImageLayout({ naturalWidth: natural.width, naturalHeight: natural.height, fitWidth, zoom, rotation })
      : null
    return (
      <div className="original-viewer__page">
        <div
          className="original-viewer__image-box"
          style={layout ? { width: `${layout.boxWidth}px`, height: `${layout.boxHeight}px` } : { width: `${fitWidth * zoom}px` }}
        >
          <img
            ref={imageRef}
            alt={t('review.viewer.canvasLabel', { page: pageNumber })}
            draggable={false}
            onLoad={(event) => setNaturalSize({ file, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            style={
              layout
                ? { width: `${layout.imageWidth}px`, height: `${layout.imageHeight}px`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }
                : { width: '100%' }
            }
          />
        </div>
      </div>
    )
  }

  const canInteract = Boolean(file) && (!isPdf || pdf.status === 'ready')
  const zoomLabel = `${Math.round(zoom * 100)}%`

  return (
    <section className="card original-viewer" aria-labelledby="original-viewer-title">
      <div className="original-viewer__header">
        <h3 id="original-viewer-title">{t('review.viewer.title')}</h3>
        <div className="viewer-toolbar" role="toolbar" aria-label={t('review.viewer.toolbar')}>
          <button type="button" className="icon-button" disabled={!canInteract || zoom <= MIN_ZOOM} aria-label={t('review.viewer.zoomOut')} onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}>
            <Icon name="zoomOut" size={18} />
          </button>
          <span className="viewer-toolbar__level" aria-live="polite">
            {t('review.viewer.zoomLevel')} {zoomLabel}
          </span>
          <button type="button" className="icon-button" disabled={!canInteract || zoom >= MAX_ZOOM} aria-label={t('review.viewer.zoomIn')} onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}>
            <Icon name="zoomIn" size={18} />
          </button>
          <button type="button" className="icon-button" disabled={!canInteract} aria-label={t('review.viewer.rotate')} title={t('review.viewer.rotateHint')} onClick={() => setRotation((r) => (r + 90) % 360)}>
            <Icon name="rotate" size={18} />
          </button>
          <button type="button" className="button button--secondary button--sm" disabled={!canInteract} onClick={resetView}>
            <Icon name="fit" size={16} />
            {t('review.viewer.reset')}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`original-viewer__frame${isGrabbing ? ' is-grabbing' : ''}`}
        tabIndex={0}
        aria-label={t('review.viewer.frameLabel')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {renderBody()}
        {isPdf && pdf.status === 'loading' && (
          <p className="original-viewer__status" role="status">
            <span className="spinner" aria-hidden="true" />
            {t('review.viewer.loading')}
          </p>
        )}
        {isPdf && pdf.status === 'ready' && renderState === 'error' && (
          <p className="original-viewer__status original-viewer__status--error" role="alert">
            {t('review.viewer.renderError')}
          </p>
        )}
      </div>
      <p className="original-viewer__hint">{t('review.viewer.hint')}</p>
    </section>
  )
}
