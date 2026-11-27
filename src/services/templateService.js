// Known document templates (layouts the system recognises).
//
//   isMock
//   list() -> Promise<{ id, name, documentType }[]>   read only
//
// What the approved decisions say about templates: the project must support layouts it has never
// seen ("unknown templates") and must never reject a document only because it matches no template. They do NOT
// define how templates are created, edited, who may manage them, or any training workflow, so this service only
// LISTS what the system recognises; nothing here is a management interface (see docs/batch-d-document-management.md,
// open questions).
//
// REPLACEABLE and NOT CONNECTED TO A BACKEND YET: production refuses ("not connected") and invents no template.
// Development builds list a few illustrative entries (src/dev/mockTemplateService.js) behind `import.meta.env.DEV`.

import { createMockTemplateService } from '../dev/mockTemplateService.js'
import { getServiceMode, SERVICE_MODE } from './serviceMode.js'
import { createNotConnectedService, SYSTEM_ERROR, SystemError } from './systemErrors.js'

export { SYSTEM_ERROR, SystemError }

export const NOT_CONNECTED_TEMPLATES = createNotConnectedService(['list'])

export function createTemplateService() {
  if (getServiceMode() === SERVICE_MODE.mock && import.meta.env?.DEV) return createMockTemplateService()
  return NOT_CONNECTED_TEMPLATES
}

export const templateService = createTemplateService()
