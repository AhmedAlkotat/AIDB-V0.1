// The employee-management service the Admin screens talk to. It is REPLACEABLE: the screens
// only know this interface.
//
//   isMock                                       true for the development mock
//   listEmployees()                -> Promise<Employee[]>
//   createEmployee({ displayName, identifier, password }) -> Promise<Employee>
//   updateEmployee(id, { displayName, identifier })       -> Promise<Employee>
//   setEmployeePassword(id, password)                     -> Promise<void>
//   deactivateEmployee(id)         -> Promise<Employee>   (never deletes: decision 16)
//   reactivateEmployee(id)         -> Promise<Employee>
//
// An `Employee` is { id, displayName, identifier, status, createdAt, updatedAt } with
// `status` from EMPLOYEE_STATUS. A password is only ever SENT, never returned or shown.
// Every method rejects with an EmployeeError (employeeErrors.js).
//
// There is deliberately no delete method: employee accounts are never permanently deleted.
//
// NOT CONNECTED TO A BACKEND YET. Endpoint names, request/response schemas and the exact
// employee fields are not agreed with the backend, so `httpEmployeeService` only reports
// "not connected". Development builds use the mock in src/dev/ (reachable only through the
// `import.meta.env.DEV` branch below, which production builds remove). Immediate revocation
// of a deactivated employee's sessions is a REQUIREMENT of the final backend (decision 16);
// the frontend cannot provide it.

import { createMockEmployeeService } from '../dev/mockEmployeeService.js'
import { EMPLOYEE_ERROR, EmployeeError } from './employeeErrors.js'

export { EMPLOYEE_ERROR, EmployeeError }

const notConnected = async () => {
  throw new EmployeeError(EMPLOYEE_ERROR.notConnected, { message: 'Employee management is not connected to a backend yet.' })
}

export const httpEmployeeService = Object.freeze({
  isMock: false,
  listEmployees: notConnected,
  createEmployee: notConnected,
  updateEmployee: notConnected,
  setEmployeePassword: notConnected,
  deactivateEmployee: notConnected,
  reactivateEmployee: notConnected,
})

// The service used by the app: the mock in development, the real one otherwise.
export function createEmployeeService() {
  if (import.meta.env?.DEV) return createMockEmployeeService()
  return httpEmployeeService
}

export const employeeService = createEmployeeService()
