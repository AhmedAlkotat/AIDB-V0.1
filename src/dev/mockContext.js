// DEVELOPMENT-ONLY context every mock administration service shares: the session storage (who is
// signed in), the mock accounts, the mock system state, the temporary document store, the clock
// and the simulated latency. Tests inject their own pieces.
//
// It also plays the SERVER's authorization: `requireUser()` / `requireAdmin()` read the mock
// session marker (written by mockAuthService) and refuse callers who may not do something, as
// the real backend must (the frontend's role checks are only interface shaping).

import { USER_ROLES } from '../constants/roles.js'
import { EMPLOYEE_STATUS } from '../domain/employee/employee.js'
import { shouldRecord, dropExpiredEntries } from '../domain/audit/audit.js'
import { documentStore } from '../services/documentStore.js'
import { SYSTEM_ERROR, SystemError } from '../services/systemErrors.js'
import { getMockAccountStore, MOCK_SESSION_KEY } from './mockAccountStore.js'
import { getMockSystemState } from './mockSystemState.js'

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve())

export function createMockContext({
  storage = globalThis.sessionStorage,
  latencyMs = 250,
  accountStore = getMockAccountStore(),
  system = getMockSystemState(),
  documents = documentStore,
  now = () => new Date(),
} = {}) {
  // The signed-in, active account, or null.
  function currentActor() {
    let marker = null
    try {
      marker = JSON.parse(storage?.getItem(MOCK_SESSION_KEY) ?? 'null')
    } catch {
      marker = null
    }
    const account = accountStore.findByIdentifier(marker?.identifier)
    return account && account.status === EMPLOYEE_STATUS.active ? { id: account.id, displayName: account.displayName, role: account.role } : null
  }

  const notifyListeners = new Set()

  const context = {
    storage,
    accountStore,
    system,
    documents,
    now,
    latencyMs,
    wait: () => wait(latencyMs),
    currentActor,
    requireUser() {
      const actor = currentActor()
      if (!actor) throw new SystemError(SYSTEM_ERROR.forbidden)
      return actor
    },
    requireAdmin() {
      const actor = currentActor()
      if (!actor || actor.role !== USER_ROLES.orgAdmin) throw new SystemError(SYSTEM_ERROR.forbidden)
      return actor
    },
    // Runs an operation after the simulated latency, for an authorized caller.
    async run(authorize, operation) {
      await wait(latencyMs)
      return operation(authorize())
    },

    // Appends an audit entry unless its category is switched off, and drops entries older than
    // the retention period. Never stores a password or document content.
    recordAudit({ category, action, actor = null, subject = '', outcome = 'success' }) {
      system.update((draft) => {
        if (!shouldRecord(draft.settings.audit, category)) return
        draft.seq += 1
        draft.audit.push({
          id: `aud-${draft.seq}`,
          at: now().toISOString(),
          category,
          action,
          actorId: actor?.id ?? null,
          actorName: actor?.displayName ?? null,
          subject: String(subject),
          outcome,
        })
        draft.audit = dropExpiredEntries(draft.audit, draft.settings.audit.retentionDays, now())
      })
    },

    // Adds a notification (readBy starts empty) and tells whoever listens (the bell refreshes at once).
    notify(notification) {
      system.update((draft) => {
        draft.seq += 1
        draft.notifications.push({ id: `ntf-${draft.seq}`, createdAt: now().toISOString(), readBy: {}, params: {}, ...notification })
      })
      for (const listener of notifyListeners) listener()
    },
    onNotify(listener) {
      notifyListeners.add(listener)
      return () => notifyListeners.delete(listener)
    },
  }
  return context
}

let shared = null

// The context the whole dev session shares (created on first use).
export function getMockContext() {
  shared ??= createMockContext()
  return shared
}
