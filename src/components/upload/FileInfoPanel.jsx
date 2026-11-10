import { useFileSizeFormatter } from '../../hooks/useFileSizeFormatter.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'

// Compact panel for the selected document: name, type, size, Replace and
// Remove actions. `children` renders below (the processing actions).
// `documentType` is an entry of ACCEPTED_DOCUMENT_TYPES.
// Page count is intentionally not shown: it cannot be read reliably without
// a PDF parsing library.
export function FileInfoPanel({ file, documentType, onReplace, onRemove, children }) {
  const { t } = useTranslation()
  const formatFileSize = useFileSizeFormatter()

  return (
    <section className="card file-panel" aria-labelledby="selected-file-heading">
      <div className="file-panel__header">
        <h3 id="selected-file-heading" className="file-panel__heading">
          {t('upload.file.heading')}
        </h3>
        <span className="badge badge--success">{t('upload.file.ready')}</span>
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
