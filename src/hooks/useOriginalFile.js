import { useEffect, useState } from 'react'
import { documentService } from '../services/documentService.js'

// The complete ORIGINAL file of a document for the viewer: { status: 'loading' | 'ready' | 'error', file }.
// A record that already carries the file (the development simulation) is used as it is; otherwise it is downloaded
// through the document service (with the bearer token) and released when the screen goes away.
// `service` can be replaced (tests).
export function useOriginalFile(documentId, knownFile = null, { service = documentService } = {}) {
  const [state, setState] = useState(() => (knownFile ? { status: 'ready', file: knownFile } : { status: 'loading', file: null }))

  useEffect(() => {
    if (knownFile) return undefined
    const controller = new AbortController()
    service.getOriginalFile(documentId, { signal: controller.signal }).then(
      (file) => !controller.signal.aborted && setState({ status: 'ready', file }),
      (error) => !controller.signal.aborted && error?.name !== 'AbortError' && setState({ status: 'error', file: null }),
    )
    return () => controller.abort()
  }, [documentId, knownFile, service])

  return knownFile ? { status: 'ready', file: knownFile } : state
}
