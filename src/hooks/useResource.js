import { useEffect, useState, useSyncExternalStore } from 'react'
import { createResourceStore } from '../state/resource/resourceStore.js'

// Loads data once when a screen opens: { status: 'loading' | 'ready' | 'error', data, error,
// reload, set } (see state/resource/resourceStore.js). `loader` is called on every (re)load.
export function useResource(loader, options) {
  const [store] = useState(() => createResourceStore(loader, options))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  useEffect(() => {
    store.load()
  }, [store])

  return { ...state, reload: store.load, set: store.set }
}
