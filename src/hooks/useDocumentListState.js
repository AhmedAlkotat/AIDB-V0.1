import { useCallback, useEffect, useRef, useState } from 'react'
import { seedDemoReviewDocuments } from '../data/mock/reviewDemo.mock.js'
import { documentStore } from '../services/documentStore.js'

function readNow(store) {
  // The demonstration documents are mock data: development builds only.
  if (import.meta.env?.DEV) seedDemoReviewDocuments(store)
  const items = store.list()
  return typeof items?.then === 'function' ? null : items
}

// The documents of the temporary store WITH a loading and an error state:
//   { status: 'loading' | 'ready' | 'error', items, reload }
// Until a backend exists the list is read from this tab's memory, so it is ready at once; the states are the
// ones a real document list service will need (a slow or failed request), so the screens that use them
// (the archive) already handle them. `store` can be replaced (tests): a store whose list() throws or
// rejects gives the error state, one that answers later (a promise) the loading state.
export function useDocumentListState({ store = documentStore } = {}) {
  const [state, setState] = useState(() => {
    try {
      const items = readNow(store)
      return items ? { status: 'ready', items } : { status: 'loading', items: [] }
    } catch {
      return { status: 'error', items: [] }
    }
  })
  const epoch = useRef(0)

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      const mine = ++epoch.current
      if (!quiet) setState((current) => ({ ...current, status: 'loading' }))
      try {
        if (import.meta.env?.DEV) seedDemoReviewDocuments(store)
        const items = await store.list()
        if (mine === epoch.current) setState({ status: 'ready', items })
      } catch {
        if (mine === epoch.current) setState({ status: 'error', items: [] })
      }
    },
    [store],
  )

  useEffect(() => {
    if (state.status === 'loading') load({ quiet: true })
    return store.subscribe(() => load({ quiet: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, store])

  return { ...state, reload: load }
}
