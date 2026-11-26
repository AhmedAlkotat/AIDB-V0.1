import { EMPLOYEE_RULES } from '../../domain/employee/employee.js'

// The translated text for a validation code of a form field, or for an error from the service
// that belongs to a field (e.g. a username already taken). `t` is the translate function.
export function fieldMessage(t, field, code) {
  const params = {
    min: field === 'identifier' ? EMPLOYEE_RULES.identifierMinLength : EMPLOYEE_RULES.passwordMinLength,
    max: { displayName: EMPLOYEE_RULES.nameMaxLength, identifier: EMPLOYEE_RULES.identifierMaxLength, password: EMPLOYEE_RULES.passwordMaxLength }[field],
  }
  if (code === 'duplicateIdentifier') return t('employees.errors.duplicateIdentifier')
  if (code === 'required' || code === 'mismatch' || code === 'invalidChars') return t(`employees.validation.${code}`)
  return t(`employees.validation.${field}.${code}`, params)
}

// The text for an error that is not tied to one field.
export function errorMessage(t, error) {
  const known = ['forbidden', 'notFound', 'invalidInput', 'notConnected', 'network', 'unknown']
  return t(`employees.errors.${known.includes(error?.code) ? error.code : 'unknown'}`)
}
