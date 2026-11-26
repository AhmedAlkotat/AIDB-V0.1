// DEVELOPMENT-ONLY mock of the employee-management backend (see services/employeeService.js
// for the interface). Not part of production bundles.
//
// It plays the SERVER's part so the screens can be built and tried before the backend exists:
// it checks that the caller is the signed-in, active Admin (the mock session marker written by
// mockAuthService), validates its input again, enforces unique usernames, and writes to the
// shared mock account store, so the mock sign-in always agrees with what the Admin did.
//
// What it cannot model: ending the sessions of a deactivated employee who is signed in in
// ANOTHER browser tab (decision 16 requires immediate revocation from the real backend).
// Here a deactivated account simply cannot sign in or restore a session any more.

import { USER_ROLES } from '../constants/roles.js'
import {
  EMPLOYEE_STATUS,
  identifiersMatch,
  normalizeDisplayName,
  normalizeIdentifier,
  validateDisplayName,
  validateEmployeeForm,
  validateIdentifier,
  validatePassword,
} from '../domain/employee/employee.js'
import { EMPLOYEE_ERROR, EmployeeError } from '../services/employeeErrors.js'
import { getMockAccountStore, MOCK_SESSION_KEY } from './mockAccountStore.js'
import { getMockContext } from './mockContext.js'

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve())

// An Employee as the screens see it: never includes the password.
const toEmployee = ({ id, displayName, identifier, status, createdAt, updatedAt }) => ({ id, displayName, identifier, status, createdAt, updatedAt })

export function createMockEmployeeService({
  storage = globalThis.sessionStorage,
  latencyMs = 250,
  accountStore = getMockAccountStore(),
  context = getMockContext(),
  generateId = () => `emp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
} = {}) {
  // The server-side check: only the signed-in, active Admin may manage employees.
  function requireAdmin() {
    let marker = null
    try {
      marker = JSON.parse(storage?.getItem(MOCK_SESSION_KEY) ?? 'null')
    } catch {
      marker = null
    }
    const actor = accountStore.findByIdentifier(marker?.identifier)
    if (!actor || actor.status !== EMPLOYEE_STATUS.active || actor.role !== USER_ROLES.orgAdmin) {
      throw new EmployeeError(EMPLOYEE_ERROR.forbidden)
    }
    return { id: actor.id, displayName: actor.displayName }
  }

  // Account changes go to the audit log (category "employee accounts"): who did what to which
  // account, never a password.
  const audit = (actor, action, subject) => context.recordAudit({ category: 'employeeAccounts', action, actor, subject })

  async function run(operation) {
    await wait(latencyMs)
    return operation(requireAdmin())
  }

  // Only employees can be managed here; the Admin account is not an "employee".
  function requireEmployee(id) {
    const account = accountStore.findById(id)
    if (!account || account.role !== USER_ROLES.employee) throw new EmployeeError(EMPLOYEE_ERROR.notFound)
    return account
  }

  function rejectInvalid(errors) {
    if (Object.keys(errors).length > 0) throw new EmployeeError(EMPLOYEE_ERROR.invalidInput, { fields: errors })
  }

  // Usernames are unique across ALL accounts (the Admin's included), ignoring case.
  function rejectDuplicate(identifier, exceptId = null) {
    const clash = accountStore.list().find((account) => account.id !== exceptId && identifiersMatch(account.identifier, identifier))
    if (clash) throw new EmployeeError(EMPLOYEE_ERROR.duplicateIdentifier, { fields: { identifier: EMPLOYEE_ERROR.duplicateIdentifier } })
  }

  return {
    isMock: true,

    listEmployees: () =>
      run(() =>
        accountStore
          .list()
          .filter((account) => account.role === USER_ROLES.employee)
          .map(toEmployee),
      ),

    createEmployee: ({ displayName, identifier, password } = {}) =>
      run((actor) => {
        rejectInvalid(validateEmployeeForm({ displayName, identifier, password, confirmation: password }, { requirePassword: true }))
        rejectDuplicate(identifier)
        const timestamp = new Date().toISOString()
        const record = {
          id: generateId(),
          identifier: normalizeIdentifier(identifier),
          password,
          displayName: normalizeDisplayName(displayName),
          role: USER_ROLES.employee,
          status: EMPLOYEE_STATUS.active,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        accountStore.add(record)
        audit(actor, 'employeeCreated', record.identifier)
        return toEmployee(record)
      }),

    updateEmployee: (id, { displayName, identifier } = {}) =>
      run((actor) => {
        requireEmployee(id)
        const errors = {}
        const nameError = validateDisplayName(displayName)
        if (nameError) errors.displayName = nameError
        const identifierError = validateIdentifier(identifier)
        if (identifierError) errors.identifier = identifierError
        rejectInvalid(errors)
        rejectDuplicate(identifier, id)
        const updated = toEmployee(accountStore.update(id, { displayName: normalizeDisplayName(displayName), identifier: normalizeIdentifier(identifier) }))
        audit(actor, 'employeeUpdated', updated.identifier)
        return updated
      }),

    setEmployeePassword: (id, password) =>
      run((actor) => {
        const target = requireEmployee(id)
        const passwordError = validatePassword(password)
        rejectInvalid(passwordError ? { password: passwordError } : {})
        accountStore.update(id, { password })
        audit(actor, 'employeePasswordSet', target.identifier)
      }),

    // Deactivation keeps the account, its documents and its history; it only blocks sign-in.
    deactivateEmployee: (id) =>
      run((actor) => {
        requireEmployee(id)
        const updated = toEmployee(accountStore.update(id, { status: EMPLOYEE_STATUS.deactivated }))
        audit(actor, 'employeeDeactivated', updated.identifier)
        return updated
      }),

    reactivateEmployee: (id) =>
      run((actor) => {
        requireEmployee(id)
        const updated = toEmployee(accountStore.update(id, { status: EMPLOYEE_STATUS.active }))
        audit(actor, 'employeeReactivated', updated.identifier)
        return updated
      }),
  }
}
