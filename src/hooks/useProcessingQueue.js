import { useEffect, useState } from 'react'
import { documentWorkflowService } from '../services/documentWorkflowService.js'

// The caller's jobs in the central queue: { blocked, jobs: [{ id, kind, documentId, pageNumber, state,
// position }] }. `status` is 'loading' | 'ready' | 'error'. Refreshes whenever the queue changes.
// `service` can be replaced (tests).
export function useProcessingQueue({ service = documentWorkflowService } = {}) {
  const [state, setState] = useState({ status: 'loading', blocked: null, jobs: [] })

  useEffect(() => {
    let cancelled = false
    const refresh = () =>
      service.getQueue().then(
        (queue) => {
          if (!cancelled) setState({ status: 'ready', blocked: queue.blocked, jobs: queue.jobs })
        },
        () => {
          if (!cancelled) setState({ status: 'error', blocked: null, jobs: [] })
        },
      )
    refresh()
    const unsubscribe = service.subscribe(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [service])

  return state
}

// The FIFO position of a document's waiting job (1 = next), or null when it is not waiting.
export function getDocumentQueuePosition(jobs, documentId) {
  const job = jobs.find((candidate) => candidate.documentId === documentId && candidate.kind === 'document' && candidate.state === 'queued')
  return job?.position ?? null
}
