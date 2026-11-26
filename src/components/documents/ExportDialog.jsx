import { useEffect, useId, useRef, useState } from 'react'
import { EXPORT_FORMAT, EXPORT_FORMAT_LIST } from '../../domain/document/exportScope.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { exportService } from '../../services/exportService.js'
import { Alert } from '../common/Alert.jsx'
import { Icon } from '../common/Icon.jsx'
import { workflowErrorMessage } from '../common/workflowErrorMessage.js'

// Export of the APPROVED results of one document (decisions 8 and 46): Word, Excel, PDF or JSON; only the
// selected and approved pages, in the original order, with their source page numbers kept in the data. The
// complete original document is a separate download. States: idle, working, done (simulated or real) and
// failed. `service` can be replaced (tests).
//
// HONESTY: when the service only SIMULATES an export (`result.simulated`, no `result.blob`) the dialog says so
// and offers no download: no file with a misleading extension is ever created.
export function ExportDialog({ item, onClose, service = exportService }) {
  const { t, formatNumber } = useTranslation()
  const dialogRef = useRef(null)
  const titleId = useId()
  const [state, setState] = useState({ status: 'idle', format: null, result: null, code: null })
  const downloadUrl = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current)
    }
  }, [])

  function save(blob, fileName) {
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current)
    downloadUrl.current = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl.current
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function run(format) {
    setState({ status: 'working', format, result: null, code: null })
    try {
      const result = await service.exportDocument({ documentId: item.id, format })
      if (result.blob) save(result.blob, result.fileName)
      setState({ status: 'done', format, result, code: null })
    } catch (error) {
      setState({ status: 'failed', format, result: null, code: error?.code })
    }
  }

  async function downloadOriginal() {
    setState({ status: 'working', format: 'original', result: null, code: null })
    try {
      const original = await service.getOriginal(item.id)
      save(original.blob, original.fileName)
      setState({ status: 'done', format: 'original', result: { fileName: original.fileName, original: true }, code: null })
    } catch (error) {
      setState({ status: 'failed', format: 'original', result: null, code: error?.code })
    }
  }

  const busy = state.status === 'working'
  const done = state.status === 'done' ? state.result : null

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog export-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => event.target === dialogRef.current && onClose()}
    >
      <div className="confirm-dialog__inner">
        <h2 id={titleId} className="confirm-dialog__title">
          {t('export.title')}
        </h2>
        <div className="confirm-dialog__body">
          <p dir="auto" className="export-dialog__name">
            {item.name}
          </p>
          <p>{t('export.scope')}</p>
          <ul className="export-dialog__formats" aria-label={t('export.formatsLabel')}>
            {EXPORT_FORMAT_LIST.map((format) => (
              <li key={format}>
                <button type="button" className="button button--secondary" disabled={busy} data-format={format} onClick={() => run(format)}>
                  <Icon name="download" size={18} />
                  {t(`export.formats.${format}`)}
                </button>
              </li>
            ))}
          </ul>

          {busy && (
            <p className="auth-loading" role="status">
              <span className="spinner" aria-hidden="true" />
              {t('export.working')}
            </p>
          )}
          {done?.original && <Alert tone="success">{t('export.originalDone', { name: done.fileName })}</Alert>}
          {done && !done.original && done.blob && (
            <Alert tone="success" title={t('export.doneTitle')}>
              {t('export.doneReal', { name: done.fileName, pages: formatNumber(done.pageCount) })}
              {state.format === EXPORT_FORMAT.json && <span> {t('export.jsonNote')}</span>}
            </Alert>
          )}
          {done && !done.original && !done.blob && (
            <Alert tone="warning" title={t('export.simulatedTitle')}>
              <p>{t('export.simulatedText', { format: t(`export.formats.${state.format}`), pages: formatNumber(done.pageCount) })}</p>
              <p>{t('export.simulatedNoFile')}</p>
            </Alert>
          )}
          {state.status === 'failed' && (
            <Alert tone="error" title={t('export.failedTitle')}>
              {workflowErrorMessage(t, state.code)}
            </Alert>
          )}

          <hr />
          <p>{t('export.originalText')}</p>
          <button type="button" className="button button--secondary" disabled={busy} data-format="original" onClick={downloadOriginal}>
            <Icon name="fileText" size={18} />
            {t('export.original')}
          </button>
        </div>
        <div className="confirm-dialog__actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
