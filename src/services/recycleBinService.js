// Recycle bin (decisions 42-45). Only the Admin may delete, view the bin, restore or delete for good.
//   isMock
//   listDeleted()           -> Promise<DeletedDocument[]>  (summaries + deletedAt, purgeAt)
//   moveToBin(id)           -> Promise<{ cancelledProcessing }>  soft delete; nothing is removed
//   restore(id)             -> Promise<void>
//   deletePermanently(id)   -> Promise<void>
//
// REPLACEABLE: screens only know this interface (every method rejects with a SystemError, see
// systemErrors.js). NOT CONNECTED TO A BACKEND YET: endpoint names and schemas are not agreed
// with the backend, so the production service only reports "not connected" and never invents
// data. Development builds use a mock (src/dev/), reachable only through the
// `import.meta.env.DEV` branch below, which production builds remove. Frontend role checks only
// shape the interface; the backend must enforce every permission.

import { createMockRecycleBinService } from '../dev/mockRecycleBinService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_RECYCLE_BIN = createNotConnectedService(['listDeleted', 'moveToBin', 'restore', 'deletePermanently'])

export function createRecycleBinService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockRecycleBinService()
  return NOT_CONNECTED_RECYCLE_BIN
}

export const recycleBinService = createRecycleBinService()
