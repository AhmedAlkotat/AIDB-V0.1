import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { getPdfViewerUrl } from '../../utils/documentFile.js'
import { Icon } from '../common/Icon.jsx'
import { ImageViewer } from './ImageViewer.jsx'
import { PdfViewer } from './PdfViewer.jsx'
import { PreviewMessage } from './PreviewMessage.jsx'

// Local, in-browser preview of the selected document, with an optional
// enlarged (full-window) mode. `url` is a temporary object URL owned
// (created and revoked) by the parent via useObjectUrl. The parent should
// pass `key={url}` so zoom and error state reset for each new file.
export function DocumentPreview({ file, kind, url }) {
  const { t } = useTranslation()
  const dialogRef = useRef(null)
  const [isEnlarged, setIsEnlarged] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  // Image zoom (null = fit to container) and natural size, shared by the
  // inline and enlarged views.
  const [zoom, setZoom] = useState(null)
  const [naturalSize, setNaturalSize] = useState(null)

  // Native modal dialog: traps focus, closes on Escape and restores focus.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isEnlarged && !dialog.open) dialog.showModal()
    if (!isEnlarged && dialog.open) dialog.close()
  }, [isEnlarged])

  const hasDocument = Boolean(file && url)
  const canPreview = hasDocument && !hasFailed
  const pdfTitle = file ? t('upload.preview.pdfTitle', { name: file.name }) : ''

  function renderViewer() {
    if (kind === 'image') {
      return (
        <ImageViewer
          url={url}
          alt={t('upload.preview.imageAlt', { name: file.name })}
          zoom={zoom}
          onZoomChange={setZoom}
          naturalSize={naturalSize}
          onNaturalSize={setNaturalSize}
          onError={() => setHasFailed(true)}
        />
      )
    }
    return <PdfViewer url={url} title={pdfTitle} />
  }

  function renderOpenInNewTab() {
    if (kind !== 'pdf') return null
    return (
      <a className="preview__link" href={getPdfViewerUrl(url)} target="_blank" rel="noopener noreferrer">
        <Icon name="externalLink" size={16} />
        {t('upload.preview.openInNewTab')}
      </a>
    )
  }

  let body
  if (!hasDocument) {
    body = (
      <div className="preview__frame">
        <PreviewMessage
          icon="image"
          title={t('upload.preview.emptyTitle')}
          text={t('upload.preview.emptyText')}
        />
      </div>
    )
  } else if (hasFailed) {
    body = (
      <div className="preview__frame has-file">
        <PreviewMessage
          icon="fileWarning"
          title={t('upload.preview.unavailableTitle')}
          text={t('upload.preview.unavailableText')}
        />
      </div>
    )
  } else {
    body = renderViewer()
  }

  return (
    <section className="card preview" aria-labelledby="preview-heading">
      <div className="preview__header">
        <h3 id="preview-heading">{t('upload.preview.heading')}</h3>
        {canPreview && (
          <div className="preview__header-actions">
            {renderOpenInNewTab()}
            <button
              type="button"
              className="button button--secondary button--sm"
              aria-haspopup="dialog"
              onClick={() => setIsEnlarged(true)}
            >
              <Icon name="expand" size={18} />
              {t('upload.preview.enlarge')}
            </button>
          </div>
        )}
      </div>
      {kind === 'pdf' && canPreview && (
        <p className="preview__hint">{t('upload.preview.pdfControlsHint')}</p>
      )}

      {body}

      {canPreview && (
        <dialog
          ref={dialogRef}
          className="preview-dialog"
          aria-labelledby="preview-dialog-title"
          onClose={() => setIsEnlarged(false)}
        >
          {isEnlarged && (
            <div className="preview-dialog__inner">
              <div className="preview-dialog__header">
                <button
                  type="button"
                  className="button button--primary button--sm"
                  onClick={() => setIsEnlarged(false)}
                >
                  <Icon name="close" size={18} />
                  {t('upload.preview.backToUpload')}
                </button>
                <h2 id="preview-dialog-title" className="preview-dialog__title" dir="auto" title={file.name}>
                  {file.name}
                </h2>
                {renderOpenInNewTab()}
              </div>
              <div className="preview-dialog__body">{renderViewer()}</div>
            </div>
          )}
        </dialog>
      )}
    </section>
  )
}
