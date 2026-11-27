// Errors shared by the system-administration services (settings, recycle bin, backups, audit
// log, storage, notifications). A separate module so the real and the development services can
// share them without importing each other.

export const SYSTEM_ERROR = Object.freeze({
  forbidden: 'forbidden', // the caller may not do this (e.g. not the Admin)
  notFound: 'notFound',
  invalidInput: 'invalidInput', // `fields` names what is wrong
  blocked: 'blocked', // refused because of the system state (e.g. a restore is running)
  notConnected: 'notConnected',
  unauthenticated: 'unauthenticated', // the session is over (HTTP 401)
  network: 'network',
  unknown: 'unknown',
})

export class SystemError extends Error {
  constructor(code, { message = code, fields = {} } = {}) {
    super(message)
    this.name = 'SystemError'
    this.code = code
    this.fields = fields
  }
}

// The production placeholder of a service: every method refuses with "not connected" and no
// data is ever invented. `isMock` is false so screens do not label anything as demo data.
export function createNotConnectedService(methodNames) {
  const refuse = async () => {
    throw new SystemError(SYSTEM_ERROR.notConnected, { message: 'This service is not connected to a backend yet.' })
  }
  return Object.freeze({ isMock: false, ...Object.fromEntries(methodNames.map((name) => [name, refuse])) })
}
