// Errors of the employee-management service (see employeeService.js). A separate module so
// the real and the development services can share them without importing each other.

export const EMPLOYEE_ERROR = Object.freeze({
  forbidden: 'forbidden', // the caller is not the Admin
  notFound: 'notFound',
  duplicateIdentifier: 'duplicateIdentifier',
  invalidInput: 'invalidInput',
  notConnected: 'notConnected',
  network: 'network',
  unknown: 'unknown',
})

export class EmployeeError extends Error {
  // `fields` (optional): { fieldName: code } when the server rejected specific inputs, so
  // the form can show the message next to the field.
  constructor(code, { message = code, fields = {} } = {}) {
    super(message)
    this.name = 'EmployeeError'
    this.code = code
    this.fields = fields
  }
}
