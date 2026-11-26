import { Link } from 'react-router'
import { countEmployees } from '../../domain/employee/employee.js'
import { useEmployeeDirectory } from '../../hooks/useEmployeeDirectory.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { ROUTES } from '../../routes/paths.js'
import { employeeService } from '../../services/employeeService.js'
import { Alert } from '../common/Alert.jsx'
import { DemoBadge } from '../common/DemoBadge.jsx'
import { Icon } from '../common/Icon.jsx'
import { StatCard } from '../common/StatCard.jsx'

// Admin dashboard: how many employee accounts exist and how many are active. Only the
// Admin's dashboard renders it (so an employee's browser never asks for the list). The
// figures come from the employee service; they are labelled as demo data while that service
// is the development mock.
export function EmployeeSummary({ service = employeeService }) {
  const { t, formatNumber } = useTranslation()
  const directory = useEmployeeDirectory(service)
  const counts = countEmployees(directory.items)

  return (
    <section aria-labelledby="employees-heading">
      <div className="section-heading">
        <div className="section-heading__title">
          <h2 id="employees-heading">{t('dashboard.employees.title')}</h2>
          {service.isMock && <DemoBadge />}
        </div>
        <Link to={ROUTES.adminEmployees} className="button button--secondary button--sm">
          <Icon name="users" size={16} />
          {t('dashboard.employees.manage')}
        </Link>
      </div>

      {directory.status === 'error' ? (
        <Alert tone="error" title={t('dashboard.employees.errorTitle')}>
          <p>{t(`employees.errors.${directory.error === 'notConnected' || directory.error === 'network' ? directory.error : 'unknown'}`)}</p>
          <p>
            <button type="button" className="button button--secondary button--sm" onClick={() => directory.reload()}>
              <Icon name="refresh" size={16} />
              {t('employees.states.error.retry')}
            </button>
          </p>
        </Alert>
      ) : directory.status !== 'ready' ? (
        <p className="auth-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {t('employees.states.loading')}
        </p>
      ) : (
        <div className="stats-grid">
          <StatCard label={t('dashboard.employees.total')} value={formatNumber(counts.total)} icon="users" tone="navy" />
          <StatCard label={t('dashboard.employees.active')} value={formatNumber(counts.active)} icon="checkCircle" tone="teal" />
          <StatCard label={t('dashboard.employees.deactivated')} value={formatNumber(counts.deactivated)} icon="lock" tone="info" />
        </div>
      )}
    </section>
  )
}
