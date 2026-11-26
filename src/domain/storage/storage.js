// Storage-monitoring rules (decisions 34–35), pure functions. THE FIGURES THEMSELVES ARE
// SIMULATED in the frontend: no real disk is measured until the backend does.

export const STORAGE_LEVEL = Object.freeze({ ok: 'ok', warning: 'warning', critical: 'critical', full: 'full' })

// The level of `usedPercent` for the Admin's thresholds. 100 % (or more) is "full".
export function getStorageLevel(usedPercent, { warningPercent, criticalPercent }) {
  if (usedPercent >= 100) return STORAGE_LEVEL.full
  if (usedPercent >= criticalPercent) return STORAGE_LEVEL.critical
  if (usedPercent >= warningPercent) return STORAGE_LEVEL.warning
  return STORAGE_LEVEL.ok
}

export function getUsedPercent(usedBytes, totalBytes) {
  if (!(totalBytes > 0)) return 0
  return Math.min(100, Math.round((usedBytes / totalBytes) * 1000) / 10)
}

// What the SERVER refuses when space is short (decision 35): uploads and processing that need
// space that is not available. Existing documents are protected, and an approved document is
// never deleted automatically because storage is full. Work resumes when space is available.
export function getBlockedOperations(level) {
  return level === STORAGE_LEVEL.full ? ['uploads', 'processing'] : []
}
