import { useState } from 'react'
import { DevSimulationPanel } from '../components/admin/DevSimulationPanel.jsx'
import { PageIntro } from '../components/common/PageIntro.jsx'
import { systemErrorMessage } from '../components/common/systemErrorMessage.js'
import { Alert } from '../components/common/Alert.jsx'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { NotificationItem } from '../components/notifications/NotificationItem.jsx'
import { useNotifications } from '../hooks/useNotifications.js'
import { useTranslation } from '../hooks/useTranslation.js'

// All the notifications of the signed-in user (for every role; the service only returns what the
// user may see: an employee the ones about their own documents, the Admin all of them plus the
// storage and backup alerts). Nothing here opens a document by itself when a processing finishes
// (decision 3): each notification offers a link and the user decides.
export default function NotificationsPage() {
  const { t, formatNumber } = useTranslation()
  const notifications = useNotifications()
  const [onlyUnread, setOnlyUnread] = useState(false)
  const shown = onlyUnread ? notifications.items.filter((item) => item.unread) : notifications.items
  const dev = notifications.service.dev

  return (
    <div className="page">
      <PageIntro id="notifications-title" icon="bell" title={t('nav.notifications')} description={t('notifications.description')} />

      {notifications.isMock && <SimulationNotice textKey="notifications.simulation" />}

      <section className="card employee-panel" aria-label={t('notifications.title')}>
        <div className="employee-filters">
          <label className="check-row">
            <input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)} />
            <span>{t('notifications.onlyUnread')}</span>
          </label>
          <p className="employee-filters__summary" role="status">
            {t('notifications.summary', { unread: formatNumber(notifications.unreadCount), total: formatNumber(notifications.items.length) })}
          </p>
          <button type="button" className="button button--secondary button--sm" disabled={notifications.unreadCount === 0} onClick={() => notifications.markAllRead()}>
            {t('notifications.markAllRead')}
          </button>
        </div>

        {notifications.status === 'error' ? (
          <div className="notification-page__state">
            <Alert tone="error" title={t('common.loadFailed')}>
              <p>{systemErrorMessage(t, notifications.error)}</p>
              <p>
                <button type="button" className="button button--secondary button--sm" onClick={() => notifications.reload()}>
                  {t('common.retry')}
                </button>
              </p>
            </Alert>
          </div>
        ) : notifications.status === 'loading' && notifications.items.length === 0 ? (
          <p className="auth-loading notification-page__state" role="status">
            <span className="spinner" aria-hidden="true" />
            {t('common.loading')}
          </p>
        ) : shown.length === 0 ? (
          <div className="queue-empty">
            <p>{t(onlyUnread ? 'notifications.noUnread' : 'notifications.empty')}</p>
          </div>
        ) : (
          <ul className="notification-list notification-list--page">
            {shown.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onFollow={(item) => notifications.markRead(item.id)} />
            ))}
          </ul>
        )}
      </section>

      {dev?.simulate && (
        <DevSimulationPanel>
          <button type="button" className="button button--secondary button--sm" onClick={() => { dev.simulate('completed'); notifications.reload({ quiet: true }) }}>
            {t('notifications.dev.completed')}
          </button>
          <button type="button" className="button button--secondary button--sm" onClick={() => { dev.simulate('failed'); notifications.reload({ quiet: true }) }}>
            {t('notifications.dev.failed')}
          </button>
        </DevSimulationPanel>
      )}
    </div>
  )
}
