import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { setUnauthorizedHandler } from '../services/apiClient.js'
import { createAuthService } from '../services/authService.js'
import { createAuthStore, shouldClearSessionData } from '../state/auth/authStore.js'
import { AuthContext } from './authContext.js'

// Holds the authentication state for the whole app. It must sit inside LanguageProvider
// and outside the router.
//
// - `service` (optional) replaces the authentication service, e.g. in tests.
// - `onSessionEnded` runs when the signed-in user signs out, is signed out, or is replaced by
//   another user. The app uses it to wipe the in-memory documents, so one user's data
//   never reaches the next session. It runs after the screens of the old session have
//   unmounted (they store their pending edits while unmounting).
export function AuthProvider({ children, service, onSessionEnded }) {
  const [{ store, devAccounts, devReset }] = useState(() => {
    const authService = service ?? createAuthService()
    return {
      store: createAuthStore(authService),
      devAccounts: authService.devAccounts ?? null,
      devReset: authService.resetDevData?.bind(authService) ?? null,
    }
  })
  const state = useSyncExternalStore(store.subscribe, store.getState)

  useEffect(() => {
    store.initialize()
  }, [store])

  // A 401 from any API call means the session is over.
  useEffect(() => setUnauthorizedHandler(() => store.expireSession()), [store])

  const previousUser = useRef(null)
  const endedCallback = useRef(onSessionEnded)
  useEffect(() => {
    endedCallback.current = onSessionEnded
  })
  useEffect(() => {
    if (shouldClearSessionData(previousUser.current, state.user)) endedCallback.current?.()
    previousUser.current = state.user
  }, [state.user])

  const value = useMemo(
    () => ({
      ...state,
      login: store.login,
      logout: store.logout,
      clearError: store.clearError,
      retryInitialize: store.retryInitialize,
      devAccounts,
      devReset,
    }),
    [state, store, devAccounts, devReset],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
