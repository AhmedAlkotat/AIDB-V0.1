import { documentService } from '../services/documentService.js'
import { useLiveResource } from './useLiveResource.js'

// The summary of ONE document (its derived state, owner, counts), kept up to date while the screen is shown:
//   { status: 'loading' | 'ready' | 'error', summary, error, reload }
// `summary` is null when the document does not exist, is in the recycle bin, or the caller may not see it.
// Render the screen that uses this with key={documentId}. `service` can be replaced (tests).
export function useDocumentSummary(documentId, { service = documentService } = {}) {
  const resource = useLiveResource({
    load: (signal) => service.getSummary(documentId, { signal }),
    peek: () => service.peekSummary?.(documentId),
    subscribe: (listener) => service.subscribe(listener),
  })
  return { status: resource.status, summary: resource.data ?? null, error: resource.error, reload: resource.reload }
}

// The document's bookkeeping without its content (attempts, version summaries, recognised template): the data, or null
// until it is known. Render the screen that uses this with key={documentId}.
export function useDocumentMeta(documentId, { service = documentService } = {}) {
  const resource = useLiveResource({
    load: (signal) => service.getMeta(documentId, { signal }),
    peek: () => service.peekMeta?.(documentId),
    subscribe: (listener) => service.subscribe(listener),
  })
  return resource.data ?? null
}
