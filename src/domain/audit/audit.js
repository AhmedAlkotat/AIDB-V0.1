// Audit-log rules (decisions 31–33), pure functions.
//
// The log records WHO did WHAT, never passwords or document content. It is independent of the
// history of versions, approvals and processing attempts (decisions 31, 33, 40), which is never
// deleted by the log's retention period. Only the Admin can view and filter the log; it cannot
// be exported (decision 32), so nothing here (or in the UI) offers an export.

import { AUDIT_CATEGORIES } from '../settings/settings.js'

export { AUDIT_CATEGORIES }

export const AUDIT_OUTCOME = Object.freeze({ success: 'success', failure: 'failure' })

const DAY_MS = 24 * 60 * 60 * 1000

// The action codes of every category (the UI translates them: audit.actions.<code>).
export const AUDIT_ACTIONS = Object.freeze({
  approval: ['approved'],
  approvedEdits: ['newVersionCreated', 'reapproved'],
  employeeAccounts: ['employeeCreated', 'employeeUpdated', 'employeePasswordSet', 'employeeDeactivated', 'employeeReactivated'],
  restore: ['restoreCompleted', 'restoreFailed', 'restoreCancelled'],
  backups: ['backupCreated', 'backupFailed'],
  authentication: ['loginSucceeded', 'loginFailed'],
  uploads: ['documentUploaded'],
  processing: ['processingStarted', 'processingRetried', 'processingFailed'],
})

// An entry: { id, at, category, action, actorId, actorName, subject, outcome }. `subject` is a
// short label of what was acted on (an account name, a document name, a backup id) and never
// holds a secret. A new entry is only kept when its category is switched on (decision 31:
// the Admin switches FUTURE logging on or off per category).
export function shouldRecord(auditSettings, category) {
  return AUDIT_CATEGORIES.includes(category) && auditSettings.categories?.[category] === true
}

// Entries older than the retention period are dropped.
export function dropExpiredEntries(entries, retentionDays, now = new Date()) {
  const limit = new Date(now).getTime() - retentionDays * DAY_MS
  return entries.filter((entry) => new Date(entry.at).getTime() >= limit)
}

export function countExpiredEntries(entries, retentionDays, now = new Date()) {
  return entries.length - dropExpiredEntries(entries, retentionDays, now).length
}

// Filters by category, outcome, free text (actor or subject) and a date range ('YYYY-MM-DD',
// inclusive, local time). Newest first.
export function filterAuditEntries(entries, { category = 'all', outcome = 'all', query = '', from = '', to = '' } = {}) {
  const needle = String(query).trim().toLowerCase()
  const start = from ? new Date(`${from}T00:00:00`).getTime() : null
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : null
  return entries
    .filter((entry) => {
      if (category !== 'all' && entry.category !== category) return false
      if (outcome !== 'all' && entry.outcome !== outcome) return false
      const at = new Date(entry.at).getTime()
      if (start !== null && at < start) return false
      if (end !== null && at > end) return false
      if (needle !== '' && !`${entry.actorName ?? ''} ${entry.subject ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}
