// The confirmation of an explicit "Save draft" click (decision 13, observation O-1).
//
// Why it exists: when autosave has already stored everything, clicking "Save draft" changes nothing on screen (the
// status was "saved" before and stays "saved"), so the user cannot tell that the click did anything. This controller
// runs the save and, ONLY when the save really ended in the "saved" state, shows a short confirmation.
//
// What it guarantees:
//   - no false success: a failed save (`ok: false`), a save that throws, or one that never answers shows no confirmation;
//   - autosave is untouched and never triggers it: only `run()` (the button) does;
//   - a second click while a save is running is ignored (no duplicate saves);
//   - the confirmation disappears by itself, and a new click restarts its time;
//   - `cancel()` stops everything that is pending (the screen was left); the controller stays usable, so React's
//     development double-mount (mount, cleanup, mount) does not break it.
//
// Framework-free, so it is tested without a browser; hooks/useManualSaveConfirmation.js connects it to a component.
//
//   state: { status: 'idle' | 'saving' | 'confirmed' }
//   save() -> Promise<{ ok: boolean }>      (the review session's saveDraft)

export const SAVE_CONFIRMATION_MS = 3500

export const MANUAL_SAVE = Object.freeze({ idle: 'idle', saving: 'saving', confirmed: 'confirmed' })

export function createManualSaveConfirmation({
  save,
  durationMs = SAVE_CONFIRMATION_MS,
  setTimeoutImpl = (...args) => globalThis.setTimeout(...args),
  clearTimeoutImpl = (...args) => globalThis.clearTimeout(...args),
}) {
  let state = Object.freeze({ status: MANUAL_SAVE.idle })
  let currentSave = save
  let timer = null
  let ticket = 0
  const listeners = new Set()

  function setStatus(status) {
    if (state.status === status) return
    state = Object.freeze({ status })
    for (const listener of listeners) listener()
  }

  function clearTimer() {
    if (timer !== null) clearTimeoutImpl(timer)
    timer = null
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // Resolves true when the draft was saved (and the confirmation is shown), false otherwise.
    async run() {
      if (state.status === MANUAL_SAVE.saving) return false
      clearTimer()
      const mine = ++ticket
      setStatus(MANUAL_SAVE.saving)
      let result = null
      try {
        result = await currentSave()
      } catch {
        result = null // a failure is reported by the save status itself, never as a confirmation
      }
      if (mine !== ticket) return false
      if (result?.ok === true) {
        setStatus(MANUAL_SAVE.confirmed)
        timer = setTimeoutImpl(() => {
          timer = null
          setStatus(MANUAL_SAVE.idle)
        }, durationMs)
        timer?.unref?.() // a pending confirmation never keeps a process (a test run) alive
        return true
      }
      setStatus(MANUAL_SAVE.idle)
      return false
    },

    // The save function to use from now on (the screen passes a new one on every render; a running save is not affected).
    setSave(next) {
      currentSave = next
    },

    // Hides the confirmation now (e.g. the document changed again after it).
    dismiss() {
      clearTimer()
      if (state.status === MANUAL_SAVE.confirmed) setStatus(MANUAL_SAVE.idle)
    },

    // The screen was left: forget what is pending (a save that is still running will not show a confirmation).
    cancel() {
      ticket += 1
      clearTimer()
      setStatus(MANUAL_SAVE.idle)
    },
  }
}
