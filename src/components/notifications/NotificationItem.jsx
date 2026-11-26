import { Link } from 'react-router'
import { NOTIFICATION_TYPE } from '../../domain/notification/notification.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'
import { getNotificationTarget } from './notificationTarget.js'

const ICONS = {
  [NOTIFICATION_TYPE.processingCompleted]: 'checkCircle',
  [NOTIFICATION_TYPE.processingFailed]: 'fileWarning',
  [NOTIFICATION_TYPE.storageWarning]: 'hardDrive',
  [NOTIFICATION_TYPE.storageCritical]: 'hardDrive',
  [NOTIFICATION_TYPE.storageFull]: 'hardDrive',
  [NOTIFICATION_TYPE.backupFailed]: 'database',
}

// One notification: icon, what happened, when, and a link. Following the link marks it read.
export function NotificationItem({ notification, onFollow }) {
  const { t, formatDateTime, formatNumber } = useTranslation()
  const target = getNotificationTarget(notification)
  const params = { name: notification.documentName ?? '', percent: formatNumber(notification.params?.percent ?? 0), backupId: notification.params?.backupId ?? '' }

  return (
    <li className={`notification-item${notification.unread ? ' is-unread' : ''}`} data-type={notification.type}>
      <span className="notification-item__icon" aria-hidden="true">
        <Icon name={ICONS[notification.type] ?? 'info'} size={20} />
      </span>
      <div className="notification-item__body">
        <p className="notification-item__title">
          {notification.unread && <span className="visually-hidden">{t('notifications.unread')}: </span>}
          {t(`notifications.types.${notification.type}.title`, params)}
        </p>
        <p className="notification-item__text" dir="auto">
          {t(`notifications.types.${notification.type}.text`, params)}
        </p>
        <p className="notification-item__meta">
          <time dateTime={notification.createdAt}>{formatDateTime(notification.createdAt)}</time>
          {target && (
            <Link to={target} className="inline-link" onClick={() => onFollow?.(notification)}>
              {t(notification.documentId ? 'notifications.openDocument' : 'notifications.openDetails')}
            </Link>
          )}
        </p>
      </div>
    </li>
  )
}
