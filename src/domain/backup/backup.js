// Backup rules (decisions 25–30), pure functions. EVERYTHING BACKUP-RELATED IN THE FRONTEND IS
// A SIMULATION: no real backup, encryption or restoration exists until the backend does.

import { BACKUP_RETENTION_MODE } from '../settings/settings.js'

const DAY_MS = 24 * 60 * 60 * 1000

export const BACKUP_TYPE = Object.freeze({
  scheduled: 'scheduled',
  manual: 'manual',
  protective: 'protective', // taken automatically just before a restore (decision 30)
})

export const BACKUP_STATUS = Object.freeze({ completed: 'completed', failed: 'failed' })

// The steps of a restore, in order (decision 30). The restore stops at the first failing step;
// if the protective backup fails nothing has been changed (the restore is cancelled).
export const RESTORE_STEPS = Object.freeze(['verify', 'protectiveBackup', 'restore'])
export const RESTORE_STEP_STATUS = Object.freeze({ done: 'done', failed: 'failed', skipped: 'skipped' })

export function canRestore(backup) {
  return backup.status === BACKUP_STATUS.completed
}

// The backups the retention policy would remove now. Protected backups are never removed,
// failed attempts do not count towards the limit, and a protective backup is only removed by
// age like any other. (Dependencies between incremental backups would have to be preserved
// too; incremental backups are not modelled here.)
export function selectBackupsToRemove(backups, settings, now = new Date()) {
  const candidates = backups.filter((backup) => backup.status === BACKUP_STATUS.completed).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (settings.retentionMode === BACKUP_RETENTION_MODE.days) {
    const limit = new Date(now).getTime() - settings.retentionDays * DAY_MS
    return candidates.filter((backup) => !backup.protected && new Date(backup.createdAt).getTime() < limit)
  }
  // By count: keep the newest `retentionCount` completed backups; protected ones are kept
  // regardless and do not use up a place.
  const unprotected = candidates.filter((backup) => !backup.protected)
  return unprotected.slice(settings.retentionCount)
}

// The next planned automatic backup after `from` (an ISO string or Date), or null when the
// schedule is off. Time is HH:MM in the local time zone; weekday 0 = Sunday.
export function getNextScheduledBackup(settings, from = new Date()) {
  if (!settings.scheduleEnabled) return null
  const [hours, minutes] = settings.time.split(':').map(Number)
  const start = new Date(from)
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(start)
    candidate.setDate(start.getDate() + offset)
    candidate.setHours(hours, minutes, 0, 0)
    if (candidate.getTime() <= start.getTime()) continue
    if (settings.frequency === 'weekly' && candidate.getDay() !== settings.weekday) continue
    return candidate.toISOString()
  }
  return null
}
