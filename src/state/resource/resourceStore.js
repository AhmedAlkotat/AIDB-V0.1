// A loaded piece of data (a list, a status) with its loading and error states, independent of
// React (so it can be tested without a browser; useResource connects it to a screen).
//
// state: { status: 'loading' | 'ready' | 'error', data, error }, where `error` is the code of
// the failure (SYSTEM_ERROR / EMPLOYEE_ERROR ...). A newer load() wins over an older one that is
// still in flight. `load({ quiet: true })` refreshes without switching to the loading state (after
// an action, so the list does not flash away). `set` replaces the data after an action the
// service acknowledged.

export function createResourceStore(loader, { initialData = null } = {}) {
  let state = { status: 'loading', data: initialData, error: null }
  let epoch = 0
  const listeners = new Set()

  function setState(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async load({ quiet = false } = {}) {
      const mine = ++epoch
      if (!quiet || state.status !== 'ready') setState({ status: 'loading', error: null })
      try {
        const data = await loader()
        if (mine === epoch) setState({ status: 'ready', data })
      } catch (error) {
        if (mine === epoch) setState({ status: 'error', error: typeof error?.code === 'string' ? error.code : 'unknown' })
      }
    },
    set: (data) => setState({ status: 'ready', data, error: null }),
  }
}
