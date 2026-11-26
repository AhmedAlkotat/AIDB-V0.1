// DEVELOPMENT-ONLY mock of the export backend (see services/exportService.js). Not part of production bundles.
// It plays the SERVER's part (decisions 8, 15, 46): who may export, only approved results, only the selected
// and approved pages in the original order with their source page numbers.
//
// HONEST SIMULATION: JSON is built for real from the approved data (it needs no library). Word, Excel and PDF
// need the server; this mock does NOT create files with those extensions, it only reports what the file would
// contain (`simulated: true`, no `blob`) so the interface can say so plainly.

import { buildExportDataset, buildExportFileName, buildJsonExport, EXPORT_FORMAT, EXPORT_FORMAT_INFO, EXPORT_FORMAT_LIST } from '../domain/document/exportScope.js'
import { canExport, canView } from '../domain/document/permissions.js'
import { latestVersion } from '../domain/document/versions.js'
import { SYSTEM_ERROR, SystemError } from '../services/systemErrors.js'
import { WORKFLOW_ERROR, workflowError } from '../services/workflowErrors.js'
import { getMockContext } from './mockContext.js'

export function createMockExportService({ context = getMockContext(), store = context.documents } = {}) {
  const ctx = context
  let failNext = false

  return {
    isMock: true,
    dev: { failNextExport: (value = true) => void (failNext = Boolean(value)) },

    exportDocument: ({ documentId, format }) =>
      ctx.run(ctx.requireUser, (actor) => {
        if (!EXPORT_FORMAT_LIST.includes(format)) throw new SystemError(SYSTEM_ERROR.invalidInput, { fields: { format: 'unknownFormat' } })
        const item = store.list().find((candidate) => candidate.id === documentId)
        if (!item || !canView(actor, item)) throw workflowError(SYSTEM_ERROR.notFound)
        if (!canExport(actor, item)) throw workflowError(SYSTEM_ERROR.forbidden)
        if (failNext) {
          failNext = false
          throw new SystemError(SYSTEM_ERROR.unknown)
        }

        // The latest APPROVED version: a draft of a new version is never exported.
        const version = latestVersion(store.get(documentId).versions)
        const dataset = buildExportDataset(version.snapshot)
        if (dataset.pageCount === 0) throw workflowError(WORKFLOW_ERROR.invalidState)

        const result = { format, fileName: buildExportFileName(item.name, format), pageCount: dataset.pageCount, sourcePages: dataset.selectedPages, simulated: true, version: version.number }
        if (format === EXPORT_FORMAT.json) {
          result.blob = new Blob([buildJsonExport(dataset, { version: version.number })], { type: EXPORT_FORMAT_INFO.json.mimeType })
        }
        return result
      }),

    // The complete original document (every page, not only the selected ones), separately from any export.
    getOriginal: (documentId) =>
      ctx.run(ctx.requireUser, (actor) => {
        const item = store.list().find((candidate) => candidate.id === documentId)
        if (!item || !canView(actor, item)) throw workflowError(SYSTEM_ERROR.notFound)
        const record = store.get(documentId)
        if (!record.file) throw workflowError(SYSTEM_ERROR.notFound)
        return { fileName: record.name, blob: record.file }
      }),
  }
}
