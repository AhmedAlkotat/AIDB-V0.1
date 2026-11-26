// The text for a failed load or action (a SYSTEM_ERROR code; anything else reads as unknown).
// `t` is the translate function.
export function systemErrorMessage(t, code) {
  const known = ['forbidden', 'notFound', 'invalidInput', 'blocked', 'notConnected', 'network']
  return t(`systemErrors.${known.includes(code) ? code : 'unknown'}`)
}
