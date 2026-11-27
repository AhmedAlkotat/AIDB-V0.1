// Backup and restore (decisions 25-30). Admin only. In the frontend EVERYTHING here is simulated.
//   isMock
//   listBackups()                  -> Promise<Backup[]>
//   createBackup()                 -> Promise<Backup>        manual backup
//   setProtected(id, isProtected)  -> Promise<Backup>        protected backups are never removed by retention
//   verifyBackup(id)               -> Promise<{ ok, checks }> restore test: integrity + decryption
//   restoreBackup(id, { acknowledged, onStep }) -> Promise<{ ok, steps }>  verify, protective backup, restore
//
// REPLACEABLE: screens only know this interface (every method rejects with a SystemError, see
// systemErrors.js). NOT CONNECTED TO A BACKEND YET: endpoint names and schemas are not agreed
// with the backend, so the production service only reports "not connected" and never invents
// data. Development builds use a mock (src/dev/), reachable only through the
// `import.meta.env.DEV` branch below, which production builds remove. Frontend role checks only
// shape the interface; the backend must enforce every permission.

import { createMockBackupService } from '../dev/mockBackupService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_BACKUPS = createNotConnectedService(['listBackups', 'createBackup', 'setProtected', 'verifyBackup', 'restoreBackup'])

export function createBackupService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockBackupService()
  return NOT_CONNECTED_BACKUPS
}

export const backupService = createBackupService()
