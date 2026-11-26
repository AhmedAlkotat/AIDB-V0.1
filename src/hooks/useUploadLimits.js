import { useCallback, useEffect, useState } from 'react'
import { settingsService } from '../services/settingsService.js'

// The Admin's upload limits (decisions 36 and 48), read from the system settings service:
//   { status: 'loading' | 'ready' | 'error', limits: { maxFileSizeMb, maxSelectedPages } | null, error, reload }
// Nothing is hard-coded: until the limits are known the upload screen cannot check a file (it says
// so instead of guessing a number). `service` can be replaced (tests).
export function useUploadLimits({ service = settingsService } = {}) {
  const [state, setState] = useState({ status: 'loading', limits: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    service.getLimits().then(
      (limits) => {
        if (!cancelled) setState({ status: 'ready', limits, error: null })
      },
      (error) => {
        if (!cancelled) setState({ status: 'error', limits: null, error: typeof error?.code === 'string' ? error.code : 'unknown' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [service, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading', limits: null, error: null })
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, reload }
}
