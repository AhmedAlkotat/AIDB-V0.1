// DEVELOPMENT-ONLY mock of the template catalogue (see services/templateService.js). Not part of production
// bundles. The entries are illustrative (see dev/mockClassification.js); the approved decisions do not define
// the catalogue, so nothing here is a requirement.

import { getMockTemplates } from './mockClassification.js'
import { getMockContext } from './mockContext.js'

export function createMockTemplateService({ context = getMockContext() } = {}) {
  return {
    isMock: true,
    list: () => context.run(context.requireUser, () => getMockTemplates()),
  }
}
