// The signed-in user's notifications, independent of React (see NotificationsProvider).
// state: { status: 'loading' | 'ready' | 'error', items, error }. Each item is what the service
// returned: { id, type, createdAt, documentId, documentName, params, unread }.
// Marking as read is applied at once and put back if the service refuses.

export function createNotificationStore(service) {
  let state = { status: 'loading', items: [], error: null }
  let epoch = 0
  const listeners = new Set()

  function setState(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  const store = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // `quiet` refreshes without showing the loading state (polling).
    async load({ quiet = false } = {}) {
      const mine = ++epoch
      if (!quiet) setState({ status: 'loading', error: null })
      try {
        const items = await service.list()
        if (mine === epoch) setState({ status: 'ready', items, error: null })
      } catch (error) {
        if (mine === epoch) setState({ status: 'error', error: typeof error?.code === 'string' ? error.code : 'unknown' })
      }
    },

    async markRead(id) {
      const before = state.items
      setState({ items: before.map((item) => (item.id === id ? { ...item, unread: false } : item)) })
      try {
        await service.markRead(id)
      } catch {
        setState({ items: before })
      }
    },

    async markAllRead() {
      const before = state.items
      setState({ items: before.map((item) => ({ ...item, unread: false })) })
      try {
        await service.markAllRead()
      } catch {
        setState({ items: before })
      }
    },
  }
  return store
}

export const getUnreadCount = (items) => items.filter((item) => item.unread).length
