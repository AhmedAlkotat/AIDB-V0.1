// Batch A: authentication and role-based access (frontend only, no backend).
//
// These tests cover the pure logic: the auth state machine, the replaceable auth service,
// the development mock, the API client, the route and navigation rules, and the
// separation of user data between sessions. Rendering is covered in authUi.test.js and
// the real browser flow in scripts/browser-checks/auth.check.mjs.
// Frontend role checks only shape the interface; they are not a security boundary.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ADMIN_ROLES, ALL_ROLES, USER_ROLES } from '../src/constants/roles.js'
import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../src/data/mock/reviewDemo.mock.js'
import { createMockAuthService, getMockAccounts, MOCK_SESSION_KEY } from '../src/dev/mockAuthService.js'
import { getNavigationGroup, navigationItems } from '../src/routes/navigation.js'
import { getPostLoginPath, getRouteDecision, ROUTE_DECISION } from '../src/routes/routeAccess.js'
import { API_ERROR, ApiError, createApiClient } from '../src/services/apiClient.js'
import { AUTH_ERROR, AuthError } from '../src/services/authErrors.js'
import { createAuthService, httpAuthService } from '../src/services/authService.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { AUTH_STATUS, createAuthStore, SESSION_EXPIRED, shouldClearSessionData } from '../src/state/auth/authStore.js'
import { getInitials } from '../src/utils/userInitials.js'
import { makeSnapshot } from './sessionHelpers.js'

const EMPLOYEE = { id: 'u-employee', displayName: 'Employee One', role: USER_ROLES.employee }
const ADMIN = { id: 'u-admin', displayName: 'Admin One', role: USER_ROLES.orgAdmin }

// A controllable fake service. Every call is recorded.
function fakeService({ session = null, users = { employee: EMPLOYEE, admin: ADMIN }, failRestore = false, failLogout = false } = {}) {
  const calls = []
  return {
    calls,
    async restoreSession() {
      calls.push('restore')
      if (failRestore) throw new Error('offline')
      return session
    },
    async login({ identifier, password }) {
      calls.push(`login:${identifier}`)
      const user = users[identifier]
      if (!user || password !== 'ok') throw new AuthError(AUTH_ERROR.invalidCredentials)
      return user
    },
    async logout() {
      calls.push('logout')
      if (failLogout) throw new Error('offline')
    },
  }
}

const memoryStorage = () => {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }
}

describe('roles', () => {
  test('there are exactly two roles: employee and the Admin', () => {
    assert.deepEqual([...ALL_ROLES].sort(), ['employee', 'orgAdmin'])
    assert.deepEqual([...ADMIN_ROLES], ['orgAdmin'])
  })
})

describe('auth store: starting up', () => {
  test('starts as "initializing" and finds no session', async () => {
    const store = createAuthStore(fakeService())
    assert.equal(store.getState().status, AUTH_STATUS.initializing)
    await store.initialize()
    assert.equal(store.getState().status, AUTH_STATUS.unauthenticated)
    assert.equal(store.getState().user, null)
  })

  test('restores an existing session', async () => {
    const store = createAuthStore(fakeService({ session: ADMIN }))
    await store.initialize()
    assert.equal(store.getState().status, AUTH_STATUS.authenticated)
    assert.deepEqual(store.getState().user, ADMIN)
  })

  test('initialize is safe to call twice (StrictMode): one session check', async () => {
    const service = fakeService()
    const store = createAuthStore(service)
    await Promise.all([store.initialize(), store.initialize()])
    assert.deepEqual(service.calls, ['restore'])
  })

  test('a failed session check is "failed" (not "signed out") and can be retried', async () => {
    let failing = true
    const service = fakeService({ session: EMPLOYEE })
    const original = service.restoreSession
    service.restoreSession = async () => {
      if (failing) throw new Error('offline')
      return original()
    }
    const store = createAuthStore(service)
    await store.initialize()
    assert.equal(store.getState().status, AUTH_STATUS.failed)
    failing = false
    await store.retryInitialize()
    assert.equal(store.getState().status, AUTH_STATUS.authenticated)
  })
})

describe('auth store: login and logout', () => {
  test('a valid login authenticates both roles', async () => {
    for (const [identifier, user] of [['employee', EMPLOYEE], ['admin', ADMIN]]) {
      const store = createAuthStore(fakeService())
      await store.initialize()
      assert.equal(await store.login({ identifier, password: 'ok' }), true)
      assert.equal(store.getState().status, AUTH_STATUS.authenticated)
      assert.deepEqual(store.getState().user, user)
      assert.equal(store.getState().error, null)
      assert.equal(store.getState().isSubmitting, false)
    }
  })

  test('wrong credentials leave the user signed out with a clear error', async () => {
    const store = createAuthStore(fakeService())
    await store.initialize()
    assert.equal(await store.login({ identifier: 'employee', password: 'wrong' }), false)
    assert.equal(store.getState().status, AUTH_STATUS.unauthenticated)
    assert.equal(store.getState().error, AUTH_ERROR.invalidCredentials)
    assert.equal(store.getState().isSubmitting, false)
  })

  test('empty fields are rejected without calling the service', async () => {
    const service = fakeService()
    const store = createAuthStore(service)
    await store.initialize()
    assert.equal(await store.login({ identifier: '  ', password: 'ok' }), false)
    assert.equal(await store.login({ identifier: 'employee', password: '' }), false)
    assert.equal(store.getState().error, AUTH_ERROR.missingFields)
    assert.deepEqual(service.calls, ['restore'])
  })

  test('an unexpected failure becomes the "unknown" error; a service code is kept', async () => {
    const service = fakeService()
    service.login = async () => {
      throw new Error('boom')
    }
    const store = createAuthStore(service)
    await store.initialize()
    await store.login({ identifier: 'a', password: 'b' })
    assert.equal(store.getState().error, AUTH_ERROR.unknown)
    service.login = async () => {
      throw new AuthError(AUTH_ERROR.accountDisabled)
    }
    await store.login({ identifier: 'a', password: 'b' })
    assert.equal(store.getState().error, AUTH_ERROR.accountDisabled)
  })

  test('a second login while one is running is ignored (no double submit)', async () => {
    const service = fakeService()
    const store = createAuthStore(service)
    await store.initialize()
    const first = store.login({ identifier: 'employee', password: 'ok' })
    assert.equal(store.getState().isSubmitting, true)
    assert.equal(await store.login({ identifier: 'admin', password: 'ok' }), false)
    await first
    assert.equal(service.calls.filter((call) => call.startsWith('login')).length, 1)
    assert.deepEqual(store.getState().user, EMPLOYEE)
  })

  test('logout signs out, tells the service, and survives a service failure', async () => {
    const service = fakeService({ session: EMPLOYEE, failLogout: true })
    const store = createAuthStore(service)
    await store.initialize()
    await store.logout()
    assert.equal(store.getState().status, AUTH_STATUS.unauthenticated)
    assert.equal(store.getState().user, null)
    assert.ok(service.calls.includes('logout'))
  })

  test('a slow session check that is overtaken by a login does not overwrite it', async () => {
    let releaseRestore
    const service = fakeService()
    service.restoreSession = () => new Promise((resolve) => (releaseRestore = () => resolve(null)))
    const store = createAuthStore(service)
    const checking = store.initialize()
    assert.equal(await store.login({ identifier: 'admin', password: 'ok' }), true)
    releaseRestore() // the old answer ("no session") arrives late
    await checking
    assert.equal(store.getState().status, AUTH_STATUS.authenticated)
    assert.deepEqual(store.getState().user, ADMIN)
  })

  test('the server rejecting the session (401) ends it with a "session expired" message', async () => {
    const service = fakeService({ session: EMPLOYEE })
    const store = createAuthStore(service)
    await store.initialize()
    store.expireSession()
    assert.equal(store.getState().status, AUTH_STATUS.unauthenticated)
    assert.equal(store.getState().error, SESSION_EXPIRED)
    assert.equal(store.getState().user, null)
  })

  test('clearError removes the message and subscribers are notified of changes', async () => {
    const store = createAuthStore(fakeService())
    await store.initialize()
    let notifications = 0
    const unsubscribe = store.subscribe(() => (notifications += 1))
    await store.login({ identifier: 'employee', password: 'wrong' })
    assert.ok(notifications >= 2)
    store.clearError()
    assert.equal(store.getState().error, null)
    unsubscribe()
    const before = notifications
    store.clearError()
    assert.equal(notifications, before)
  })
})

describe('data never leaks between sessions', () => {
  test('session data is cleared when a signed-in user leaves or is replaced, not at startup', () => {
    assert.equal(shouldClearSessionData(null, EMPLOYEE), false) // restoring a session on startup
    assert.equal(shouldClearSessionData(null, null), false)
    assert.equal(shouldClearSessionData(EMPLOYEE, null), true) // sign out / session ended
    assert.equal(shouldClearSessionData(EMPLOYEE, ADMIN), true) // another user
    assert.equal(shouldClearSessionData(EMPLOYEE, { ...EMPLOYEE }), false) // same user
  })

  test('the document store forgets every record (and the simulated failure) on reset', () => {
    const store = createMemoryDocumentStore()
    seedDemoReviewDocuments(store)
    store.create({ name: 'private', snapshot: makeSnapshot(), ownerId: EMPLOYEE.id })
    store.setSimulatedFailure(true)
    let notified = 0
    store.subscribe(() => (notified += 1))
    assert.ok(store.list().length >= 3)

    store.reset()
    assert.deepEqual(store.list(), [])
    assert.equal(store.has(DEMO_REVIEW_IDS.toReview), false)
    assert.equal(store.isSimulatingFailure(), false)
    assert.equal(notified, 1)

    seedDemoReviewDocuments(store) // the demo documents can be created again
    assert.equal(store.list().length, 2)
  })
})

describe('the auth service in a production-like environment', () => {
  test('without the development flag the real (not connected) service is used', async () => {
    // Node has no import.meta.env, exactly like a build where DEV is false.
    const service = createAuthService()
    assert.equal(service, httpAuthService)
    assert.equal(service.devAccounts, undefined)
  })

  test('it never signs anyone in, whatever the credentials', async () => {
    assert.equal(await httpAuthService.restoreSession(), null)
    for (const credentials of [{ identifier: 'admin', password: 'admin-dev' }, { identifier: 'employee', password: 'employee-dev' }, {}]) {
      await assert.rejects(httpAuthService.login(credentials), (error) => error instanceof AuthError && error.code === AUTH_ERROR.notConnected)
    }
  })
})

describe('development mock authentication', () => {
  const make = (storage = memoryStorage()) => ({ storage, service: createMockAuthService({ storage, latencyMs: 0 }) })

  test('offers one Employee and one Admin account for the login page', () => {
    const { service } = make()
    assert.deepEqual(service.devAccounts.map((account) => account.role).sort(), ['employee', 'orgAdmin'])
  })

  test('both roles can sign in and out, and a reload restores the session', async () => {
    for (const role of [USER_ROLES.employee, USER_ROLES.orgAdmin]) {
      const { storage, service } = make()
      const account = service.devAccounts.find((candidate) => candidate.role === role)
      const user = await service.login({ identifier: account.identifier, password: account.password })
      assert.equal(user.role, role)
      assert.ok(user.displayName)
      assert.deepEqual(await createMockAuthService({ storage, latencyMs: 0 }).restoreSession(), user) // "reload"
      await service.logout()
      assert.equal(await service.restoreSession(), null)
    }
  })

  test('wrong passwords and unknown accounts are refused with the same error', async () => {
    const { service } = make()
    for (const credentials of [{ identifier: 'employee', password: 'nope' }, { identifier: 'nobody', password: 'employee-dev' }, {}]) {
      await assert.rejects(service.login(credentials), (error) => error.code === AUTH_ERROR.invalidCredentials)
    }
  })

  test('a deactivated account cannot sign in and cannot restore a session', async () => {
    const { storage, service } = make()
    await assert.rejects(service.login({ identifier: 'disabled', password: 'disabled-dev' }), (error) => error.code === AUTH_ERROR.accountDisabled)
    storage.setItem(MOCK_SESSION_KEY, JSON.stringify({ identifier: 'disabled' }))
    assert.equal(await service.restoreSession(), null)
  })

  test('only the account name is remembered, never the password', async () => {
    const { storage, service } = make()
    await service.login({ identifier: 'admin', password: 'admin-dev' })
    assert.equal(storage.getItem(MOCK_SESSION_KEY), JSON.stringify({ identifier: 'admin' }))
    assert.ok(![...storage.data.values()].some((value) => value.includes('admin-dev')))
  })

  test('the mock employee owns the demonstration documents; the Admin does not', () => {
    const accounts = getMockAccounts()
    assert.equal(accounts.find((account) => account.identifier === 'employee').user.id, 'demo-employee')
    assert.notEqual(accounts.find((account) => account.identifier === 'admin').user.id, 'demo-employee')
  })
})

describe('route access decisions', () => {
  const employee = { status: 'authenticated', user: EMPLOYEE }
  const admin = { status: 'authenticated', user: ADMIN }

  test('waiting, failing and signed-out states never reach the page', () => {
    assert.equal(getRouteDecision({ status: 'initializing', user: null }), ROUTE_DECISION.loading)
    assert.equal(getRouteDecision({ status: 'failed', user: null }), ROUTE_DECISION.failed)
    assert.equal(getRouteDecision({ status: 'unauthenticated', user: null }), ROUTE_DECISION.login)
    assert.equal(getRouteDecision({ status: 'authenticated', user: null }), ROUTE_DECISION.login)
  })

  test('any signed-in user may open an ordinary route', () => {
    assert.equal(getRouteDecision(employee), ROUTE_DECISION.allow)
    assert.equal(getRouteDecision(admin), ROUTE_DECISION.allow)
  })

  test('an Admin-only route is forbidden for an employee and open to the Admin', () => {
    assert.equal(getRouteDecision(employee, ADMIN_ROLES), ROUTE_DECISION.forbidden)
    assert.equal(getRouteDecision(admin, ADMIN_ROLES), ROUTE_DECISION.allow)
  })

  test('an unknown role is forbidden everywhere that lists roles', () => {
    assert.equal(getRouteDecision({ status: 'authenticated', user: { id: 'x', role: 'superAdmin' } }, ALL_ROLES), ROUTE_DECISION.forbidden)
  })

  test('after signing in the user returns to the page they asked for, only if it is an in-app path', () => {
    const options = { fallback: '/', loginPath: '/login', logoutPath: '/logout' }
    assert.equal(getPostLoginPath({ pathname: '/archive', search: '?q=1', hash: '#a' }, options), '/archive?q=1#a')
    assert.equal(getPostLoginPath(undefined, options), '/')
    assert.equal(getPostLoginPath({ pathname: '/login' }, options), '/')
    assert.equal(getPostLoginPath({ pathname: '/logout' }, options), '/')
    assert.equal(getPostLoginPath({ pathname: '//evil.example' }, options), '/')
    assert.equal(getPostLoginPath({ pathname: 'https://evil.example' }, options), '/')
  })
})

describe('role-based navigation', () => {
  const idsFor = (role) => ['main', 'admin', 'system'].flatMap((group) => getNavigationGroup(group, role).map((item) => item.id))

  test('an employee sees the workspace and settings, never the Admin section', () => {
    const ids = idsFor(USER_ROLES.employee)
    assert.deepEqual(ids, ['dashboard', 'upload', 'archive', 'corrections', 'templates', 'notifications', 'settings'])
    assert.deepEqual(getNavigationGroup('admin', USER_ROLES.employee), [])
  })

  test('the Admin sees everything the employee sees plus the Admin section', () => {
    const ids = idsFor(USER_ROLES.orgAdmin)
    assert.deepEqual(ids, ['dashboard', 'upload', 'archive', 'corrections', 'templates', 'notifications', 'adminEmployees', 'adminRecycleBin', 'adminBackups', 'adminAuditLog', 'adminStorage', 'adminSettings', 'settings'])
  })

  test('an unknown or missing role sees nothing', () => {
    assert.deepEqual(idsFor(undefined), [])
    assert.deepEqual(idsFor('superAdmin'), [])
  })

  test('every navigation item declares which roles see it', () => {
    for (const item of navigationItems) assert.ok(item.roles.length > 0, item.id)
  })
})

describe('user badge helpers', () => {
  test('initials come from the first two words of the name', () => {
    assert.equal(getInitials('Ahmed Ali Hassan'), 'A A')
    assert.equal(getInitials('موظف تجريبي'), 'م ت')
    assert.equal(getInitials('  Single  '), 'S')
    assert.equal(getInitials(''), '')
    assert.equal(getInitials(undefined), '')
  })
})

describe('API client', () => {
  const jsonResponse = (status, body, headers = { 'content-type': 'application/json' }) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers })

  function clientWith(handler, options = {}) {
    const requests = []
    const client = createApiClient({
      baseUrl: 'https://api.test/v1/',
      fetchImpl: async (url, init) => {
        requests.push({ url, init })
        return handler(url, init)
      },
      ...options,
    })
    return { client, requests }
  }

  test('joins the base URL, sends and receives JSON', async () => {
    const { client, requests } = clientWith(() => jsonResponse(200, { ok: true }))
    assert.deepEqual(await client.post('/things', { a: 1 }), { ok: true })
    assert.equal(requests[0].url, 'https://api.test/v1/things')
    assert.equal(requests[0].init.method, 'POST')
    assert.equal(requests[0].init.body, JSON.stringify({ a: 1 }))
    assert.equal(requests[0].init.headers['Content-Type'], 'application/json')
  })

  test('adds the bearer token only when there is one', async () => {
    let token = null
    const { client, requests } = clientWith(() => jsonResponse(200, {}), { getAccessToken: () => token })
    await client.get('x')
    token = 'abc'
    await client.get('x')
    assert.equal(requests[0].init.headers.Authorization, undefined)
    assert.equal(requests[1].init.headers.Authorization, 'Bearer abc')
  })

  test('uploads FormData untouched (no JSON content type)', async () => {
    const { client, requests } = clientWith(() => jsonResponse(201, { id: 1 }))
    const form = new FormData()
    form.append('file', new Blob(['x']), 'a.pdf')
    await client.post('/documents', form)
    assert.equal(requests[0].init.body, form)
    assert.equal(requests[0].init.headers['Content-Type'], undefined)
  })

  test('401 tells the app the session ended and fails with UNAUTHORIZED', async () => {
    let ended = 0
    const { client } = clientWith(() => jsonResponse(401, { detail: 'expired' }), { onUnauthorized: () => (ended += 1) })
    await assert.rejects(client.get('x'), (error) => error instanceof ApiError && error.code === API_ERROR.unauthorized && error.status === 401)
    assert.equal(ended, 1)
  })

  test('403, 404, 5xx and other statuses map to their own codes and keep the error body', async () => {
    const cases = [[403, API_ERROR.forbidden], [404, API_ERROR.notFound], [500, API_ERROR.server], [422, API_ERROR.http]]
    for (const [status, code] of cases) {
      let ended = 0
      const { client } = clientWith(() => jsonResponse(status, { detail: 'why' }), { onUnauthorized: () => (ended += 1) })
      await assert.rejects(client.get('x'), (error) => error.code === code && error.status === status && error.details.detail === 'why')
      assert.equal(ended, 0)
    }
  })

  test('an unreachable server is a NETWORK_ERROR; 204 has no body; bad JSON is reported', async () => {
    const down = createApiClient({ fetchImpl: async () => Promise.reject(new TypeError('failed')) })
    await assert.rejects(down.get('x'), (error) => error.code === API_ERROR.network)
    const { client } = clientWith(() => new Response(null, { status: 204 }))
    assert.equal(await client.delete('x'), null)
    const broken = clientWith(() => new Response('{oops', { status: 200, headers: { 'content-type': 'application/json' } }))
    await assert.rejects(broken.client.get('x'), (error) => error.code === API_ERROR.invalidResponse)
  })

  test('a request that takes too long fails with TIMEOUT', async () => {
    const hanging = createApiClient({
      timeoutMs: 20,
      fetchImpl: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    })
    await assert.rejects(hanging.get('x'), (error) => error.code === API_ERROR.timeout)
  })
})
