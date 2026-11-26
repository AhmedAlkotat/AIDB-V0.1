import { useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { ConfirmActionDialog } from '../components/common/ConfirmActionDialog.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { PageIntro } from '../components/common/PageIntro.jsx'
import { ResourceState } from '../components/common/ResourceState.jsx'
import { systemErrorMessage } from '../components/common/systemErrorMessage.js'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { isDocumentApproved } from '../domain/document/approval.js'
import { useResource } from '../hooks/useResource.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { recycleBinService } from '../services/recycleBinService.js'
import { settingsService } from '../services/settingsService.js'

// Recycle bin (Admin only, decisions 42-45). Deleted documents are only hidden: the original,
// results, drafts and versions stay. The Admin can restore a document (after a confirmation) or
// delete it permanently (after a confirmation that must be acknowledged). Automatic deletion
// after the retention period is decided in the system settings and never touches the archive.
//
// `service` and `settings` can be replaced (tests).
export default function RecycleBinPage({ service = recycleBinService, settings = settingsService }) {
  const { t, formatDate, formatNumber } = useTranslation()
  const bin = useResource(() => service.listDeleted())
  const policy = useResource(() => settings.getSettings())
  // { kind: 'restore' | 'delete', item }
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(null)

  const close = () => setDialog(null)
  const act = (operation) => async () => {
    try {
      await operation(dialog.item.id)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: systemErrorMessage(t, error?.code) }
    }
  }
  const finish = (key) => {
    setNotice({ key, name: dialog.item.name })
    bin.set(bin.data.filter((entry) => entry.id !== dialog.item.id))
    close()
  }

  const recycle = policy.data?.recycleBin
  const items = bin.data ?? []

  return (
    <div className="page">
      <PageIntro id="bin-title" icon="trash" title={t('nav.adminRecycleBin')} description={t('recycleBin.description')} />

      {service.isMock && <SimulationNotice textKey="recycleBin.simulation" />}

      {policy.status === 'ready' && (
        <Alert tone="info">
          {recycle.autoDelete ? t('recycleBin.policy.auto', { days: formatNumber(recycle.retentionDays) }) : t('recycleBin.policy.off')}{' '}
          <Link to={ROUTES.adminSettings} className="inline-link">
            {t('recycleBin.policy.change')}
          </Link>
        </Alert>
      )}

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {t(`recycleBin.notice.${notice.key}`, { name: notice.name })}
        </Alert>
      )}

      <ResourceState resource={bin}>
        <section className="card employee-panel" aria-label={t('recycleBin.table.caption')}>
          {items.length === 0 ? (
            <div className="queue-empty">
              <p className="employee-empty__title">{t('recycleBin.empty.title')}</p>
              <p>{t('recycleBin.empty.text')}</p>
            </div>
          ) : (
            <div className="employee-table-wrap">
              <table className="employee-table">
                <caption className="visually-hidden">{t('recycleBin.table.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('recycleBin.table.name')}</th>
                    <th scope="col">{t('recycleBin.table.status')}</th>
                    <th scope="col">{t('recycleBin.table.deleted')}</th>
                    <th scope="col">{t('recycleBin.table.remaining')}</th>
                    <th scope="col">{t('recycleBin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <th scope="row" className="employee-table__name" dir="auto">
                        {item.name}
                      </th>
                      <td>
                        <span className={`badge ${isDocumentApproved(item.approvalStatus) ? 'badge--success' : 'badge--neutral'}`}>
                          {t(isDocumentApproved(item.approvalStatus) ? 'recycleBin.table.approved' : 'recycleBin.table.pending')}
                        </span>
                      </td>
                      <td>{formatDate(item.deletedAt)}</td>
                      <td>{item.daysRemaining === null ? t('recycleBin.table.noAutoDelete') : t('recycleBin.table.days', { days: formatNumber(item.daysRemaining) })}</td>
                      <td>
                        <div className="employee-table__actions">
                          <button type="button" className="button button--secondary button--sm" aria-label={`${t('recycleBin.actions.restore')}: ${item.name}`} onClick={() => setDialog({ kind: 'restore', item })}>
                            <Icon name="refresh" size={16} />
                            {t('recycleBin.actions.restore')}
                          </button>
                          <button type="button" className="button button--secondary button--sm button--outline-danger" aria-label={`${t('recycleBin.actions.delete')}: ${item.name}`} onClick={() => setDialog({ kind: 'delete', item })}>
                            <Icon name="trash" size={16} />
                            {t('recycleBin.actions.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </ResourceState>

      {dialog?.kind === 'restore' && (
        <ConfirmActionDialog
          key={dialog.item.id}
          title={t('recycleBin.restore.title', { name: dialog.item.name })}
          confirmLabel={t('recycleBin.restore.confirm')}
          tone="primary"
          onConfirm={act(service.restore)}
          onCancel={close}
          onDone={() => finish('restored')}
        >
          <p>{t('recycleBin.restore.text')}</p>
        </ConfirmActionDialog>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmActionDialog
          key={dialog.item.id}
          title={t('recycleBin.purge.title', { name: dialog.item.name })}
          confirmLabel={t('recycleBin.purge.confirm')}
          acknowledgement={t('recycleBin.purge.acknowledge')}
          onConfirm={act(service.deletePermanently)}
          onCancel={close}
          onDone={() => finish('deleted')}
        >
          <p>{t('recycleBin.purge.text')}</p>
          <p className="confirm-warning">{t('recycleBin.purge.warning')}</p>
        </ConfirmActionDialog>
      )}
    </div>
  )
}
