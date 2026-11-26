// Processing attempts and accepted results (decisions 11 and 40), as pure functions.
//
//   - the full content of EVERY accepted extraction result is kept, including earlier ones;
//   - EVERY attempt is logged with its date, status and failure reason;
//   - the content of a REJECTED result is never kept (only the fact that it was rejected);
//   - current corrections, current results and approved versions are protected;
//   - this history is independent of the audit log (decisions 31 and 40).
//
// An attempt entry carries METADATA ONLY, never document content: sanitizeAttempt() copies only
// the whitelisted keys, so extracted text cannot leak into the log even by mistake.

import { deepClone } from './utils.js'

export const ATTEMPT_STATUS = Object.freeze({
  succeeded: 'succeeded', // an extraction was produced and applied (nothing to protect on the page)
  failed: 'failed',
  cancelled: 'cancelled',
  awaitingDecision: 'awaitingDecision', // a candidate waits for the user (the page has content)
  accepted: 'accepted', // the user replaced the content with the candidate
  rejected: 'rejected', // the user kept the current content; the candidate was discarded
})

export const ATTEMPT_TRIGGER = Object.freeze({
  upload: 'upload', // the first processing after "Start processing"
  retry: 'retry', // a whole-document retry, no new upload (decision 11)
  reprocess: 'reprocess', // one page again (decision 38)
})

export const ATTEMPT_SCOPE = Object.freeze({ document: 'document', page: 'page' })

const ALLOWED_KEYS = ['id', 'scope', 'pageNumber', 'attempt', 'trigger', 'status', 'startedAt', 'finishedAt', 'errorCode', 'actorId']

export function sanitizeAttempt(entry) {
  const clean = {}
  for (const key of ALLOWED_KEYS) if (entry[key] !== undefined) clean[key] = entry[key]
  clean.pageNumber ??= null
  clean.errorCode ??= null
  clean.finishedAt ??= null
  return clean
}

export const appendAttempt = (attempts, entry) => [...attempts, sanitizeAttempt(entry)]

export function updateAttempt(attempts, id, patch) {
  return attempts.map((entry) => (entry.id === id ? sanitizeAttempt({ ...entry, ...patch, id }) : entry))
}

// Newest first.
export const sortAttempts = (attempts) => [...attempts].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))

// The next attempt number of a page (document-level attempts count as attempt of every page they cover).
export function nextAttemptNumber(attempts, pageNumber) {
  return attempts.filter((entry) => entry.pageNumber === pageNumber || entry.scope === ATTEMPT_SCOPE.document).reduce((max, entry) => Math.max(max, entry.attempt ?? 0), 0) + 1
}

// ---- accepted results ---------------------------------------------------------------------
// { [pageNumber]: [{ attempt, acceptedAt, elements }] } in the order they were accepted.

export function addAcceptedResult(history, pageNumber, { attempt, acceptedAt, elements }) {
  const list = history[pageNumber] ?? []
  // The same attempt is kept once (a retry of a write must not duplicate it).
  if (list.some((entry) => entry.attempt === attempt)) return history
  return { ...history, [pageNumber]: [...list, { attempt, acceptedAt, elements: deepClone(elements) }] }
}

export const listAcceptedResults = (history, pageNumber) => history[pageNumber] ?? []
