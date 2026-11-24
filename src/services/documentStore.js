// TEMPORARY, FRONTEND-ONLY document store.
//
// Everything lives in this browser tab's memory: it is lost when the page is
// reloaded or closed, it is NOT sent to any server and it is NOT durable.
// `isDurable` is false so the UI says so. A later phase replaces this module
// with a real persistence service that implements the same interface:
//
//   isDurable            true only for storage that survives a reload
//   create(input)        -> record id
//   get(id)              -> record | null   (a copy; the File is shared)
//   list()               -> summaries for the correction queue
//   saveDraft(id, snap)  -> Promise, resolves ONLY when the write is acknowledged
//   savePages(id, pages) -> Promise: writes ONLY the given serialized pages (the
//                           ones that changed); resolves when acknowledged
//   setApprovalStatus(id, status) -> Promise (acknowledged)
//   setLastVisitedPage(id, pageNumber)
//   subscribe(listener)  -> unsubscribe
//
// A record: { id, name, file, usesMockProcessing, kind, createdAt, updatedAt,
//             approval: { status }, lastVisitedPage, snapshot }
// `snapshot` is the serialized canonical document (see serializeDocument with
// includeOriginalExtraction: true), i.e. plain JSON.

import { APPROVAL_STATUS } from '../domain/document/approval.js'
import { deepClone } from '../domain/document/utils.js'

export const STORAGE_ERROR = Object.freeze({
  unavailable: 'STORAGE_UNAVAILABLE',
  notFound: 'DOCUMENT_NOT_FOUND',
  pageMismatch: 'PAGE_MISMATCH',
  invalidApproval: 'INVALID_APPROVAL_STATUS',
})

export class StorageError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'StorageError'
    this.code = code
  }
}

function summarize(record) {
  const pages = record.snapshot.pages
  const reviewedCount = pages.filter((page) => page.review.status === 'reviewed').length
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    usesMockProcessing: record.usesMockProcessing,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    approvalStatus: record.approval.status,
    totalPages: record.snapshot.file.totalPages,
    selectedCount: pages.length,
    reviewedCount,
    lastVisitedPage: record.lastVisitedPage,
  }
}

export function createMemoryDocumentStore({ now = () => new Date().toISOString(), generateId } = {}) {
  const records = new Map()
  const listeners = new Set()
  let simulateFailure = false
  let counter = 0

  const notify = () => {
    for (const listener of listeners) listener()
  }
  const nextId = () => {
    counter += 1
    return generateId ? generateId('review') : `review-${Date.now().toString(36)}-${counter}`
  }

  return {
    isDurable: false,

    create({ name, file = null, snapshot, kind = 'upload', usesMockProcessing = true, approval, lastVisitedPage = null, id }) {
      const recordId = id ?? nextId()
      const timestamp = now()
      records.set(recordId, {
        id: recordId,
        name,
        file,
        kind,
        usesMockProcessing,
        createdAt: timestamp,
        updatedAt: timestamp,
        approval: { status: approval?.status ?? APPROVAL_STATUS.none },
        lastVisitedPage,
        snapshot: deepClone(snapshot),
      })
      notify()
      return recordId
    },

    get(id) {
      const record = records.get(id)
      if (!record) return null
      return { ...record, approval: { ...record.approval }, snapshot: deepClone(record.snapshot) }
    },

    list() {
      return [...records.values()].map(summarize).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    has: (id) => records.has(id),

    // Resolves only after the write was applied and acknowledged.
    async saveDraft(id, snapshot) {
      if (simulateFailure) throw new StorageError(STORAGE_ERROR.unavailable, 'The (simulated) storage is unavailable.')
      const record = records.get(id)
      if (!record) throw new StorageError(STORAGE_ERROR.notFound, `No document with ID "${id}".`)
      record.snapshot = deepClone(snapshot)
      record.updatedAt = now()
      await Promise.resolve() // the acknowledgement
      notify()
    },

    // Writes only the pages that changed (serialized pages, see serializePage).
    // All-or-nothing: every page must already exist in the stored document with
    // the same ID, otherwise nothing is written. Everything else in the stored
    // document is left exactly as it was.
    async savePages(id, pages) {
      if (simulateFailure) throw new StorageError(STORAGE_ERROR.unavailable, 'The (simulated) storage is unavailable.')
      const record = records.get(id)
      if (!record) throw new StorageError(STORAGE_ERROR.notFound, `No document with ID "${id}".`)
      if (!Array.isArray(pages)) throw new StorageError(STORAGE_ERROR.pageMismatch, 'savePages expects a list of pages.')

      const positions = new Map(record.snapshot.pages.map((page, index) => [page.pageNumber, index]))
      for (const page of pages) {
        const index = positions.get(page?.pageNumber)
        if (index === undefined || record.snapshot.pages[index].id !== page.id) {
          throw new StorageError(STORAGE_ERROR.pageMismatch, `Page ${page?.pageNumber} does not match the stored document.`)
        }
      }
      for (const page of pages) record.snapshot.pages[positions.get(page.pageNumber)] = deepClone(page)
      record.updatedAt = now()
      await Promise.resolve() // the acknowledgement
      notify()
    },

    // Persists the approval status of a document (after the approval service
    // acknowledged it), so reopening the document finds it approved.
    async setApprovalStatus(id, status) {
      const record = records.get(id)
      if (!record) throw new StorageError(STORAGE_ERROR.notFound, `No document with ID "${id}".`)
      if (!Object.values(APPROVAL_STATUS).includes(status)) {
        throw new StorageError(STORAGE_ERROR.invalidApproval, `Unknown approval status "${status}".`)
      }
      record.approval = { status }
      record.updatedAt = now()
      await Promise.resolve() // the acknowledgement
      notify()
    },

    setLastVisitedPage(id, pageNumber) {
      const record = records.get(id)
      if (record) record.lastVisitedPage = pageNumber
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // For tests and the labelled demo tools: make every save fail.
    setSimulatedFailure(value) {
      simulateFailure = Boolean(value)
    },
    isSimulatingFailure: () => simulateFailure,
  }
}

// The application's single temporary store.
export const documentStore = createMemoryDocumentStore()
