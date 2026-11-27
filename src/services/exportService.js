// Export of APPROVED results (decisions 8 and 46) and download of the complete original.
//
//   isMock
//   exportDocument({ documentId, format }) -> Promise<{ format, fileName, pageCount, sourcePages, simulated, blob? }>
//        format: 'docx' | 'xlsx' | 'pdf' | 'json'. Only the selected and approved pages, in the original order, with
//        their original page numbers kept in the data. `blob` is present only when a real file was produced.
//   getOriginal(documentId)                -> Promise<{ fileName, blob }>  the complete original document, separately
//
// REPLACEABLE and NOT CONNECTED TO A BACKEND YET: the production service refuses ("not connected") and creates no
// file. The development simulation (src/dev/mockExportService.js, reachable only through the `import.meta.env.DEV`
// branch) says plainly that it is a simulation: it builds a real JSON file from the approved data (that needs no
// library) but it does NOT fabricate Word, Excel or PDF files; those need the server (Batch E).

import { createMockExportService } from '../dev/mockExportService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_EXPORT = createNotConnectedService(['exportDocument', 'getOriginal'])

export function createExportService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockExportService()
  return NOT_CONNECTED_EXPORT
}

export const exportService = createExportService()
