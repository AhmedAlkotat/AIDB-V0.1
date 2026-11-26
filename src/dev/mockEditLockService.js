// DEVELOPMENT-ONLY mock of the edit-lock backend (see services/editLockService.js). Not part of production
// bundles. It plays the SERVER's part: it keeps one lock per document, grants it to one editor at a time,
// and refuses a save, a re-processing or an approval from anybody else.
//
// SIMULATED: all the "other editors" are pretend. The lease below (DEV_LEASE_MS) is a DEVELOPMENT value so
// that expiry can be seen; it is NOT the real lock duration, which decision 47 leaves to technical
// coordination with the backend.
//
// Development switches (service.dev): pretend another employee started editing, stopped editing, or that
// the current lock expired.

import { assertHolds, isLockActive, releaseLock, renewLock, requestLock, LOCK_ERROR } from '../domain/document/lock.js'
import { WORKFLOW_ERROR, workflowError } from '../services/workflowErrors.js'
import { getMockContext } from './mockContext.js'

export const DEV_LEASE_MS = 90 * 1000
// (Plain object, not frozen: keeps this development data out of production bundles, see mockClassification.js.)
export const SIMULATED_EDITOR = { id: 'sim-other-editor', name: 'موظف آخر (محاكاة)' }

const toError = (code) => workflowError(code === LOCK_ERROR.held ? WORKFLOW_ERROR.lockHeld : WORKFLOW_ERROR.lockLost)

export function createMockEditLockService({ context = getMockContext(), leaseMs = DEV_LEASE_MS } = {}) {
  const ctx = context
  const locks = new Map() // documentId -> lock
  const listeners = new Map() // documentId -> Set<listener>
  const timers = new Map()

  const active = (documentId) => (isLockActive(locks.get(documentId), ctx.now()) ? locks.get(documentId) : null)

  function emit(documentId) {
    for (const listener of listeners.get(documentId) ?? []) listener(active(documentId))
  }

  // The lock changes by itself when its lease ends: whoever watches is told.
  function armExpiry(documentId) {
    clearTimeout(timers.get(documentId))
    const lock = locks.get(documentId)
    if (!lock) return
    const wait = new Date(lock.expiresAt).getTime() - ctx.now().getTime()
    const timer = setTimeout(() => {
      if (!isLockActive(locks.get(documentId), ctx.now())) {
        locks.delete(documentId)
        emit(documentId)
      } else armExpiry(documentId)
    }, Math.max(0, wait) + 5)
    timer.unref?.() // a pending lease never keeps a process (a test run) alive
    timers.set(documentId, timer)
  }

  function set(documentId, lock) {
    if (lock) locks.set(documentId, lock)
    else locks.delete(documentId)
    armExpiry(documentId)
    emit(documentId)
  }

  return {
    isMock: true,
    leaseMs,

    dev: {
      simulateOtherEditor(documentId) {
        set(documentId, requestLock(null, { userId: SIMULATED_EDITOR.id, userName: SIMULATED_EDITOR.name, now: ctx.now(), leaseMs }).lock)
      },
      releaseOtherEditor(documentId) {
        if (locks.get(documentId)?.holderId === SIMULATED_EDITOR.id) set(documentId, null)
      },
      // The current lock ends now (its lease ran out), whoever holds it.
      expire(documentId) {
        if (locks.has(documentId)) set(documentId, null)
      },
      getLock: (documentId) => active(documentId),
    },

    acquire: (documentId) =>
      ctx.run(ctx.requireUser, (actor) => {
        const outcome = requestLock(locks.get(documentId), { userId: actor.id, userName: actor.displayName, now: ctx.now(), leaseMs })
        if (outcome.granted) set(documentId, outcome.lock)
        return { granted: outcome.granted, lock: outcome.lock }
      }),

    renew: (documentId) =>
      ctx.run(ctx.requireUser, (actor) => {
        const outcome = renewLock(locks.get(documentId), { userId: actor.id, now: ctx.now(), leaseMs })
        if (!outcome.ok) throw toError(outcome.code)
        set(documentId, outcome.lock)
        return { lock: outcome.lock }
      }),

    release: (documentId) =>
      ctx.run(ctx.requireUser, (actor) => {
        const outcome = releaseLock(locks.get(documentId), { userId: actor.id, now: ctx.now() })
        if (outcome.ok && locks.has(documentId)) set(documentId, null)
      }),

    // The server's check before a save, a re-processing and an approval (decision 47).
    assertHeld: (documentId) =>
      ctx.run(ctx.requireUser, (actor) => {
        const outcome = assertHolds(locks.get(documentId), { userId: actor.id, now: ctx.now() })
        if (!outcome.ok) throw toError(outcome.code)
      }),

    subscribe(documentId, listener) {
      if (!listeners.has(documentId)) listeners.set(documentId, new Set())
      listeners.get(documentId).add(listener)
      return () => listeners.get(documentId)?.delete(listener)
    },
  }
}
