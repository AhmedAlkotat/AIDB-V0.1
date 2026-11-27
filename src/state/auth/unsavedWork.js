// Who has work on screen that the server has not stored yet (a review session with unsaved edits).
//
// The auth layer asks this before it ends a session: an HTTP 401 must never throw away what the user typed. While
// unsaved work exists the session is only marked "expiring" (state/auth/authStore.js): the screen stays, the user is asked
// to sign in again IN PLACE and the save is retried. Nothing here stores any content; a source is just a function that
// answers "is there unsaved work?".

const sources = new Set()

// Registers a source (`() => boolean`). Returns the function that removes it again.
export function registerUnsavedWorkSource(source) {
  sources.add(source)
  return () => sources.delete(source)
}

export function hasUnsavedWork() {
  for (const source of sources) {
    try {
      if (source()) return true
    } catch {
      // A broken source must not hide the others (or end a session by accident): ignore it.
    }
  }
  return false
}
