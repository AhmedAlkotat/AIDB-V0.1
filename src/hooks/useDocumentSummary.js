import { useEffect, useState } from 'react'
import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../data/mock/reviewDemo.mock.js'
import { documentStore } from '../services/documentStore.js'

// The store summary of ONE document (its derived state, owner, counts), kept up to date while the
// screen is shown; null when the document does not exist or is in the recycle bin.
export function useDocumentSummary(documentId, store = documentStore) {
  const find = () => {
    // The demonstration documents are mock data: development builds only.
    if (import.meta.env?.DEV && Object.values(DEMO_REVIEW_IDS).includes(documentId)) seedDemoReviewDocuments(store)
    return store.list().find((item) => item.id === documentId) ?? null
  }
  const [summary, setSummary] = useState(find)
  // The screen that uses this is keyed by the document, so only the store's changes need following.
  useEffect(() => store.subscribe(() => setSummary(find())), [documentId, store]) // eslint-disable-line react-hooks/exhaustive-deps
  return summary
}

// The document's bookkeeping without its content (attempts, version summaries, recognised template).
export function useDocumentMeta(documentId, store = documentStore) {
  const [meta, setMeta] = useState(() => store.getMeta(documentId))
  useEffect(() => store.subscribe(() => setMeta(store.getMeta(documentId))), [documentId, store])
  return meta
}
