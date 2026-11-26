// Batch C: system administration (recycle bin, backup and restore, audit log, storage monitoring,
// notifications, system settings). Frontend only, against development mocks.
//
// Covers the pure rules, the permissions of every mock service (the "server side" check the real
// backend must also make), the effects the mocks simulate (retention, soft delete, the restore
// sequence), the production "not connected" services, and the state stores. Rendering is in
// systemAdminUi.test.js, the real browser flow in scripts/browser-checks/admin.check.mjs.
// Nothing here is a real security boundary, and nothing real is backed up or restored.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { USER_ROLES } from '../src/constants/roles.js'
import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../src/data/mock/reviewDemo.mock.js'
import { AUDIT_ACTIONS, AUDIT_CATEGORIES, countExpiredEntries, dropExpiredEntries, filterAuditEntries, shouldRecord } from '../src/domain/audit/audit.js'
import { BACKUP_STATUS, BACKUP_TYPE, canRestore, getNextScheduledBackup, RESTORE_STEPS, selectBackupsToRemove } from '../src/domain/backup/backup.js'
import { canSeeNotification, countUnread, isUnreadFor, NOTIFICATION_TYPE, selectNotificationsFor } from '../src/domain/notification/notification.js'
import { countExpired, getDaysRemaining, getPurgeAt, isExpired } from '../src/domain/recycleBin/recycleBin.js'
import {
  AUDIT_CATEGORIES as SETTINGS_AUDIT_CATEGORIES,
  cloneSettings,
  coerceSection,
  DEFAULT_SETTINGS,
  getEmployeeLimits,
  normalizeSettings,
  SETTINGS_SECTIONS,
  validateSettingsSection,
  VALIDATION,
} from '../src/domain/settings/settings.js'
import { getBlockedOperations, getStorageLevel, getUsedPercent, STORAGE_LEVEL } from '../src/domain/storage/storage.js'
import { createMockAccountStore, MOCK_SESSION_KEY } from '../src/dev/mockAccountStore.js'
import { createMockAuditService } from '../src/dev/mockAuditService.js'
import { createMockAuthService } from '../src/dev/mockAuthService.js'
import { createMockBackupService } from '../src/dev/mockBackupService.js'
import { createMockContext } from '../src/dev/mockContext.js'
import { createMockEmployeeService } from '../src/dev/mockEmployeeService.js'
import { createMockNotificationService } from '../src/dev/mockNotificationService.js'
import { createMockRecycleBinService } from '../src/dev/mockRecycleBinService.js'
import { createMockSettingsService } from '../src/dev/mockSettingsService.js'
import { createMockStorageService } from '../src/dev/mockStorageService.js'
import { createMockSystemState, MOCK_STORAGE_TOTAL_BYTES } from '../src/dev/mockSystemState.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { NOT_CONNECTED_BACKUPS, createBackupService } from '../src/services/backupService.js'
import { NOT_CONNECTED_AUDIT, createAuditLogService } from '../src/services/auditLogService.js'
import { NOT_CONNECTED_NOTIFICATIONS, createNotificationService } from '../src/services/notificationService.js'
import { NOT_CONNECTED_RECYCLE_BIN, createRecycleBinService } from '../src/services/recycleBinService.js'
import { NOT_CONNECTED_SETTINGS, createSettingsService } from '../src/services/settingsService.js'
import { NOT_CONNECTED_STORAGE, createStorageService } from '../src/services/storageService.js'
import { SYSTEM_ERROR, SystemError } from '../src/services/systemErrors.js'
import { createNotificationStore, getUnreadCount } from '../src/state/notifications/notificationStore.js'
import { createResourceStore } from '../src/state/resource/resourceStore.js'
import { makeSnapshot } from './sessionHelpers.js'

const DAY = 24 * 60 * 60 * 1000
const memoryStorage = () => {
  const data = new Map()
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error instanceof SystemError && error.code === code)

// A whole mock "server": one clock, one session storage, one account store, one system state, one
// temporary document store, and every administration service built on them.
function world({ actor = 'admin' } = {}) {
  const storage = memoryStorage()
  const clock = { time: new Date('2026-06-01T12:00:00.000Z') }
  const now = () => new Date(clock.time)
  const accountStore = createMockAccountStore({ storage, now: () => clock.time.toISOString() })
  const system = createMockSystemState({ storage, now })
  const documents = createMemoryDocumentStore({ now: () => clock.time.toISOString() })
  const context = createMockContext({ storage, latencyMs: 0, accountStore, system, documents, now })
  const signInAs = (identifier) => (identifier ? storage.setItem(MOCK_SESSION_KEY, JSON.stringify({ identifier })) : storage.removeItem(MOCK_SESSION_KEY))
  signInAs(actor)
  return {
    storage, clock, accountStore, system, documents, context, signInAs,
    settings: createMockSettingsService({ context }),
    recycleBin: createMockRecycleBinService({ context }),
    backups: createMockBackupService({ context }),
    audit: createMockAuditService({ context }),
    storageService: createMockStorageService({ context }),
    notifications: createMockNotificationService({ context }),
    employees: createMockEmployeeService({ storage, latencyMs: 0, accountStore, context }),
    auth: createMockAuthService({ storage, latencyMs: 0, accountStore, context }),
  }
}

function addTrashed(w, id) {
  w.documents.create({ id, name: `doc-${id}`, snapshot: makeSnapshot(), ownerId: 'demo-employee' })
  w.documents.moveToTrash(id, { by: 'demo-admin' })
  const record = w.documents.listTrashed().find((item) => item.id === id)
  return record
}

describe('settings rules', () => {
  test('there are five sections, eight audit categories, and the defaults are valid', () => {
    assert.deepEqual([...SETTINGS_SECTIONS], ['uploads', 'recycleBin', 'audit', 'backups', 'storage'])
    assert.equal(SETTINGS_AUDIT_CATEGORIES.length, 8)
    assert.deepEqual([...AUDIT_CATEGORIES], [...SETTINGS_AUDIT_CATEGORIES])
    for (const section of SETTINGS_SECTIONS) assert.deepEqual(validateSettingsSection(section, DEFAULT_SETTINGS[section]), {}, section)
  })

  test('numbers must be whole and in range', () => {
    assert.equal(validateSettingsSection('uploads', { maxFileSizeMb: '', maxSelectedPages: 5 }).maxFileSizeMb, VALIDATION.required)
    assert.equal(validateSettingsSection('uploads', { maxFileSizeMb: '1.5', maxSelectedPages: 5 }).maxFileSizeMb, VALIDATION.notInteger)
    assert.equal(validateSettingsSection('uploads', { maxFileSizeMb: '0', maxSelectedPages: 5 }).maxFileSizeMb, VALIDATION.outOfRange)
    assert.equal(validateSettingsSection('uploads', { maxFileSizeMb: 10, maxSelectedPages: 100000 }).maxSelectedPages, VALIDATION.outOfRange)
    assert.deepEqual(validateSettingsSection('uploads', { maxFileSizeMb: '25', maxSelectedPages: '300' }), {})
  })

  test('recycle bin retention is only checked while automatic deletion is on', () => {
    assert.equal(validateSettingsSection('recycleBin', { autoDelete: true, retentionDays: 0 }).retentionDays, VALIDATION.outOfRange)
    assert.deepEqual(validateSettingsSection('recycleBin', { autoDelete: false, retentionDays: '' }), {})
  })

  test('backups: time format, the retention value of the chosen mode, and distinct paths', () => {
    const base = { ...DEFAULT_SETTINGS.backups }
    assert.equal(validateSettingsSection('backups', { ...base, time: '25:00' }).time, VALIDATION.invalidTime)
    assert.equal(validateSettingsSection('backups', { ...base, time: '2:00' }).time, VALIDATION.invalidTime)
    assert.deepEqual(validateSettingsSection('backups', { ...base, time: '23:59' }), {})
    assert.equal(validateSettingsSection('backups', { ...base, retentionMode: 'count', retentionCount: 0 }).retentionCount, VALIDATION.outOfRange)
    assert.equal(validateSettingsSection('backups', { ...base, retentionMode: 'days', retentionDays: 'x' }).retentionDays, VALIDATION.notInteger)
    assert.equal(validateSettingsSection('backups', { ...base, localPath: '/data/backups', externalPath: '/data/backups' }).externalPath, VALIDATION.mustDiffer)
    assert.equal(validateSettingsSection('backups', { ...base, localPath: 'x'.repeat(300) }).localPath, VALIDATION.tooLong)
    assert.deepEqual(validateSettingsSection('backups', { ...base, localPath: '/data/a', externalPath: '/mnt/nas' }), {})
  })

  test('storage thresholds: whole percentages and warning below critical', () => {
    assert.equal(validateSettingsSection('storage', { warningPercent: 90, criticalPercent: 80 }).warningPercent, VALIDATION.mustBeBelowCritical)
    assert.equal(validateSettingsSection('storage', { warningPercent: 80, criticalPercent: 80 }).warningPercent, VALIDATION.mustBeBelowCritical)
    assert.equal(validateSettingsSection('storage', { warningPercent: 0, criticalPercent: 80 }).warningPercent, VALIDATION.outOfRange)
    assert.equal(validateSettingsSection('storage', { warningPercent: 80, criticalPercent: 100 }).criticalPercent, VALIDATION.outOfRange)
    assert.deepEqual(validateSettingsSection('storage', { warningPercent: '70', criticalPercent: '95' }), {})
  })

  test('form text becomes stored types; a damaged stored object falls back to the defaults', () => {
    assert.deepEqual(coerceSection('uploads', { maxFileSizeMb: '12', maxSelectedPages: '40' }), { maxFileSizeMb: 12, maxSelectedPages: 40 })
    assert.equal(coerceSection('backups', { ...DEFAULT_SETTINGS.backups, localPath: '  /a  ', retentionCount: '5' }).localPath, '/a')
    const messy = normalizeSettings({ uploads: { maxFileSizeMb: 'many', maxSelectedPages: 7 }, audit: { categories: { approval: false, bogus: false }, retentionDays: 30 }, nothing: 1 })
    assert.equal(messy.uploads.maxFileSizeMb, DEFAULT_SETTINGS.uploads.maxFileSizeMb)
    assert.equal(messy.uploads.maxSelectedPages, 7)
    assert.equal(messy.audit.categories.approval, false)
    assert.equal(messy.audit.categories.backups, true)
    assert.equal('bogus' in messy.audit.categories, false)
    assert.deepEqual(normalizeSettings(null), cloneSettings())
  })

  test('only the two upload limits are exposed to employees', () => {
    assert.deepEqual(Object.keys(getEmployeeLimits(DEFAULT_SETTINGS)).sort(), ['maxFileSizeMb', 'maxSelectedPages'])
  })
})

describe('recycle-bin rules', () => {
  const policy = { autoDelete: true, retentionDays: 30 }
  const deletedAt = '2026-05-01T00:00:00.000Z'

  test('the retention period counts from the day the document was moved to the bin', () => {
    assert.equal(getPurgeAt(deletedAt, policy), '2026-05-31T00:00:00.000Z')
    assert.equal(isExpired(deletedAt, policy, new Date('2026-05-30T23:59:59Z')), false)
    assert.equal(isExpired(deletedAt, policy, new Date('2026-05-31T00:00:00Z')), true)
    assert.equal(getDaysRemaining(deletedAt, policy, new Date('2026-05-21T00:00:00Z')), 10)
    assert.equal(getDaysRemaining(deletedAt, policy, new Date('2026-07-01T00:00:00Z')), 0)
  })

  test('with automatic deletion off nothing ever expires', () => {
    const off = { autoDelete: false, retentionDays: 30 }
    assert.equal(getPurgeAt(deletedAt, off), null)
    assert.equal(isExpired(deletedAt, off, new Date('2030-01-01')), false)
    assert.equal(getDaysRemaining(deletedAt, off), null)
    assert.equal(countExpired([{ deletedAt }], off, new Date('2030-01-01')), 0)
  })

  test('counts what a shorter period would delete', () => {
    const items = [{ deletedAt: '2026-05-20T00:00:00Z' }, { deletedAt: '2026-04-01T00:00:00Z' }]
    assert.equal(countExpired(items, { autoDelete: true, retentionDays: 90 }, new Date('2026-06-01')), 0)
    assert.equal(countExpired(items, { autoDelete: true, retentionDays: 60 }, new Date('2026-06-01')), 1)
    assert.equal(countExpired(items, { autoDelete: true, retentionDays: 30 }, new Date('2026-06-01')), 1)
    assert.equal(countExpired(items, { autoDelete: true, retentionDays: 5 }, new Date('2026-06-01')), 2)
  })
})

describe('backup rules', () => {
  const at = (days) => new Date(new Date('2026-06-01T12:00:00Z').getTime() - days * DAY).toISOString()
  const backup = (id, days, extra = {}) => ({ id, createdAt: at(days), status: BACKUP_STATUS.completed, type: BACKUP_TYPE.scheduled, protected: false, ...extra })
  const ids = (list) => list.map((item) => item.id).sort()

  test('by count: the newest N unprotected backups stay, protected ones are never removed and do not use a place', () => {
    const list = [backup('a', 1), backup('b', 2), backup('c', 3), backup('d', 4, { protected: true }), backup('e', 5)]
    const config = { retentionMode: 'count', retentionCount: 2, retentionDays: 30 }
    assert.deepEqual(ids(selectBackupsToRemove(list, config)), ['c', 'e'])
  })

  test('by age: older than the period is removed unless protected; failed attempts are ignored', () => {
    const list = [backup('new', 3), backup('old', 40), backup('oldProtected', 50, { protected: true }), backup('failed', 90, { status: BACKUP_STATUS.failed })]
    const config = { retentionMode: 'days', retentionCount: 7, retentionDays: 30 }
    assert.deepEqual(ids(selectBackupsToRemove(list, config, new Date('2026-06-01T12:00:00Z'))), ['old'])
  })

  test('only a completed backup can be restored', () => {
    assert.equal(canRestore(backup('a', 1)), true)
    assert.equal(canRestore(backup('a', 1, { status: BACKUP_STATUS.failed })), false)
    assert.deepEqual([...RESTORE_STEPS], ['verify', 'protectiveBackup', 'restore'])
  })

  test('the next scheduled backup (daily, weekly, off)', () => {
    const from = new Date(2026, 5, 3, 12, 0, 0) // Wednesday 3 June 2026, noon local time
    const next = (config) => (getNextScheduledBackup({ scheduleEnabled: true, frequency: 'daily', time: '02:00', weekday: 5, ...config }, from))
    const daily = new Date(next({}))
    assert.deepEqual([daily.getDate(), daily.getHours(), daily.getMinutes()], [4, 2, 0])
    const later = new Date(next({ time: '23:30' }))
    assert.deepEqual([later.getDate(), later.getHours(), later.getMinutes()], [3, 23, 30])
    assert.equal(new Date(next({ frequency: 'weekly', weekday: 5 })).getDay(), 5)
    assert.equal(getNextScheduledBackup({ scheduleEnabled: false, frequency: 'daily', time: '02:00', weekday: 0 }, from), null)
  })
})

describe('audit rules', () => {
  const entry = (id, daysAgo, extra = {}) => ({ id, at: new Date(new Date('2026-06-01T12:00:00Z').getTime() - daysAgo * DAY).toISOString(), category: 'authentication', action: 'loginSucceeded', actorId: 'u1', actorName: 'Sara', subject: 'sara', outcome: 'success', ...extra })

  test('every category has actions, and only switched-on categories are recorded', () => {
    for (const category of AUDIT_CATEGORIES) assert.ok(AUDIT_ACTIONS[category].length > 0, category)
    const settings = { categories: { ...DEFAULT_SETTINGS.audit.categories, uploads: false } }
    assert.equal(shouldRecord(settings, 'authentication'), true)
    assert.equal(shouldRecord(settings, 'uploads'), false)
    assert.equal(shouldRecord(settings, 'not-a-category'), false)
  })

  test('entries older than the retention period are dropped, newer ones kept', () => {
    const entries = [entry('a', 1), entry('b', 100)]
    assert.deepEqual(dropExpiredEntries(entries, 90, new Date('2026-06-01T12:00:00Z')).map((item) => item.id), ['a'])
    assert.equal(countExpiredEntries(entries, 90, new Date('2026-06-01T12:00:00Z')), 1)
    assert.equal(countExpiredEntries(entries, 365, new Date('2026-06-01T12:00:00Z')), 0)
  })

  test('filters by category, outcome, text and date range; newest first', () => {
    const entries = [
      entry('1', 5, { category: 'backups', action: 'backupFailed', outcome: 'failure', actorName: null, subject: 'bkp-9' }),
      entry('2', 3, { category: 'authentication', subject: 'Employee.One', actorName: 'علي' }),
      entry('3', 1, { category: 'authentication', outcome: 'failure', action: 'loginFailed' }),
    ]
    const ids = (filters) => filterAuditEntries(entries, filters).map((item) => item.id)
    assert.deepEqual(ids({}), ['3', '2', '1'])
    assert.deepEqual(ids({ category: 'backups' }), ['1'])
    assert.deepEqual(ids({ outcome: 'failure' }), ['3', '1'])
    assert.deepEqual(ids({ query: 'employee.one' }), ['2'])
    assert.deepEqual(ids({ query: 'علي' }), ['2'])
    assert.deepEqual(ids({ from: '2026-05-30', to: '2026-05-31' }), ['3'])
    assert.deepEqual(ids({ from: '2026-05-28' }), ['3', '2'])
    assert.deepEqual(ids({ category: 'backups', outcome: 'success' }), [])
  })
})

describe('storage rules', () => {
  test('levels follow the Admin\'s thresholds; 100 % is full', () => {
    const limits = { warningPercent: 80, criticalPercent: 90 }
    assert.equal(getStorageLevel(10, limits), STORAGE_LEVEL.ok)
    assert.equal(getStorageLevel(80, limits), STORAGE_LEVEL.warning)
    assert.equal(getStorageLevel(89.9, limits), STORAGE_LEVEL.warning)
    assert.equal(getStorageLevel(90, limits), STORAGE_LEVEL.critical)
    assert.equal(getStorageLevel(100, limits), STORAGE_LEVEL.full)
    assert.equal(getStorageLevel(70, { warningPercent: 60, criticalPercent: 65 }), STORAGE_LEVEL.critical)
  })

  test('used percentage is bounded; only "full" blocks work', () => {
    assert.equal(getUsedPercent(50, 200), 25)
    assert.equal(getUsedPercent(300, 200), 100)
    assert.equal(getUsedPercent(1, 0), 0)
    assert.deepEqual(getBlockedOperations(STORAGE_LEVEL.full), ['uploads', 'processing'])
    for (const level of [STORAGE_LEVEL.ok, STORAGE_LEVEL.warning, STORAGE_LEVEL.critical]) assert.deepEqual(getBlockedOperations(level), [])
  })
})

describe('notification visibility', () => {
  const employee = { id: 'demo-employee', role: USER_ROLES.employee }
  const other = { id: 'someone-else', role: USER_ROLES.employee }
  const admin = { id: 'demo-admin', role: USER_ROLES.orgAdmin }
  const mine = { id: 'n1', type: NOTIFICATION_TYPE.processingCompleted, createdAt: '2026-06-01T10:00:00Z', ownerId: 'demo-employee', readBy: {} }
  const theirs = { id: 'n2', type: NOTIFICATION_TYPE.processingFailed, createdAt: '2026-06-01T11:00:00Z', ownerId: 'someone-else', readBy: {} }
  const storage = { id: 'n3', type: NOTIFICATION_TYPE.storageWarning, createdAt: '2026-06-01T12:00:00Z', readBy: {} }
  const backup = { id: 'n4', type: NOTIFICATION_TYPE.backupFailed, createdAt: '2026-06-01T13:00:00Z', readBy: {} }
  const orphan = { id: 'n5', type: NOTIFICATION_TYPE.processingFailed, createdAt: '2026-06-01T09:00:00Z', ownerId: null, readBy: {} }
  const all = [mine, theirs, storage, backup, orphan]
  const ids = (user) => selectNotificationsFor(user, all).map((item) => item.id)

  test('an employee sees only the notifications about their own documents', () => {
    assert.deepEqual(ids(employee), ['n1'])
    assert.deepEqual(ids(other), ['n2'])
  })

  test('administrative alerts (storage, backup) are for the Admin only; the Admin sees everything, newest first', () => {
    for (const notification of [storage, backup]) {
      assert.equal(canSeeNotification(employee, notification), false)
      assert.equal(canSeeNotification(admin, notification), true)
    }
    assert.deepEqual(ids(admin), ['n4', 'n3', 'n2', 'n1', 'n5'])
  })

  test('a notification without an owner, an unknown role or nobody never leaks to an employee', () => {
    assert.equal(canSeeNotification(employee, orphan), false)
    assert.equal(canSeeNotification({ id: 'x', role: 'superAdmin' }, mine), false)
    assert.equal(canSeeNotification(null, mine), false)
  })

  test('read state is per user', () => {
    const read = { ...mine, readBy: { 'demo-admin': true } }
    assert.equal(isUnreadFor('demo-admin', read), false)
    assert.equal(isUnreadFor('demo-employee', read), true)
    assert.equal(countUnread(employee, [read, theirs]), 1)
    assert.equal(countUnread(admin, [read, theirs, storage]), 2)
  })
})

describe('document store: soft delete', () => {
  const make = () => {
    const store = createMemoryDocumentStore()
    store.create({ id: 'd1', name: 'one', snapshot: makeSnapshot(), ownerId: 'u1' })
    store.create({ id: 'd2', name: 'two', snapshot: makeSnapshot(), ownerId: 'u1' })
    return store
  }

  test('a document in the bin disappears from normal use but nothing is removed', () => {
    const store = make()
    store.moveToTrash('d1', { by: 'admin' })
    assert.deepEqual(store.list().map((item) => item.id), ['d2'])
    assert.equal(store.get('d1'), null)
    assert.equal(store.has('d1'), true)
    const trashed = store.listTrashed()
    assert.deepEqual(trashed.map((item) => [item.id, item.deletedBy]), [['d1', 'admin']])
    assert.ok(trashed[0].deletedAt)
  })

  test('restoring brings the document back unchanged', () => {
    const store = make()
    const before = JSON.stringify(store.get('d1'))
    store.moveToTrash('d1')
    store.restoreFromTrash('d1')
    assert.equal(JSON.stringify(store.get('d1')), before)
    assert.deepEqual(store.listTrashed(), [])
  })

  test('permanent deletion only works on a document that is already in the bin', () => {
    const store = make()
    assert.throws(() => store.purge('d1'), /No deleted document/)
    store.moveToTrash('d1')
    store.purge('d1')
    assert.equal(store.has('d1'), false)
    assert.throws(() => store.moveToTrash('d1'), /No document/)
    assert.throws(() => store.restoreFromTrash('d2'), /No deleted document/)
  })

  test('seeding the demo documents never recreates one that sits in the bin', () => {
    const store = createMemoryDocumentStore()
    seedDemoReviewDocuments(store)
    store.moveToTrash(DEMO_REVIEW_IDS.toReview)
    seedDemoReviewDocuments(store)
    assert.equal(store.list().length, 1)
    assert.equal(store.listTrashed().length, 1)
  })

  test('the list summary counts pages that are being processed', () => {
    const store = createMemoryDocumentStore()
    const snapshot = makeSnapshot()
    snapshot.pages[0].processing = { ...snapshot.pages[0].processing, status: 'processing' }
    store.create({ id: 'p1', name: 'busy', snapshot, ownerId: 'u1' })
    assert.equal(store.list()[0].processingCount, 1)
  })
})

describe('who may use the administration services (server-side check simulated)', () => {
  const adminOnly = (w) => [
    () => w.settings.getSettings(),
    () => w.settings.previewImpact('recycleBin', { autoDelete: true, retentionDays: 5 }),
    () => w.settings.updateSection('uploads', { maxFileSizeMb: 5, maxSelectedPages: 5 }),
    () => w.recycleBin.listDeleted(),
    () => w.recycleBin.moveToBin('x'),
    () => w.recycleBin.restore('x'),
    () => w.recycleBin.deletePermanently('x'),
    () => w.backups.listBackups(),
    () => w.backups.createBackup(),
    () => w.backups.setProtected('bkp-seed-1', true),
    () => w.backups.verifyBackup('bkp-seed-1'),
    () => w.backups.restoreBackup('bkp-seed-1', { acknowledged: true }),
    () => w.audit.listEntries(),
    () => w.storageService.getStatus(),
  ]

  test('an employee, a deactivated employee and nobody are refused by every Admin operation', async () => {
    for (const actor of ['employee', 'disabled', 'nobody', null]) {
      const w = world({ actor })
      const before = JSON.stringify(w.system.read())
      for (const call of adminOnly(w)) await rejectsWith(call(), SYSTEM_ERROR.forbidden)
      assert.equal(JSON.stringify(w.system.read()), before, `nothing changed for ${actor}`)
    }
  })

  test('the Admin is allowed (the same calls do not fail with "forbidden")', async () => {
    const w = world()
    assert.ok(await w.settings.getSettings())
    assert.ok(Array.isArray(await w.recycleBin.listDeleted()))
    assert.ok(Array.isArray(await w.backups.listBackups()))
    assert.ok(Array.isArray(await w.audit.listEntries()))
    assert.ok(await w.storageService.getStatus())
  })

  test('every signed-in user can read the upload limits and their own notifications; signed-out callers cannot', async () => {
    for (const actor of ['admin', 'employee']) {
      const w = world({ actor })
      assert.deepEqual(Object.keys(await w.settings.getLimits()).sort(), ['maxFileSizeMb', 'maxSelectedPages'])
      assert.ok(Array.isArray(await w.notifications.list()))
    }
    const signedOut = world({ actor: null })
    await rejectsWith(signedOut.settings.getLimits(), SYSTEM_ERROR.forbidden)
    await rejectsWith(signedOut.notifications.list(), SYSTEM_ERROR.forbidden)
  })

  test('there is no export of the audit log and no delete of backups or accounts in any service', () => {
    const w = world()
    const names = [w.audit, w.backups, w.recycleBin, w.settings, w.storageService, w.notifications].flatMap((service) => Object.keys(service))
    assert.deepEqual(names.filter((name) => /export|download|csv|excel|pdf/i.test(name)), [])
    assert.deepEqual(Object.keys(w.backups).filter((name) => /delete|remove/i.test(name)), [])
  })
})

describe('system settings service', () => {
  test('saves a section after validating it again on the "server"', async () => {
    const w = world()
    const saved = await w.settings.updateSection('uploads', { maxFileSizeMb: '25', maxSelectedPages: '300' })
    assert.deepEqual(saved.uploads, { maxFileSizeMb: 25, maxSelectedPages: 300 })
    assert.deepEqual(await w.settings.getLimits(), { maxFileSizeMb: 25, maxSelectedPages: 300 })
    await assert.rejects(w.settings.updateSection('uploads', { maxFileSizeMb: 0, maxSelectedPages: 1 }), (error) => error.code === SYSTEM_ERROR.invalidInput && error.fields.maxFileSizeMb === 'outOfRange')
    await assert.rejects(w.settings.updateSection('nonsense', {}), (error) => error.code === SYSTEM_ERROR.invalidInput)
    assert.equal((await w.settings.getSettings()).uploads.maxFileSizeMb, 25) // the failed save changed nothing
  })

  test('the audit categories and the storage thresholds are saved too', async () => {
    const w = world()
    const categories = { ...DEFAULT_SETTINGS.audit.categories, uploads: false }
    assert.equal((await w.settings.updateSection('audit', { categories, retentionDays: 365 })).audit.categories.uploads, false)
    assert.equal((await w.settings.updateSection('storage', { warningPercent: 70, criticalPercent: 85 })).storage.criticalPercent, 85)
  })

  test('a shorter bin retention warns first and then really deletes the expired documents (and no others)', async () => {
    const w = world()
    addTrashed(w, 'old')
    addTrashed(w, 'fresh')
    // Make "old" 40 days old by moving the clock after "fresh" was deleted.
    w.clock.time = new Date(w.clock.time.getTime() + 40 * DAY)
    w.documents.create({ id: 'late', name: 'late', snapshot: makeSnapshot(), ownerId: 'demo-employee' })
    w.documents.moveToTrash('late')
    const proposed = { autoDelete: true, retentionDays: 30 }
    const impact = await w.settings.previewImpact('recycleBin', proposed)
    assert.equal(impact.recycleBinExpiring, 2) // old + fresh are 40 days old; late is not
    assert.equal(w.documents.listTrashed().length, 3) // a preview deletes nothing
    await w.settings.updateSection('recycleBin', proposed)
    assert.deepEqual(w.documents.listTrashed().map((item) => item.id), ['late'])
  })

  test('switching automatic deletion off deletes nothing; the normal archive is never touched', async () => {
    const w = world()
    seedDemoReviewDocuments(w.documents)
    addTrashed(w, 'old')
    w.clock.time = new Date(w.clock.time.getTime() + 400 * DAY)
    assert.equal((await w.settings.previewImpact('recycleBin', { autoDelete: false, retentionDays: 30 })).recycleBinExpiring, 0)
    await w.settings.updateSection('recycleBin', { autoDelete: false, retentionDays: 30 })
    assert.equal(w.documents.listTrashed().length, 1)
    await w.settings.updateSection('recycleBin', { autoDelete: true, retentionDays: 30 })
    assert.equal(w.documents.listTrashed().length, 0)
    assert.equal(w.documents.list().length, 2) // the demo documents (normal lists) are untouched
  })

  test('a shorter audit retention deletes old entries, and the preview says how many', async () => {
    const w = world()
    w.system.update((draft) => void draft.audit.push({ id: 'ancient', at: '2020-01-01T00:00:00.000Z', category: 'uploads', action: 'documentUploaded', actorId: null, actorName: null, subject: 'x', outcome: 'success' }))
    const values = { categories: DEFAULT_SETTINGS.audit.categories, retentionDays: 30 }
    assert.ok((await w.settings.previewImpact('audit', values)).auditEntriesExpiring >= 1)
    await w.settings.updateSection('audit', values)
    assert.equal((await w.audit.listEntries()).some((entry) => entry.id === 'ancient'), false)
  })

  test('a shorter backup retention removes only unprotected backups', async () => {
    const w = world()
    const values = { ...DEFAULT_SETTINGS.backups, retentionMode: 'count', retentionCount: 1 }
    const preview = await w.settings.previewImpact('backups', values)
    assert.equal(preview.backupsExpiring, 1) // seeds: 2 unprotected + 1 protected -> keep the newest unprotected only
    await w.settings.updateSection('backups', values)
    const left = (await w.backups.listBackups()).map((backup) => backup.id).sort()
    assert.deepEqual(left, ['bkp-seed-2', 'bkp-seed-3']) // the protected one and the newest unprotected one
  })
})

describe('recycle bin service', () => {
  function withDocuments(actor = 'admin') {
    const w = world({ actor })
    seedDemoReviewDocuments(w.documents)
    return w
  }

  test('moving a document hides it from every normal list but keeps it in the bin with its purge date', async () => {
    const w = withDocuments()
    const result = await w.recycleBin.moveToBin(DEMO_REVIEW_IDS.toReview)
    assert.deepEqual(result, { cancelledProcessing: false })
    assert.equal(w.documents.list().some((item) => item.id === DEMO_REVIEW_IDS.toReview), false)
    const [entry] = await w.recycleBin.listDeleted()
    assert.equal(entry.id, DEMO_REVIEW_IDS.toReview)
    assert.equal(entry.purgeAt, new Date(new Date(entry.deletedAt).getTime() + 30 * DAY).toISOString())
    assert.equal(entry.daysRemaining, 30)
    assert.equal(entry.deletedBy, 'demo-admin')
  })

  test('both approved and not approved documents can be deleted (decision 42)', async () => {
    const w = withDocuments()
    await w.recycleBin.moveToBin(DEMO_REVIEW_IDS.toReview)
    await w.recycleBin.moveToBin(DEMO_REVIEW_IDS.approved)
    assert.equal((await w.recycleBin.listDeleted()).length, 2)
  })

  test('a document being processed is flagged so processing is stopped safely first (decision 45)', async () => {
    const w = world()
    const snapshot = makeSnapshot()
    snapshot.pages[0].processing = { ...snapshot.pages[0].processing, status: 'processing' }
    w.documents.create({ id: 'busy', name: 'busy', snapshot, ownerId: 'demo-employee' })
    w.documents.create({ id: 'other', name: 'other', snapshot: makeSnapshot(), ownerId: 'demo-employee' })
    assert.deepEqual(await w.recycleBin.moveToBin('busy'), { cancelledProcessing: true })
    assert.equal(w.documents.list().some((item) => item.id === 'other'), true) // other documents unaffected
  })

  test('restore brings it back; permanent deletion removes it; each only for a document in the bin', async () => {
    const w = withDocuments()
    await w.recycleBin.moveToBin(DEMO_REVIEW_IDS.toReview)
    await w.recycleBin.restore(DEMO_REVIEW_IDS.toReview)
    assert.equal(w.documents.list().length, 2)
    await rejectsWith(w.recycleBin.restore(DEMO_REVIEW_IDS.toReview), SYSTEM_ERROR.notFound)
    await rejectsWith(w.recycleBin.deletePermanently(DEMO_REVIEW_IDS.toReview), SYSTEM_ERROR.notFound) // not in the bin: cannot be purged
    await w.recycleBin.moveToBin(DEMO_REVIEW_IDS.toReview)
    await w.recycleBin.deletePermanently(DEMO_REVIEW_IDS.toReview)
    assert.equal(w.documents.has(DEMO_REVIEW_IDS.toReview), false)
    await rejectsWith(w.recycleBin.moveToBin('missing'), SYSTEM_ERROR.notFound)
  })

  test('listing applies the retention job: expired items are gone, others stay', async () => {
    const w = withDocuments()
    await w.recycleBin.moveToBin(DEMO_REVIEW_IDS.toReview)
    w.clock.time = new Date(w.clock.time.getTime() + 31 * DAY)
    await w.recycleBin.moveToBin(DEMO_REVIEW_IDS.approved)
    const left = (await w.recycleBin.listDeleted()).map((item) => item.id)
    assert.deepEqual(left, [DEMO_REVIEW_IDS.approved])
  })

  test('an employee cannot delete anything', async () => {
    const w = withDocuments('employee')
    await rejectsWith(w.recycleBin.moveToBin(DEMO_REVIEW_IDS.toReview), SYSTEM_ERROR.forbidden)
    assert.equal(w.documents.list().length, 2)
  })
})

describe('backup service (simulated)', () => {
  test('creates a manual backup with an audit entry; the separate device only when one is configured', async () => {
    const w = world()
    const first = await w.backups.createBackup()
    assert.deepEqual([first.type, first.status, first.locations], ['manual', 'completed', ['local']])
    await w.settings.updateSection('backups', { ...DEFAULT_SETTINGS.backups, externalPath: '/mnt/nas' })
    const second = await w.backups.createBackup()
    assert.deepEqual(second.locations, ['local', 'external'])
    const entries = await w.audit.listEntries()
    assert.equal(entries.filter((entry) => entry.action === 'backupCreated' && entry.actorName === 'مدير تجريبي').length, 2)
  })

  test('a failed backup is recorded as failed, logged, and alerts the Admin only', async () => {
    const w = world()
    w.backups.dev.setFlag('failNextBackup', true)
    const failed = await w.backups.createBackup()
    assert.equal(failed.status, BACKUP_STATUS.failed)
    assert.equal(w.backups.dev.getFlags().failNextBackup, false) // one-shot
    assert.ok((await w.audit.listEntries()).some((entry) => entry.action === 'backupFailed' && entry.outcome === 'failure'))
    assert.ok((await w.notifications.list()).some((item) => item.type === 'backupFailed'))
    w.signInAs('employee')
    assert.ok(!(await w.notifications.list()).some((item) => item.type === 'backupFailed'))
  })

  test('retention is applied after every backup and never removes protected ones', async () => {
    const w = world()
    await w.settings.updateSection('backups', { ...DEFAULT_SETTINGS.backups, retentionMode: 'count', retentionCount: 2 })
    for (let index = 0; index < 4; index += 1) {
      w.clock.time = new Date(w.clock.time.getTime() + DAY)
      await w.backups.createBackup()
    }
    const list = await w.backups.listBackups()
    assert.equal(list.filter((backup) => !backup.protected).length, 2)
    assert.ok(list.some((backup) => backup.id === 'bkp-seed-2' && backup.protected)) // the protected seed survived
  })

  test('protecting and testing a backup', async () => {
    const w = world()
    assert.equal((await w.backups.setProtected('bkp-seed-1', true)).protected, true)
    assert.equal((await w.backups.setProtected('bkp-seed-1', false)).protected, false)
    const checked = await w.backups.verifyBackup('bkp-seed-1')
    assert.deepEqual(checked, { ok: true, checks: { integrity: true, decryption: true } })
    assert.ok((await w.backups.listBackups()).find((backup) => backup.id === 'bkp-seed-1').verifiedAt)
    await rejectsWith(w.backups.setProtected('nope', true), SYSTEM_ERROR.notFound)
    await rejectsWith(w.backups.verifyBackup('nope'), SYSTEM_ERROR.notFound)
  })

  test('a failed backup cannot be tested or restored', async () => {
    const w = world()
    w.backups.dev.setFlag('failNextBackup', true)
    const failed = await w.backups.createBackup()
    assert.equal((await w.backups.verifyBackup(failed.id)).ok, false)
    await assert.rejects(w.backups.restoreBackup(failed.id, { acknowledged: true }), (error) => error.code === SYSTEM_ERROR.invalidInput)
  })

  test('a restore needs the explicit acknowledgement and changes nothing without it', async () => {
    const w = world()
    const before = JSON.stringify(w.system.read().backups)
    await assert.rejects(w.backups.restoreBackup('bkp-seed-1'), (error) => error.code === SYSTEM_ERROR.invalidInput && error.fields.acknowledged === 'required')
    await assert.rejects(w.backups.restoreBackup('bkp-seed-1', { acknowledged: 'yes' }), (error) => error.code === SYSTEM_ERROR.invalidInput)
    assert.equal(JSON.stringify(w.system.read().backups), before)
  })

  test('a restore verifies, takes a protective backup, then restores, in that order, and is logged', async () => {
    const w = world()
    const seen = []
    const result = await w.backups.restoreBackup('bkp-seed-3', { acknowledged: true, onStep: (step) => seen.push(`${step.step}:${step.status}`) })
    assert.equal(result.ok, true)
    assert.deepEqual(seen, ['verify:done', 'protectiveBackup:done', 'restore:done'])
    assert.deepEqual(result.steps.map((step) => step.step), [...RESTORE_STEPS])
    const list = await w.backups.listBackups()
    assert.equal(list.filter((backup) => backup.type === BACKUP_TYPE.protective).length, 1)
    assert.ok((await w.audit.listEntries()).some((entry) => entry.action === 'restoreCompleted' && entry.subject === 'bkp-seed-3'))
  })

  test('if the protective backup fails the restore is cancelled and nothing changes (decision 30)', async () => {
    const w = world()
    w.backups.dev.setFlag('failProtectiveBackup', true)
    const before = (await w.backups.listBackups()).length
    const result = await w.backups.restoreBackup('bkp-seed-3', { acknowledged: true })
    assert.equal(result.ok, false)
    assert.deepEqual(result.steps, [{ step: 'verify', status: 'done' }, { step: 'protectiveBackup', status: 'failed' }, { step: 'restore', status: 'skipped' }])
    assert.equal((await w.backups.listBackups()).length, before) // no protective backup, nothing restored
    const entry = (await w.audit.listEntries()).find((item) => item.action === 'restoreCancelled')
    assert.equal(entry.outcome, 'failure')
  })
})

describe('audit log service', () => {
  test('account changes and sign-ins are logged without any password', async () => {
    const w = world()
    await w.employees.createEmployee({ displayName: 'سارة أحمد', identifier: 'sara.ahmed', password: 'Secret-pass-1' })
    await w.employees.setEmployeePassword((await w.employees.listEmployees()).find((employee) => employee.identifier === 'sara.ahmed').id, 'Another-secret-9')
    await w.auth.login({ identifier: 'employee', password: 'employee-dev' })
    await assert.rejects(w.auth.login({ identifier: 'employee', password: 'Wrong-guess-77' }))
    w.signInAs('admin') // the Admin (in another tab) reads the log
    const entries = await w.audit.listEntries()
    for (const action of ['employeeCreated', 'employeePasswordSet', 'loginSucceeded', 'loginFailed']) assert.ok(entries.some((entry) => entry.action === action), action)
    const everything = JSON.stringify(entries)
    for (const secret of ['Secret-pass-1', 'Another-secret-9', 'Wrong-guess-77', 'employee-dev']) assert.equal(everything.includes(secret), false, secret)
    assert.ok(entries.every((entry) => !('password' in entry)))
    assert.ok(entries.every((entry) => ['success', 'failure'].includes(entry.outcome)))
  })

  test('switching a category off stops FUTURE logging only', async () => {
    const w = world()
    const before = (await w.audit.listEntries()).length
    await w.settings.updateSection('audit', { categories: { ...DEFAULT_SETTINGS.audit.categories, authentication: false }, retentionDays: 90 })
    await w.auth.login({ identifier: 'employee', password: 'employee-dev' })
    w.signInAs('admin')
    assert.equal((await w.audit.listEntries()).length, before) // earlier entries kept, the new sign-in not recorded
    await w.employees.deactivateEmployee('demo-employee') // other categories still recorded
    assert.equal((await w.audit.listEntries()).length, before + 1)
  })

  test('entries older than the retention period are removed when new ones are written', async () => {
    const w = world()
    w.clock.time = new Date(w.clock.time.getTime() + 200 * DAY)
    await w.employees.deactivateEmployee('demo-employee')
    const entries = await w.audit.listEntries()
    assert.ok(entries.length > 0 && entries.every((entry) => new Date(entry.at).getTime() >= w.clock.time.getTime() - 90 * DAY))
  })
})

describe('storage service (simulated)', () => {
  test('reports usage, a breakdown that adds up and the level for the thresholds', async () => {
    const w = world()
    const status = await w.storageService.getStatus()
    assert.equal(status.totalBytes, MOCK_STORAGE_TOTAL_BYTES)
    assert.equal(status.level, STORAGE_LEVEL.ok)
    const parts = Object.values(status.breakdown).reduce((sum, value) => sum + value, 0)
    assert.ok(Math.abs(parts - status.usedBytes) < 5)
  })

  test('a worse scenario changes the level and notifies the Admin only; changing the thresholds changes the level', async () => {
    const w = world()
    w.storageService.dev.setScenario('warning')
    assert.equal((await w.storageService.getStatus()).level, STORAGE_LEVEL.warning)
    w.storageService.dev.setScenario('critical')
    w.storageService.dev.setScenario('full')
    const types = (await w.notifications.list()).map((item) => item.type)
    for (const type of ['storageWarning', 'storageCritical', 'storageFull']) assert.ok(types.includes(type), type)
    await w.settings.updateSection('storage', { warningPercent: 30, criticalPercent: 40 })
    w.storageService.dev.setScenario('normal')
    assert.equal((await w.storageService.getStatus()).level, STORAGE_LEVEL.critical) // 42 % > the new critical 40 %
    w.signInAs('employee')
    assert.ok(!(await w.notifications.list()).some((item) => item.type.startsWith('storage')))
    assert.throws(() => w.storageService.dev.setScenario('bogus'), (error) => error.code === SYSTEM_ERROR.invalidInput)
  })
})

describe('notification service', () => {
  test('each role only receives what it may see; document notifications reach the owner and the Admin', async () => {
    const w = world()
    w.notifications.dev.simulate('failed')
    const adminTypes = (await w.notifications.list()).map((item) => item.type)
    assert.ok(adminTypes.includes('processingFailed'))
    w.signInAs('employee')
    const mine = await w.notifications.list()
    assert.ok(mine.length > 0 && mine.every((item) => ['processingCompleted', 'processingFailed'].includes(item.type)))
    assert.ok(mine.every((item) => item.documentId))
  })

  test('another employee sees none of the first employee\'s notifications', async () => {
    const w = world()
    w.accountStore.add({ id: 'emp-2', identifier: 'second', password: 'pw-12345678', displayName: 'ثان', role: USER_ROLES.employee, status: 'active', createdAt: '2026-01-01', updatedAt: '2026-01-01' })
    w.signInAs('second')
    assert.deepEqual(await w.notifications.list(), [])
  })

  test('the view never reveals who else read a notification, and read state is per user', async () => {
    const w = world()
    const [first] = await w.notifications.list()
    assert.equal('readBy' in first, false)
    assert.equal(first.unread, true)
    await w.notifications.markRead(first.id)
    assert.equal((await w.notifications.list()).find((item) => item.id === first.id).unread, false)
    w.signInAs('employee') // the Admin read it; the employee did not
    assert.equal((await w.notifications.list()).find((item) => item.id === first.id)?.unread ?? true, true)
  })

  test('mark all as read only touches the caller\'s view; an employee cannot touch an admin alert', async () => {
    const w = world()
    w.storageService.dev.setScenario('warning')
    const alert = (await w.notifications.list()).find((item) => item.type === 'storageWarning')
    w.signInAs('employee')
    await rejectsWith(w.notifications.markRead(alert.id), SYSTEM_ERROR.notFound)
    await w.notifications.markAllRead()
    w.signInAs('admin')
    const adminView = await w.notifications.list()
    assert.ok(adminView.some((item) => item.unread)) // the employee's "mark all" did not read the admin's
  })

  test('a processing notification offers a link but nothing navigates by itself', async () => {
    const w = world()
    w.notifications.dev.simulate('completed')
    const item = (await w.notifications.list())[0]
    assert.equal(item.documentId, DEMO_REVIEW_IDS.toReview)
    assert.equal(typeof item.href, 'undefined') // data only: no redirect instruction in the service result
  })
})

describe('production services (backend not connected)', () => {
  test('without the development flag every service is the "not connected" one, never inventing data', async () => {
    const pairs = [
      [createSettingsService(), NOT_CONNECTED_SETTINGS, () => createSettingsService().getSettings()],
      [createRecycleBinService(), NOT_CONNECTED_RECYCLE_BIN, () => createRecycleBinService().listDeleted()],
      [createBackupService(), NOT_CONNECTED_BACKUPS, () => createBackupService().listBackups()],
      [createAuditLogService(), NOT_CONNECTED_AUDIT, () => createAuditLogService().listEntries()],
      [createStorageService(), NOT_CONNECTED_STORAGE, () => createStorageService().getStatus()],
      [createNotificationService(), NOT_CONNECTED_NOTIFICATIONS, () => createNotificationService().list()],
    ]
    for (const [service, expected, call] of pairs) {
      assert.equal(service, expected)
      assert.equal(service.isMock, false)
      assert.equal(service.dev, undefined) // no simulation switches in production
      await rejectsWith(call(), SYSTEM_ERROR.notConnected)
    }
    await rejectsWith(NOT_CONNECTED_BACKUPS.restoreBackup('x', { acknowledged: true }), SYSTEM_ERROR.notConnected)
    await rejectsWith(NOT_CONNECTED_SETTINGS.getLimits(), SYSTEM_ERROR.notConnected)
  })
})

describe('mock system state', () => {
  test('keeps changes across "reloads" in the tab storage and can be reset to the seeds', () => {
    const storage = memoryStorage()
    const first = createMockSystemState({ storage })
    first.update((draft) => void (draft.storage.scenario = 'full'))
    assert.equal(createMockSystemState({ storage }).read().storage.scenario, 'full')
    first.reset()
    assert.equal(createMockSystemState({ storage }).read().storage.scenario, 'normal')
  })

  test('read() hands out a copy, and unreadable stored data starts from the seeds', () => {
    const storage = memoryStorage()
    const state = createMockSystemState({ storage })
    state.read().backups.length = 0
    assert.equal(state.read().backups.length, 3)
    storage.setItem('aidp.dev.mockSystem', '{broken')
    assert.equal(createMockSystemState({ storage }).read().backups.length, 3)
  })

  test('the sample audit entries and notifications carry no secrets', () => {
    const state = createMockSystemState({ storage: memoryStorage() }).read()
    assert.ok(!/password|secret|token/i.test(JSON.stringify(state.audit)))
    assert.ok(state.notifications.every((notification) => !('password' in notification)))
  })
})

describe('resource and notification stores', () => {
  test('a resource loads, reports errors with a code, and a newer load wins', async () => {
    let calls = 0
    const releases = []
    const store = createResourceStore(() => new Promise((resolve, reject) => releases.push({ resolve, reject, call: (calls += 1) })))
    const first = store.load()
    assert.equal(store.getState().status, 'loading')
    const second = store.load()
    releases[1].resolve('new')
    releases[0].resolve('old') // the older answer arrives late
    await Promise.all([first, second])
    assert.deepEqual([store.getState().status, store.getState().data], ['ready', 'new'])

    const failing = createResourceStore(async () => {
      throw new SystemError(SYSTEM_ERROR.network)
    })
    await failing.load()
    assert.deepEqual([failing.getState().status, failing.getState().error], ['error', 'network'])
    const odd = createResourceStore(async () => {
      throw new Error('boom')
    })
    await odd.load()
    assert.equal(odd.getState().error, 'unknown')
    failing.set(['x'])
    assert.deepEqual([failing.getState().status, failing.getState().data], ['ready', ['x']])
  })

  test('notifications load, mark read at once and put the state back when the service refuses', async () => {
    const items = [{ id: 'a', unread: true }, { id: 'b', unread: true }]
    const calls = []
    let refuse = false
    const store = createNotificationStore({
      list: async () => items.map((item) => ({ ...item })),
      markRead: async (id) => {
        calls.push(id)
        if (refuse) throw new Error('no')
      },
      markAllRead: async () => {
        if (refuse) throw new Error('no')
      },
    })
    await store.load()
    assert.equal(getUnreadCount(store.getState().items), 2)
    await store.markRead('a')
    assert.equal(getUnreadCount(store.getState().items), 1)
    refuse = true
    await store.markRead('b')
    assert.equal(getUnreadCount(store.getState().items), 1) // rolled back to "b unread"
    await store.markAllRead()
    assert.equal(getUnreadCount(store.getState().items), 1)
    refuse = false
    await store.markAllRead()
    assert.equal(getUnreadCount(store.getState().items), 0)
  })

  test('a failed load is an error state; a quiet refresh does not flash the loading state', async () => {
    let fail = true
    const store = createNotificationStore({ list: async () => (fail ? Promise.reject(new SystemError(SYSTEM_ERROR.notConnected)) : [{ id: 'a', unread: true }]) })
    await store.load()
    assert.deepEqual([store.getState().status, store.getState().error], ['error', 'notConnected'])
    fail = false
    const states = []
    store.subscribe(() => states.push(store.getState().status))
    await store.load({ quiet: true })
    assert.deepEqual(states, ['ready'])
    assert.equal(store.getState().items.length, 1)
  })
})
