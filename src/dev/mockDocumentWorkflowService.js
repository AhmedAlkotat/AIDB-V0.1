// DEVELOPMENT-ONLY mock of the document workflow backend (see services/documentWorkflowService.js).
// Not part of production bundles. It plays the SERVER's part for upload registration (decisions 35,
// 36, 41, 48): it checks the caller, the file size, the selected page count and the storage, stores
// the document as Pending and puts it in the simulated central queue (dev/mockProcessingQueue.js).
// NOTHING is really uploaded, stored or processed: the document stays in this tab's memory.
//
// Development switches (service.dev): force the next document to fail, make the simulated disk
// "too small" for the next upload. The storage scenario "full" (Admin > Storage) blocks uploads
// and pauses the queue, as decision 35 requires; setting it back lets the work resume.

import { ATTEMPT_TRIGGER } from '../domain/document/attempts.js'
import { canView } from '../domain/document/permissions.js'
import { DOCUMENT_STATE } from '../domain/document/lifecycle.js'
import { normalizeSettings } from '../domain/settings/settings.js'
import { getBlockedOperations, getStorageLevel, getUsedPercent, STORAGE_LEVEL } from '../domain/storage/storage.js'
import { mockProcessingService } from '../services/mockProcessingService.js'
import { createReviewDocumentFromRequest } from '../services/reviewDocuments.js'
import { SYSTEM_ERROR } from '../services/systemErrors.js'
import { WORKFLOW_ERROR, workflowError } from '../services/workflowErrors.js'
import { checkFileSize, checkSelectedPageCount, LIMIT_ERROR } from '../utils/uploadLimits.js'
import { classifyByName } from './mockClassification.js'
import { getMockContext } from './mockContext.js'
import { createMockProcessingQueue, QUEUE_BLOCKED } from './mockProcessingQueue.js'
import { MOCK_STORAGE_SCENARIOS, MOCK_STORAGE_TOTAL_BYTES } from './mockSystemState.js'

// A document needs this many times its own size on disk while it is processed (originals, page
// images, results). A development value, not a requirement.
const SPACE_FACTOR = 3

export function createMockDocumentWorkflowService({ context = getMockContext(), store = context.documents, processing = mockProcessingService, concurrency = 1, engine, engineOptions = {} } = {}) {
  const ctx = context
  const readSystem = () => ctx.system.read()

  // What the "disk" can take right now, from the scenario chosen on the storage page.
  function storageAnswer(fileSize = 0) {
    const state = readSystem()
    const scenario = state.storage?.scenario ?? 'normal'
    const usedBytes = Math.round((MOCK_STORAGE_TOTAL_BYTES * MOCK_STORAGE_SCENARIOS[scenario]) / 100)
    const level = getStorageLevel(getUsedPercent(usedBytes, MOCK_STORAGE_TOTAL_BYTES), normalizeSettings(state.settings).storage)
    if (getBlockedOperations(level).includes('uploads') || level === STORAGE_LEVEL.full) return WORKFLOW_ERROR.storageFull
    // The development switch pretends the disk cannot take THIS document although it is not full.
    if (state.flags?.insufficientSpace && fileSize > 0) return WORKFLOW_ERROR.insufficientStorage
    const free = MOCK_STORAGE_TOTAL_BYTES - usedBytes
    return free < fileSize * SPACE_FACTOR ? WORKFLOW_ERROR.insufficientStorage : null
  }

  const actorName = (id) => ctx.accountStore.findById?.(id)?.displayName ?? null
  const queueEngine =
    engine ??
    createMockProcessingQueue({
      store,
      processing,
      concurrency,
      now: ctx.now,
      isBlocked: () => (storageAnswer(0) === WORKFLOW_ERROR.storageFull ? QUEUE_BLOCKED.storageFull : null),
      notify: (notification) => ctx.notify(notification),
      recordAudit: ({ actorId, ...entry }) => ctx.recordAudit({ ...entry, actor: actorId ? { id: actorId, displayName: actorName(actorId) } : null }),
      ...engineOptions,
    })

  const summaryOf = (documentId) => store.list().find((item) => item.id === documentId)

  // The caller's own jobs (every job for the Admin), with the FIFO position computed over the WHOLE queue.
  function visibleQueue(actor) {
    const snapshot = queueEngine.snapshot()
    const jobs = snapshot.jobs.filter((job) => {
      const item = summaryOf(job.documentId)
      return item && canView(actor, item)
    })
    return { blocked: snapshot.blocked, jobs }
  }

  return {
    isMock: true,

    // The queue and the switches behind it, for tests and the labelled development panel.
    engine: queueEngine,
    dev: {
      failNextDocument: (value) => queueEngine.dev.failNextDocument(value),
      isFailNextDocument: () => queueEngine.dev.isFailNextDocument(),
      setInsufficientSpace: (value) => ctx.system.update((draft) => void (draft.flags.insufficientSpace = Boolean(value))),
      isInsufficientSpace: () => Boolean(readSystem().flags?.insufficientSpace),
    },

    pageProcessing: {
      isMock: true,
      survivesSessionClose: true,
      extractPage: ({ documentId, pageNumber, attempt }) => queueEngine.submitPage({ documentId, pageNumber, attempt }),
      detach: (target) => queueEngine.detachPage(target),
      getActivePages: (documentId) => queueEngine.getActivePages(documentId),
      adopt: (target) => queueEngine.adoptPage(target),
    },

    getUploadAvailability: () =>
      ctx.run(ctx.requireUser, () => {
        const reason = storageAnswer(0)
        return { available: reason === null, reason }
      }),

    registerDocument: (request) =>
      ctx.run(ctx.requireUser, (actor) => {
        // The server checks everything again (decisions 35, 36, 41, 48), whatever the interface did.
        const limits = normalizeSettings(readSystem().settings).uploads
        if (checkFileSize(request.fileSize, limits)?.code === LIMIT_ERROR.fileTooLarge) throw workflowError(WORKFLOW_ERROR.fileTooLarge)
        if (checkSelectedPageCount(request.pageSelection.pages.length, limits)?.code === LIMIT_ERROR.tooManyPages) throw workflowError(WORKFLOW_ERROR.tooManyPages)
        const refusal = storageAnswer(request.fileSize)
        if (refusal) {
          ctx.recordAudit({ category: 'uploads', action: 'documentUploaded', actor, subject: request.fileName, outcome: 'failure' })
          throw workflowError(refusal)
        }

        // Stored first, queued after the storage succeeded (decision 41).
        const recognised = classifyByName(request.fileName)
        const documentId = createReviewDocumentFromRequest(store, request, {
          ownerId: actor.id,
          workflow: { phase: 'pending' },
          documentType: recognised.documentType,
          template: recognised.template,
        })
        ctx.recordAudit({ category: 'uploads', action: 'documentUploaded', actor, subject: request.fileName, outcome: 'success' })
        const { position } = queueEngine.submitDocument({ documentId, trigger: ATTEMPT_TRIGGER.upload })
        return { documentId, queuePosition: position }
      }),

    // A retry needs no new upload (decision 11): the stored original is processed again.
    retryDocument: (documentId) =>
      ctx.run(ctx.requireUser, (actor) => {
        const item = summaryOf(documentId)
        if (!item || !canView(actor, item)) throw workflowError(SYSTEM_ERROR.notFound)
        if (item.state !== DOCUMENT_STATE.failed && item.state !== DOCUMENT_STATE.manualEditing) throw workflowError(WORKFLOW_ERROR.invalidState)
        const refusal = storageAnswer(0)
        if (refusal === WORKFLOW_ERROR.storageFull) throw workflowError(refusal)
        queueEngine.submitDocument({ documentId, trigger: ATTEMPT_TRIGGER.retry })
      }),

    getQueue: () => ctx.run(ctx.requireUser, (actor) => visibleQueue(actor)),

    subscribe: (listener) => queueEngine.subscribe(listener),
  }
}
