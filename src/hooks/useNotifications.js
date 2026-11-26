import { useContext } from 'react'
import { NotificationsContext } from '../contexts/notificationsContext.js'

// The notifications of the signed-in user (see contexts/NotificationsProvider.jsx).
export function useNotifications() {
  const value = useContext(NotificationsContext)
  if (!value) throw new Error('useNotifications must be used inside <NotificationsProvider>.')
  return value
}
