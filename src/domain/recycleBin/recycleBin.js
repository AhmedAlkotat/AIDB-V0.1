// Recycle-bin rules (decisions 42–45), pure functions.
//
// A deleted document is only hidden (soft delete): its original, results, drafts and versions
// stay. The Admin alone can see the bin, restore (with an extra confirmation) or delete
// permanently. The retention period counts from the day the document was moved to the bin and
// can be switched off; the policy never touches the normal archive.

const DAY_MS = 24 * 60 * 60 * 1000

// The moment an item will be deleted automatically, or null when automatic deletion is off.
export function getPurgeAt(deletedAt, recycleBinSettings) {
  if (!recycleBinSettings.autoDelete) return null
  return new Date(new Date(deletedAt).getTime() + recycleBinSettings.retentionDays * DAY_MS).toISOString()
}

export function isExpired(deletedAt, recycleBinSettings, now = new Date()) {
  const purgeAt = getPurgeAt(deletedAt, recycleBinSettings)
  return purgeAt !== null && new Date(purgeAt).getTime() <= new Date(now).getTime()
}

// Whole days left (rounded up, never below 0), or null when automatic deletion is off.
export function getDaysRemaining(deletedAt, recycleBinSettings, now = new Date()) {
  const purgeAt = getPurgeAt(deletedAt, recycleBinSettings)
  if (purgeAt === null) return null
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - new Date(now).getTime()) / DAY_MS))
}

// How many of `items` ({ deletedAt }) the given settings would delete now: used to warn the
// Admin before a shorter retention period (or switching automatic deletion on) removes things.
export function countExpired(items, recycleBinSettings, now = new Date()) {
  return items.filter((item) => isExpired(item.deletedAt, recycleBinSettings, now)).length
}
