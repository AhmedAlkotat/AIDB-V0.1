// Autosave state machine (framework-independent, injectable timers).
//
// Status (SAVE_STATUS) always reflects what the storage has ACKNOWLEDGED:
//   saved    nothing pending; the storage confirmed the latest changes
//   unsaved  changes exist and a save is scheduled
//   saving   `save()` was called and has not settled yet
//   failed   `save()` rejected; the changes are NOT saved (it keeps retrying
//            with backoff, and `retry()` tries immediately)
// "saved" is only ever set after the promise returned by `save()` resolves,
// and only if no newer change arrived meanwhile.
//
// `save()` must read the CURRENT state when it is called and return a promise
// that settles once the storage acknowledged (or rejected) the write.

import { SAVE_STATUS } from '../domain/document/saveStatus.js'

const defaultScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  now: () => Date.now(),
}

export function createAutosaveController({
  save,
  delayMs = 800,
  maxWaitMs = 5000,
  retryDelaysMs = [2000, 5000, 15000],
  scheduler = defaultScheduler,
} = {}) {
  if (typeof save !== 'function') throw new TypeError('createAutosaveController needs a save() function.')

  let revision = 0 // bumped on every change
  let savedRevision = 0 // last revision the storage acknowledged
  let timer = null
  let firstDirtyAt = null
  let inFlight = null
  let retryIndex = 0
  let disposed = false
  let state = Object.freeze({ status: SAVE_STATUS.saved, error: null })
  const listeners = new Set()

  function setState(status, error = null) {
    if (state.status === status && state.error === error) return
    state = Object.freeze({ status, error })
    for (const listener of listeners) listener(state)
  }

  function clearTimer() {
    if (timer !== null) {
      scheduler.clearTimeout(timer)
      timer = null
    }
  }

  function scheduleSave() {
    clearTimer()
    const waited = firstDirtyAt === null ? 0 : scheduler.now() - firstDirtyAt
    timer = scheduler.setTimeout(() => {
      timer = null
      run()
    }, Math.max(0, Math.min(delayMs, maxWaitMs - waited)))
  }

  // Starts a save now. Returns the in-flight promise (never rejects).
  function run() {
    if (disposed) return Promise.resolve()
    if (inFlight) return inFlight
    if (revision === savedRevision) {
      setState(SAVE_STATUS.saved)
      return Promise.resolve()
    }

    clearTimer()
    const target = revision
    setState(SAVE_STATUS.saving)
    inFlight = Promise.resolve()
      .then(() => save())
      .then(
        () => {
          inFlight = null
          retryIndex = 0
          savedRevision = target
          if (disposed) return
          if (revision !== savedRevision) {
            // Changed while saving: those changes are still unsaved.
            firstDirtyAt = scheduler.now()
            setState(SAVE_STATUS.unsaved)
            scheduleSave()
          } else {
            firstDirtyAt = null
            setState(SAVE_STATUS.saved)
          }
        },
        (error) => {
          inFlight = null
          if (disposed) return
          setState(SAVE_STATUS.failed, error ?? new Error('Save failed.'))
          if (retryIndex < retryDelaysMs.length) {
            clearTimer()
            timer = scheduler.setTimeout(() => {
              timer = null
              run()
            }, retryDelaysMs[retryIndex])
            retryIndex += 1
          }
        },
      )
    return inFlight
  }

  return {
    // Call after every change to the saved data.
    markDirty() {
      if (disposed) return
      revision += 1
      firstDirtyAt ??= scheduler.now()
      // While a save is in flight the status stays "saving" (it is true); the
      // newer change is handled when that save settles.
      if (!inFlight) setState(SAVE_STATUS.unsaved)
      if (!inFlight) scheduleSave()
    },

    // Saves everything pending now. Resolves when the data is saved or a save failed.
    async flush() {
      clearTimer()
      for (;;) {
        if (disposed || revision === savedRevision) return state
        await run()
        if (state.status === SAVE_STATUS.failed) return state
      }
    },

    // Immediate retry after a failure (also resets the backoff).
    retry() {
      if (disposed || state.status !== SAVE_STATUS.failed) return Promise.resolve()
      retryIndex = 0
      clearTimer()
      return run()
    },

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      disposed = true
      clearTimer()
      listeners.clear()
    },
  }
}
