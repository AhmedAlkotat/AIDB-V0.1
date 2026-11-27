// The document-level edit lock (decision 47): ONE editor at a time; everybody else may only view and is
// told who is editing. The server checks the lock on every save, re-processing and approval.
//
//   isMock
//   acquire(documentId)  -> Promise<{ granted: true, lock } | { granted: false, lock }>   `lock` = { holderId,
//                           holderName, acquiredAt, expiresAt }. Taking a lock that is free, expired or already
//                           yours succeeds; someone else's active lock gives granted: false (not an exception).
//   renew(documentId)    -> Promise<{ lock }>   rejects (lockLost / lockHeld) when it is no longer yours
//   release(documentId)  -> Promise<void>       editing ended; saved work is untouched
//   assertHeld(documentId) -> Promise<void>     the server's check before a save, a re-processing or an approval;
//                           rejects with lockLost / lockHeld
//   subscribe(documentId, listener) -> unsubscribe   told when the lock changes hands or expires
//
// The lock's DURATION and RENEWAL are technical coordination with the backend (decision 47 says so) and are
// NOT decided here: the service decides the lease and returns `expiresAt`; the interface only renews when
// that time is getting close.
//
// REPLACEABLE and NOT CONNECTED TO A BACKEND YET: the production service refuses ("not connected"). Development
// builds use a simulation (src/dev/mockEditLockService.js) reachable only through the `import.meta.env.DEV` branch.

import { createMockEditLockService } from '../dev/mockEditLockService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_EDIT_LOCK = Object.freeze({
  ...createNotConnectedService(['acquire', 'renew', 'release', 'assertHeld']),
  subscribe: () => () => {},
})

export function createEditLockService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockEditLockService()
  return NOT_CONNECTED_EDIT_LOCK
}

export const editLockService = createEditLockService()
