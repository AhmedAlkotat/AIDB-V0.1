// DEVELOPMENT-ONLY state of the "server side" of the administration screens: settings, backups,
// audit entries, notifications, the simulated storage scenario and the failure switches. All
// the mock services (settings, recycle bin, backups, audit, storage, notifications) and the
// mock sign-in / employee management read and write THIS state, so they agree with each other.
//
// Everything in it is SIMULATED, not real data, and it is not part of production bundles. Like
// the mock accounts it is kept in this tab's sessionStorage so a reload during development keeps
// it; "reset mock accounts" on the login page restores the seeds.

import { cloneSettings, DEFAULT_SETTINGS } from '../domain/settings/settings.js'
import { BACKUP_STATUS, BACKUP_TYPE } from '../domain/backup/backup.js'
import { NOTIFICATION_TYPE } from '../domain/notification/notification.js'
import { DEMO_REVIEW_IDS } from '../data/mock/reviewDemo.mock.js'
import { DEMO_USER } from '../data/mock/demoUser.mock.js'

export const MOCK_SYSTEM_KEY = 'aidp.dev.mockSystem'

// Simulated disk: 500 GB, and how full each scenario makes it.
export const MOCK_STORAGE_TOTAL_BYTES = 500 * 1024 ** 3
export const MOCK_STORAGE_SCENARIOS = Object.freeze({ normal: 42, warning: 84, critical: 93, full: 100 })

const DAY_MS = 24 * 60 * 60 * 1000
const GB = 1024 ** 3

// A fresh development session's data. A function so nothing runs unless the mock is used.
export function createSeedState(now = new Date()) {
  const ago = (days, hours = 0) => new Date(now.getTime() - days * DAY_MS - hours * 3600 * 1000).toISOString()
  return {
    seq: 100,
    settings: cloneSettings(DEFAULT_SETTINGS),
    storage: { scenario: 'normal' },
    flags: { failNextBackup: false, failProtectiveBackup: false },
    backups: [
      { id: 'bkp-seed-3', createdAt: ago(1), type: BACKUP_TYPE.scheduled, status: BACKUP_STATUS.completed, sizeBytes: 3.2 * GB, locations: ['local', 'external'], protected: false, verifiedAt: null },
      { id: 'bkp-seed-2', createdAt: ago(2), type: BACKUP_TYPE.scheduled, status: BACKUP_STATUS.completed, sizeBytes: 3.1 * GB, locations: ['local', 'external'], protected: true, verifiedAt: ago(1, 20) },
      { id: 'bkp-seed-1', createdAt: ago(5), type: BACKUP_TYPE.manual, status: BACKUP_STATUS.completed, sizeBytes: 2.9 * GB, locations: ['local'], protected: false, verifiedAt: null },
    ],
    // Sample entries only (clearly simulated): they let the log's filters be tried.
    audit: [
      { id: 'aud-seed-1', at: ago(0, 3), category: 'authentication', action: 'loginSucceeded', actorId: 'demo-admin', actorName: 'مدير تجريبي', subject: 'admin', outcome: 'success' },
      { id: 'aud-seed-2', at: ago(0, 5), category: 'authentication', action: 'loginFailed', actorId: null, actorName: null, subject: 'unknown.user', outcome: 'failure' },
      { id: 'aud-seed-3', at: ago(1), category: 'backups', action: 'backupCreated', actorId: null, actorName: null, subject: 'bkp-seed-3', outcome: 'success' },
      { id: 'aud-seed-4', at: ago(2, 4), category: 'uploads', action: 'documentUploaded', actorId: DEMO_USER.id, actorName: 'موظف تجريبي', subject: 'invoice-2026-001.pdf', outcome: 'success' },
      { id: 'aud-seed-5', at: ago(2, 3), category: 'processing', action: 'processingFailed', actorId: null, actorName: null, subject: 'invoice-2026-001.pdf', outcome: 'failure' },
      { id: 'aud-seed-6', at: ago(2, 2), category: 'processing', action: 'processingRetried', actorId: DEMO_USER.id, actorName: 'موظف تجريبي', subject: 'invoice-2026-001.pdf', outcome: 'success' },
      { id: 'aud-seed-7', at: ago(3), category: 'approval', action: 'approved', actorId: DEMO_USER.id, actorName: 'موظف تجريبي', subject: 'invoice-2026-001.pdf', outcome: 'success' },
      { id: 'aud-seed-8', at: ago(4), category: 'employeeAccounts', action: 'employeeCreated', actorId: 'demo-admin', actorName: 'مدير تجريبي', subject: 'employee', outcome: 'success' },
    ],
    // Seed notifications are about the demonstration documents (their ids are stable), so the
    // links work. `readBy` holds the ids of the users who read it.
    notifications: [
      { id: 'ntf-seed-2', type: NOTIFICATION_TYPE.processingFailed, createdAt: ago(0, 6), readBy: {}, documentId: DEMO_REVIEW_IDS.toReview, documentName: 'مستند تجريبي للمراجعة', ownerId: DEMO_USER.id, params: {} },
      { id: 'ntf-seed-1', type: NOTIFICATION_TYPE.processingCompleted, createdAt: ago(1), readBy: {}, documentId: DEMO_REVIEW_IDS.approved, documentName: 'مستند تجريبي معتمد', ownerId: DEMO_USER.id, params: {} },
    ],
  }
}

// `storage`: where the state is kept (default: sessionStorage when it exists; none in tests).
export function createMockSystemState({ storage = globalThis.sessionStorage, now = () => new Date() } = {}) {
  let state = null

  function load() {
    if (state) return state
    try {
      const parsed = JSON.parse(storage?.getItem(MOCK_SYSTEM_KEY) ?? 'null')
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.backups)) state = parsed
    } catch {
      // Unreadable data: start from the seeds.
    }
    state ??= createSeedState(now())
    return state
  }

  function save() {
    try {
      storage?.setItem(MOCK_SYSTEM_KEY, JSON.stringify(state))
    } catch {
      // Storage full or unavailable: the data simply lives in memory.
    }
  }

  return {
    // A deep copy: callers cannot change the state by accident.
    read: () => JSON.parse(JSON.stringify(load())),
    // Runs `mutator(draft)` on the live state and saves; returns what the mutator returns.
    update(mutator) {
      const result = mutator(load())
      save()
      return result
    },
    nextId(prefix) {
      return this.update((draft) => {
        draft.seq += 1
        return `${prefix}-${draft.seq}`
      })
    },
    reset() {
      state = createSeedState(now())
      save()
    },
  }
}

let shared = null

// The one state the whole dev session shares (created on first use).
export function getMockSystemState() {
  shared ??= createMockSystemState()
  return shared
}
