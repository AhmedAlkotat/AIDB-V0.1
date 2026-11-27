import { useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { DocumentListItem } from '../components/review/DocumentListItem.jsx'
import { selectCorrectionQueue, stateOf } from '../domain/document/access.js'
import { DOCUMENT_STATE } from '../domain/document/lifecycle.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useDocumentDeletion } from '../hooks/useDocumentDeletion.jsx'
import { useDocumentListState } from '../hooks/useDocumentListState.js'
import { useDocumentRetry } from '../hooks/useDocumentRetry.jsx'
import { getDocumentQueuePosition, useProcessingQueue } from '../hooks/useProcessingQueue.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { documentService } from '../services/documentService.js'

const STATE_FILTERS = [DOCUMENT_STATE.pending, DOCUMENT_STATE.processing, DOCUMENT_STATE.readyForReview, DOCUMENT_STATE.failed, DOCUMENT_STATE.manualEditing]

// Correction queue: the documents still in work, in every state but Approved (Pending, Processing, Ready for
// Review, Failed, Manual Editing, decision 12). An employee sees their own documents, an administrator all of
// them (simulated, see domain/document/access.js). Documents wait here in the central FIFO queue (decisions
// 22 and 23) and are processed in the background: leaving this page never stops that, and a notification
// (never an automatic redirect) says when a document is ready (decisions 2 and 3). Opening one goes to its
// own review page (the editor is NOT embedded here). Approved documents are in the archive.
//
// Until a backend exists the queue lists the documents held in this browser tab's memory (the development simulation
// behind the document service).
export default function CorrectionQueuePage() {
  const { t, formatNumber } = useTranslation()
  const user = useCurrentUser()
  const list = useDocumentListState()
  const all = selectCorrectionQueue(list.items, user)
  const deletion = useDocumentDeletion()
  const retry = useDocumentRetry()
  const queue = useProcessingQueue()
  const [stateFilter, setStateFilter] = useState('all')

  const items = stateFilter === 'all' ? all : all.filter((item) => stateOf(item) === stateFilter)
  const counts = Object.fromEntries(STATE_FILTERS.map((state) => [state, all.filter((item) => stateOf(item) === state).length]))

  return (
    <div className="page">
      <section className="card page-intro" aria-labelledby="queue-title">
        <span className="page-intro__icon">
          <Icon name="fileWarning" size={26} />
        </span>
        <div className="page-intro__text">
          <h2 id="queue-title" className="page-intro__title">
            {t('nav.corrections')}
          </h2>
          <p className="page-intro__description">{t('queue.description')}</p>
        </div>
      </section>

      {deletion.feedback}
      {retry.feedback}

      {documentService.isMock && (
        <Alert tone="info" title={t('queue.temporaryTitle')}>
          <p>{t('queue.temporaryNote')}</p>
          <p>{t('queue.simulatedNote')}</p>
        </Alert>
      )}

      {queue.blocked === 'storageFull' && (
        <Alert tone="warning" title={t('queue.pausedTitle')}>
          {t('queue.pausedText')}
        </Alert>
      )}

      {all.length > 0 && (
        <div className="queue-filter">
          <label className="form-field__label" htmlFor="queue-state-filter">
            {t('queue.filter.label')}
          </label>
          <select id="queue-state-filter" className="form-field__input" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value="all">{t('queue.filter.all', { count: formatNumber(all.length) })}</option>
            {STATE_FILTERS.map((state) => (
              <option key={state} value={state}>
                {t(`documents.state.${state}`)} ({formatNumber(counts[state])})
              </option>
            ))}
          </select>
        </div>
      )}

      {list.status === 'loading' ? (
        <p className="auth-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {t('common.loading')}
        </p>
      ) : list.status === 'error' ? (
        <Alert tone="error" title={t('common.loadFailed')}>
          <p>
            <button type="button" className="button button--secondary button--sm" onClick={() => list.reload()}>
              <Icon name="refresh" size={16} />
              {t('common.retry')}
            </button>
          </p>
        </Alert>
      ) : items.length === 0 ? (
        <section className="card queue-empty">
          <p>{all.length === 0 ? t('queue.empty') : t('queue.emptyFiltered')}</p>
          <Link className="button button--primary" to={ROUTES.upload}>
            <Icon name="upload" />
            {t('dashboard.uploadCta')}
          </Link>
        </section>
      ) : (
        <ul className="queue-list" aria-label={t('queue.listLabel')}>
          {items.map((item) => (
            <DocumentListItem
              key={item.id}
              item={item}
              queuePosition={getDocumentQueuePosition(queue.jobs, item.id)}
              onDelete={deletion.onDelete}
              onRetry={retry.onRetry}
              isRetrying={retry.busyId === item.id}
            />
          ))}
        </ul>
      )}
      {deletion.dialog}
    </div>
  )
}
