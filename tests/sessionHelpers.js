// Helpers for the review-session tests. Not a test file.

import { createDocument } from '../src/domain/document/document.js'
import { serializeDocument } from '../src/domain/document/serialization.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'
import { createMockProcessingService } from '../src/services/mockProcessingService.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { createReviewSession } from '../src/state/documentSession/reviewSession.js'
import { FILE } from './helpers.js'

// A scheduler driven by hand (no real time passes).
export function createManualScheduler() {
  let current = 0
  let nextHandle = 1
  const timers = new Map()
  return {
    setTimeout(callback, delay) {
      const handle = nextHandle++
      timers.set(handle, { callback, at: current + delay })
      return handle
    },
    clearTimeout: (handle) => timers.delete(handle),
    now: () => current,
    pendingCount: () => timers.size,
    // Runs every timer due within `ms`, in order.
    advance(ms) {
      const target = current + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        current = Math.max(current, due[1].at)
        due[1].callback()
      }
      current = target
    },
  }
}

// Lets promise callbacks run.
export const settle = () => new Promise((resolve) => setImmediate(resolve))

// A promise whose outcome the test decides.
export function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function makeSnapshot({ selectedPages = [1, 2, 3], totalPages = 3, generateId } = {}) {
  const document = createDocument({ file: FILE, totalPages, selectedPages }, generateId ? { generateId } : undefined)
  return serializeDocument(document, { includeOriginalExtraction: true })
}

// A session on a memory store with an instant mock processing service.
export function makeSession({
  selectedPages = [1, 2, 3],
  totalPages = 3,
  role = 'employee',
  approvalStatus = 'none',
  lastVisitedPage = null,
  snapshot,
  processing,
  store = createMemoryDocumentStore(),
  scheduler,
  autoProcess = false,
  approvalService,
  shouldFail = () => false,
} = {}) {
  const ids = createSequentialIdGenerator(1000)
  const id = store.create({
    name: 'مستند اختبار',
    snapshot: snapshot ?? makeSnapshot({ selectedPages, totalPages }),
    approval: { status: approvalStatus },
    lastVisitedPage,
    kind: 'upload',
  })
  const service = processing ?? createMockProcessingService({ delayMs: 0, shouldFail, generateId: ids })
  const session = createReviewSession({
    record: store.get(id),
    store,
    processing: service,
    role,
    generateId: ids,
    now: () => new Date('2026-11-23T10:00:00.000Z'),
    autosaveOptions: scheduler ? { scheduler } : { delayMs: 0, maxWaitMs: 0, retryDelaysMs: [] },
    autoProcess,
    ...(approvalService ? { approvalService } : {}),
  })
  session.open()
  return { session, store, id, ids, service }
}

export const pageOf = (session, pageNumber = session.getView().editor.lastVisitedPage) =>
  session.getView().editor.document.pages.find((page) => page.pageNumber === pageNumber)
