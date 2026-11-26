import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { notificationService } from '../services/notificationService.js'
import { createNotificationStore, getUnreadCount } from '../state/notifications/notificationStore.js'
import { NotificationsContext } from './notificationsContext.js'

const REFRESH_MS = 30000

// Holds the signed-in user's notifications for the application shell (the header bell and the
// notifications page share it). It loads when the shell opens and refreshes every 30 seconds
// and when the window regains focus. It never navigates anywhere: a notification only offers a
// link (decision 3). `service` can be replaced (tests).
export function NotificationsProvider({ children, service = notificationService }) {
  const [store] = useState(() => createNotificationStore(service))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  useEffect(() => {
    store.load()
    const timer = setInterval(() => store.load({ quiet: true }), REFRESH_MS)
    const onFocus = () => store.load({ quiet: true })
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [store])

  const value = useMemo(
    () => ({ ...state, unreadCount: getUnreadCount(state.items), isMock: Boolean(service.isMock), service, reload: store.load, markRead: store.markRead, markAllRead: store.markAllRead }),
    [state, store, service],
  )
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
