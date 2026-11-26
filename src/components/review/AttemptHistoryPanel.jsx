import { sortAttempts } from '../../domain/document/attempts.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'
import { failureMessageKey } from '../documents/failureMessage.js'

// The log of processing attempts (decisions 11 and 40): every attempt with its date, its status and, when it
// failed, the reason. It holds METADATA only: the content of a result the user rejected is never kept, and the
// content of the results that were accepted stays in the document's history, not here. The log is independent of
// the audit log (decision 31): the audit log's retention never shortens it.
export function AttemptHistoryPanel({ attempts, acceptedResultCounts = {} }) {
  const { t, formatNumber, formatDateTime } = useTranslation()
  const rows = sortAttempts(attempts)
  const accepted = Object.values(acceptedResultCounts).reduce((sum, count) => sum + count, 0)

  return (
    <details className="card attempt-history" data-testid="attempt-history">
      <summary>
        <Icon name="clipboard" size={18} /> {t('review.attempts.title')} <span className="badge badge--neutral">{formatNumber(rows.length)}</span>
      </summary>
      <p className="approval-panel__note">{t('review.attempts.note')}</p>
      {accepted > 0 && <p className="approval-panel__note">{t('review.attempts.accepted', { count: formatNumber(accepted) })}</p>}
      {rows.length === 0 ? (
        <p>{t('review.attempts.empty')}</p>
      ) : (
        <div className="employee-table-wrap">
          <table className="employee-table attempt-history__table">
            <thead>
              <tr>
                <th scope="col">{t('review.attempts.columns.when')}</th>
                <th scope="col">{t('review.attempts.columns.scope')}</th>
                <th scope="col">{t('review.attempts.columns.trigger')}</th>
                <th scope="col">{t('review.attempts.columns.status')}</th>
                <th scope="col">{t('review.attempts.columns.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} data-attempt-status={entry.status}>
                  <td>{formatDateTime(entry.startedAt)}</td>
                  <td>{entry.pageNumber ? t('review.attempts.page', { page: formatNumber(entry.pageNumber) }) : t('review.attempts.document')}</td>
                  <td>{t(`review.attempts.trigger.${entry.trigger}`)}</td>
                  <td>{t(`review.attempts.status.${entry.status}`)}</td>
                  <td>{entry.errorCode ? t(failureMessageKey(entry.errorCode)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
