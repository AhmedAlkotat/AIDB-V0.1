// DEVELOPMENT-ONLY mock of the notification backend (see services/notificationService.js). Not
// part of production bundles. It plays the SERVER's part: every caller only receives what they
// may see (an employee: notifications about their own documents; the Admin: all of them plus the
// administrative alerts), and "read" is tracked per user.
//
// Development switch (service.dev): simulate a finished or failed processing of a demonstration
// document. Nothing is ever opened automatically: a notification only offers a link (decision 3).

import { DEMO_REVIEW_IDS } from '../data/mock/reviewDemo.mock.js'
import { DEMO_USER } from '../data/mock/demoUser.mock.js'
import { canSeeNotification, isUnreadFor, NOTIFICATION_TYPE, selectNotificationsFor } from '../domain/notification/notification.js'
import { SYSTEM_ERROR, SystemError } from '../services/systemErrors.js'
import { getMockContext } from './mockContext.js'

// What the caller gets: never the list of other readers.
const toView = (user, notification) => ({
  id: notification.id,
  type: notification.type,
  createdAt: notification.createdAt,
  documentId: notification.documentId ?? null,
  documentName: notification.documentName ?? null,
  params: notification.params ?? {},
  unread: isUnreadFor(user.id, notification),
})

export function createMockNotificationService({ context = getMockContext() } = {}) {
  const ctx = context
  const visibleTo = (user) => selectNotificationsFor(user, ctx.system.read().notifications)

  return {
    isMock: true,

    // Development: pretend a processing finished or failed for the demonstration document that
    // belongs to the demo employee.
    dev: {
      simulate(kind) {
        const type = kind === 'failed' ? NOTIFICATION_TYPE.processingFailed : NOTIFICATION_TYPE.processingCompleted
        ctx.notify({ type, documentId: DEMO_REVIEW_IDS.toReview, documentName: 'مستند تجريبي للمراجعة', ownerId: DEMO_USER.id })
      },
    },

    list: () => ctx.run(ctx.requireUser, (user) => visibleTo(user).map((notification) => toView(user, notification))),

    // Told when a notification is added (a finished or failed processing, an alert), so the bell does not
    // have to wait for its next refresh. The real service would push the same event.
    subscribe: (listener) => ctx.onNotify(listener),

    markRead: (id) =>
      ctx.run(ctx.requireUser, (user) => {
        const target = ctx.system.read().notifications.find((notification) => notification.id === id)
        if (!target || !canSeeNotification(user, target)) throw new SystemError(SYSTEM_ERROR.notFound)
        ctx.system.update((draft) => void (draft.notifications.find((notification) => notification.id === id).readBy[user.id] = true))
      }),

    markAllRead: () =>
      ctx.run(ctx.requireUser, (user) => {
        const visible = new Set(visibleTo(user).map((notification) => notification.id))
        ctx.system.update((draft) => {
          for (const notification of draft.notifications) if (visible.has(notification.id)) notification.readBy[user.id] = true
        })
      }),
  }
}
