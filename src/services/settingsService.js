// System settings.
//   isMock
//   getSettings()                    -> Promise<Settings>      (Admin only)
//   getLimits()                      -> Promise<{ maxFileSizeMb, maxSelectedPages }> (any signed-in user)
//   previewImpact(section, values)   -> Promise<{ recycleBinExpiring, auditEntriesExpiring }> what saving would delete
//   updateSection(section, values)   -> Promise<Settings>      (Admin only; validated again by the server)
//
// REPLACEABLE: screens only know this interface (every method rejects with a SystemError, see
// systemErrors.js). NOT CONNECTED TO A BACKEND YET: endpoint names and schemas are not agreed
// with the backend, so the production service only reports "not connected" and never invents
// data. Development builds use a mock (src/dev/), reachable only through the
// `import.meta.env.DEV` branch below, which production builds remove. Frontend role checks only
// shape the interface; the backend must enforce every permission.

import { createMockSettingsService } from '../dev/mockSettingsService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_SETTINGS = createNotConnectedService(['getSettings', 'getLimits', 'previewImpact', 'updateSection'])

export function createSettingsService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockSettingsService()
  return NOT_CONNECTED_SETTINGS
}

export const settingsService = createSettingsService()
