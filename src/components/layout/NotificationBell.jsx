import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useNotifications } from '../../hooks/useNotifications.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { ROUTES } from '../../routes/paths.js'
import { systemErrorMessage } from '../common/systemErrorMessage.js'
import { Icon } from '../common/Icon.jsx'
import { NotificationItem } from '../notifications/NotificationItem.jsx'

const LATEST = 5

// The header bell: the number of unread notifications and a panel with the latest ones. It
// shows only what the signed-in user may see (the service decides: an employee gets the
// notifications about their own documents, the Admin all of them plus the administrative
// alerts). Opening it, or a notification, never navigates anywhere by itself.
export function NotificationBell() {
  const { t, formatNumber } = useTranslation()
  const notifications = useNotifications()
  const { pathname } = useLocation()
  // The panel is open for the page it was opened on, so changing page closes it.
  const [openPath, setOpenPath] = useState(null)
  const open = openPath === pathname
  const setOpen = (value) => setOpenPath(value ? pathname : null)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpenPath(null)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenPath(null)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const latest = notifications.items.slice(0, LATEST)
  const count = notifications.unreadCount
  const label = t(count > 0 ? 'notifications.bellUnread' : 'notifications.bell', { count: formatNumber(count) })

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button notification-bell__button"
        aria-label={label}
        title={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => {
          setOpen(!open)
          if (!open) notifications.reload({ quiet: true })
        }}
      >
        <Icon name="bell" />
        {count > 0 && (
          <span className="notification-bell__badge" aria-hidden="true">
            {count > 9 ? `${formatNumber(9)}+` : formatNumber(count)}
          </span>
        )}
      </button>

      {open && (
        <div id="notification-panel" className="notification-panel" role="region" aria-label={t('notifications.title')}>
          <div className="notification-panel__header">
            <h2>{t('notifications.title')}</h2>
            {count > 0 && (
              <button type="button" className="button button--secondary button--sm" onClick={() => notifications.markAllRead()}>
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          {notifications.status === 'error' ? (
            <p className="notification-panel__empty">{systemErrorMessage(t, notifications.error)}</p>
          ) : latest.length === 0 ? (
            <p className="notification-panel__empty">{notifications.status === 'loading' ? t('common.loading') : t('notifications.empty')}</p>
          ) : (
            <ul className="notification-list">
              {latest.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} onFollow={(item) => notifications.markRead(item.id)} />
              ))}
            </ul>
          )}
          <Link to={ROUTES.notifications} className="notification-panel__all">
            {t('notifications.viewAll')}
          </Link>
        </div>
      )}
    </div>
  )
}
