import { useId } from 'react'
import { EMPLOYEE_STATUS } from '../../domain/employee/employee.js'
import { useTranslation } from '../../hooks/useTranslation.js'

const STATUS_FILTERS = ['all', EMPLOYEE_STATUS.active, EMPLOYEE_STATUS.deactivated]

// Search (name or username) and the account-status filter of the employee list.
export function EmployeeFilters({ query, status, shown, total, onQueryChange, onStatusChange }) {
  const { t, formatNumber } = useTranslation()
  const searchId = useId()
  const statusId = useId()

  return (
    <div className="employee-filters">
      <div className="form-field employee-filters__search">
        <label className="form-field__label" htmlFor={searchId}>
          {t('employees.filters.search')}
        </label>
        <input
          id={searchId}
          type="search"
          className="form-field__input"
          value={query}
          placeholder={t('employees.filters.searchPlaceholder')}
          autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="form-field employee-filters__status">
        <label className="form-field__label" htmlFor={statusId}>
          {t('employees.filters.status')}
        </label>
        <select id={statusId} className="form-field__input" value={status} onChange={(event) => onStatusChange(event.target.value)}>
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {t(`employees.filters.${value}`)}
            </option>
          ))}
        </select>
      </div>
      <p className="employee-filters__summary" role="status">
        {t('employees.filters.summary', { shown: formatNumber(shown), total: formatNumber(total) })}
      </p>
    </div>
  )
}
