// The text for a failed workflow action (upload registration, retry, approval, lock, export). `code` is a
// WORKFLOW_ERROR / SYSTEM_ERROR code, or a session / approval code; anything unknown reads as "unknown".
// `t` is the translate function.
const WORKFLOW_CODES = ['storageFull', 'insufficientStorage', 'fileTooLarge', 'tooManyPages', 'invalidState', 'notEligible', 'lockHeld', 'lockLost', 'noSuchVersion']
const SYSTEM_CODES = ['forbidden', 'notFound', 'invalidInput', 'blocked', 'notConnected', 'network']

export function workflowErrorMessage(t, code, params) {
  if (WORKFLOW_CODES.includes(code)) return t(`workflow.errors.${code}`, params)
  if (SYSTEM_CODES.includes(code)) return t(`systemErrors.${code}`)
  return t('workflow.errors.unknown')
}
