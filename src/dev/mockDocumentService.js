// DEVELOPMENT-ONLY adapter of the document service (see services/documentService.js) around the temporary in-memory
// document store. It is NOT part of production bundles (reachable only through the `import.meta.env.DEV` +
// VITE_API_MODE=mock branch of createDocumentService).
//
// It plays the SERVER's part for the screens: the store keeps the documents (lost on reload), the simulated queue,
// approval and lock services (src/dev/) write into it, and this adapter only answers reads asynchronously with the same
// shapes the HTTP adapter returns. It adds NO artificial latency, so what a user sees in development is unchanged.
//
// Because the data is already in memory it also offers the optional synchronous `peek*` methods, so the first render of
// a screen shows the documents at once (an HTTP adapter cannot; its screens start in the loading state).

import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../data/mock/reviewDemo.mock.js'
import { selectArchive, selectCorrectionQueue, selectVisibleDocuments } from '../domain/document/access.js'
import { filterDocuments } from '../domain/document/archiveFilter.js'
import { createChangeFeedFromStore } from './storeChangeFeed.js'
import { getMockContext } from './mockContext.js'

const isDemoId = (id) => Object.values(DEMO_REVIEW_IDS).includes(id)

const VIEW_SELECTORS = { archive: selectArchive, queue: selectCorrectionQueue, all: selectVisibleDocuments }

export function createMockDocumentService({ context = getMockContext(), store = context.documents, seed = seedDemoReviewDocuments } = {}) {
  const feed = createChangeFeedFromStore(store)

  // The demonstration documents are mock data: created once, development builds only.
  const ensureSeeded = (id) => {
    if (id === undefined || isDemoId(id)) seed(store)
  }

  const summaries = () => {
    ensureSeeded()
    return store.list()
  }
  const summaryOf = (id) => {
    ensureSeeded(id)
    return store.list().find((item) => item.id === id) ?? null
  }
  const metaOf = (id) => store.getMeta(id)
  const documentOf = (id) => {
    ensureSeeded(id)
    return store.get(id)
  }

  const service = {
    isMock: true,
    isDurable: store.isDurable,

    peekSummaries: summaries,
    peekSummary: summaryOf,
    peekMeta: metaOf,
    peekDocument: documentOf,

    list: async () => summaries(),

    // The server-side query: ownership, view, filters and paging are applied HERE (not in the screens).
    listPage: async (query = {}) => {
      const actor = context.currentActor()
      const select = VIEW_SELECTORS[query.view ?? 'all'] ?? VIEW_SELECTORS.all
      const visible = actor ? select(summaries(), actor) : []
      const filtered = filterDocuments(visible, { query: query.query, type: query.type, state: query.state, from: query.from, to: query.to })
      if (query.sort === 'uploadedAt_asc') filtered.reverse()
      const pageSize = Math.max(1, query.pageSize ?? 50)
      const page = Math.max(1, query.page ?? 1)
      return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize }
    },

    getSummary: async (id) => summaryOf(id),
    getMeta: async (id) => metaOf(id),
    getVersion: async (id, number) => store.getVersion(id, number),
    getDocument: async (id) => documentOf(id),
    getOriginalFile: async (id) => {
      const record = documentOf(id)
      if (!record?.file) throw Object.assign(new Error('The original file is not available.'), { code: 'notFound' })
      return record.file
    },

    // The review session writes drafts (and its bookkeeping) straight into the simulated server's store.
    getSessionStore: () => store,

    subscribe: (listener) => feed.subscribe(listener),
    reset: () => store.reset(),
  }
  return service
}
