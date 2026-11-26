// Notification rules (decisions 2, 3, 35), pure functions.
//
// Who sees what: an employee sees the notifications about THEIR OWN documents; the Admin sees
// those about every document plus the administrative alerts (storage and backup), which are
// for the Admin only. A notification never navigates anywhere by itself: it only offers a link
// (decision 3: no automatic navigation when processing completes).

import { USER_ROLES } from '../../constants/roles.js'

export const NOTIFICATION_TYPE = Object.freeze({
  processingCompleted: 'processingCompleted',
  processingFailed: 'processingFailed',
  storageWarning: 'storageWarning',
  storageCritical: 'storageCritical',
  storageFull: 'storageFull',
  backupFailed: 'backupFailed',
})

export const DOCUMENT_NOTIFICATION_TYPES = Object.freeze([NOTIFICATION_TYPE.processingCompleted, NOTIFICATION_TYPE.processingFailed])
export const ADMIN_NOTIFICATION_TYPES = Object.freeze([
  NOTIFICATION_TYPE.storageWarning,
  NOTIFICATION_TYPE.storageCritical,
  NOTIFICATION_TYPE.storageFull,
  NOTIFICATION_TYPE.backupFailed,
])

// A notification: { id, type, createdAt, readBy: { [userId]: true }, documentId?, documentName?,
// ownerId?, params? }. `ownerId` is the owner of the document it is about.
export function canSeeNotification(user, notification) {
  if (!user) return false
  if (user.role === USER_ROLES.orgAdmin) return true
  if (user.role !== USER_ROLES.employee) return false
  if (!DOCUMENT_NOTIFICATION_TYPES.includes(notification.type)) return false
  return notification.ownerId !== null && notification.ownerId !== undefined && notification.ownerId === user.id
}

export function isUnreadFor(userId, notification) {
  return notification.readBy?.[userId] !== true
}

// The notifications `user` may see, newest first.
export function selectNotificationsFor(user, notifications) {
  return notifications.filter((notification) => canSeeNotification(user, notification)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function countUnread(user, notifications) {
  return selectNotificationsFor(user, notifications).filter((notification) => isUnreadFor(user.id, notification)).length
}
