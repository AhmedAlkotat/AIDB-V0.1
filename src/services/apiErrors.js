// One mapping from an HTTP failure (ApiError, apiClient.js) to the domain errors the screens already understand
// (SystemError, AuthError, EmployeeError). HTTP details stop here: nothing above the services sees a status code.
//
// The server's error body is PROPOSED to be the envelope of docs/api/error-codes.md:
//   { "error": { "code", "message", "fields", "details", "requestId" } }
// When the body is not an envelope, the HTTP status decides. A code that is not in the closed list becomes `unknown`.

import { API_ERROR, ApiError } from './apiClient.js'
import { AUTH_ERROR, AuthError } from './authErrors.js'
import { EMPLOYEE_ERROR, EmployeeError } from './employeeErrors.js'
import { SYSTEM_ERROR, SystemError } from './systemErrors.js'
import { WORKFLOW_ERROR } from './workflowErrors.js'

// The closed list of server codes (docs/api/error-codes.md). Kept in one place; a test checks it against the contract.
export const SERVER_ERROR_CODES = Object.freeze([
  'unauthenticated',
  'sessionExpired',
  'invalidCredentials',
  'accountDisabled',
  'missingFields',
  'forbidden',
  'notFound',
  'invalidInput',
  'blocked',
  'duplicateIdentifier',
  'fileTooLarge',
  'unsupportedFileType',
  'tooManyPages',
  'storageFull',
  'insufficientStorage',
  'invalidState',
  'notEligible',
  'lockHeld',
  'lockLost',
  'noSuchVersion',
  'revisionConflict',
  'unknown',
])

// The error envelope of a response body, or null when the body is something else.
export function readErrorEnvelope(body) {
  const error = body && typeof body === 'object' ? body.error : null
  if (!error || typeof error !== 'object' || typeof error.code !== 'string') return null
  return {
    code: SERVER_ERROR_CODES.includes(error.code) ? error.code : 'unknown',
    message: typeof error.message === 'string' ? error.message : error.code,
    fields: error.fields && typeof error.fields === 'object' ? error.fields : {},
    details: error.details && typeof error.details === 'object' ? error.details : {},
    requestId: typeof error.requestId === 'string' ? error.requestId : null,
  }
}

// The domain code of any failure: the server's code when it sent one, otherwise one derived from the failure kind.
export function domainCodeOf(error) {
  if (!(error instanceof ApiError)) return error?.code && typeof error.code === 'string' ? error.code : SYSTEM_ERROR.unknown
  const envelope = readErrorEnvelope(error.details)
  if (envelope) return envelope.code
  switch (error.code) {
    case API_ERROR.network:
    case API_ERROR.timeout:
      return SYSTEM_ERROR.network
    case API_ERROR.unauthorized:
      return 'unauthenticated'
    case API_ERROR.forbidden:
      return SYSTEM_ERROR.forbidden
    case API_ERROR.notFound:
      return SYSTEM_ERROR.notFound
    default:
      return SYSTEM_ERROR.unknown
  }
}

// ---- the error classes -----------------------------------------------------------------------------

// A SystemError for settings, documents, queue, lock, approval, export, ... `fields` and `details` are kept.
export function toSystemError(error) {
  if (error instanceof SystemError) return error
  const envelope = error instanceof ApiError ? readErrorEnvelope(error.details) : null
  const code = domainCodeOf(error)
  const mapped = new SystemError(code, { message: envelope?.message ?? error?.message ?? code, fields: envelope?.fields ?? {} })
  mapped.details = envelope?.details ?? {}
  mapped.status = error instanceof ApiError ? error.status : 0
  mapped.cause = error
  return mapped
}

const AUTH_CODES = { invalidCredentials: AUTH_ERROR.invalidCredentials, accountDisabled: AUTH_ERROR.accountDisabled, missingFields: AUTH_ERROR.missingFields, network: AUTH_ERROR.network }

export function toAuthError(error) {
  if (error instanceof AuthError) return error
  const code = domainCodeOf(error)
  return new AuthError(AUTH_CODES[code] ?? AUTH_ERROR.unknown, error?.message ?? code)
}

const EMPLOYEE_CODES = Object.freeze(Object.values(EMPLOYEE_ERROR))

export function toEmployeeError(error) {
  if (error instanceof EmployeeError) return error
  const envelope = error instanceof ApiError ? readErrorEnvelope(error.details) : null
  const code = domainCodeOf(error)
  return new EmployeeError(EMPLOYEE_CODES.includes(code) ? code : EMPLOYEE_ERROR.unknown, { message: envelope?.message ?? error?.message ?? code, fields: envelope?.fields ?? {} })
}

// True when the failure means "your session is over" (a 401 the client could not repair).
export const isSessionError = (error) => error instanceof ApiError && error.code === API_ERROR.unauthorized

// True when the data on the server changed since the client last read it (lost-update protection).
export const isRevisionConflict = (error) => domainCodeOf(error) === WORKFLOW_ERROR.revisionConflict
