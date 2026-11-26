// Document-level edit lock (decision 47), as pure functions.
//
//   - one document, one editor at a time (a lock on the whole document, not on a page);
//   - everybody else may only view, and is told who is editing;
//   - the lock is released when editing ends or after idleness, WITHOUT losing what was saved;
//   - the server checks the lock on every save, re-processing and approval.
//
// "The lock duration and its renewal are for technical coordination" (47): this module does NOT
// decide a duration. It only answers "is this lock still valid at `now`?" for a lock that
// carries its own `expiresAt`; whoever creates the lock (the server later, the development mock
// today) chooses the lease. A lock: { holderId, holderName, acquiredAt, expiresAt }.

export const LOCK_ERROR = Object.freeze({
  held: 'LOCK_HELD', // someone else is editing
  lost: 'LOCK_LOST', // this user's lock expired or was taken over
  notHeld: 'LOCK_NOT_HELD',
})

export function isLockActive(lock, now = new Date()) {
  return Boolean(lock) && new Date(lock.expiresAt).getTime() > new Date(now).getTime()
}

// The lock that actually counts (an expired one is gone).
export const activeLock = (lock, now) => (isLockActive(lock, now) ? lock : null)

export const holdsLock = (lock, userId, now) => isLockActive(lock, now) && lock.holderId === userId

// Decides a request to take the lock. Returns
//   { granted: true, lock }                         free, expired, or already this user's (renewed)
//   { granted: false, code: LOCK_ERROR.held, lock } someone else holds an active lock
export function requestLock(current, { userId, userName, now, leaseMs }) {
  const active = activeLock(current, now)
  if (active && active.holderId !== userId) return { granted: false, code: LOCK_ERROR.held, lock: active }
  const at = new Date(now)
  return {
    granted: true,
    lock: {
      holderId: userId,
      holderName: userName,
      acquiredAt: active ? active.acquiredAt : at.toISOString(),
      expiresAt: new Date(at.getTime() + leaseMs).toISOString(),
    },
  }
}

// Only the holder can renew or release. Returns the new lock (or null after a release) and ok.
export function renewLock(current, { userId, now, leaseMs }) {
  if (!holdsLock(current, userId, now)) return { ok: false, code: isLockActive(current, now) ? LOCK_ERROR.held : LOCK_ERROR.lost }
  return { ok: true, lock: { ...current, expiresAt: new Date(new Date(now).getTime() + leaseMs).toISOString() } }
}

export function releaseLock(current, { userId, now }) {
  if (!current) return { ok: true, lock: null }
  if (isLockActive(current, now) && current.holderId !== userId) return { ok: false, code: LOCK_ERROR.held }
  return { ok: true, lock: null }
}

// The check the server makes before a save, a re-processing or an approval.
export function assertHolds(current, { userId, now }) {
  if (holdsLock(current, userId, now)) return { ok: true }
  if (isLockActive(current, now)) return { ok: false, code: LOCK_ERROR.held, lock: current }
  return { ok: false, code: current ? LOCK_ERROR.lost : LOCK_ERROR.notHeld }
}
