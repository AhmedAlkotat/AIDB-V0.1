import { NOTIFICATION_TYPE } from '../../domain/notification/notification.js'
import { ROUTES, reviewPath } from '../../routes/paths.js'

// Where a notification's link leads: the document to review, or the administrative page about
// the alert. A notification never navigates by itself (decision 3): the user chooses to follow it.
export function getNotificationTarget(notification) {
  if (notification.documentId) return reviewPath(notification.documentId)
  if (notification.type === NOTIFICATION_TYPE.backupFailed) return ROUTES.adminBackups
  if ([NOTIFICATION_TYPE.storageWarning, NOTIFICATION_TYPE.storageCritical, NOTIFICATION_TYPE.storageFull].includes(notification.type)) return ROUTES.adminStorage
  return null
}
