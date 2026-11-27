import { documentService } from '../services/documentService.js'
import { useLiveResource } from './useLiveResource.js'

// The documents the caller may see, WITH a loading and an error state, kept up to date while the screen is shown:
//   { status: 'loading' | 'ready' | 'error', items, error, refreshError, reload }
// The data comes from the asynchronous document service (the backend is authoritative; the screens only filter what
// the server returned for display). An adapter that already holds the data in memory (the development simulation)
// lets the first render show it at once; an HTTP adapter starts in `loading`. A stale answer never overwrites a newer
// one, a failed background refresh keeps the documents on screen, and leaving the screen cancels what is in flight.
// `service` can be replaced (tests).
export function useDocumentListState({ service = documentService } = {}) {
  const resource = useLiveResource({
    load: (signal) => service.list({ signal }),
    peek: () => service.peekSummaries?.(),
    subscribe: (listener) => service.subscribe(listener),
  })
  return { status: resource.status, items: resource.data ?? [], error: resource.error, refreshError: resource.refreshError, reload: resource.reload }
}
