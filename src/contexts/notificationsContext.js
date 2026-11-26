import { createContext } from 'react'

// Value: { status, items, error, unreadCount, isMock, service, reload, markRead, markAllRead }.
// See contexts/NotificationsProvider.jsx. Read it with useNotifications.
export const NotificationsContext = createContext(null)
