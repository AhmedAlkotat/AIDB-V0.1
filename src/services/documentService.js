// The asynchronous document service (Batch E, decision D2): the ONE way screens, hooks and review sessions read and
// write documents. It replaces the direct, synchronous use of the in-memory document store.
//
//   isMock, isDurable
//
//   -- reading (all asynchronous, all take an optional { signal } so a screen that is left can cancel) ----------------
//   list(options)            -> Promise<Summary[]>             every document the caller may see (not the deleted ones)
//   listPage(query, options) -> Promise<{ items, total, page, pageSize }>   server-side query: view ('all' | 'archive' |
//                               'queue'), query (name), type, state, from/to (UPLOAD date), sort, page, pageSize
//   getSummary(id)           -> Promise<Summary | null>        null: unknown, deleted, or not visible to the caller
//   getMeta(id)              -> Promise<Meta | null>           attempts, version summaries, accepted-result counts, class/template
//   getVersion(id, number)   -> Promise<Version | null>        one approved version with its content
//   getDocument(id)          -> Promise<Record | null>         the canonical content + workflow data a review session opens
//   getOriginalFile(id)      -> Promise<Blob>                  the COMPLETE original (never an export)
//
//   -- review session port ------------------------------------------------------------------------------------------
//   getSessionStore(id, { revision }) -> the store a review session writes drafts through (savePages / saveDraft /
//                            setLastVisitedPage ...). `revision` is the one of the record the session was built from: every
//                            write is based on it (lost-update protection), and reads such as polling never change it.
//
//   -- change signals -----------------------------------------------------------------------------------------------
//   subscribe(listener)      -> unsubscribe     "something may have changed": re-read what you show (polling now, SSE later)
//   reset()                  forget everything held locally (the signed-in user changed). Never touches the server.
//
//   -- optional synchronous peeks (adapters that already hold the data in memory) -----------------------------------
//   peekSummaries() / peekSummary(id) / peekMeta(id) / peekDocument(id) -> the value, or `undefined` when the adapter
//   cannot answer without waiting. A screen uses them ONLY for its first render; the asynchronous call is always made.
//   The HTTP adapter has none, so a real screen starts in its "loading" state.
//
// Who is authoritative: THE BACKEND (persistence, permissions, ownership, locks, attempts, approval, state). Role
// checks in the screens only shape the interface. In 'mock' mode (development) src/dev/mockDocumentService.js plays
// the server; in 'http' mode httpDocumentService.js talks to the API. There is no fallback from one to the other.

import { createMockDocumentService } from '../dev/mockDocumentService.js'
import { createHttpDocumentService } from './httpDocumentService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'

export function createDocumentService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockDocumentService()
  return createHttpDocumentService()
}

export const documentService = createDocumentService()
