// DEVELOPMENT-ONLY mock of the recycle-bin backend (see services/recycleBinService.js). Not part
// of production bundles. Admin-only, like the server must be (decisions 42-44). The documents it
// moves are those of the temporary in-memory store; nothing is really deleted from a disk.

import { isBeingProcessed } from '../domain/document/lifecycle.js'
import { getDaysRemaining, getPurgeAt, isExpired } from '../domain/recycleBin/recycleBin.js'
import { normalizeSettings } from '../domain/settings/settings.js'
import { SYSTEM_ERROR, SystemError } from '../services/systemErrors.js'
import { getMockContext } from './mockContext.js'

// A store error (unknown id) becomes the service's "not found".
function guard(operation) {
  try {
    return operation()
  } catch (error) {
    if (error?.name === 'StorageError') throw new SystemError(SYSTEM_ERROR.notFound)
    throw error
  }
}

export function createMockRecycleBinService({ context = getMockContext() } = {}) {
  const ctx = context
  const policy = () => normalizeSettings(ctx.system.read().settings).recycleBin

  // The server's retention job: items whose period is over are deleted for good (only when the
  // Admin has not switched automatic deletion off). The normal archive is never affected.
  function applyRetention() {
    const settings = policy()
    for (const item of ctx.documents.listTrashed()) {
      if (isExpired(item.deletedAt, settings, ctx.now())) ctx.documents.purge(item.id)
    }
  }

  return {
    isMock: true,

    listDeleted: () =>
      ctx.run(ctx.requireAdmin, () => {
        applyRetention()
        const settings = policy()
        return ctx.documents.listTrashed().map((item) => ({
          ...item,
          purgeAt: getPurgeAt(item.deletedAt, settings),
          daysRemaining: getDaysRemaining(item.deletedAt, settings, ctx.now()),
        }))
      }),

    // Soft delete: the document, its results, drafts and versions all stay. A document that is
    // being processed has its processing stopped safely first; completed results are kept and
    // other documents are untouched (decision 45).
    moveToBin: (id) =>
      ctx.run(ctx.requireAdmin, (actor) => {
        const item = ctx.documents.list().find((candidate) => candidate.id === id)
        if (!item) throw new SystemError(SYSTEM_ERROR.notFound)
        // A document the queue still owes work to (waiting or running) is stopped safely; whatever was
        // completed stays in its record and no other document is touched (decision 45).
        const cancelledProcessing = item.processingCount > 0 || isBeingProcessed(item.state)
        guard(() => ctx.documents.moveToTrash(id, { by: actor.id }))
        return { cancelledProcessing }
      }),

    restore: (id) => ctx.run(ctx.requireAdmin, () => guard(() => ctx.documents.restoreFromTrash(id))),

    deletePermanently: (id) => ctx.run(ctx.requireAdmin, () => guard(() => ctx.documents.purge(id))),
  }
}
