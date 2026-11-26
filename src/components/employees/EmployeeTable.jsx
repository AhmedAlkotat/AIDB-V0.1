import { EMPLOYEE_STATUS } from '../../domain/employee/employee.js'
import { useTranslation } from '../../hooks/useTranslation.js'

// The employee accounts as a table. Actions are offered per row; deactivated accounts get
// "reactivate" instead of "deactivate", and there is no delete: accounts are never removed.
// A password is never shown anywhere. `onAction(kind, employee)` with kind one of
// 'edit' | 'password' | 'deactivate' | 'reactivate'.
export function EmployeeTable({ employees, onAction }) {
  const { t, formatDate } = useTranslation()

  return (
    <div className="employee-table-wrap">
      <table className="employee-table">
        <caption className="visually-hidden">{t('employees.table.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('employees.table.name')}</th>
            <th scope="col">{t('employees.table.username')}</th>
            <th scope="col">{t('employees.table.status')}</th>
            <th scope="col">{t('employees.table.created')}</th>
            <th scope="col">{t('employees.table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const isActive = employee.status === EMPLOYEE_STATUS.active
            const label = (action) => `${t(`employees.actions.${action}`)}: ${employee.displayName}`
            return (
              <tr key={employee.id} data-status={employee.status}>
                <th scope="row" className="employee-table__name" dir="auto">
                  {employee.displayName}
                </th>
                <td dir="ltr" className="employee-table__username">
                  {employee.identifier}
                </td>
                <td>
                  <span className={`badge ${isActive ? 'badge--success' : 'badge--neutral'}`}>{t(`employees.status.${employee.status}`)}</span>
                </td>
                <td>{formatDate(employee.createdAt)}</td>
                <td>
                  <div className="employee-table__actions">
                    <button type="button" className="button button--secondary button--sm" aria-label={label('edit')} onClick={() => onAction('edit', employee)}>
                      {t('employees.actions.edit')}
                    </button>
                    <button type="button" className="button button--secondary button--sm" aria-label={label('setPassword')} onClick={() => onAction('password', employee)}>
                      {t('employees.actions.setPassword')}
                    </button>
                    <button
                      type="button"
                      className={`button button--sm ${isActive ? 'button--secondary employee-table__danger' : 'button--secondary'}`}
                      aria-label={label(isActive ? 'deactivate' : 'reactivate')}
                      onClick={() => onAction(isActive ? 'deactivate' : 'reactivate', employee)}
                    >
                      {t(`employees.actions.${isActive ? 'deactivate' : 'reactivate'}`)}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
