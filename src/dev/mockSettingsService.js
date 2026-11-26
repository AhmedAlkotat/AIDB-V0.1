// DEVELOPMENT-ONLY mock of the settings backend (see services/settingsService.js). Not part of
// production bundles. It plays the SERVER's part: Admin-only reads and writes, validation, and
// the effects of a shorter retention period (what the Admin is warned about is really removed).

import { countExpiredEntries, dropExpiredEntries } from '../domain/audit/audit.js'
import { selectBackupsToRemove } from '../domain/backup/backup.js'
import { countExpired, isExpired } from '../domain/recycleBin/recycleBin.js'
import { coerceSection, getEmployeeLimits, normalizeSettings, SETTINGS_SECTIONS, validateSettingsSection } from '../domain/settings/settings.js'
import { SYSTEM_ERROR, SystemError } from '../services/systemErrors.js'
import { getMockContext } from './mockContext.js'

// What saving `values` for `section` would delete right now (computed from the live data).
function computeImpact(ctx, section, values) {
  const state = ctx.system.read()
  const now = ctx.now()
  const impact = { recycleBinExpiring: 0, auditEntriesExpiring: 0, backupsExpiring: 0 }
  if (section === 'recycleBin') impact.recycleBinExpiring = countExpired(ctx.documents.listTrashed(), values, now)
  if (section === 'audit') impact.auditEntriesExpiring = countExpiredEntries(state.audit, values.retentionDays, now)
  if (section === 'backups') impact.backupsExpiring = selectBackupsToRemove(state.backups, values, now).length
  return impact
}

function validated(section, values) {
  if (!SETTINGS_SECTIONS.includes(section)) throw new SystemError(SYSTEM_ERROR.invalidInput, { fields: { section: 'unknownSection' } })
  const errors = validateSettingsSection(section, values ?? {})
  if (Object.keys(errors).length > 0) throw new SystemError(SYSTEM_ERROR.invalidInput, { fields: errors })
  return coerceSection(section, values)
}

export function createMockSettingsService({ context = getMockContext() } = {}) {
  const ctx = context
  const settings = () => normalizeSettings(ctx.system.read().settings)

  return {
    isMock: true,

    getSettings: () => ctx.run(ctx.requireAdmin, () => settings()),

    // The limits are readable by every signed-in user: they decide whether a file or a page
    // selection is accepted. Nothing else about the settings is exposed.
    getLimits: () => ctx.run(ctx.requireUser, () => getEmployeeLimits(settings())),

    previewImpact: (section, values) => ctx.run(ctx.requireAdmin, () => computeImpact(ctx, section, validated(section, values))),

    updateSection: (section, values) =>
      ctx.run(ctx.requireAdmin, () => {
        const next = validated(section, values)
        const now = ctx.now()
        ctx.system.update((draft) => {
          draft.settings = normalizeSettings({ ...draft.settings, [section]: next })
          // The effect of the new policy, as the server's retention job would apply it.
          if (section === 'audit') draft.audit = dropExpiredEntries(draft.audit, draft.settings.audit.retentionDays, now)
          if (section === 'backups') {
            const doomed = new Set(selectBackupsToRemove(draft.backups, draft.settings.backups, now).map((backup) => backup.id))
            draft.backups = draft.backups.filter((backup) => !doomed.has(backup.id))
          }
        })
        if (section === 'recycleBin') {
          for (const item of ctx.documents.listTrashed()) {
            if (isExpired(item.deletedAt, next, now)) ctx.documents.purge(item.id)
          }
        }
        return settings()
      }),
  }
}
