// Batch E / Wave 1: loading, error and cancellation states of the server data that screens show, the protection against
// stale answers, and the rule that a 401 never ends a session while unsaved work is on screen.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createPollingChangeFeed } from '../src/services/changeFeed.js'
import { createLiveResource } from '../src/state/resource/liveResource.js'
import { AUTH_STATUS, createAuthStore, SESSION_EXPIRED, SESSION_USER_MISMATCH } from '../src/state/auth/authStore.js'
import { hasUnsavedWork, registerUnsavedWorkSource } from '../src/state/auth/unsavedWork.js'
import { AUTH_ERROR, AuthError } from '../src/services/authErrors.js'

// A load function whose answers the test releases by hand, in any order.
function manualLoader() {
  const calls = []
  const load = (signal) =>
    new Promise((resolve, reject) => {
      const call = { signal, resolve, reject }
      calls.push(call)
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
  return { load, calls }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('live resource', () => {
  test('starts in "loading" when the source cannot answer at once, and shows the data when it arrives', async () => {
    const { load, calls } = manualLoader()
    const resource = createLiveResource({ load })
    assert.deepEqual(resource.getState(), { status: 'loading', data: null, error: null, refreshError: null })
    const stop = resource.start()
    calls[0].resolve(['a'])
    await tick()
    assert.deepEqual(resource.getState(), { status: 'ready', data: ['a'], error: null, refreshError: null })
    stop()
  })

  test('an empty answer is still "ready" (the screen decides what empty means)', async () => {
    const resource = createLiveResource({ load: async () => [] })
    resource.start()
    await tick()
    assert.equal(resource.getState().status, 'ready')
    assert.deepEqual(resource.getState().data, [])
  })

  test('a source that already holds the data (peek) gives the first render real data, and is still refreshed', async () => {
    const { load, calls } = manualLoader()
    const resource = createLiveResource({ load, peek: () => ['cached'] })
    assert.deepEqual(resource.getState().data, ['cached'])
    assert.equal(resource.getState().status, 'ready')
    resource.start()
    assert.equal(calls.length, 1)
    calls[0].resolve(['fresh'])
    await tick()
    assert.deepEqual(resource.getState().data, ['fresh'])
  })

  test('a peek that answers "unknown" (undefined) means loading; null is a real answer ("no such document")', () => {
    assert.equal(createLiveResource({ load: async () => 1, peek: () => undefined }).getState().status, 'loading')
    const missing = createLiveResource({ load: async () => 1, peek: () => null }).getState()
    assert.equal(missing.status, 'ready')
    assert.equal(missing.data, null)
  })

  test('a failed first load is an error with the failure code; reload recovers', async () => {
    let fail = true
    const resource = createLiveResource({ load: async () => (fail ? Promise.reject(Object.assign(new Error('x'), { code: 'network' })) : ['ok']) })
    resource.start()
    await tick()
    assert.equal(resource.getState().status, 'error')
    assert.equal(resource.getState().error, 'network')
    fail = false
    await resource.reload()
    assert.equal(resource.getState().status, 'ready')
    assert.equal(resource.getState().error, null)
  })

  test('a failure without a code reads as "unknown"', async () => {
    const resource = createLiveResource({ load: async () => Promise.reject(new Error('boom')) })
    resource.start()
    await tick()
    assert.equal(resource.getState().error, 'unknown')
  })

  test('STALE responses never overwrite newer ones, whatever order they arrive in', async () => {
    const { load, calls } = manualLoader()
    const resource = createLiveResource({ load })
    resource.start() // call 0
    const second = resource.reload({ quiet: true }) // call 1 supersedes call 0 (and aborts it)
    const third = resource.reload({ quiet: true }) // call 2 supersedes call 1
    calls[2].resolve(['newest'])
    await third
    calls[1].resolve(['older']) // arrives late
    calls[0].resolve(['oldest'])
    await second
    await tick()
    assert.deepEqual(resource.getState().data, ['newest'])
    assert.equal(calls[0].signal.aborted && calls[1].signal.aborted, true)
  })

  test('a stale FAILURE does not replace newer data either', async () => {
    const { load, calls } = manualLoader()
    const resource = createLiveResource({ load })
    resource.start()
    const second = resource.reload({ quiet: true })
    calls[1].resolve(['good'])
    await second
    calls[0].reject(Object.assign(new Error('late'), { code: 'network' }))
    await tick()
    assert.equal(resource.getState().status, 'ready')
    assert.deepEqual(resource.getState().data, ['good'])
    assert.equal(resource.getState().refreshError, null)
  })

  test('a failed BACKGROUND refresh keeps the data on screen and reports it separately', async () => {
    let fail = false
    const resource = createLiveResource({ load: async () => (fail ? Promise.reject(Object.assign(new Error('x'), { code: 'network' })) : ['shown']) })
    resource.start()
    await tick()
    fail = true
    await resource.reload({ quiet: true })
    assert.equal(resource.getState().status, 'ready')
    assert.deepEqual(resource.getState().data, ['shown'])
    assert.equal(resource.getState().refreshError, 'network')
    fail = false
    await resource.reload({ quiet: true })
    assert.equal(resource.getState().refreshError, null)
  })

  test('leaving the screen cancels what is in flight and ignores whatever still arrives', async () => {
    const { load, calls } = manualLoader()
    const resource = createLiveResource({ load })
    const stop = resource.start()
    stop()
    assert.equal(calls[0].signal.aborted, true)
    calls[0].resolve(['too late'])
    await tick()
    assert.equal(resource.getState().status, 'loading')
    assert.equal(resource.getState().data, null)
  })

  test('the source can be started again after it was stopped (StrictMode mounts effects twice)', async () => {
    const { load, calls } = manualLoader()
    const resource = createLiveResource({ load })
    resource.start()()
    const stop = resource.start()
    assert.equal(calls.length, 2)
    calls[1].resolve(['again'])
    await tick()
    assert.deepEqual(resource.getState().data, ['again'])
    stop()
  })

  test('change signals refresh quietly (no loading flash) until the screen stops following', async () => {
    let value = 1
    let notify
    let unsubscribed = 0
    const resource = createLiveResource({
      load: async () => value,
      subscribe: (listener) => {
        notify = listener
        return () => (unsubscribed += 1)
      },
    })
    const stop = resource.start()
    await tick()
    const seen = []
    resource.subscribe(() => seen.push(resource.getState().status))
    value = 2
    notify()
    await tick()
    assert.equal(resource.getState().data, 2)
    assert.ok(seen.every((status) => status === 'ready'))
    stop()
    assert.equal(unsubscribed, 1)
    stop() // stopping twice is harmless
  })

  test('set() replaces the data after an acknowledged action', () => {
    const resource = createLiveResource({ load: async () => [] })
    resource.set(['x'])
    assert.deepEqual(resource.getState().data, ['x'])
    assert.equal(resource.getState().status, 'ready')
  })
})

describe('polling change feed (extensible: an event stream would call notify() instead)', () => {
  function fakeTimers() {
    const timers = new Set()
    return {
      timers,
      setIntervalImpl: (fn) => {
        const timer = { fn }
        timers.add(timer)
        return timer
      },
      clearIntervalImpl: (timer) => timers.delete(timer),
      fire: () => [...timers].forEach((timer) => timer.fn()),
    }
  }

  test('polls only while somebody listens, and only while the tab is visible', () => {
    const clock = fakeTimers()
    let visible = true
    const feed = createPollingChangeFeed({ intervalMs: 1000, isActive: () => visible, setIntervalImpl: clock.setIntervalImpl, clearIntervalImpl: clock.clearIntervalImpl })
    assert.equal(clock.timers.size, 0)
    let calls = 0
    const first = feed.subscribe(() => (calls += 1))
    const second = feed.subscribe(() => (calls += 1))
    assert.equal(clock.timers.size, 1) // one timer however many listeners
    clock.fire()
    assert.equal(calls, 2)
    visible = false
    clock.fire()
    assert.equal(calls, 2) // hidden tab: no signal
    visible = true
    first()
    clock.fire()
    assert.equal(calls, 3)
    second()
    assert.equal(clock.timers.size, 0)
    assert.equal(feed.size(), 0)
  })

  test('notify() signals at once (after this client changed something)', () => {
    const feed = createPollingChangeFeed({ setIntervalImpl: () => ({}), clearIntervalImpl: () => {} })
    let calls = 0
    feed.subscribe(() => (calls += 1))
    feed.notify()
    assert.equal(calls, 1)
  })
})

describe('unsaved work and the session (a 401 never throws work away)', () => {
  const USER = { id: 'u1', displayName: 'علي', role: 'employee' }
  const OTHER = { id: 'u2', displayName: 'سارة', role: 'employee' }

  function storeWith({ login = async () => USER } = {}) {
    let logouts = 0
    const service = { restoreSession: async () => USER, login, logout: async () => void (logouts += 1) }
    const store = createAuthStore(service)
    return { store, logouts: () => logouts }
  }

  test('the registry answers whether any source has unsaved work, and a broken source is ignored', () => {
    assert.equal(hasUnsavedWork(), false)
    const remove = registerUnsavedWorkSource(() => true)
    const broken = registerUnsavedWorkSource(() => {
      throw new Error('broken')
    })
    assert.equal(hasUnsavedWork(), true)
    remove()
    assert.equal(hasUnsavedWork(), false) // the broken one does not count as unsaved work
    broken()
  })

  test('without unsaved work a 401 ends the session at once (unchanged behaviour)', async () => {
    const { store, logouts } = storeWith()
    await store.initialize()
    store.expireSession()
    assert.equal(store.getState().status, AUTH_STATUS.unauthenticated)
    assert.equal(store.getState().error, SESSION_EXPIRED)
    assert.equal(store.getState().sessionExpiring, false)
    await tick()
    assert.equal(logouts(), 1)
  })

  test('with unsaved work the session is only marked "expiring": the user stays, nothing is dropped', async () => {
    const { store, logouts } = storeWith()
    await store.initialize()
    const remove = registerUnsavedWorkSource(() => true)
    store.expireSession()
    store.expireSession() // repeated 401s change nothing more
    assert.equal(store.getState().status, AUTH_STATUS.authenticated)
    assert.deepEqual(store.getState().user, USER)
    assert.equal(store.getState().sessionExpiring, true)
    assert.equal(logouts(), 0)
    remove()
  })

  test('the same user signs in again in place; the work stays and the session is valid again', async () => {
    const { store } = storeWith()
    await store.initialize()
    const remove = registerUnsavedWorkSource(() => true)
    store.expireSession()
    assert.equal(await store.reauthenticate({ identifier: 'ali', password: 'secret' }), true)
    assert.equal(store.getState().sessionExpiring, false)
    assert.equal(store.getState().status, AUTH_STATUS.authenticated)
    assert.equal(store.getState().error, null)
    remove()
  })

  test('another user\'s credentials are refused (and that session is ended again); a wrong password keeps the screen', async () => {
    let next = OTHER
    let logouts = 0
    const service = { restoreSession: async () => USER, login: async () => (next instanceof Error ? Promise.reject(next) : next), logout: async () => void (logouts += 1) }
    const store = createAuthStore(service)
    await store.initialize()
    const remove = registerUnsavedWorkSource(() => true)
    store.expireSession()
    assert.equal(await store.reauthenticate({ identifier: 'sara', password: 'secret' }), false)
    assert.equal(store.getState().error, SESSION_USER_MISMATCH)
    assert.equal(store.getState().sessionExpiring, true)
    assert.equal(store.getState().user.id, USER.id)
    assert.equal(logouts, 1)
    next = new AuthError(AUTH_ERROR.invalidCredentials)
    assert.equal(await store.reauthenticate({ identifier: 'ali', password: 'wrong' }), false)
    assert.equal(store.getState().error, AUTH_ERROR.invalidCredentials)
    assert.equal(store.getState().status, AUTH_STATUS.authenticated)
    assert.equal(await store.reauthenticate({ identifier: '', password: '' }), false)
    assert.equal(store.getState().error, AUTH_ERROR.missingFields)
    remove()
  })

  test('re-authentication does nothing unless the session is expiring; signing out is always possible', async () => {
    const { store } = storeWith()
    await store.initialize()
    assert.equal(await store.reauthenticate({ identifier: 'a', password: 'b' }), false)
    const remove = registerUnsavedWorkSource(() => true)
    store.expireSession()
    await store.logout() // the user's own explicit choice to give the work up
    assert.equal(store.getState().status, AUTH_STATUS.unauthenticated)
    assert.equal(store.getState().sessionExpiring, false)
    remove()
  })
})
