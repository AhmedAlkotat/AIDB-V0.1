// Batch B: employee management and role-based dashboards (frontend only, development mocks).
//
// Covers the pure rules (validation, filtering), the replaceable employee service (the
// development mock and the "not connected" production service), the consistency between the
// mock employee management and the mock sign-in, the Admin's directory state, and the figures
// of the role-based dashboards. Rendering is in employeesUi.test.js, the real browser flow in
// scripts/browser-checks/employees.check.mjs. Nothing here is a real security boundary.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { USER_ROLES } from '../src/constants/roles.js'
import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../src/data/mock/reviewDemo.mock.js'
import { selectVisibleDocuments } from '../src/domain/document/access.js'
import { getDocumentStats, getRecentDocuments } from '../src/domain/dashboard/stats.js'
import {
  countEmployees,
  EMPLOYEE_RULES,
  EMPLOYEE_STATUS,
  filterEmployees,
  normalizeDisplayName,
  sortEmployees,
  validateEmployeeForm,
  validateIdentifier,
  validatePassword,
  validatePasswordConfirmation,
  validatePasswordForm,
  VALIDATION,
} from '../src/domain/employee/employee.js'
import { createMockAccountStore, MOCK_ACCOUNTS_KEY } from '../src/dev/mockAccountStore.js'
import { createMockAuthService, MOCK_SESSION_KEY } from '../src/dev/mockAuthService.js'
import { createMockEmployeeService } from '../src/dev/mockEmployeeService.js'
import { AUTH_ERROR } from '../src/services/authErrors.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { EMPLOYEE_ERROR, EmployeeError } from '../src/services/employeeErrors.js'
import { createEmployeeService, httpEmployeeService } from '../src/services/employeeService.js'
import { createEmployeeDirectory } from '../src/state/employees/employeeDirectory.js'
import { makeSnapshot } from './sessionHelpers.js'

const memoryStorage = () => {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }
}

// A whole mock "server": one account store, one session storage, an employee service and an
// authentication service that share them. `actor` is who is signed in ('admin', 'employee', null).
function world({ actor = 'admin' } = {}) {
  const storage = memoryStorage()
  const accountStore = createMockAccountStore({ storage, now: () => '2026-01-01T00:00:00.000Z' })
  let counter = 0
  const options = { storage, latencyMs: 0, accountStore }
  const employees = createMockEmployeeService({ ...options, generateId: () => `emp-${++counter}` })
  const auth = createMockAuthService(options)
  const signInAs = (identifier) => (identifier ? storage.setItem(MOCK_SESSION_KEY, JSON.stringify({ identifier })) : storage.removeItem(MOCK_SESSION_KEY))
  signInAs(actor)
  return { storage, accountStore, employees, auth, signInAs }
}

const newEmployee = { displayName: 'سارة أحمد', identifier: 'sara.ahmed', password: 'Strong-pass-1' }
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error instanceof EmployeeError && error.code === code)

describe('employee validation', () => {
  test('names are required, trimmed and limited', () => {
    assert.equal(normalizeDisplayName('  سارة    أحمد  '), 'سارة أحمد')
    assert.equal(validateEmployeeForm({ displayName: '   ', identifier: 'abc' }).displayName, VALIDATION.required)
    assert.equal(validateEmployeeForm({ displayName: 'x'.repeat(EMPLOYEE_RULES.nameMaxLength + 1), identifier: 'abc' }).displayName, VALIDATION.tooLong)
    assert.deepEqual(validateEmployeeForm({ displayName: 'علي', identifier: 'abc' }), {})
  })

  test('usernames: required, length, allowed characters, no spaces', () => {
    assert.equal(validateIdentifier(''), VALIDATION.required)
    assert.equal(validateIdentifier('ab'), VALIDATION.tooShort)
    assert.equal(validateIdentifier('a'.repeat(EMPLOYEE_RULES.identifierMaxLength + 1)), VALIDATION.tooLong)
    for (const bad of ['has space', 'سارة', 'a/b', 'a;b']) assert.equal(validateIdentifier(bad), VALIDATION.invalidChars, bad)
    for (const good of ['sara', 'sara.ahmed', 'sara_a-1', 'sara@example.org']) assert.equal(validateIdentifier(good), null, good)
  })

  test('passwords: required, minimum and maximum length, never trimmed', () => {
    assert.equal(validatePassword(''), VALIDATION.required)
    assert.equal(validatePassword('        '), VALIDATION.required)
    assert.equal(validatePassword('short'), VALIDATION.tooShort)
    assert.equal(validatePassword('x'.repeat(EMPLOYEE_RULES.passwordMaxLength + 1)), VALIDATION.tooLong)
    assert.equal(validatePassword('  spaces ok  '), null) // inner/outer spaces are part of the password
    assert.equal(validatePassword('12345678'), null)
  })

  test('the confirmation must match and is checked after the password itself', () => {
    assert.equal(validatePasswordConfirmation('Strong-pass-1', ''), VALIDATION.required)
    assert.equal(validatePasswordConfirmation('Strong-pass-1', 'Strong-pass-2'), VALIDATION.mismatch)
    assert.equal(validatePasswordConfirmation('Strong-pass-1', 'Strong-pass-1'), null)
    assert.deepEqual(validatePasswordForm({ password: 'short', confirmation: 'other' }), { password: VALIDATION.tooShort })
    assert.deepEqual(validatePasswordForm({ password: 'Strong-pass-1', confirmation: 'x' }), { confirmation: VALIDATION.mismatch })
    assert.deepEqual(validatePasswordForm({ password: 'Strong-pass-1', confirmation: 'Strong-pass-1' }), {})
  })

  test('creating needs a password, editing does not', () => {
    const base = { displayName: 'علي', identifier: 'ali' }
    assert.deepEqual(Object.keys(validateEmployeeForm(base, { requirePassword: true })).sort(), ['password'])
    assert.deepEqual(validateEmployeeForm(base, { requirePassword: false }), {})
    assert.deepEqual(validateEmployeeForm({ ...base, password: 'Strong-pass-1', confirmation: 'Strong-pass-1' }, { requirePassword: true }), {})
  })
})

describe('listing: search, status filter, order, counts', () => {
  const list = [
    { id: '1', displayName: 'أحمد علي', identifier: 'ahmed', status: EMPLOYEE_STATUS.active },
    { id: '2', displayName: 'إبراهيم', identifier: 'ibrahim.k', status: EMPLOYEE_STATUS.deactivated },
    { id: '3', displayName: 'Sara Hassan', identifier: 'sara', status: EMPLOYEE_STATUS.active },
  ]
  const ids = (items) => items.map((item) => item.id)

  test('filters by account status', () => {
    assert.deepEqual(ids(filterEmployees(list, { status: 'all' })), ['1', '2', '3'])
    assert.deepEqual(ids(filterEmployees(list, { status: 'active' })), ['1', '3'])
    assert.deepEqual(ids(filterEmployees(list, { status: 'deactivated' })), ['2'])
  })

  test('searches name or username, ignoring case and Arabic letter variants', () => {
    assert.deepEqual(ids(filterEmployees(list, { query: 'sara' })), ['3'])
    assert.deepEqual(ids(filterEmployees(list, { query: 'SARA hass' })), ['3'])
    assert.deepEqual(ids(filterEmployees(list, { query: 'احمد' })), ['1']) // أ matches ا
    assert.deepEqual(ids(filterEmployees(list, { query: 'ابراهيم' })), ['2']) // إ matches ا
    assert.deepEqual(ids(filterEmployees(list, { query: 'ibrahim.k' })), ['2']) // by username
    assert.deepEqual(ids(filterEmployees(list, { query: 'nobody' })), [])
  })

  test('search and status combine', () => {
    assert.deepEqual(ids(filterEmployees(list, { query: 'ibrahim', status: 'active' })), [])
    assert.deepEqual(ids(filterEmployees(list, { query: 'ibrahim', status: 'deactivated' })), ['2'])
  })

  test('sorting is alphabetical and does not change the input; counts add up', () => {
    const copy = [...list]
    assert.equal(sortEmployees(list).length, 3)
    assert.deepEqual(list, copy)
    assert.deepEqual(countEmployees(list), { total: 3, active: 2, deactivated: 1 })
    assert.deepEqual(countEmployees([]), { total: 0, active: 0, deactivated: 0 })
  })
})

describe('mock account store', () => {
  test('starts with the seeded Admin, employee and deactivated employee', () => {
    const accounts = createMockAccountStore({ storage: memoryStorage() }).list()
    assert.deepEqual(accounts.map((account) => [account.identifier, account.role, account.status]).sort(), [
      ['admin', USER_ROLES.orgAdmin, 'active'],
      ['disabled', USER_ROLES.employee, 'deactivated'],
      ['employee', USER_ROLES.employee, 'active'],
    ])
  })

  test('keeps changes in the tab storage across "reloads" and can be reset to the seeds', () => {
    const storage = memoryStorage()
    const first = createMockAccountStore({ storage })
    first.update('demo-employee', { password: 'changed-password' })
    first.add({ id: 'x1', identifier: 'new.one', password: 'pw-123456', displayName: 'جديد', role: USER_ROLES.employee, status: 'active' })
    assert.ok(storage.data.has(MOCK_ACCOUNTS_KEY))
    const reloaded = createMockAccountStore({ storage })
    assert.equal(reloaded.findById('demo-employee').password, 'changed-password')
    assert.ok(reloaded.findByIdentifier('NEW.ONE'))
    reloaded.reset()
    assert.equal(reloaded.findById('demo-employee').password, 'employee-dev')
    assert.equal(reloaded.findByIdentifier('new.one'), null)
  })

  test('survives unreadable stored data by starting from the seeds', () => {
    const storage = memoryStorage()
    storage.setItem(MOCK_ACCOUNTS_KEY, '{not json')
    assert.equal(createMockAccountStore({ storage }).list().length, 3)
  })
})

describe('mock employee service: who may use it (server-side check simulated)', () => {
  test('only the signed-in, active Admin may use any operation', async () => {
    for (const actor of ['employee', 'disabled', 'nobody', null]) {
      const { employees } = world({ actor })
      await rejectsWith(employees.listEmployees(), EMPLOYEE_ERROR.forbidden)
      await rejectsWith(employees.createEmployee(newEmployee), EMPLOYEE_ERROR.forbidden)
      await rejectsWith(employees.updateEmployee('demo-employee', { displayName: 'x y', identifier: 'xyz' }), EMPLOYEE_ERROR.forbidden)
      await rejectsWith(employees.setEmployeePassword('demo-employee', 'Strong-pass-1'), EMPLOYEE_ERROR.forbidden)
      await rejectsWith(employees.deactivateEmployee('demo-employee'), EMPLOYEE_ERROR.forbidden)
      await rejectsWith(employees.reactivateEmployee('demo-disabled'), EMPLOYEE_ERROR.forbidden)
    }
  })

  test('a refused employee changes nothing', async () => {
    const { employees, accountStore } = world({ actor: 'employee' })
    const before = JSON.stringify(accountStore.list())
    await employees.deactivateEmployee('demo-employee').catch(() => {})
    await employees.setEmployeePassword('demo-employee', 'hacked-password').catch(() => {})
    assert.equal(JSON.stringify(accountStore.list()), before)
  })

  test('the Admin is not an employee: it is not listed and cannot be managed here', async () => {
    const { employees } = world()
    const list = await employees.listEmployees()
    assert.deepEqual(list.map((employee) => employee.identifier).sort(), ['disabled', 'employee'])
    await rejectsWith(employees.deactivateEmployee('demo-admin'), EMPLOYEE_ERROR.notFound)
    await rejectsWith(employees.setEmployeePassword('demo-admin', 'Strong-pass-1'), EMPLOYEE_ERROR.notFound)
    await rejectsWith(employees.updateEmployee('demo-admin', { displayName: 'مدير جديد', identifier: 'boss' }), EMPLOYEE_ERROR.notFound)
  })
})

describe('mock employee service: operations', () => {
  test('creates an active employee and never returns the password', async () => {
    const { employees } = world()
    const created = await employees.createEmployee({ ...newEmployee, displayName: '  سارة   أحمد ' })
    assert.deepEqual(Object.keys(created).sort(), ['createdAt', 'displayName', 'id', 'identifier', 'status', 'updatedAt'])
    assert.equal(created.displayName, 'سارة أحمد')
    assert.equal(created.status, EMPLOYEE_STATUS.active)
    assert.ok(!JSON.stringify(await employees.listEmployees()).includes(newEmployee.password))
  })

  test('validates again on the "server" and reports the failing fields', async () => {
    const { employees } = world()
    await assert.rejects(employees.createEmployee({ displayName: '', identifier: 'a b', password: 'short' }), (error) => {
      assert.equal(error.code, EMPLOYEE_ERROR.invalidInput)
      assert.deepEqual(Object.keys(error.fields).sort(), ['displayName', 'identifier', 'password'])
      return true
    })
    await rejectsWith(employees.setEmployeePassword('demo-employee', 'short'), EMPLOYEE_ERROR.invalidInput)
    await rejectsWith(employees.updateEmployee('demo-employee', { displayName: '', identifier: 'ok-name' }), EMPLOYEE_ERROR.invalidInput)
  })

  test('usernames are unique, ignoring case, across employees AND the Admin', async () => {
    const { employees } = world()
    await employees.createEmployee(newEmployee)
    for (const identifier of ['SARA.AHMED', 'employee', 'ADMIN']) {
      await assert.rejects(employees.createEmployee({ ...newEmployee, identifier }), (error) => error.code === EMPLOYEE_ERROR.duplicateIdentifier && error.fields.identifier === 'duplicateIdentifier')
    }
  })

  test('editing changes name and username; keeping your own username is not a duplicate', async () => {
    const { employees } = world()
    const updated = await employees.updateEmployee('demo-employee', { displayName: 'موظف مُعدَّل', identifier: 'employee' })
    assert.equal(updated.displayName, 'موظف مُعدَّل')
    const renamed = await employees.updateEmployee('demo-employee', { displayName: 'موظف مُعدَّل', identifier: 'employee.renamed' })
    assert.equal(renamed.identifier, 'employee.renamed')
    await rejectsWith(employees.updateEmployee('demo-employee', { displayName: 'موظف', identifier: 'disabled' }), EMPLOYEE_ERROR.duplicateIdentifier)
    await rejectsWith(employees.updateEmployee('missing-id', { displayName: 'موظف', identifier: 'whatever' }), EMPLOYEE_ERROR.notFound)
  })

  test('deactivating and reactivating only change the status; the account and its id stay', async () => {
    const { employees, accountStore } = world()
    const before = accountStore.findById('demo-employee')
    const off = await employees.deactivateEmployee('demo-employee')
    assert.equal(off.status, EMPLOYEE_STATUS.deactivated)
    assert.equal(off.id, before.id)
    assert.equal(accountStore.findById('demo-employee').displayName, before.displayName)
    const on = await employees.reactivateEmployee('demo-employee')
    assert.equal(on.status, EMPLOYEE_STATUS.active)
  })

  test('there is no way to delete an account, in either service', () => {
    for (const service of [createMockEmployeeService({ storage: memoryStorage(), latencyMs: 0, accountStore: createMockAccountStore({ storage: memoryStorage() }) }), httpEmployeeService]) {
      assert.deepEqual(Object.keys(service).filter((name) => /delete|remove|destroy|purge/i.test(name)), [])
    }
  })
})

describe('mock employee management and mock sign-in stay consistent', () => {
  test('a new employee can sign in with the initial password; a wrong one cannot', async () => {
    const { employees, auth } = world()
    await employees.createEmployee(newEmployee)
    await assert.rejects(auth.login({ identifier: 'sara.ahmed', password: 'wrong-password' }), (error) => error.code === AUTH_ERROR.invalidCredentials)
    const user = await auth.login({ identifier: 'SARA.ahmed', password: newEmployee.password })
    assert.equal(user.role, USER_ROLES.employee)
    assert.equal(user.displayName, 'سارة أحمد')
  })

  test('a deactivated employee cannot sign in or restore a session; reactivating restores access', async () => {
    const { employees, auth, signInAs } = world()
    await employees.deactivateEmployee('demo-employee')
    await assert.rejects(auth.login({ identifier: 'employee', password: 'employee-dev' }), (error) => error.code === AUTH_ERROR.accountDisabled)
    signInAs('employee') // a session marker left over from before the deactivation
    assert.equal(await auth.restoreSession(), null)
    signInAs('admin') // the Admin (in another tab) reactivates the account
    await employees.reactivateEmployee('demo-employee')
    assert.equal((await auth.login({ identifier: 'employee', password: 'employee-dev' })).id, 'demo-employee')
  })

  test('the originally deactivated seed account stays unable to sign in until reactivated', async () => {
    const { employees, auth } = world()
    await assert.rejects(auth.login({ identifier: 'disabled', password: 'disabled-dev' }), (error) => error.code === AUTH_ERROR.accountDisabled)
    await employees.reactivateEmployee('demo-disabled')
    assert.equal((await auth.login({ identifier: 'disabled', password: 'disabled-dev' })).id, 'demo-disabled')
  })

  test('a changed password applies to the next sign-in: the old one stops working', async () => {
    const { employees, auth, signInAs } = world()
    assert.ok(await auth.login({ identifier: 'employee', password: 'employee-dev' }))
    signInAs('admin') // the Admin (in another tab) changes the password
    await employees.setEmployeePassword('demo-employee', 'Brand-new-pass-9')
    await assert.rejects(auth.login({ identifier: 'employee', password: 'employee-dev' }), (error) => error.code === AUTH_ERROR.invalidCredentials)
    assert.ok(await auth.login({ identifier: 'employee', password: 'Brand-new-pass-9' }))
  })

  test('a changed username applies to the next sign-in', async () => {
    const { employees, auth } = world()
    await employees.updateEmployee('demo-employee', { displayName: 'موظف تجريبي', identifier: 'employee.new' })
    await assert.rejects(auth.login({ identifier: 'employee', password: 'employee-dev' }), (error) => error.code === AUTH_ERROR.invalidCredentials)
    assert.ok(await auth.login({ identifier: 'employee.new', password: 'employee-dev' }))
  })

  test('deactivation keeps the documents and their owner untouched', () => {
    // Documents are owned by the account id; the mock employee service never touches them.
    const documents = createMemoryDocumentStore()
    seedDemoReviewDocuments(documents)
    const before = JSON.stringify(documents.list())
    const { employees } = world()
    return employees.deactivateEmployee('demo-employee').then(() => {
      assert.equal(JSON.stringify(documents.list()), before)
      assert.ok(documents.list().every((item) => item.ownerId === 'demo-employee'))
    })
  })

  test('the login page helper can restore the original accounts', async () => {
    const { employees, auth } = world()
    await employees.setEmployeePassword('demo-employee', 'Brand-new-pass-9')
    await auth.resetDevData()
    assert.ok(await auth.login({ identifier: 'employee', password: 'employee-dev' }))
  })
})

describe('services without a backend', () => {
  test('production-like environments get the "not connected" service, which never answers with data', async () => {
    const service = createEmployeeService() // Node has no import.meta.env, like a build where DEV is false
    assert.equal(service, httpEmployeeService)
    assert.equal(service.isMock, false)
    await rejectsWith(service.listEmployees(), EMPLOYEE_ERROR.notConnected)
    await rejectsWith(service.createEmployee(newEmployee), EMPLOYEE_ERROR.notConnected)
    await rejectsWith(service.setEmployeePassword('x', 'Strong-pass-1'), EMPLOYEE_ERROR.notConnected)
    await rejectsWith(service.deactivateEmployee('x'), EMPLOYEE_ERROR.notConnected)
  })
})

describe('employee directory (the Admin screen state)', () => {
  test('loads the list: loading, then ready', async () => {
    const { employees } = world()
    const directory = createEmployeeDirectory(employees)
    assert.equal(directory.getState().status, 'idle')
    const loading = directory.load()
    assert.equal(directory.getState().status, 'loading')
    await loading
    assert.equal(directory.getState().status, 'ready')
    assert.equal(directory.getState().items.length, 2)
  })

  test('a failed load is an error state with the code, and can be retried', async () => {
    const { employees, signInAs } = world({ actor: null })
    const directory = createEmployeeDirectory(employees)
    await directory.load()
    assert.deepEqual([directory.getState().status, directory.getState().error], ['error', EMPLOYEE_ERROR.forbidden])
    signInAs('admin')
    await directory.load()
    assert.equal(directory.getState().status, 'ready')
    assert.equal(directory.getState().error, null)

    const broken = createEmployeeDirectory({ listEmployees: async () => Promise.reject(new Error('boom')) })
    await broken.load()
    assert.equal(broken.getState().error, EMPLOYEE_ERROR.unknown)
  })

  test('actions update the list only after the service acknowledged them', async () => {
    const { employees } = world()
    const directory = createEmployeeDirectory(employees)
    await directory.load()

    const created = await directory.create(newEmployee)
    assert.equal(created.ok, true)
    assert.equal(directory.getState().items.length, 3)
    const id = created.employee.id

    assert.equal((await directory.update(id, { displayName: 'سارة علي', identifier: 'sara.ali' })).ok, true)
    assert.equal(directory.getState().items.find((item) => item.id === id).identifier, 'sara.ali')

    assert.equal((await directory.deactivate(id)).ok, true)
    assert.equal(directory.getState().items.find((item) => item.id === id).status, 'deactivated')
    assert.equal((await directory.reactivate(id)).ok, true)
    assert.equal(directory.getState().items.find((item) => item.id === id).status, 'active')

    const passwordResult = await directory.setPassword(id, 'Brand-new-pass-9')
    assert.deepEqual(passwordResult, { ok: true, employee: undefined })
    assert.ok(!JSON.stringify(directory.getState()).includes('Brand-new-pass-9'))
  })

  test('failures are returned (never thrown) and leave the list unchanged', async () => {
    const { employees } = world()
    const directory = createEmployeeDirectory(employees)
    await directory.load()
    const before = JSON.stringify(directory.getState().items)

    const duplicate = await directory.create({ ...newEmployee, identifier: 'employee' })
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.error.code, EMPLOYEE_ERROR.duplicateIdentifier)
    assert.equal(duplicate.error.fields.identifier, 'duplicateIdentifier')

    const missing = await directory.deactivate('missing-id')
    assert.deepEqual([missing.ok, missing.error.code], [false, EMPLOYEE_ERROR.notFound])

    const odd = await createEmployeeDirectory({ createEmployee: async () => Promise.reject(new Error('boom')) }).create({})
    assert.deepEqual([odd.ok, odd.error.code], [false, EMPLOYEE_ERROR.unknown])
    assert.equal(JSON.stringify(directory.getState().items), before)
  })

  test('subscribers are told about changes', async () => {
    const { employees } = world()
    const directory = createEmployeeDirectory(employees)
    let notifications = 0
    const stop = directory.subscribe(() => (notifications += 1))
    await directory.load()
    assert.ok(notifications >= 2)
    stop()
  })
})

describe('role-based dashboard figures', () => {
  function documentsWithForeign() {
    const store = createMemoryDocumentStore()
    seedDemoReviewDocuments(store) // one pending + one approved, both owned by the demo employee
    store.create({ id: 'other-pending', name: 'مستند موظف آخر', snapshot: makeSnapshot(), ownerId: 'another-employee' })
    store.create({ id: 'other-pending-2', name: 'مستند آخر ٢', snapshot: makeSnapshot(), ownerId: 'another-employee' })
    return store.list()
  }
  const employee = { id: 'demo-employee', role: USER_ROLES.employee }
  const admin = { id: 'demo-admin', role: USER_ROLES.orgAdmin }

  test('an employee\'s figures count only their own documents', () => {
    const own = selectVisibleDocuments(documentsWithForeign(), employee)
    assert.deepEqual(getDocumentStats(own), { total: 2, approved: 1, needsCorrection: 1 })
    assert.ok(own.every((item) => item.ownerId === 'demo-employee'))
  })

  test('the Admin\'s figures cover the whole institution', () => {
    assert.deepEqual(getDocumentStats(selectVisibleDocuments(documentsWithForeign(), admin)), { total: 4, approved: 1, needsCorrection: 3 })
  })

  test('another employee sees none of the first employee\'s documents', () => {
    const other = selectVisibleDocuments(documentsWithForeign(), { id: 'another-employee', role: USER_ROLES.employee })
    assert.deepEqual(other.map((item) => item.id).sort(), ['other-pending', 'other-pending-2'])
  })

  test('figures of nothing are zeros, and recent activity is newest first and limited', () => {
    assert.deepEqual(getDocumentStats([]), { total: 0, approved: 0, needsCorrection: 0 })
    const items = Array.from({ length: 8 }, (_, index) => ({ id: `d${index}`, updatedAt: `2026-01-0${index + 1}T00:00:00.000Z`, approvalStatus: 'none' }))
    const recent = getRecentDocuments(items, 5)
    assert.deepEqual(recent.map((item) => item.id), ['d7', 'd6', 'd5', 'd4', 'd3'])
    assert.equal(items[0].id, 'd0') // the input order is untouched
    assert.ok(DEMO_REVIEW_IDS.toReview)
  })
})
