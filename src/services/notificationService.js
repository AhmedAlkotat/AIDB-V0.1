// Notifications (decisions 2, 3, 35). Each user only receives what they may see (own documents for an employee).
//   isMock
//   list()          -> Promise<Notification[]>   already limited to what the caller may see
//   markRead(id)    -> Promise<void>
//   markAllRead()   -> Promise<void>
//   subscribe(listener) -> unsubscribe   OPTIONAL: told when a notification arrives (the shell refreshes at once)
//
// REPLACEABLE: screens only know this interface (every method rejects with a SystemError, see
// systemErrors.js). NOT CONNECTED TO A BACKEND YET: endpoint names and schemas are not agreed
// with the backend, so the production service only reports "not connected" and never invents
// data. Development builds use a mock (src/dev/), reachable only through the
// `import.meta.env.DEV` branch below, which production builds remove. Frontend role checks only
// shape the interface; the backend must enforce every permission.

import { createMockNotificationService } from '../dev/mockNotificationService.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_NOTIFICATIONS = createNotConnectedService(['list', 'markRead', 'markAllRead'])

export function createNotificationService() {
  if (import.meta.env?.DEV) return createMockNotificationService()
  return NOT_CONNECTED_NOTIFICATIONS
}

export const notificationService = createNotificationService()
