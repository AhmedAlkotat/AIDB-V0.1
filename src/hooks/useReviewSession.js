import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { canViewDocument } from '../domain/document/access.js'
import { documentService } from '../services/documentService.js'
import { documentWorkflowService } from '../services/documentWorkflowService.js'
import { editLockService } from '../services/editLockService.js'
import { SYSTEM_ERROR } from '../services/systemErrors.js'
import { registerUnsavedWorkSource } from '../state/auth/unsavedWork.js'
import { createReviewSession, SessionLoadError } from '../state/documentSession/reviewSession.js'
import { useCurrentUser } from './useCurrentUser.js'

// Builds the review session of a loaded record (no side effects). Returns
// { status: 'ready' | 'missing' | 'forbidden' | 'error', ... }. "forbidden" is what the caller may not see; the SERVER
// is the authority, this only shapes the interface.
function sessionFromRecord(record, { user, service }) {
  if (!record) return { status: 'missing' }
  if (!canViewDocument({ role: user.role, userId: user.id, ownerId: record.ownerId })) return { status: 'forbidden' }
  try {
    // Processing goes through the central queue (it goes on after this screen is left, decision 2), editing
    // needs the document's edit lock (decision 47) and the user's id decides who may approve (decision 39).
    const session = createReviewSession({
      record,
      // The store keeps the revision of THIS record: every save of the session is based on the content it loaded.
      store: service.getSessionStore(record.id, { revision: record.revision }),
      processing: documentWorkflowService.pageProcessing,
      role: user.role,
      userId: user.id,
      lockService: editLockService,
      autoProcess: record.autoProcessOnOpen === true,
    })
    return { status: 'ready', session, record }
  } catch (error) {
    return { status: 'error', errors: error instanceof SessionLoadError ? error.errors : [] }
  }
}

function sessionFromFailure(error) {
  if (error?.code === SYSTEM_ERROR.forbidden) return { status: 'forbidden' }
  if (error?.code === SYSTEM_ERROR.notFound) return { status: 'missing' }
  return { status: 'error', errors: [], code: error?.code ?? SYSTEM_ERROR.unknown }
}

// The review session of a stored document, opened while the page is shown and closed (pending edits stored, running
// extractions cancelled) when leaving. Render the component that calls this with key={documentId}.
// Returns { status: 'loading' | 'ready' | 'missing' | 'forbidden' | 'error', session, record, errors, code, retry }.
// The document is read through the asynchronous document service; an adapter that already holds it in memory gives the
// session at once, otherwise the status is 'loading' first. Unsaved edits are registered with the auth layer, so a
// 401 never signs the user out while they exist (state/auth/unsavedWork.js).
export function useReviewSession(documentId, { service = documentService } = {}) {
  const user = useCurrentUser()
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(() => {
    const record = service.peekDocument?.(documentId)
    return record === undefined ? { status: 'loading' } : sessionFromRecord(record, { user, service })
  })

  // The asynchronous read (made whenever the session is not known yet; a retry makes it again).
  useEffect(() => {
    if (loaded.status !== 'loading') return undefined
    const controller = new AbortController()
    service.getDocument(documentId, { signal: controller.signal }).then(
      (record) => !controller.signal.aborted && setLoaded(sessionFromRecord(record, { user, service })),
      (error) => !controller.signal.aborted && error?.name !== 'AbortError' && setLoaded(sessionFromFailure(error)),
    )
    return () => controller.abort()
  }, [documentId, service, user, loaded.status, attempt])

  const retry = useCallback(() => {
    setLoaded({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (loaded.status !== 'ready') return undefined
    loaded.session.open()
    const unregister = registerUnsavedWorkSource(() => loaded.session.getEffectiveSaveStatus() !== 'saved')
    return () => {
      unregister()
      loaded.session.close()
    }
  }, [loaded])

  return { ...loaded, retry }
}

// The session's current view; re-renders whenever it changes.
export function useSessionView(session) {
  return useSyncExternalStore(session.subscribe, session.getView)
}
