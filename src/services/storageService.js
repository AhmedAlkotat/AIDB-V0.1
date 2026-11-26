// Storage monitoring (decisions 34-35). Admin only. The figures are simulated in the frontend.
//   isMock
//   getStatus()  -> Promise<{ totalBytes, usedBytes, breakdown, thresholds }>
//
// REPLACEABLE: screens only know this interface (every method rejects with a SystemError, see
// systemErrors.js). NOT CONNECTED TO A BACKEND YET: endpoint names and schemas are not agreed
// with the backend, so the production service only reports "not connected" and never invents
// data. Development builds use a mock (src/dev/), reachable only through the
// `import.meta.env.DEV` branch below, which production builds remove. Frontend role checks only
// shape the interface; the backend must enforce every permission.

import { createMockStorageService } from '../dev/mockStorageService.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_STORAGE = createNotConnectedService(['getStatus'])

export function createStorageService() {
  if (import.meta.env?.DEV) return createMockStorageService()
  return NOT_CONNECTED_STORAGE
}

export const storageService = createStorageService()
