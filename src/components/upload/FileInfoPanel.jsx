import { useFileSizeFormatter } from '../../hooks/useFileSizeFormatter.js'
import { PDF_PAGE_COUNT_STATUS } from '../../hooks/usePdfPageCount.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { formatNumber } from '../../i18n/translations.js'
import { Icon } from '../common/Icon.jsx'

// Compact panel for the selected document: name, type, size, Replace and
// Remove actions. `children` renders below (the processing actions).
// `documentType` is an entry of ACCEPTED_DOCUMENT_TYPES.
// `pageCountStatus` (a PDF_PAGE_COUNT_STATUS value) and `pageCount` describe
// the page count: read with PDF.js for PDFs, always 1 for images.
export function FileInfoPanel({
  file,
  documentType,
  pageCountStatus = PDF_PAGE_COUNT_STATUS.ready,
  pageCount = null,
  onReplace,
  onRemove,
  children,
}) {
  const { t, language } = useTranslation()
  const formatFileSize = useFileSizeFormatter()

  let pagesText = t('upload.file.pagesUnavailable')
  if (pageCountStatus === PDF_PAGE_COUNT_STATUS.loading) pagesText = t('upload.file.pagesLoading')
  else if (pageCountStatus === PDF_PAGE_COUNT_STATUS.ready && pageCount) pagesText = formatNumber(pageCount, language)

  let badge = <span className="badge badge--success">{t('upload.file.ready')}</span>
  if (pageCountStatus === PDF_PAGE_COUNT_STATUS.loading) {
    badge = <span className="badge badge--neutral">{t('upload.file.reading')}</span>
  } else if (pageCountStatus === PDF_PAGE_COUNT_STATUS.error) {
    badge = <span className="badge badge--neutral">{t('upload.file.notReady')}</span>
  }

  return (
    <section className="card file-panel" aria-labelledby="selected-file-heading">
      <div className="file-panel__header">
        <h3 id="selected-file-heading" className="file-panel__heading">
          {t('upload.file.heading')}
        </h3>
        {badge}
      </div>

      <div className="file-panel__file">
        <span className={`file-panel__icon file-panel__icon--${documentType.kind}`}>
          <Icon name={documentType.kind === 'pdf' ? 'fileText' : 'image'} size={22} />
        </span>
        <dl className="file-panel__details">
          <div className="file-panel__row file-panel__row--name">
            <dt className="visually-hidden">{t('upload.file.name')}</dt>
            {/* File names can be Arabic or Latin; let the browser pick direction. */}
            <dd className="file-panel__name" dir="auto" title={file.name}>
              {file.name}
            </dd>
          </div>
          <div className="file-panel__meta">
            <div className="file-panel__row">
              <dt>{t('upload.file.type')}</dt>
              <dd>{t(documentType.labelKey)}</dd>
            </div>
            <div className="file-panel__row">
              <dt>{t('upload.file.size')}</dt>
              <dd>{formatFileSize(file.size)}</dd>
            </div>
            <div className="file-panel__row">
              <dt>{t('upload.file.pages')}</dt>
              <dd>{pagesText}</dd>
            </div>
          </div>
        </dl>
      </div>

      <div className="file-panel__actions">
        <button type="button" className="button button--secondary button--sm" onClick={onReplace}>
          <Icon name="refresh" size={18} />
          {t('upload.file.replace')}
        </button>
        <button
          type="button"
          className="button button--danger button--sm"
          aria-label={t('upload.file.removeAria', { name: file.name })}
          onClick={onRemove}
        >
          <Icon name="trash" size={18} />
          {t('upload.file.remove')}
        </button>
      </div>

      {children}
    </section>
  )
}
