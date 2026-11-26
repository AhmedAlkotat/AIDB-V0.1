// DEVELOPMENT-ONLY mock of the audit-log backend (see services/auditLogService.js). Not part of
// production bundles. Only the Admin may read the log (decision 32) and there is no export.

import { getMockContext } from './mockContext.js'

export function createMockAuditService({ context = getMockContext() } = {}) {
  const ctx = context
  return {
    isMock: true,
    listEntries: () => ctx.run(ctx.requireAdmin, () => ctx.system.read().audit),
  }
}
