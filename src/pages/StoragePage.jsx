import { useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { PageIntro } from '../components/common/PageIntro.jsx'
import { ResourceState } from '../components/common/ResourceState.jsx'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { DevSimulationPanel } from '../components/admin/DevSimulationPanel.jsx'
import { getBlockedOperations, STORAGE_LEVEL } from '../domain/storage/storage.js'
import { useFileSizeFormatter } from '../hooks/useFileSizeFormatter.js'
import { useResource } from '../hooks/useResource.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { storageService } from '../services/storageService.js'

const LEVEL_TONE = { [STORAGE_LEVEL.ok]: 'success', [STORAGE_LEVEL.warning]: 'warning', [STORAGE_LEVEL.critical]: 'error', [STORAGE_LEVEL.full]: 'error' }
const BREAKDOWN_KEYS = ['originals', 'results', 'backups', 'other']

// Storage monitoring (Admin only, decisions 34-35). The figures are SIMULATED while the service is
// the development mock. The Admin sets the alert thresholds in the system settings (the examples
// 80 % and 90 % are not final). When storage runs out the SERVER refuses uploads and processing
// that need space that is not available, protects what exists, never deletes an approved document
// because storage is full, and resumes when space is available: the frontend cannot enforce that,
// it only explains it.
//
// `service` can be replaced (tests).
export default function StoragePage({ service = storageService }) {
  const { t, formatNumber } = useTranslation()
  const formatSize = useFileSizeFormatter()
  const status = useResource(() => service.getStatus())
  const [scenario, setScenario] = useState(() => service.dev?.getScenario())

  const data = status.data
  const blocked = data ? getBlockedOperations(data.level) : []

  async function changeScenario(next) {
    service.dev.setScenario(next)
    setScenario(next)
    await status.reload({ quiet: true })
  }

  return (
    <div className="page">
      <PageIntro id="storage-title" icon="hardDrive" title={t('nav.adminStorage')} description={t('storage.description')} />

      {service.isMock && <SimulationNotice textKey="storage.simulation" />}

      <ResourceState resource={status}>
        {data && (
          <>
            <Alert tone={LEVEL_TONE[data.level]} title={t(`storage.level.${data.level}.title`)}>
              {t(`storage.level.${data.level}.text`, { percent: formatNumber(data.usedPercent), warning: formatNumber(data.thresholds.warningPercent), critical: formatNumber(data.thresholds.criticalPercent) })}
            </Alert>

            <section className="card info-card" aria-labelledby="storage-usage-heading">
              <div className="section-heading">
                <h2 id="storage-usage-heading">{t('storage.usage.title')}</h2>
                <Link to={ROUTES.adminSettings} className="button button--secondary button--sm">
                  {t('storage.usage.thresholds')}
                </Link>
              </div>
              <p className="storage-figures">
                <strong>{formatNumber(data.usedPercent)}%</strong> {t('storage.usage.of', { used: formatSize(data.usedBytes), total: formatSize(data.totalBytes), free: formatSize(data.totalBytes - data.usedBytes) })}
              </p>
              <div
                className={`storage-meter storage-meter--${data.level}`}
                role="meter"
                aria-label={t('storage.usage.meterLabel')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={data.usedPercent}
                aria-valuetext={`${formatNumber(data.usedPercent)}%`}
              >
                <div className="storage-meter__fill" style={{ inlineSize: `${data.usedPercent}%` }} />
                <span className="storage-meter__mark" style={{ insetInlineStart: `${data.thresholds.warningPercent}%` }} title={t('storage.usage.warningMark', { percent: data.thresholds.warningPercent })} />
                <span className="storage-meter__mark storage-meter__mark--critical" style={{ insetInlineStart: `${data.thresholds.criticalPercent}%` }} title={t('storage.usage.criticalMark', { percent: data.thresholds.criticalPercent })} />
              </div>
              <p className="storage-legend">
                {t('storage.usage.warningMark', { percent: formatNumber(data.thresholds.warningPercent) })} · {t('storage.usage.criticalMark', { percent: formatNumber(data.thresholds.criticalPercent) })}
              </p>
            </section>

            <section className="card info-card" aria-labelledby="storage-breakdown-heading">
              <h2 id="storage-breakdown-heading">{t('storage.breakdown.title')}</h2>
              <ul className="breakdown-list">
                {BREAKDOWN_KEYS.map((key) => (
                  <li key={key}>
                    <span>{t(`storage.breakdown.${key}`)}</span>
                    <strong>{formatSize(data.breakdown[key])}</strong>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card info-card" aria-labelledby="storage-rules-heading">
              <h2 id="storage-rules-heading">{t('storage.rules.title')}</h2>
              {blocked.length > 0 && <Alert tone="error">{t('storage.rules.blockedNow')}</Alert>}
              <ul className="confirm-list">
                <li>{t('storage.rules.block')}</li>
                <li>{t('storage.rules.protect')}</li>
                <li>{t('storage.rules.noDelete')}</li>
                <li>{t('storage.rules.resume')}</li>
              </ul>
              <p className="demo-note">{t('storage.rules.serverNote')}</p>
            </section>
          </>
        )}
      </ResourceState>

      {service.dev && (
        <DevSimulationPanel>
          <div className="form-field">
            <label className="form-field__label" htmlFor="storage-scenario">
              {t('storage.dev.scenario')}
            </label>
            <select id="storage-scenario" className="form-field__input" value={scenario} onChange={(event) => changeScenario(event.target.value)}>
              {service.dev.scenarios.map((name) => (
                <option key={name} value={name}>
                  {t(`storage.dev.scenarios.${name}`)}
                </option>
              ))}
            </select>
          </div>
        </DevSimulationPanel>
      )}
    </div>
  )
}
