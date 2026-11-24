// What happens in the "replace the current content?" dialog after the user
// confirms. Accepting a re-extraction can be refused (for example when the new
// content clashes with other data in the document). A refusal must NEVER close
// the dialog or look like success: the dialog stays open and shows the error.
//
// `onAccept` returns the session's result { ok, code? }. Only `ok === true`
// counts as success; anything else (a refusal, nothing returned, an exception)
// keeps the dialog open.
export function runAcceptCandidate(onAccept) {
  let result
  try {
    result = onAccept()
  } catch {
    return { closeDialog: false, errorCode: 'UNKNOWN' }
  }
  if (result && result.ok === true) return { closeDialog: true, errorCode: null }
  return { closeDialog: false, errorCode: (result && result.code) || 'UNKNOWN' }
}
