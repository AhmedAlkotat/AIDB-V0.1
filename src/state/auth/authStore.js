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
// state: { status, user, error, isSubmitting }, where `error` is a code from AUTH_ERROR or
// 'sessionExpired' (the server said the session is no longer valid).

import { AUTH_ERROR, AuthError } from '../../services/authErrors.js'

export const SESSION_EXPIRED = 'sessionExpired'

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

export function createAuthStore(service) {
  let state = { status: AUTH_STATUS.initializing, user: null, error: null, isSubmitting: false }
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
      setState({ status: AUTH_STATUS.unauthenticated, user: null, error: null, isSubmitting: false })
      try {
        await service.logout()
      } catch {
        // Nothing more to do: the local session is already gone.
      }
    },

    // The server rejected our credentials (HTTP 401) while signed in.
    expireSession() {
      if (state.status !== AUTH_STATUS.authenticated) return
      epoch += 1
      setState({ status: AUTH_STATUS.unauthenticated, user: null, error: SESSION_EXPIRED, isSubmitting: false })
      Promise.resolve(service.logout()).catch(() => {})
    },

    clearError() {
      if (state.error !== null) setState({ error: null })
    },
  }
  return store
}
