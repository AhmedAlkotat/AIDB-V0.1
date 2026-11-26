// Errors of the authentication service (see authService.js). A separate module so the
// real and the development services can both use them without importing each other.

export const AUTH_ERROR = Object.freeze({
  missingFields: 'missingFields',
  invalidCredentials: 'invalidCredentials',
  accountDisabled: 'accountDisabled',
  notConnected: 'notConnected',
  network: 'network',
  unknown: 'unknown',
})

export class AuthError extends Error {
  constructor(code, message = code) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}
