// DEVELOPMENT-ONLY mock authentication, so both roles can be tried before the backend
// exists. It is imported by services/authService.js and used only inside its
// `import.meta.env.DEV` branch, so it is not part of production bundles (checked in the
// Batch A verification by searching the built files).
//
// Do NOT reuse these accounts or passwords anywhere real. Nothing here is secure: the
// "session" is a marker in sessionStorage so a reload keeps you signed in during
// development. That is NOT the JWT storage strategy, which is still to be agreed.

import { USER_ROLES } from '../constants/roles.js'
import { DEMO_USER } from '../data/mock/demoUser.mock.js'
import { AUTH_ERROR, AuthError } from '../services/authErrors.js'

export const MOCK_SESSION_KEY = 'aidp.dev.mockSession'

// The `id` of the mock employee equals the owner of the demonstration documents
// (data/mock/reviewDemo.mock.js), so the employee sees them and the Admin sees all.
// A function (not a top-level constant) so nothing here runs unless the mock is used.
export function getMockAccounts() {
  return [
    { identifier: 'employee', password: 'employee-dev', user: { id: DEMO_USER.id, displayName: 'موظف تجريبي', role: USER_ROLES.employee } },
    { identifier: 'admin', password: 'admin-dev', user: { id: 'demo-admin', displayName: 'مدير تجريبي', role: USER_ROLES.orgAdmin } },
    // A deactivated employee (decision 16), to see the "account disabled" message.
    { identifier: 'disabled', password: 'disabled-dev', disabled: true, user: { id: 'demo-disabled', displayName: 'موظف معطل', role: USER_ROLES.employee } },
  ]
}

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve())

// `storage`: where the dev session marker lives (default sessionStorage when it exists).
// `latencyMs`: simulated server delay, so loading states are visible.
export function createMockAuthService({ storage = globalThis.sessionStorage, latencyMs = 250 } = {}) {
  const accounts = getMockAccounts()
  const readMarker = () => {
    try {
      return JSON.parse(storage?.getItem(MOCK_SESSION_KEY) ?? 'null')
    } catch {
      return null
    }
  }

  return {
    // The login page offers to fill these in. Never includes anything for production.
    devAccounts: Object.freeze(accounts.filter((account) => !account.disabled).map(({ identifier, password, user }) => ({ identifier, password, role: user.role }))),

    async restoreSession() {
      await wait(latencyMs)
      const account = accounts.find((candidate) => candidate.identifier === readMarker()?.identifier)
      if (!account || account.disabled) return null
      return { ...account.user }
    },

    async login({ identifier, password } = {}) {
      await wait(latencyMs)
      const account = accounts.find((candidate) => candidate.identifier === String(identifier ?? '').trim())
      if (!account || account.password !== password) throw new AuthError(AUTH_ERROR.invalidCredentials)
      if (account.disabled) throw new AuthError(AUTH_ERROR.accountDisabled)
      // Only the account name is remembered, never the password.
      storage?.setItem(MOCK_SESSION_KEY, JSON.stringify({ identifier: account.identifier }))
      return { ...account.user }
    },

    async logout() {
      // The session ends at once; only the (simulated) server answer takes time.
      storage?.removeItem(MOCK_SESSION_KEY)
      await wait(latencyMs)
    },
  }
}
