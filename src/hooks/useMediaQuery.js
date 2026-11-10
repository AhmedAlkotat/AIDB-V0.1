import { useCallback, useSyncExternalStore } from 'react'

// Returns whether a CSS media query currently matches, updating on change.
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const mediaQueryList = window.matchMedia(query)
      mediaQueryList.addEventListener('change', onChange)
      return () => mediaQueryList.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = () => window.matchMedia(query).matches
  const getServerSnapshot = () => false

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
