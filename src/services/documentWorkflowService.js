// Upload registration, the central processing queue and page processing (decisions 1, 2, 3, 11, 22-24,
// 35, 38, 40, 41, 45).
//
//   isMock
//   getUploadAvailability()  -> Promise<{ available, reason }>   reason: null | 'storageFull' | 'insufficientStorage'.
//                                Readable by every signed-in user (the server refuses uploads when there is no
//                                room, decision 35; the interface only shows the answer).
//   registerDocument(request)-> Promise<{ documentId, queuePosition }>  Called ONLY when the user clicks "Start
//                                processing" (decision 41): the server checks the file, the size, the page count
//                                and the space, stores the document as Pending and queues it after the storage
//                                succeeded. `request` is the Task 1 processing request (the whole original file
//                                plus the selected page numbers).
//   retryDocument(documentId)-> Promise<void>   a retry WITHOUT a new upload (decision 11)
//   getQueue()               -> Promise<{ blocked, jobs: [{ id, kind, documentId, pageNumber, state, position }] }>
//                                the caller's own jobs only; position = FIFO place among the waiting jobs
//   subscribe(listener)      -> unsubscribe        queue changes
//   pageProcessing           the port the review session uses to (re)process ONE page; see PageProcessingPort below
//
// PageProcessingPort (what a review session needs; the mock queue and the later real service implement it):
//   extractPage({ documentId, pageNumber, attempt, signal }) -> Promise<{ elements, attempt }>   queued FIFO
//   survivesSessionClose   true when closing the review screen must NOT cancel the work (decision 2)
//   detach({ documentId, pageNumber })       the session was closed: the service finishes the job itself
//   getActivePages(documentId)               pages that are still being processed (for a reopened session)
//   adopt({ documentId, pageNumber })        a reopened session waits for such a page again
//
// REPLACEABLE: screens only know this interface. NOT CONNECTED TO A BACKEND YET: endpoints and schemas
// are not agreed, so the production service only reports "not connected" and never invents data.
// Development builds use a simulation (src/dev/), reachable only through the `import.meta.env.DEV` branch
// below, which production builds remove. Real durability, restart recovery, concurrency and every
// permission and limit check belong to the backend (Batch E).

import { createMockDocumentWorkflowService } from '../dev/mockDocumentWorkflowService.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

const refuse = async () => {
  throw new SystemError(SYSTEM_ERROR.notConnected, { message: 'This service is not connected to a backend yet.' })
}

export const NOT_CONNECTED_PAGE_PROCESSING = Object.freeze({
  isMock: false,
  survivesSessionClose: false,
  extractPage: refuse,
  detach() {},
  getActivePages: () => [],
  adopt: () => null,
})

export const NOT_CONNECTED_WORKFLOW = Object.freeze({
  ...createNotConnectedService(['getUploadAvailability', 'registerDocument', 'retryDocument', 'getQueue']),
  subscribe: () => () => {},
  pageProcessing: NOT_CONNECTED_PAGE_PROCESSING,
})

export function createDocumentWorkflowService() {
  // The simulated queue holds a document in "Pending" for a moment after its turn, so the state can be seen.
  if (import.meta.env?.DEV) return createMockDocumentWorkflowService({ engineOptions: { startDelayMs: 600 } })
  return NOT_CONNECTED_WORKFLOW
}

export const documentWorkflowService = createDocumentWorkflowService()
