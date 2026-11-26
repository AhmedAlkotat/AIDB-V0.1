import { useEffect, useState } from 'react'
import { seedDemoReviewDocuments } from '../data/mock/reviewDemo.mock.js'
import { documentStore } from '../services/documentStore.js'

// The summaries of every document in the temporary store (demo documents are created
// once), kept up to date while the page is shown. Filtering for the current user and
// for the queue/archive is done with domain/document/access.js.
export function useDocumentList() {
  const [items, setItems] = useState(() => {
    // The demonstration documents are mock data: development builds only.
    if (import.meta.env?.DEV) seedDemoReviewDocuments(documentStore)
    return documentStore.list()
  })
  useEffect(() => documentStore.subscribe(() => setItems(documentStore.list())), [])
  return items
}
