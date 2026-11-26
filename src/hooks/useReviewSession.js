import { useEffect, useState, useSyncExternalStore } from 'react'
import { canViewDocument } from '../domain/document/access.js'
import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../data/mock/reviewDemo.mock.js'
import { documentStore } from '../services/documentStore.js'
import { mockProcessingService } from '../services/mockProcessingService.js'
import { createReviewSession, SessionLoadError } from '../state/documentSession/reviewSession.js'
import { useCurrentUser } from './useCurrentUser.js'

// Loads a stored document into a review session (no side effects besides idempotent
// seeding of the demo documents). Returns
// { status: 'ready' | 'missing' | 'forbidden' | 'error', ... }. "forbidden" is the
// SIMULATED visibility rule (an employee opening someone else's document by its URL).
function loadReviewSession(documentId, user) {
  if (Object.values(DEMO_REVIEW_IDS).includes(documentId)) seedDemoReviewDocuments(documentStore)
  const record = documentStore.get(documentId)
  if (!record) return { status: 'missing' }
  if (!canViewDocument({ role: user.role, userId: user.id, ownerId: record.ownerId })) return { status: 'forbidden' }
  try {
    const session = createReviewSession({ record, store: documentStore, processing: mockProcessingService, role: user.role })
    return { status: 'ready', session, record }
  } catch (error) {
    return { status: 'error', errors: error instanceof SessionLoadError ? error.errors : [] }
  }
}

// The review session of a stored document, opened while the page is shown and
// closed (pending edits stored, running extractions cancelled) when leaving.
// Render the component that calls this with key={documentId}.
export function useReviewSession(documentId) {
  const user = useCurrentUser()
  const [loaded] = useState(() => loadReviewSession(documentId, user))

  useEffect(() => {
    if (loaded.status !== 'ready') return undefined
    loaded.session.open()
    return () => {
      loaded.session.close()
    }
  }, [loaded])

  return loaded
}

// The session's current view; re-renders whenever it changes.
export function useSessionView(session) {
  return useSyncExternalStore(session.subscribe, session.getView)
}
