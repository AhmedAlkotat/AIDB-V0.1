import { Link } from 'react-router'
import { DOCUMENT_STATE } from '../../domain/document/lifecycle.js'
import { getDocumentActions } from '../../domain/document/permissions.js'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { reviewPath } from '../../routes/paths.js'
import { DemoBadge } from '../common/DemoBadge.jsx'
import { Icon } from '../common/Icon.jsx'
import { DocumentStateBadge } from '../documents/DocumentStateBadge.jsx'
import { failureMessageKey } from '../documents/failureMessage.js'

// What the row says about the document's progress, per state (decision 12).
function ProgressLine({ item, queuePosition }) {
  const { t, formatNumber, formatDate } = useTranslation()
  const pages = t('queue.pages', { selected: formatNumber(item.selectedCount), total: formatNumber(item.totalPages) })
  switch (item.state) {
    case DOCUMENT_STATE.pending:
      return (
        <>
          <span>{pages}</span>
          <span>{queuePosition ? t('documents.progress.position', { position: formatNumber(queuePosition) }) : t('documents.progress.waiting')}</span>
        </>
      )
    case DOCUMENT_STATE.processing:
      return (
        <>
          <span>{pages}</span>
          <span>{t('documents.progress.processing', { done: formatNumber(item.processedCount + item.failedPageCount), total: formatNumber(item.selectedCount) })}</span>
        </>
      )
    case DOCUMENT_STATE.failed:
      return (
        <>
          <span>{pages}</span>
          <span>{t(failureMessageKey(item.failureCode))}</span>
        </>
      )
    case DOCUMENT_STATE.approved:
      return (
        <>
          <span>{pages}</span>
          <span>{t('documents.progress.approved', { date: formatDate(item.approvedAt ?? item.updatedAt), version: formatNumber(item.latestVersion ?? 1) })}</span>
        </>
      )
    default:
      return (
        <>
          <span>{pages}</span>
          <span>{t('queue.reviewed', { reviewed: formatNumber(item.reviewedCount), selected: formatNumber(item.selectedCount) })}</span>
        </>
      )
  }
}

// One row of the correction queue, the archive or the dashboard (a store summary). The buttons come from
// ONE place (domain/document/permissions.js, getDocumentActions) so every list agrees. `onDelete` (given
// to the Admin only, decision 42) adds "move to the recycle bin"; `onRetry` retries a failed document
// without a new upload (decision 11); `onExport` (archive) opens the export of the approved results.
// Opening goes to the review page, which shows the processing status while the document has no content yet.
export function DocumentListItem({ item, onDelete, onRetry, onExport, queuePosition = null, isRetrying = false }) {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const actions = getDocumentActions(user, item)
  const isApproved = item.state === DOCUMENT_STATE.approved
  const isNewVersion = item.versionCount > 0 && !isApproved

  const openLabel = { review: 'queue.open', status: 'documents.actions.viewStatus', readOnly: 'queue.openReadOnly' }[actions.open] ?? 'queue.open'

  return (
    <li className="card queue-item" data-state={item.state}>
      <div className="queue-item__main">
        <h3 className="queue-item__name" dir="auto">
          {item.name}
        </h3>
        <div className="queue-item__badges">
          {item.usesMockProcessing && <DemoBadge />}
          <DocumentStateBadge state={item.state} />
          {isNewVersion && <span className="badge badge--warning">{t('documents.newVersionBadge', { version: item.versionCount + 1 })}</span>}
          {item.documentType && <span className="badge badge--neutral">{t(`documents.types.${item.documentType}`)}</span>}
        </div>
        <p className="queue-item__meta">
          <ProgressLine item={item} queuePosition={queuePosition} />
        </p>
      </div>
      <div className="queue-item__actions">
        {actions.open && (
          <Link className="button button--primary" to={reviewPath(item.id)}>
            <Icon name="fileText" />
            {t(openLabel)}
          </Link>
        )}
        {actions.retry && onRetry && (
          <button type="button" className="button button--secondary" disabled={isRetrying} aria-label={`${t('documents.actions.retry')}: ${item.name}`} onClick={() => onRetry(item)}>
            <Icon name="refresh" />
            {isRetrying ? t('documents.actions.retrying') : t('documents.actions.retry')}
          </button>
        )}
        {actions.manualEntry && (
          <Link className="button button--secondary" to={reviewPath(item.id)} aria-label={`${t('documents.actions.manual')}: ${item.name}`}>
            <Icon name="fileWarning" />
            {t('documents.actions.manual')}
          </Link>
        )}
        {actions.export && onExport && (
          <button type="button" className="button button--secondary" aria-label={`${t('documents.actions.export')}: ${item.name}`} onClick={() => onExport(item)}>
            <Icon name="download" />
            {t('documents.actions.export')}
          </button>
        )}
        {onDelete && actions.delete && (
          <button type="button" className="button button--secondary button--outline-danger" aria-label={`${t('recycleBin.move.action')}: ${item.name}`} onClick={() => onDelete(item)}>
            <Icon name="trash" />
            {t('recycleBin.move.action')}
          </button>
        )}
      </div>
    </li>
  )
}
