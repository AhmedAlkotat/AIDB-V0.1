// A source of "something may have changed" signals (decision D8: polling first, extensible to server-sent events).
//
//   subscribe(listener) -> unsubscribe     the listener is called (with no arguments) whenever the data should be re-read
//   notify()                               signal now (e.g. right after this client changed something)
//
// The listeners re-read what they show; they never trust the signal's content, so replacing the polling feed with an
// SSE feed (same two methods, `notify` called when an event arrives) needs no change in any consumer.

export function createPollingChangeFeed({
  intervalMs = 5000,
  isActive = () => globalThis.document?.visibilityState !== 'hidden', // no polling in a hidden tab
  setIntervalImpl = (...args) => globalThis.setInterval(...args),
  clearIntervalImpl = (...args) => globalThis.clearInterval(...args),
} = {}) {
  const listeners = new Set()
  let timer = null

  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  function start() {
    if (timer !== null) return
    timer = setIntervalImpl(() => {
      if (isActive()) notify()
    }, intervalMs)
    timer?.unref?.() // a polling timer never keeps a process (a test run) alive
  }

  function stop() {
    if (timer === null) return
    clearIntervalImpl(timer)
    timer = null
  }

  return {
    intervalMs,
    notify,
    subscribe(listener) {
      listeners.add(listener)
      start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    // Number of listeners (tests, diagnostics).
    size: () => listeners.size,
  }
}
