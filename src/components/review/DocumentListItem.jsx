import { Link } from 'react-router'
import { isDocumentApproved } from '../../domain/document/approval.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { reviewPath } from '../../routes/paths.js'
import { DemoBadge } from '../common/DemoBadge.jsx'
import { Icon } from '../common/Icon.jsx'

// One row of the correction queue or of the archive (a store summary). Opening goes to
// the review page; an approved document opens read-only. `onDelete` (given to the Admin only,
// decision 42) adds the "move to the recycle bin" button.
export function DocumentListItem({ item, onDelete }) {
  const { t, formatNumber } = useTranslation()
  const isApproved = isDocumentApproved(item.approvalStatus)

  return (
    <li className="card queue-item">
      <div className="queue-item__main">
        <h3 className="queue-item__name" dir="auto">
          {item.name}
        </h3>
        <div className="queue-item__badges">
          {item.usesMockProcessing && <DemoBadge />}
          {isApproved && <span className="badge badge--success">{t('review.header.approvedBadge')}</span>}
        </div>
        <p className="queue-item__meta">
          <span>{t('queue.pages', { selected: formatNumber(item.selectedCount), total: formatNumber(item.totalPages) })}</span>
          <span>{t('queue.reviewed', { reviewed: formatNumber(item.reviewedCount), selected: formatNumber(item.selectedCount) })}</span>
        </p>
      </div>
      <div className="queue-item__actions">
        <Link className="button button--primary" to={reviewPath(item.id)}>
          <Icon name="fileText" />
          {t(isApproved ? 'queue.openReadOnly' : 'queue.open')}
        </Link>
        {onDelete && (
          <button type="button" className="button button--secondary button--outline-danger" aria-label={`${t('recycleBin.move.action')}: ${item.name}`} onClick={() => onDelete(item)}>
            <Icon name="trash" />
            {t('recycleBin.move.action')}
          </button>
        )}
      </div>
    </li>
  )
}
