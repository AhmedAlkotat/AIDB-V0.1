import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'
import { ResultTabs } from './ResultTabs.jsx'

const noop = () => ({ ok: false })

// A previous APPROVED version, read only: the same four tabs as the review, with every control off. Viewing
// never changes anything and never creates a new version (decision 14).
function VersionViewer({ version, onClose }) {
  const { t, formatNumber, formatDateTime } = useTranslation()
  const dialogRef = useRef(null)
  const titleId = useId()
  const [pageNumber, setPageNumber] = useState(version.snapshot.selectedPages[0])
  const [tab, setTab] = useState('texts')
  const page = version.snapshot.pages.find((candidate) => candidate.pageNumber === pageNumber) ?? version.snapshot.pages[0]

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} className="confirm-dialog version-viewer" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => event.target === dialogRef.current && onClose()}>
      <div className="confirm-dialog__inner">
        <h2 id={titleId} className="confirm-dialog__title">
          {t('review.versions.viewerTitle', { version: formatNumber(version.number) })}
        </h2>
        <div className="confirm-dialog__body">
          <p>
            {t('review.versions.approvedOn', { date: formatDateTime(version.approvedAt), name: version.approvedByName ?? t('review.versions.unknownApprover') })}
          </p>
          <p className="approval-panel__note">{t('review.versions.readOnlyNote')}</p>
          <label className="form-field__label" htmlFor={`${titleId}-page`}>
            {t('review.versions.page')}
          </label>
          <select id={`${titleId}-page`} className="form-field__input" value={page.pageNumber} onChange={(event) => setPageNumber(Number(event.target.value))}>
            {version.snapshot.pages.map((candidate) => (
              <option key={candidate.pageNumber} value={candidate.pageNumber}>
                {t('review.nav.current', { page: formatNumber(candidate.pageNumber) })}
              </option>
            ))}
          </select>
          <ResultTabs document={version.snapshot} page={page} tab={tab} onTabChange={setTab} query="" disabled dispatch={noop} setPending={() => {}} />
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

// The approved versions of a document with their dates (decision 14): who approved, when, and how many pages.
// The previous versions stay for good (the audit log's retention period never deletes them, decision 33); an
// authorised user (whoever may see the document) can open any of them read-only. `isDraft` says a new version
// is in progress and not yet approved. `getVersion(number)` returns the stored version with its content.
export function VersionHistoryPanel({ versions, isDraft, getVersion }) {
  const { t, formatNumber, formatDateTime } = useTranslation()
  const [viewing, setViewing] = useState(null)

  if (versions.length === 0) return null

  return (
    <section className="card version-history" aria-labelledby="version-history-title">
      <h3 id="version-history-title">
        <Icon name="history" size={18} /> {t('review.versions.title')}
      </h3>
      <p className="approval-panel__note">{t('review.versions.note')}</p>
      {isDraft && <p className="badge badge--warning">{t('review.versions.draftInProgress', { version: formatNumber(versions[0].number + 1) })}</p>}
      <ol className="version-history__list">
        {versions.map((version) => (
          <li key={version.number} data-version={version.number}>
            <span className="version-history__name">
              {t('review.versions.version', { version: formatNumber(version.number) })}
              {version.isLatest && <span className="badge badge--success">{t('review.versions.latest')}</span>}
            </span>
            <span className="version-history__meta">
              {t('review.versions.approvedOn', { date: formatDateTime(version.approvedAt), name: version.approvedByName ?? t('review.versions.unknownApprover') })}
              {' · '}
              {t('review.versions.pages', { count: formatNumber(version.pageCount) })}
            </span>
            <button type="button" className="button button--secondary button--sm" onClick={() => setViewing(getVersion(version.number))}>
              {t('review.versions.view')}
            </button>
          </li>
        ))}
      </ol>
      {viewing && <VersionViewer version={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}
