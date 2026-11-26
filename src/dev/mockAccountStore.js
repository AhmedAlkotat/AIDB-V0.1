// DEVELOPMENT-ONLY store of the mock accounts. The mock authentication and the mock
// employee management both read and write THIS store, so what the Admin does (create an
// employee, change a password, deactivate an account) really affects who can sign in.
//
// Like the rest of src/dev/ it is only reachable through `import.meta.env.DEV` branches and
// is not part of production bundles. Nothing here is secure: passwords are kept in plain
// text, in this browser tab's sessionStorage only so a reload during development keeps the
// data (it disappears when the tab is closed). The real system stores salted hashes on the
// server (decision 19).

import { EMPLOYEE_STATUS } from '../domain/employee/employee.js'
import { USER_ROLES } from '../constants/roles.js'
import { DEMO_USER } from '../data/mock/demoUser.mock.js'

export const MOCK_ACCOUNTS_KEY = 'aidp.dev.mockAccounts'
// Where the mock sign-in remembers who is signed in (the mock services read it to know the caller).
export const MOCK_SESSION_KEY = 'aidp.dev.mockSession'

// The accounts a fresh development session starts with. The `id` of the mock employee equals
// the owner of the demonstration documents (data/mock/reviewDemo.mock.js), so that employee
// sees them and the Admin sees all. A function, so nothing runs unless the mock is used.
export function getMockAccounts() {
  return [
    { identifier: 'employee', password: 'employee-dev', user: { id: DEMO_USER.id, displayName: 'موظف تجريبي', role: USER_ROLES.employee } },
    { identifier: 'admin', password: 'admin-dev', user: { id: 'demo-admin', displayName: 'مدير تجريبي', role: USER_ROLES.orgAdmin } },
    // A deactivated employee (decision 16), to see the "account disabled" message.
    { identifier: 'disabled', password: 'disabled-dev', disabled: true, user: { id: 'demo-disabled', displayName: 'موظف معطل', role: USER_ROLES.employee } },
  ]
}

function seedRecords(timestamp) {
  return getMockAccounts().map(({ identifier, password, disabled, user }) => ({
    id: user.id,
    identifier,
    password,
    displayName: user.displayName,
    role: user.role,
    status: disabled ? EMPLOYEE_STATUS.deactivated : EMPLOYEE_STATUS.active,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

// `storage`: where the records are kept (default: sessionStorage when it exists; none in tests).
export function createMockAccountStore({ storage = globalThis.sessionStorage, now = () => new Date().toISOString() } = {}) {
  let records = null

  function load() {
    if (records) return records
    try {
      const parsed = JSON.parse(storage?.getItem(MOCK_ACCOUNTS_KEY) ?? 'null')
      if (Array.isArray(parsed) && parsed.length > 0) records = parsed
    } catch {
      // Unreadable data: start from the seeds.
    }
    records ??= seedRecords(now())
    return records
  }

  function save() {
    try {
      storage?.setItem(MOCK_ACCOUNTS_KEY, JSON.stringify(records))
    } catch {
      // Storage full or unavailable: the data simply lives in memory.
    }
  }

  return {
    list: () => load().map((record) => ({ ...record })),
    findById: (id) => {
      const record = load().find((candidate) => candidate.id === id)
      return record ? { ...record } : null
    },
    findByIdentifier: (identifier) => {
      const wanted = String(identifier ?? '').trim().toLowerCase()
      const record = wanted === '' ? null : load().find((candidate) => candidate.identifier.toLowerCase() === wanted)
      return record ? { ...record } : null
    },
    add(record) {
      load().push({ ...record })
      save()
    },
    // Changes fields of an existing account; returns the updated copy (null when unknown).
    update(id, patch) {
      const record = load().find((candidate) => candidate.id === id)
      if (!record) return null
      Object.assign(record, patch, { updatedAt: now() })
      save()
      return { ...record }
    },
    // Back to the seeds (the login page's development helper).
    reset() {
      records = seedRecords(now())
      save()
    },
  }
}

let shared = null

// The one store the whole dev session shares (created on first use).
export function getMockAccountStore() {
  shared ??= createMockAccountStore()
  return shared
}
