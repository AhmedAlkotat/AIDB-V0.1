// Centralized authentication state, independent of React (so it can be tested without a
// browser; AuthProvider connects it to the component tree).
//
// status:
//   'initializing'    looking for an existing session (protected pages wait)
//   'authenticated'   `user` is set
//   'unauthenticated' no session; `error` may explain why (a failed login, an ended session)
//   'failed'          the existing session could not be checked (e.g. the server is
//                     unreachable): the user may retry; we do not pretend to be signed out
//
// state: { status, user, error, isSubmitting, sessionExpiring }, where `error` is a code from AUTH_ERROR or
// 'sessionExpired' (the server said the session is no longer valid). `sessionExpiring` is true while the server
// rejected the session but the user still has UNSAVED WORK on screen: the user stays signed in locally, nothing is
// discarded, and `reauthenticate` signs the same user in again in place (then the save is retried).

import { AUTH_ERROR, AuthError } from '../../services/authErrors.js'
import { hasUnsavedWork as defaultHasUnsavedWork } from './unsavedWork.js'

export const SESSION_EXPIRED = 'sessionExpired'
export const SESSION_USER_MISMATCH = 'sessionUserMismatch'

export const AUTH_STATUS = Object.freeze({
  initializing: 'initializing',
  authenticated: 'authenticated',
  unauthenticated: 'unauthenticated',
  failed: 'failed',
})

const errorCodeOf = (error) => (error instanceof AuthError ? error.code : AUTH_ERROR.unknown)

// True when the previous user's data must be removed: someone WAS signed in and now
// nobody, or somebody else, is. (Restoring a session on startup is not a change.)
export function shouldClearSessionData(previousUser, nextUser) {
  return previousUser !== null && previousUser !== undefined && previousUser.id !== nextUser?.id
}

export function createAuthStore(service, { hasUnsavedWork = defaultHasUnsavedWork } = {}) {
  let state = { status: AUTH_STATUS.initializing, user: null, error: null, isSubmitting: false, sessionExpiring: false }
  let initialization = null
  // Bumped whenever the session changes, so a slow answer for an older request is ignored.
  let epoch = 0
  const listeners = new Set()

  function setState(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  const store = {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // Looks for an existing session once; safe to call repeatedly (StrictMode).
    initialize() {
      if (!initialization) {
        const mine = epoch
        initialization = (async () => {
          try {
            const user = await service.restoreSession()
            if (mine !== epoch) return
            setState(user ? { status: AUTH_STATUS.authenticated, user, error: null } : { status: AUTH_STATUS.unauthenticated, user: null })
          } catch {
            if (mine !== epoch) return
            setState({ status: AUTH_STATUS.failed, user: null })
          }
        })()
      }
      return initialization
    },

    // Checks the session again after 'failed'.
    retryInitialize() {
      if (state.status !== AUTH_STATUS.failed) return initialization
      initialization = null
      setState({ status: AUTH_STATUS.initializing, error: null })
      return store.initialize()
    },

    // Resolves true when signed in. Failures are reported through `state.error`.
    async login({ identifier, password }) {
      if (state.isSubmitting || state.status === AUTH_STATUS.authenticated) return false
      if (String(identifier ?? '').trim() === '' || String(password ?? '') === '') {
        setState({ error: AUTH_ERROR.missingFields })
        return false
      }
      const mine = ++epoch
      setState({ isSubmitting: true, error: null })
      try {
        const user = await service.login({ identifier: String(identifier).trim(), password })
        if (mine !== epoch) return false
        setState({ status: AUTH_STATUS.authenticated, user, error: null, isSubmitting: false })
        return true
      } catch (error) {
        if (mine !== epoch) return false
        setState({ status: AUTH_STATUS.unauthenticated, user: null, error: errorCodeOf(error), isSubmitting: false })
        return false
      }
    },

    // The user is signed out locally even when the server could not be told.
    async logout() {
      if (state.status !== AUTH_STATUS.authenticated) return
      epoch += 1
      setState({ status: AUTH_STATUS.unauthenticated, user: null, error: null, isSubmitting: false, sessionExpiring: false })
      try {
        await service.logout()
      } catch {
        // Nothing more to do: the local session is already gone.
      }
    },

    // The server rejected our credentials (HTTP 401) while signed in.
    expireSession() {
      if (state.status !== AUTH_STATUS.authenticated) return
      // Never throw away unsaved work: keep the screen and ask for a new sign-in in place.
      if (hasUnsavedWork()) {
        if (!state.sessionExpiring) setState({ sessionExpiring: true, error: SESSION_EXPIRED })
        return
      }
      epoch += 1
      setState({ status: AUTH_STATUS.unauthenticated, user: null, error: SESSION_EXPIRED, isSubmitting: false, sessionExpiring: false })
      Promise.resolve(service.logout()).catch(() => {})
    },

    // While the session is "expiring": signs in again and keeps the screen if it is the SAME user. Another user's
    // credentials are refused (their session is ended again) so that nobody else can save into this user's work.
    // Resolves true when the session is valid again.
    async reauthenticate({ identifier, password }) {
      if (state.status !== AUTH_STATUS.authenticated || !state.sessionExpiring || state.isSubmitting) return false
      if (String(identifier ?? '').trim() === '' || String(password ?? '') === '') {
        setState({ error: AUTH_ERROR.missingFields })
        return false
      }
      setState({ isSubmitting: true, error: null })
      try {
        const user = await service.login({ identifier: String(identifier).trim(), password })
        if (user?.id !== state.user?.id) {
          Promise.resolve(service.logout()).catch(() => {})
          setState({ isSubmitting: false, error: SESSION_USER_MISMATCH })
          return false
        }
        setState({ sessionExpiring: false, error: null, isSubmitting: false })
        return true
      } catch (error) {
        setState({ isSubmitting: false, error: errorCodeOf(error) })
        return false
      }
    },

    clearError() {
      if (state.error !== null) setState({ error: null })
    },
  }
  return store
}
