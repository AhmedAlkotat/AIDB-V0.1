// The HTTP adapter of the document service (see documentService.js): the documents live on the BACKEND, which is
// authoritative for persistence, permissions, ownership, locks, attempts, approval and the derived document state.
//
// PROPOSED CONTRACT, NOT AGREED: every path and DTO below follows docs/api/openapi.draft.yaml, which the Backend and
// AI developers have not agreed yet. The assumptions are isolated here (and in documentDto.js / apiErrors.js), so a
// change in the real contract never reaches a screen. Open questions: docs/api/questions.md (Q-B1 … Q-B12, Q-C3).
//
// What this adapter keeps locally: only REVISION numbers, never document content. A write says which revision of the
// content it is based on (`baseRevision`); a stale write is refused by the server with `revisionConflict`.
//
// THE RULE THAT MAKES THAT PROTECTION WORK: the base revision belongs to the CONTENT a review session loaded. It is set
// by `getDocument` (the load that produced the session's content) and advanced only by the session's OWN acknowledged
// writes. Reading a summary, the list, a page of the list or the metadata (what the polling does) NEVER changes it:
// those reads say what the server has now, not what the user's unsaved edits were made on. Otherwise a poll would
// "refresh" the base and the next save would silently overwrite another writer's change. Revisions only move forward, so
// a late answer can never take one back. A session store takes the revision of the record it was opened with and keeps
// its own base, so another load of the same document cannot move a session that is being edited.
//
// A write that fails (conflict, network, expired session) rejects and changes nothing here; the review session keeps the
// user's unsaved edits and the base stays where it was until the document is loaded again.

import { createPollingChangeFeed } from './changeFeed.js'
import { apiClient as defaultClient } from './apiClient.js'
import { toListQuery, toMeta, toRecord, toSummary, toVersion } from './documentDto.js'
import { toSystemError } from './apiErrors.js'
import { SYSTEM_ERROR, SystemError } from './systemErrors.js'
import { WORKFLOW_ERROR } from './workflowErrors.js'

const MAX_PAGES_WHEN_LISTING_ALL = 100
const LIST_ALL_PAGE_SIZE = 200

const idPath = (documentId) => `/documents/${encodeURIComponent(documentId)}`

// A failure of the caller's own cancellation is not a service failure.
const isCancellation = (error) => error?.name === 'AbortError'

export function createHttpDocumentService({ client = defaultClient, feed = createPollingChangeFeed() } = {}) {
  // documentId -> the revision of the content last LOADED (getDocument) or last written by a session. Moves forward only.
  const contentRevisions = new Map()

  const adoptContentRevision = (documentId, revision) => {
    if (Number.isInteger(revision) && !(contentRevisions.get(documentId) >= revision)) contentRevisions.set(documentId, revision)
  }

  async function call(operation) {
    try {
      return await operation()
    } catch (error) {
      if (isCancellation(error)) throw error
      throw toSystemError(error)
    }
  }

  // Maps "unknown / deleted / not visible" (404) to null; everything else is an error.
  async function orNull(operation) {
    try {
      return await call(operation)
    } catch (error) {
      if (error?.code === SYSTEM_ERROR.notFound || error?.code === WORKFLOW_ERROR.noSuchVersion) return null
      throw error
    }
  }

  // The store a review session writes through. `base` is the revision of the content the session was built from.
  function createSessionStore(documentId, openedAt) {
    let base = Number.isInteger(openedAt) ? openedAt : contentRevisions.get(documentId)
    const moveForward = (revision) => {
      if (Number.isInteger(revision) && !(base >= revision)) base = revision
      adoptContentRevision(documentId, revision)
    }

    async function sendPages(pages) {
      // Without the revision of loaded content nothing can be saved safely: refuse instead of guessing one from a read.
      if (!Number.isInteger(base)) throw new SystemError(WORKFLOW_ERROR.invalidState, { message: 'The document must be loaded before it is saved.' })
      const response = await call(() => client.patch(`${idPath(documentId)}/pages`, { baseRevision: base, pages }))
      moveForward(response?.revision)
      feed.notify()
      return response
    }

    return {
      isDurable: true,
      savePages: async (id, pages) => void (await sendPages(pages)),
      saveDraft: async (id, snapshot) => void (await sendPages(snapshot.pages)),
      // Approval and "new version" are done by the approval service and change the document's revision without changing
      // the content this session holds. Once the server acknowledged it, the session moves FORWARD to the new revision
      // (never back). This is the only place a summary read is used, and only after an acknowledged action of this session.
      setApprovalStatus: async () => {
        const summary = await service.getSummary(documentId)
        if (summary) moveForward(summary.revision)
        feed.notify()
      },
      // Remembering the page is a convenience: a failure never matters to the user.
      setLastVisitedPage: (id, pageNumber) => {
        client.put(`${idPath(documentId)}/last-visited-page`, { pageNumber }).catch(() => {})
      },
      // Diagnostics and tests: the revision the next write will be based on.
      baseRevision: () => base,
    }
  }

  const service = {
    isMock: false,
    isDurable: true,

    list: async ({ signal } = {}) => {
      const items = []
      for (let page = 1; page <= MAX_PAGES_WHEN_LISTING_ALL; page += 1) {
        const result = await service.listPage({ page, pageSize: LIST_ALL_PAGE_SIZE }, { signal })
        items.push(...result.items)
        if (items.length >= result.total || result.items.length === 0) break
      }
      return items
    },

    listPage: async (query = {}, { signal } = {}) => {
      const body = await call(() => client.get('/documents', { query: toListQuery(query), signal }))
      const items = (body?.items ?? []).map(toSummary)
      return { items, total: Number.isInteger(body?.total) ? body.total : items.length, page: body?.page ?? query.page ?? 1, pageSize: body?.pageSize ?? query.pageSize ?? items.length }
    },

    getSummary: async (documentId, { signal } = {}) => {
      // A read for display and polling: it NEVER changes the revision a session saves on (see the top of this file).
      return toSummary(await orNull(() => client.get(`${idPath(documentId)}/status`, { signal })))
    },

    getMeta: async (documentId, { signal } = {}) => toMeta(await orNull(() => client.get(`${idPath(documentId)}/meta`, { signal }))),

    getVersion: async (documentId, number, { signal } = {}) => toVersion(await orNull(() => client.get(`${idPath(documentId)}/versions/${encodeURIComponent(number)}`, { signal }))),

    getDocument: async (documentId, { signal } = {}) => {
      const record = toRecord(await orNull(() => client.get(idPath(documentId), { signal })))
      if (record) adoptContentRevision(documentId, record.revision) // the revision of the content this load returned
      return record
    },

    // The original is fetched with the bearer token (an <img src> could not send it) and handed over as a File.
    getOriginalFile: async (documentId, { signal } = {}) => {
      const result = await call(() => client.get(`${idPath(documentId)}/original`, { responseType: 'blob', signal }))
      const name = result.fileName ?? `${documentId}`
      return new File([result.blob], name, { type: result.contentType || result.blob.type })
    },

    // The store a review session saves through. Pass the `revision` of the record the session was built from. Attempts,
    // accepted results, candidates and versions are SERVER-owned, so there is deliberately no `peek` / `updateMeta` here
    // (the session skips the bookkeeping it cannot own).
    getSessionStore: (documentId, { revision } = {}) => createSessionStore(documentId, revision),

    subscribe: (listener) => feed.subscribe(listener),

    reset() {
      contentRevisions.clear()
      feed.notify()
    },

    // Test/diagnostic access: the revision of the content last loaded or written (not of any summary read).
    knownRevision: (documentId) => contentRevisions.get(documentId),
  }
  return service
}
