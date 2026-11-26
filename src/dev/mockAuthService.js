// DEVELOPMENT-ONLY mock authentication, so both roles can be tried before the backend
// exists. It is imported by services/authService.js and used only inside its
// `import.meta.env.DEV` branch, so it is not part of production bundles (checked by
// searching the built files).
//
// Do NOT reuse these accounts or passwords anywhere real. Nothing here is secure: the
// "session" is a marker in sessionStorage so a reload keeps you signed in during
// development. That is NOT the JWT storage strategy, which is still to be agreed.
//
// The accounts live in the shared mock account store (mockAccountStore.js), which the mock
// employee management also writes to: a deactivated account cannot sign in or restore a
// session, a changed password applies to the next sign-in, a new employee can sign in.

import { EMPLOYEE_STATUS } from '../domain/employee/employee.js'
import { AUTH_ERROR, AuthError } from '../services/authErrors.js'
import { getMockAccounts, getMockAccountStore } from './mockAccountStore.js'

export { getMockAccounts }
export const MOCK_SESSION_KEY = 'aidp.dev.mockSession'

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve())

const toUser = (account) => ({ id: account.id, displayName: account.displayName, role: account.role })

// `storage`: where the dev session marker lives (default sessionStorage when it exists).
// `latencyMs`: simulated server delay, so loading states are visible.
// `accountStore`: the shared mock accounts (injectable for tests).
export function createMockAuthService({ storage = globalThis.sessionStorage, latencyMs = 250, accountStore = getMockAccountStore() } = {}) {
  const readMarker = () => {
    try {
      return JSON.parse(storage?.getItem(MOCK_SESSION_KEY) ?? 'null')
    } catch {
      return null
    }
  }

  return {
    // The login page offers to fill these in (the original accounts only; a password the Admin
    // has changed since is no longer valid, see resetDevData). Never includes anything for
    // production.
    devAccounts: Object.freeze(getMockAccounts().filter((account) => !account.disabled).map(({ identifier, password, user }) => ({ identifier, password, role: user.role }))),

    // Development helper: forget every account change and start from the original accounts.
    async resetDevData() {
      accountStore.reset()
      storage?.removeItem(MOCK_SESSION_KEY)
    },

    async restoreSession() {
      await wait(latencyMs)
      const account = accountStore.findByIdentifier(readMarker()?.identifier)
      if (!account || account.status !== EMPLOYEE_STATUS.active) return null
      return toUser(account)
    },

    async login({ identifier, password } = {}) {
      await wait(latencyMs)
      const account = accountStore.findByIdentifier(identifier)
      if (!account || account.password !== password) throw new AuthError(AUTH_ERROR.invalidCredentials)
      if (account.status !== EMPLOYEE_STATUS.active) throw new AuthError(AUTH_ERROR.accountDisabled)
      // Only the account name is remembered, never the password.
      storage?.setItem(MOCK_SESSION_KEY, JSON.stringify({ identifier: account.identifier }))
      return toUser(account)
    },

    async logout() {
      // The session ends at once; only the (simulated) server answer takes time.
      storage?.removeItem(MOCK_SESSION_KEY)
      await wait(latencyMs)
    },
  }
}
