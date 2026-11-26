// Rules and helpers for employee accounts (frontend only, pure functions).
//
// Approved decisions this follows: 16 (the Admin deactivates and reactivates employees, no
// permanent deletion, their work is kept), 17/19 (only the Admin resets or changes an
// employee's password), 18 (only the Admin creates accounts and sets the initial password,
// no mandatory change at first login), 20 (one institution, one Admin).
//
// PROVISIONAL, NOT APPROVED: the decisions do not define which employee fields exist, the
// username format or a password policy. The limits below are conservative placeholders so
// the forms can validate something sensible; they are collected here so they are easy to
// change once the requirements and the backend agree. The backend must validate on its own.

import { normalizeForSearch } from '../document/search.js'

export const EMPLOYEE_STATUS = Object.freeze({
  active: 'active',
  deactivated: 'deactivated',
})

export const EMPLOYEE_RULES = Object.freeze({
  nameMaxLength: 100,
  identifierMinLength: 3,
  identifierMaxLength: 64,
  // Letters, digits and . _ - @ (so both a plain username and an e-mail address fit; the
  // identifier format is not agreed yet). No spaces.
  identifierPattern: /^[A-Za-z0-9._@-]+$/,
  passwordMinLength: 8,
  passwordMaxLength: 128,
})

// Codes returned by the validators (the UI turns them into translated messages).
export const VALIDATION = Object.freeze({
  required: 'required',
  tooShort: 'tooShort',
  tooLong: 'tooLong',
  invalidChars: 'invalidChars',
  mismatch: 'mismatch',
})

// A name is stored trimmed with inner whitespace collapsed.
export function normalizeDisplayName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

// Usernames are compared without case (the stored spelling is kept as typed).
export function normalizeIdentifier(value) {
  return String(value ?? '').trim()
}

export function identifiersMatch(a, b) {
  return normalizeIdentifier(a).toLowerCase() === normalizeIdentifier(b).toLowerCase()
}

export function validateDisplayName(value) {
  const name = normalizeDisplayName(value)
  if (name === '') return VALIDATION.required
  if (name.length > EMPLOYEE_RULES.nameMaxLength) return VALIDATION.tooLong
  return null
}

export function validateIdentifier(value) {
  const identifier = normalizeIdentifier(value)
  if (identifier === '') return VALIDATION.required
  if (identifier.length < EMPLOYEE_RULES.identifierMinLength) return VALIDATION.tooShort
  if (identifier.length > EMPLOYEE_RULES.identifierMaxLength) return VALIDATION.tooLong
  if (!EMPLOYEE_RULES.identifierPattern.test(identifier)) return VALIDATION.invalidChars
  return null
}

// Passwords are never trimmed or altered.
export function validatePassword(value) {
  const password = String(value ?? '')
  if (password.trim() === '') return VALIDATION.required
  if (password.length < EMPLOYEE_RULES.passwordMinLength) return VALIDATION.tooShort
  if (password.length > EMPLOYEE_RULES.passwordMaxLength) return VALIDATION.tooLong
  return null
}

// The confirmation only guards against typing mistakes; it is not sent anywhere.
export function validatePasswordConfirmation(password, confirmation) {
  if (String(confirmation ?? '') === '') return VALIDATION.required
  return password === confirmation ? null : VALIDATION.mismatch
}

// Validates a whole form. Returns { field: code } with only the fields that are wrong (an
// empty object means valid). `requirePassword` is true when creating an account.
export function validateEmployeeForm({ displayName, identifier, password, confirmation }, { requirePassword = false } = {}) {
  const errors = {}
  const nameError = validateDisplayName(displayName)
  if (nameError) errors.displayName = nameError
  const identifierError = validateIdentifier(identifier)
  if (identifierError) errors.identifier = identifierError
  if (requirePassword) Object.assign(errors, validatePasswordForm({ password, confirmation }))
  return errors
}

export function validatePasswordForm({ password, confirmation }) {
  const errors = {}
  const passwordError = validatePassword(password)
  if (passwordError) errors.password = passwordError
  else {
    const confirmationError = validatePasswordConfirmation(password, confirmation)
    if (confirmationError) errors.confirmation = confirmationError
  }
  return errors
}

// ----- Listing --------------------------------------------------------------------------

// `status`: 'all' or an EMPLOYEE_STATUS value. `query` matches the name or the username,
// ignoring case, diacritics and the usual Arabic letter variants.
export function filterEmployees(employees, { query = '', status = 'all' } = {}) {
  const needle = normalizeForSearch(String(query).trim())
  return employees.filter((employee) => {
    if (status !== 'all' && employee.status !== status) return false
    if (needle === '') return true
    return normalizeForSearch(employee.displayName).includes(needle) || normalizeForSearch(employee.identifier).includes(needle)
  })
}

// Alphabetical by name (Arabic and English aware); the list never changes order because of
// an edit or a status change.
export function sortEmployees(employees) {
  return [...employees].sort((a, b) => a.displayName.localeCompare(b.displayName, ['ar', 'en']) || a.id.localeCompare(b.id))
}

export function countEmployees(employees) {
  const active = employees.filter((employee) => employee.status === EMPLOYEE_STATUS.active).length
  return { total: employees.length, active, deactivated: employees.length - active }
}
