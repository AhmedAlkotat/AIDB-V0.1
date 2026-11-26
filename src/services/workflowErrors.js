// Error codes of the document workflow services (upload registration, queue, approval, edit lock,
// export). A separate module so the real and the development services share them without
// importing each other. They reuse SystemError (services/systemErrors.js), so `error.code`,
// `error.fields` and the "not connected" refusal work the same everywhere.

import { SYSTEM_ERROR, SystemError } from './systemErrors.js'

export const WORKFLOW_ERROR = Object.freeze({
  storageFull: 'storageFull', // decision 35: uploads that need space that is not available are refused
  insufficientStorage: 'insufficientStorage', // there is some space, but not enough for this document
  fileTooLarge: 'fileTooLarge', // decision 36 (the server checks again)
  tooManyPages: 'tooManyPages', // decision 48 (the server checks again)
  invalidState: 'invalidState', // the document is not in a state that allows this
  notEligible: 'notEligible', // approval prerequisites are not met (pages, saved, processing)
  lockHeld: 'lockHeld', // decision 47: someone else is editing
  lockLost: 'lockLost', // the caller's own lock expired or was taken over
  noSuchVersion: 'noSuchVersion',
  forbidden: SYSTEM_ERROR.forbidden,
  notFound: SYSTEM_ERROR.notFound,
  notConnected: SYSTEM_ERROR.notConnected,
})

export { SYSTEM_ERROR, SystemError }

export const workflowError = (code, details) => new SystemError(code, details)
