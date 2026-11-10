import { useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_STEP = 1.25

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

// Image preview with zoom in / zoom out / fit-to-container. Proportions are
// always preserved. `zoom` is null for "fit", otherwise a scale relative to
// the image's natural size (1 = 100%). State lives in the parent so the
// inline and enlarged views stay in sync.
export function ImageViewer({ url, alt, zoom, onZoomChange, naturalSize, onNaturalSize, onError }) {
  const { t, language } = useTranslation()
  const frameRef = useRef(null)

  // Scale the image currently has in "fit" mode (never upscaled).
  function getFitScale() {
    const frame = frameRef.current
    if (!frame || !naturalSize) return 1
    return Math.min(1, frame.clientWidth / naturalSize.width, frame.clientHeight / naturalSize.height)
  }

  function zoomBy(factor) {
    const current = zoom ?? getFitScale()
    onZoomChange(clampZoom(current * factor))
  }

  const isReady = Boolean(naturalSize)
  const zoomLabel =
    zoom === null
      ? t('upload.preview.fit')
      : new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(zoom)

  return (
    <div className="image-viewer">
      <div className="viewer-toolbar" role="toolbar" aria-label={t('upload.preview.zoomToolbar')}>
        <button
          type="button"
          className="icon-button"
          aria-label={t('upload.preview.zoomOut')}
          title={t('upload.preview.zoomOut')}
          disabled={!isReady || (zoom !== null && zoom <= MIN_ZOOM)}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <Icon name="zoomOut" />
        </button>
        <span className="viewer-toolbar__level" aria-live="polite">
          <span className="visually-hidden">{t('upload.preview.zoomLevel')} </span>
          {zoomLabel}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={t('upload.preview.zoomIn')}
          title={t('upload.preview.zoomIn')}
          disabled={!isReady || (zoom !== null && zoom >= MAX_ZOOM)}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <Icon name="zoomIn" />
        </button>
        <button
          type="button"
          className="button button--secondary button--sm"
          aria-pressed={zoom === null}
          disabled={!isReady}
          onClick={() => onZoomChange(null)}
        >
          <Icon name="fit" size={18} />
          {t('upload.preview.fitToContainer')}
        </button>
      </div>

      <div ref={frameRef} className="preview__frame has-file image-viewer__frame">
        <img
          className={`preview__image${zoom === null ? ' is-fit' : ''}`}
          src={url}
          alt={alt}
          style={zoom !== null && naturalSize ? { inlineSize: `${naturalSize.width * zoom}px` } : undefined}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            if (!naturalSize && naturalWidth > 0 && naturalHeight > 0) {
              onNaturalSize({ width: naturalWidth, height: naturalHeight })
            }
          }}
          onError={onError}
        />
      </div>
    </div>
  )
}
