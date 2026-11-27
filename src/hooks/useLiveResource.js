import { useEffect, useState, useSyncExternalStore } from 'react'
import { createLiveResource } from '../state/resource/liveResource.js'

// Shows server data that stays up to date (see state/resource/liveResource.js):
//   { status, data, error, refreshError, reload }
// `options` = { load, peek, subscribe } as for createLiveResource. The resource is created ONCE per mounted screen, so
// render a screen that depends on an id with `key={id}` (the review page does).
export function useLiveResource(options) {
  const [resource] = useState(() => createLiveResource(options))
  const state = useSyncExternalStore(resource.subscribe, resource.getState, resource.getState)
  useEffect(() => resource.start(), [resource])
  return { ...state, reload: resource.reload }
}
