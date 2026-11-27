// Audit log (decisions 31-33). Admin only: view, search and filter; NO export exists.
//   isMock
//   listEntries()  -> Promise<AuditEntry[]>   { id, at, category, action, actorId, actorName, subject, outcome }
//
// REPLACEABLE: screens only know this interface (every method rejects with a SystemError, see
// systemErrors.js). NOT CONNECTED TO A BACKEND YET: endpoint names and schemas are not agreed
// with the backend, so the production service only reports "not connected" and never invents
// data. Development builds use a mock (src/dev/), reachable only through the
// `import.meta.env.DEV` branch below, which production builds remove. Frontend role checks only
// shape the interface; the backend must enforce every permission.

import { createMockAuditService } from '../dev/mockAuditService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_AUDIT = createNotConnectedService(['listEntries'])

export function createAuditLogService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockAuditService()
  return NOT_CONNECTED_AUDIT
}

export const auditLogService = createAuditLogService()
