// A piece of server data that a screen shows and keeps up to date, independent of React (so it is testable without a
// browser; hooks/useLiveResource.js connects it to a component).
//
//   state: { status: 'loading' | 'ready' | 'error', data, error, refreshError }
//     loading       nothing to show yet
//     ready         `data` is shown (an empty list is still "ready"; the screen decides what "empty" means)
//     error         the first load failed: `error` is the failure's code
//     refreshError  a BACKGROUND refresh failed while older data is shown: the data is kept (never blanked) and the
//                   code is here so the screen may mention it
//
// Rules that protect the user:
//   - a STALE answer never overwrites a newer one: every load gets a ticket and only the newest ticket may write;
//   - leaving the screen (stop) aborts what is in flight and ignores whatever still arrives;
//   - a failed background refresh keeps the data on screen;
//   - `peek` (optional, synchronous) gives the first render real data when the source already holds it in memory.
//
//   createLiveResource({ load(signal) -> Promise<data>, peek() -> data | undefined, subscribe(listener) -> unsubscribe })

const isAbort = (error) => error?.name === 'AbortError'
const codeOf = (error) => (typeof error?.code === 'string' ? error.code : 'unknown')

export function createLiveResource({ load, peek, subscribe }) {
  const first = peek?.()
  let state = first === undefined ? { status: 'loading', data: null, error: null, refreshError: null } : { status: 'ready', data: first, error: null, refreshError: null }
  const listeners = new Set()
  let ticket = 0
  let controller = null
  let started = false
  let unsubscribeSource = null

  function setState(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  // `quiet`: a background refresh (no loading state, a failure keeps the data).
  async function reload({ quiet = false } = {}) {
    const mine = ++ticket
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    if (!quiet && state.status !== 'ready') setState({ status: 'loading', error: null })
    try {
      const data = await load(signal)
      if (mine !== ticket || signal.aborted) return
      setState({ status: 'ready', data, error: null, refreshError: null })
    } catch (error) {
      if (mine !== ticket || signal.aborted || isAbort(error)) return
      if (state.status === 'ready') setState({ refreshError: codeOf(error) })
      else setState({ status: 'error', error: codeOf(error) })
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reload,
    // Replaces the data after an action the server acknowledged.
    set: (data) => setState({ status: 'ready', data, error: null, refreshError: null }),

    // Called while a screen shows the data: loads it (always, even when `peek` gave a first value) and follows the
    // source's change signals. Returns the function that stops it.
    start() {
      if (started) return () => {}
      started = true
      reload({ quiet: state.status === 'ready' })
      unsubscribeSource = subscribe?.(() => reload({ quiet: true })) ?? null
      return () => {
        started = false
        ticket += 1 // anything still in flight is stale now
        controller?.abort()
        controller = null
        unsubscribeSource?.()
        unsubscribeSource = null
      }
    },
  }
}
