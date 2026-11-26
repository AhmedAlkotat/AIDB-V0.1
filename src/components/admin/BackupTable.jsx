import { BACKUP_STATUS, canRestore } from '../../domain/backup/backup.js'
import { useFileSizeFormatter } from '../../hooks/useFileSizeFormatter.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'

// The backups (simulated), newest first. `onAction(kind, backup)` with kind 'verify' | 'restore' |
// 'toggleProtect'. Only completed backups can be tested or restored (decisions 26, 30). A
// protected backup is never removed by the retention policy (decision 28).
export function BackupTable({ backups, busyId, onAction }) {
  const { t, formatDateTime } = useTranslation()
  const formatSize = useFileSizeFormatter()

  const when = formatDateTime

  return (
    <div className="employee-table-wrap">
      <table className="employee-table">
        <caption className="visually-hidden">{t('backups.table.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('backups.table.date')}</th>
            <th scope="col">{t('backups.table.type')}</th>
            <th scope="col">{t('backups.table.locations')}</th>
            <th scope="col">{t('backups.table.size')}</th>
            <th scope="col">{t('backups.table.status')}</th>
            <th scope="col">{t('backups.table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => {
            const ok = backup.status === BACKUP_STATUS.completed
            const busy = busyId === backup.id
            return (
              <tr key={backup.id} data-status={backup.status}>
                <th scope="row" className="employee-table__name">
                  {when(backup.createdAt)}
                </th>
                <td>{t(`backups.types.${backup.type}`)}</td>
                <td>{backup.locations.map((location) => t(`backups.locations.${location}`)).join(' + ')}</td>
                <td>{ok ? formatSize(backup.sizeBytes) : '—'}</td>
                <td>
                  <div className="badge-stack">
                    <span className={`badge ${ok ? 'badge--success' : 'badge--demo'}`}>{t(`backups.status.${backup.status}`)}</span>
                    {backup.protected && (
                      <span className="badge badge--neutral">
                        <Icon name="lock" size={12} />
                        {t('backups.table.protected')}
                      </span>
                    )}
                    {backup.verifiedAt && <span className="badge badge--neutral">{t('backups.table.verified')}</span>}
                  </div>
                </td>
                <td>
                  <div className="employee-table__actions">
                    <button type="button" className="button button--secondary button--sm" disabled={!canRestore(backup) || busy} aria-label={`${t('backups.actions.verify')}: ${when(backup.createdAt)}`} onClick={() => onAction('verify', backup)}>
                      {t('backups.actions.verify')}
                    </button>
                    <button type="button" className="button button--secondary button--sm" disabled={busy} aria-pressed={backup.protected} aria-label={`${t(backup.protected ? 'backups.actions.unprotect' : 'backups.actions.protect')}: ${when(backup.createdAt)}`} onClick={() => onAction('toggleProtect', backup)}>
                      {t(backup.protected ? 'backups.actions.unprotect' : 'backups.actions.protect')}
                    </button>
                    <button type="button" className="button button--secondary button--sm button--outline-danger" disabled={!canRestore(backup) || busy} aria-label={`${t('backups.actions.restore')}: ${when(backup.createdAt)}`} onClick={() => onAction('restore', backup)}>
                      {t('backups.actions.restore')}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
