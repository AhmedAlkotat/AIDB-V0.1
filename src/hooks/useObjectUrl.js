import { useCallback, useEffect, useRef } from 'react'

// Manages a single temporary object URL (e.g. for a local file preview).
// `createObjectUrl(blob)` revokes the previous URL before creating a new one,
// `revokeObjectUrl()` releases the current one, and any remaining URL is
// revoked automatically when the component unmounts.
export function useObjectUrl() {
  const urlRef = useRef(null)

  const revokeObjectUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  const createObjectUrl = useCallback(
    (blob) => {
      revokeObjectUrl()
      urlRef.current = URL.createObjectURL(blob)
      return urlRef.current
    },
    [revokeObjectUrl],
  )

  useEffect(() => revokeObjectUrl, [revokeObjectUrl])

  return { createObjectUrl, revokeObjectUrl }
}
