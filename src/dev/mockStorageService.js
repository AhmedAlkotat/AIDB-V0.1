// DEVELOPMENT-ONLY mock of the storage-monitoring backend (see services/storageService.js). Not
// part of production bundles. THE FIGURES ARE SIMULATED: a chosen scenario (normal, warning,
// critical, full) decides how full the pretend disk is. Admin-only, like the server must be.
//
// Development switch (service.dev): pick the scenario. Moving into a worse level sends the
// Admin the matching notification (decision 34), as the real monitoring would.

import { getStorageLevel, getUsedPercent, STORAGE_LEVEL } from '../domain/storage/storage.js'
import { normalizeSettings } from '../domain/settings/settings.js'
import { SYSTEM_ERROR, SystemError } from '../services/systemErrors.js'
import { getMockContext } from './mockContext.js'
import { MOCK_STORAGE_SCENARIOS, MOCK_STORAGE_TOTAL_BYTES } from './mockSystemState.js'

// How the used space is split (percent of the used space).
const BREAKDOWN = Object.freeze({ originals: 45, results: 20, backups: 25, other: 10 })
const ALERT_TYPE = Object.freeze({ [STORAGE_LEVEL.warning]: 'storageWarning', [STORAGE_LEVEL.critical]: 'storageCritical', [STORAGE_LEVEL.full]: 'storageFull' })

export function createMockStorageService({ context = getMockContext() } = {}) {
  const ctx = context
  const thresholds = () => normalizeSettings(ctx.system.read().settings).storage

  function status() {
    const scenario = ctx.system.read().storage.scenario
    const usedBytes = Math.round((MOCK_STORAGE_TOTAL_BYTES * MOCK_STORAGE_SCENARIOS[scenario]) / 100)
    const limits = thresholds()
    const usedPercent = getUsedPercent(usedBytes, MOCK_STORAGE_TOTAL_BYTES)
    return {
      totalBytes: MOCK_STORAGE_TOTAL_BYTES,
      usedBytes,
      usedPercent,
      level: getStorageLevel(usedPercent, limits),
      breakdown: Object.fromEntries(Object.entries(BREAKDOWN).map(([key, share]) => [key, Math.round((usedBytes * share) / 100)])),
      thresholds: limits,
    }
  }

  return {
    isMock: true,

    dev: {
      scenarios: Object.keys(MOCK_STORAGE_SCENARIOS),
      getScenario: () => ctx.system.read().storage.scenario,
      setScenario(scenario) {
        if (!(scenario in MOCK_STORAGE_SCENARIOS)) throw new SystemError(SYSTEM_ERROR.invalidInput, { fields: { scenario: 'unknown' } })
        ctx.system.update((draft) => void (draft.storage.scenario = scenario))
        const alert = ALERT_TYPE[status().level]
        if (alert) ctx.notify({ type: alert, params: { percent: status().usedPercent } })
      },
    },

    getStatus: () => ctx.run(ctx.requireAdmin, () => status()),
  }
}
