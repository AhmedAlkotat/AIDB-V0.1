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
//   moveToTrash(id, { by }) -> hides a document (soft delete, nothing is removed: original,
//                           results, drafts and versions stay); list()/get() no longer return it
//   listTrashed()        -> summaries of the hidden documents (with deletedAt / deletedBy)
//   restoreFromTrash(id) -> shows it again;  purge(id) -> removes it for good (bin only)
//   updateMeta(id, patch) -> merges workflow metadata (see "Workflow metadata" below); synchronous
//   reset()              -> forgets every record (used when the signed-in user changes,
//                           so one user's documents never reach the next session)
//
// A record: { id, name, file, usesMockProcessing, kind, ownerId, createdAt, updatedAt,
//             approval: { status }, lastVisitedPage, snapshot }
// `ownerId` is the uploading user (null when unknown); who may see a record is decided
// by domain/document/access.js, not by the store.
// `snapshot` is the serialized canonical document (see serializeDocument with
// includeOriginalExtraction: true), i.e. plain JSON.
//
// Workflow metadata (Batch D, all plain JSON, all optional with a safe default):
//   workflow       { phase, queuedAt, startedAt, finishedAt, errorCode }  the queue's view of the document-level
//                  processing (domain/document/lifecycle.js). Default: completed.
//   attempts       [ attempt metadata ]   every processing attempt, never any content (decisions 11, 40)
//   resultHistory  { [pageNumber]: [ { attempt, acceptedAt, elements } ] }  every ACCEPTED extraction result
//   candidates     { [pageNumber]: { attempt, elements, receivedAt } }  a result waiting for the user's decision
//                  while no review session is open; never kept for a rejected result (decision 40)
//   versions       [ approved version ]   previous approved versions and their dates (decision 14)
//   documentType / template   what the processing recognised (both optional; unknown layouts are fine)
//   autoProcessOnOpen   demonstration documents only: process an untouched page when it is opened
// The document STATE (Pending ... Approved) is derived from these and the pages, never stored.

import { APPROVAL_STATUS } from '../domain/document/approval.js'
import { DEFAULT_WORKFLOW, getDocumentState } from '../domain/document/lifecycle.js'
import { latestVersion, summarizeVersions } from '../domain/document/versions.js'
import { deepClone } from '../domain/document/utils.js'

export const STORAGE_ERROR = Object.freeze({
  unavailable: 'STORAGE_UNAVAILABLE',
  notFound: 'DOCUMENT_NOT_FOUND',
  pageMismatch: 'PAGE_MISMATCH',
  invalidApproval: 'INVALID_APPROVAL_STATUS',
  invalidMeta: 'INVALID_META',
})

export class StorageError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'StorageError'
    this.code = code
  }
}

const META_KEYS = ['workflow', 'attempts', 'resultHistory', 'candidates', 'versions', 'documentType', 'template', 'autoProcessOnOpen']

function fileKindOf(record) {
  const mime = record.snapshot.file.mimeType ?? ''
  return mime === 'application/pdf' || /\.pdf$/i.test(record.name ?? '') ? 'pdf' : 'image'
}

function summarize(record) {
  const pages = record.snapshot.pages
  const reviewedCount = pages.filter((page) => page.review.status === 'reviewed').length
  const approved = latestVersion(record.versions)
  return {
    state: getDocumentState({ approvalStatus: record.approval.status, workflow: record.workflow, pages }),
    workflowPhase: record.workflow.phase,
    failureCode: record.workflow.errorCode,
    queuedAt: record.workflow.queuedAt,
    startedAt: record.workflow.startedAt,
    finishedAt: record.workflow.finishedAt,
    documentType: record.documentType,
    template: record.template,
    fileKind: fileKindOf(record),
    versionCount: record.versions.length,
    latestVersion: approved?.number ?? null,
    approvedAt: approved?.approvedAt ?? null,
    approvedByName: approved?.approvedByName ?? null,
    autoProcessOnOpen: record.autoProcessOnOpen,
    id: record.id,
    name: record.name,
    kind: record.kind,
    ownerId: record.ownerId,
    usesMockProcessing: record.usesMockProcessing,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    approvalStatus: record.approval.status,
    deletedAt: record.deletedAt ?? null,
    deletedBy: record.deletedBy ?? null,
    processingCount: pages.filter((page) => page.processing?.status === 'processing').length,
    processedCount: pages.filter((page) => page.processing?.status === 'succeeded').length,
    failedPageCount: pages.filter((page) => page.processing?.status === 'failed').length,
    totalPages: record.snapshot.file.totalPages,
    selectedCount: pages.length,
    reviewedCount,
    lastVisitedPage: record.lastVisitedPage,
    firstSelectedPage: record.snapshot.selectedPages[0] ?? null,
  }
}

function copyOf(record) {
  return { ...record, approval: { ...record.approval }, snapshot: deepClone(record.snapshot), workflow: { ...record.workflow }, attempts: deepClone(record.attempts), resultHistory: deepClone(record.resultHistory), candidates: deepClone(record.candidates), versions: deepClone(record.versions), template: record.template ? { ...record.template } : null }
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

    create({ name, file = null, snapshot, kind = 'upload', usesMockProcessing = true, approval, lastVisitedPage = null, id, ownerId = null, workflow, documentType = null, template = null, autoProcessOnOpen = false, versions = [] }) {
      const recordId = id ?? nextId()
      const timestamp = now()
      records.set(recordId, {
        id: recordId,
        name,
        file,
        kind,
        ownerId,
        usesMockProcessing,
        createdAt: timestamp,
        updatedAt: timestamp,
        approval: { status: approval?.status ?? APPROVAL_STATUS.none },
        lastVisitedPage,
        deletedAt: null,
        deletedBy: null,
        workflow: { ...DEFAULT_WORKFLOW, ...(workflow ?? {}) },
        attempts: [],
        resultHistory: {},
        candidates: {},
        versions: deepClone(versions),
        documentType,
        template: template ? deepClone(template) : null,
        autoProcessOnOpen,
        snapshot: deepClone(snapshot),
      })
      notify()
      return recordId
    },

    // A document in the recycle bin is "missing" for every normal use.
    get(id) {
      const record = records.get(id)
      if (!record || record.deletedAt) return null
      return copyOf(record)
    },

    // The bookkeeping of a document without its content (cheap to read on every change): the attempt log,
    // the versions' summaries (never their content), how many results were accepted per page, and what
    // the processing recognised. null for an unknown or hidden document.
    getMeta(id) {
      const record = records.get(id)
      if (!record || record.deletedAt) return null
      return {
        attempts: deepClone(record.attempts),
        versions: summarizeVersions(record.versions),
        acceptedResultCounts: Object.fromEntries(Object.entries(record.resultHistory).map(([page, list]) => [page, list.length])),
        workflow: { ...record.workflow },
        documentType: record.documentType,
        template: record.template ? { ...record.template } : null,
      }
    },

    // The approved content of ONE version (the history screen shows it read-only), or null.
    getVersion(id, number) {
      const record = records.get(id)
      const version = record && !record.deletedAt ? record.versions.find((candidate) => candidate.number === number) : null
      return version ? deepClone(version) : null
    },

    // Like get(), but a hidden (soft-deleted) document is returned too. Only for the services that
    // play the server (the queue finishing work on a document that was just deleted, the bin).
    peek(id) {
      const record = records.get(id)
      return record ? copyOf(record) : null
    },

    list() {
      return [...records.values()].filter((record) => !record.deletedAt).map(summarize).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    // The recycle bin (Admin only, see services/recycleBinService.js), newest deletion first.
    listTrashed() {
      return [...records.values()].filter((record) => record.deletedAt).map(summarize).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    },

    // `has` also finds hidden documents, so seeding never creates a second record with the same id.
    has: (id) => records.has(id),

    moveToTrash(id, { by = null } = {}) {
      const record = records.get(id)
      if (!record || record.deletedAt) throw new StorageError(STORAGE_ERROR.notFound, `No document with ID "${id}".`)
      record.deletedAt = now()
      record.deletedBy = by
      notify()
    },

    restoreFromTrash(id) {
      const record = records.get(id)
      if (!record || !record.deletedAt) throw new StorageError(STORAGE_ERROR.notFound, `No deleted document with ID "${id}".`)
      record.deletedAt = null
      record.deletedBy = null
      notify()
    },

    // Permanent deletion: only for a document that is already in the bin.
    purge(id) {
      const record = records.get(id)
      if (!record || !record.deletedAt) throw new StorageError(STORAGE_ERROR.notFound, `No deleted document with ID "${id}".`)
      records.delete(id)
      notify()
    },

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

    // Merges workflow metadata into a document (the keys listed under "Workflow metadata" above;
    // anything else is refused). Works on a hidden document too, so work the queue finishes after a
    // delete still lands in the record. Synchronous: the metadata is bookkeeping of the simulated
    // server, not user content (the user's content goes through saveDraft/savePages).
    updateMeta(id, patch) {
      const record = records.get(id)
      if (!record) throw new StorageError(STORAGE_ERROR.notFound, `No document with ID "${id}".`)
      for (const key of Object.keys(patch)) {
        if (!META_KEYS.includes(key)) throw new StorageError(STORAGE_ERROR.invalidMeta, `"${key}" is not workflow metadata.`)
      }
      for (const [key, value] of Object.entries(patch)) record[key] = key === 'workflow' ? { ...record.workflow, ...value } : deepClone(value)
      record.updatedAt = now()
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

    // Removes every record and clears the simulated failure. Called when the user signs
    // out (or the session ends), so the next user starts from an empty store.
    reset() {
      records.clear()
      simulateFailure = false
      notify()
    },

    // For tests and the labelled demo tools: make every save fail.
    setSimulatedFailure(value) {
      simulateFailure = Boolean(value)
    },
    isSimulatingFailure: () => simulateFailure,
  }
}

// The application's single temporary store.
// Marked pure: only the development simulation uses it, so a production bundle drops it.
export const documentStore = /* @__PURE__ */ createMemoryDocumentStore()
