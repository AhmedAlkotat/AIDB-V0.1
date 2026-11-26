import { useState } from 'react'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { ArchiveFilters } from '../components/documents/ArchiveFilters.jsx'
import { ExportDialog } from '../components/documents/ExportDialog.jsx'
import { DocumentListItem } from '../components/review/DocumentListItem.jsx'
import { selectArchive } from '../domain/document/access.js'
import { availableTypes, EMPTY_FILTERS, filterDocuments, hasActiveFilters } from '../domain/document/archiveFilter.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useDocumentDeletion } from '../hooks/useDocumentDeletion.jsx'
import { useDocumentListState } from '../hooks/useDocumentListState.js'
import { useDocumentRetry } from '../hooks/useDocumentRetry.jsx'
import { useTranslation } from '../hooks/useTranslation.js'

// Archive (decisions 7, 9, 12, 15, 39, 42, 43, 46): every document in every lifecycle state EXCEPT Pending
// (decision 12, which supersedes the earlier "approved only" rule), with search and filters by name, document
// type, status and date. An employee sees their own documents, the Admin all of them; a document in the
// recycle bin is not listed (decision 43). What each row offers depends on the state and the role
// (domain/document/permissions.js): open (read-only once approved), retry or manual entry for a failed
// one, export of the approved results, and "move to the recycle bin" for the Admin only.
//
// The role checks and the data are SIMULATED in the interface until the backend exists; the server must
// enforce them.
export default function DocumentArchivePage() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const list = useDocumentListState()
  const deletion = useDocumentDeletion()
  const retry = useDocumentRetry()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [exporting, setExporting] = useState(null)

  const archived = selectArchive(list.items, user)
  const shown = filterDocuments(archived, filters)

  let body
  if (list.status === 'loading') {
    body = (
      <p className="auth-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        {t('common.loading')}
      </p>
    )
  } else if (list.status === 'error') {
    body = (
      <Alert tone="error" title={t('common.loadFailed')}>
        <p>
          <button type="button" className="button button--secondary button--sm" onClick={() => list.reload()}>
            <Icon name="refresh" size={16} />
            {t('common.retry')}
          </button>
        </p>
      </Alert>
    )
  } else if (archived.length === 0) {
    body = (
      <section className="card queue-empty">
        <p>{t('archive.empty')}</p>
      </section>
    )
  } else {
    body = (
      <>
        <ArchiveFilters
          filters={filters}
          types={availableTypes(archived)}
          shown={shown.length}
          total={archived.length}
          canClear={hasActiveFilters(filters)}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />
        {shown.length === 0 ? (
          <section className="card queue-empty">
            <p>{t('archive.noResults')}</p>
            <button type="button" className="button button--secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
              {t('archive.filters.clear')}
            </button>
          </section>
        ) : (
          <ul className="queue-list" aria-label={t('archive.listLabel')}>
            {shown.map((item) => (
              <DocumentListItem key={item.id} item={item} onDelete={deletion.onDelete} onRetry={retry.onRetry} isRetrying={retry.busyId === item.id} onExport={setExporting} />
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="page">
      <section className="card page-intro" aria-labelledby="archive-title">
        <span className="page-intro__icon">
          <Icon name="archive" size={26} />
        </span>
        <div className="page-intro__text">
          <h2 id="archive-title" className="page-intro__title">
            {t('nav.archive')}
          </h2>
          <p className="page-intro__description">{t('archive.description')}</p>
        </div>
      </section>

      {deletion.feedback}
      {retry.feedback}

      <Alert tone="info" title={t('archive.temporaryTitle')}>
        <p>{t('archive.temporaryNote')}</p>
        <p>{t('queue.simulatedNote')}</p>
      </Alert>

      {body}
      {deletion.dialog}
      {exporting && <ExportDialog item={exporting} onClose={() => setExporting(null)} />}
    </div>
  )
}
