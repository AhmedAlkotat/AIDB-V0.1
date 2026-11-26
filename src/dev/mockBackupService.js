// DEVELOPMENT-ONLY mock of the backup backend (see services/backupService.js). Not part of
// production bundles. EVERYTHING HERE IS SIMULATED: no file is written, nothing is encrypted and
// nothing is restored; only records in the mock state change. Admin-only, like the server must be.
//
// Development switches (service.dev): make the next backup fail, or make the protective backup
// of a restore fail, to see how the screens handle failure (decision 30: a failed protective
// backup cancels the restore and nothing changes).

import { BACKUP_STATUS, BACKUP_TYPE, canRestore, RESTORE_STEP_STATUS, selectBackupsToRemove } from '../domain/backup/backup.js'
import { normalizeSettings } from '../domain/settings/settings.js'
import { SYSTEM_ERROR, SystemError } from '../services/systemErrors.js'
import { getMockContext } from './mockContext.js'

const GB = 1024 ** 3

export function createMockBackupService({ context = getMockContext() } = {}) {
  const ctx = context
  const settings = () => normalizeSettings(ctx.system.read().settings).backups
  const find = (id) => ctx.system.read().backups.find((backup) => backup.id === id)

  // Adds a backup record (completed unless `failed`) and applies the retention policy.
  function addBackup({ type, failed = false }) {
    const config = settings()
    const id = ctx.system.nextId('bkp')
    const record = {
      id,
      createdAt: ctx.now().toISOString(),
      type,
      status: failed ? BACKUP_STATUS.failed : BACKUP_STATUS.completed,
      sizeBytes: failed ? 0 : 3.3 * GB,
      // Local always; the separate device only when the Admin configured one (decision 26).
      locations: config.externalPath !== '' ? ['local', 'external'] : ['local'],
      protected: false,
      verifiedAt: null,
    }
    ctx.system.update((draft) => {
      draft.backups.push(record)
      const doomed = new Set(selectBackupsToRemove(draft.backups, config, ctx.now()).map((backup) => backup.id))
      draft.backups = draft.backups.filter((backup) => !doomed.has(backup.id))
    })
    return record
  }

  return {
    isMock: true,

    // Simulation switches for development only.
    dev: {
      getFlags: () => ({ ...ctx.system.read().flags }),
      setFlag: (name, value) => ctx.system.update((draft) => void (draft.flags[name] = Boolean(value))),
    },

    listBackups: () => ctx.run(ctx.requireAdmin, () => ctx.system.read().backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),

    createBackup: () =>
      ctx.run(ctx.requireAdmin, (actor) => {
        const failed = ctx.system.read().flags.failNextBackup
        ctx.system.update((draft) => void (draft.flags.failNextBackup = false))
        const record = addBackup({ type: BACKUP_TYPE.manual, failed })
        ctx.recordAudit({ category: 'backups', action: failed ? 'backupFailed' : 'backupCreated', actor, subject: record.id, outcome: failed ? 'failure' : 'success' })
        if (failed) ctx.notify({ type: 'backupFailed', params: { backupId: record.id } })
        return record
      }),

    setProtected: (id, isProtected) =>
      ctx.run(ctx.requireAdmin, () => {
        if (!find(id)) throw new SystemError(SYSTEM_ERROR.notFound)
        ctx.system.update((draft) => void (draft.backups.find((backup) => backup.id === id).protected = Boolean(isProtected)))
        return find(id)
      }),

    // The "restore test" (decision 26): check integrity and decryption without changing anything.
    verifyBackup: (id) =>
      ctx.run(ctx.requireAdmin, () => {
        const backup = find(id)
        if (!backup) throw new SystemError(SYSTEM_ERROR.notFound)
        const ok = canRestore(backup)
        if (ok) ctx.system.update((draft) => void (draft.backups.find((candidate) => candidate.id === id).verifiedAt = ctx.now().toISOString()))
        return { ok, checks: { integrity: ok, decryption: ok } }
      }),

    // The restore of decision 30. `acknowledged` must be true (the explicit confirmation). Steps:
    // verify integrity and decrypt; take a protective backup of the current state; restore. If
    // the protective backup fails the restore is cancelled and nothing is changed.
    restoreBackup: (id, { acknowledged = false, onStep = () => {} } = {}) =>
      ctx.run(ctx.requireAdmin, async (actor) => {
        if (acknowledged !== true) throw new SystemError(SYSTEM_ERROR.invalidInput, { fields: { acknowledged: 'required' } })
        const backup = find(id)
        if (!backup) throw new SystemError(SYSTEM_ERROR.notFound)
        if (!canRestore(backup)) throw new SystemError(SYSTEM_ERROR.invalidInput, { fields: { backup: 'notRestorable' } })

        const steps = []
        const report = (step, status) => {
          steps.push({ step, status })
          onStep({ step, status })
        }
        const finish = (ok, action, outcome) => {
          ctx.recordAudit({ category: 'restore', action, actor, subject: id, outcome })
          return { ok, steps }
        }

        await ctx.wait()
        report('verify', RESTORE_STEP_STATUS.done)
        await ctx.wait()
        if (ctx.system.read().flags.failProtectiveBackup) {
          report('protectiveBackup', RESTORE_STEP_STATUS.failed)
          report('restore', RESTORE_STEP_STATUS.skipped)
          return finish(false, 'restoreCancelled', 'failure')
        }
        addBackup({ type: BACKUP_TYPE.protective })
        report('protectiveBackup', RESTORE_STEP_STATUS.done)
        await ctx.wait()
        report('restore', RESTORE_STEP_STATUS.done)
        return finish(true, 'restoreCompleted', 'success')
      }),
  }
}
