import { useId } from 'react'
import { ARCHIVE_STATES, UNCLASSIFIED } from '../../domain/document/archiveFilter.js'
import { useTranslation } from '../../hooks/useTranslation.js'

// Search (name), document type, status and upload-date range of the archive (decision 9).
// `filters` = { query, type, state, from, to }; `types` are the types present in the data.
export function ArchiveFilters({ filters, types, shown, total, canClear, onChange, onClear }) {
  const { t, formatNumber } = useTranslation()
  const ids = { search: useId(), type: useId(), state: useId(), from: useId(), to: useId() }
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value })

  return (
    <form className="archive-filters" role="search" aria-label={t('archive.filters.label')} onSubmit={(event) => event.preventDefault()}>
      <div className="form-field archive-filters__search">
        <label className="form-field__label" htmlFor={ids.search}>
          {t('archive.filters.search')}
        </label>
        <input id={ids.search} type="search" className="form-field__input" value={filters.query} placeholder={t('archive.filters.searchPlaceholder')} autoComplete="off" onChange={set('query')} />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.type}>
          {t('archive.filters.type')}
        </label>
        <select id={ids.type} className="form-field__input" value={filters.type} onChange={set('type')}>
          <option value="all">{t('archive.filters.allTypes')}</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {t(`documents.types.${type === UNCLASSIFIED ? 'unclassified' : type}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.state}>
          {t('archive.filters.status')}
        </label>
        <select id={ids.state} className="form-field__input" value={filters.state} onChange={set('state')}>
          <option value="all">{t('archive.filters.allStatuses')}</option>
          {ARCHIVE_STATES.map((state) => (
            <option key={state} value={state}>
              {t(`documents.state.${state}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.from}>
          {t('archive.filters.from')}
        </label>
        <input id={ids.from} type="date" className="form-field__input" value={filters.from} max={filters.to || undefined} onChange={set('from')} />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.to}>
          {t('archive.filters.to')}
        </label>
        <input id={ids.to} type="date" className="form-field__input" value={filters.to} min={filters.from || undefined} onChange={set('to')} />
      </div>
      <div className="archive-filters__footer">
        <p className="archive-filters__summary" role="status">
          {t('archive.filters.summary', { shown: formatNumber(shown), total: formatNumber(total) })}
        </p>
        {canClear && (
          <button type="button" className="button button--secondary button--sm" onClick={onClear}>
            {t('archive.filters.clear')}
          </button>
        )}
      </div>
    </form>
  )
}
