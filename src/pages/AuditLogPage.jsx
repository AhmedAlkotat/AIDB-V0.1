import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { PageIntro } from '../components/common/PageIntro.jsx'
import { ResourceState } from '../components/common/ResourceState.jsx'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { AUDIT_CATEGORIES, filterAuditEntries } from '../domain/audit/audit.js'
import { useResource } from '../hooks/useResource.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { auditLogService } from '../services/auditLogService.js'

const EMPTY_FILTERS = Object.freeze({ category: 'all', outcome: 'all', query: '', from: '', to: '' })

// Audit log (Admin only, decisions 31-33): view, search and filter. It records who did what, never
// passwords or document content, and it can NOT be exported (no Excel, no PDF: decision 32), so no
// export control exists here. Which categories are recorded, and for how long, is set in the
// system settings. The history of versions, approvals and processing attempts is separate and is
// never removed by this log's retention period.
//
// `service` can be replaced (tests).
export default function AuditLogPage({ service = auditLogService }) {
  const { t, formatDateTime, formatNumber } = useTranslation()
  const log = useResource(() => service.listEntries())
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const ids = { category: useId(), outcome: useId(), query: useId(), from: useId(), to: useId() }

  const entries = useMemo(() => log.data ?? [], [log.data])
  const shown = useMemo(() => filterAuditEntries(entries, filters), [entries, filters])
  const filtering = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)
  const set = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }))

  return (
    <div className="page">
      <PageIntro id="audit-title" icon="clipboard" title={t('nav.adminAuditLog')} description={t('audit.description')} />

      {service.isMock && <SimulationNotice textKey="audit.simulation" />}

      <Alert tone="info">
        {t('audit.rules')}{' '}
        <Link to={ROUTES.adminSettings} className="inline-link">
          {t('audit.settingsLink')}
        </Link>
      </Alert>

      <ResourceState resource={log}>
        <section className="card employee-panel" aria-label={t('audit.table.caption')}>
          <div className="employee-filters">
            <div className="form-field">
              <label className="form-field__label" htmlFor={ids.category}>
                {t('audit.filters.category')}
              </label>
              <select id={ids.category} className="form-field__input" value={filters.category} onChange={set('category')}>
                <option value="all">{t('audit.filters.allCategories')}</option>
                {AUDIT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`audit.categories.${category}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor={ids.outcome}>
                {t('audit.filters.outcome')}
              </label>
              <select id={ids.outcome} className="form-field__input" value={filters.outcome} onChange={set('outcome')}>
                <option value="all">{t('audit.filters.allOutcomes')}</option>
                <option value="success">{t('audit.outcome.success')}</option>
                <option value="failure">{t('audit.outcome.failure')}</option>
              </select>
            </div>
            <div className="form-field employee-filters__search">
              <label className="form-field__label" htmlFor={ids.query}>
                {t('audit.filters.search')}
              </label>
              <input id={ids.query} type="search" className="form-field__input" value={filters.query} autoComplete="off" onChange={set('query')} />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor={ids.from}>
                {t('audit.filters.from')}
              </label>
              <input id={ids.from} type="date" className="form-field__input" value={filters.from} max={filters.to || undefined} onChange={set('from')} />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor={ids.to}>
                {t('audit.filters.to')}
              </label>
              <input id={ids.to} type="date" className="form-field__input" value={filters.to} min={filters.from || undefined} onChange={set('to')} />
            </div>
            <p className="employee-filters__summary" role="status">
              {t('audit.filters.summary', { shown: formatNumber(shown.length), total: formatNumber(entries.length) })}
            </p>
          </div>

          {shown.length === 0 ? (
            <div className="queue-empty">
              <p>{t(entries.length === 0 ? 'audit.empty' : 'audit.noResults')}</p>
              {filtering && (
                <button type="button" className="button button--secondary button--sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  {t('audit.filters.clear')}
                </button>
              )}
            </div>
          ) : (
            <div className="employee-table-wrap">
              <table className="employee-table">
                <caption className="visually-hidden">{t('audit.table.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('audit.table.time')}</th>
                    <th scope="col">{t('audit.table.category')}</th>
                    <th scope="col">{t('audit.table.action')}</th>
                    <th scope="col">{t('audit.table.actor')}</th>
                    <th scope="col">{t('audit.table.subject')}</th>
                    <th scope="col">{t('audit.table.outcome')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((entry) => (
                    <tr key={entry.id} data-outcome={entry.outcome}>
                      <th scope="row" className="employee-table__name">
                        {formatDateTime(entry.at)}
                      </th>
                      <td>{t(`audit.categories.${entry.category}`)}</td>
                      <td>{t(`audit.actions.${entry.action}`)}</td>
                      <td dir="auto">{entry.actorName ?? t('audit.table.system')}</td>
                      <td dir="auto">{entry.subject}</td>
                      <td>
                        <span className={`badge ${entry.outcome === 'success' ? 'badge--success' : 'badge--demo'}`}>{t(`audit.outcome.${entry.outcome}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </ResourceState>
    </div>
  )
}
