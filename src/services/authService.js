// The authentication service the app talks to. It is REPLACEABLE: the rest of the
// frontend only knows this interface, never how the session is really obtained.
//
//   restoreSession() -> Promise<user | null>   the user of an existing session, or null
//   login({ identifier, password }) -> Promise<user>   rejects with AuthError
//   logout() -> Promise<void>
//   devAccounts      (development mock only) accounts the login page may offer to fill in
//
// A `user` is { id, displayName, role } with `role` one of USER_ROLES (constants/roles.js).
//
// NOT CONNECTED TO A BACKEND YET. The endpoint names, the login identifier (username or
// email), the JWT storage strategy and the response schemas are not agreed with the
// backend, so `httpAuthService` below only reports "not connected" and never signs
// anyone in. Production builds therefore cannot sign in until the real service
// replaces it; there is no bypass and no built-in credential.
//
// Development builds (`npm run dev`) use a mock service instead (src/dev/). The mock is
// only reachable through the `import.meta.env.DEV` branch of createAuthService, which
// the bundler removes from production builds.

import { createMockAuthService } from '../dev/mockAuthService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { AUTH_ERROR, AuthError } from './authErrors.js'

export { AUTH_ERROR, AuthError }

// Backend not connected: no session exists, and signing in is refused honestly.
export const httpAuthService = Object.freeze({
  async restoreSession() {
    return null
  },
  async login() {
    throw new AuthError(AUTH_ERROR.notConnected, 'Authentication is not connected to a backend yet.')
  },
  async logout() {},
})

// The service used by the app: the mock in development, the real one otherwise.
export function createAuthService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockAuthService()
  return httpAuthService
}
