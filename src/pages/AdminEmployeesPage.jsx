import { useMemo, useState } from 'react'
import { Alert } from '../components/common/Alert.jsx'
import { DemoBadge } from '../components/common/DemoBadge.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { EmployeeFormDialog, PasswordDialog, StatusDialog } from '../components/employees/EmployeeDialogs.jsx'
import { EmployeeFilters } from '../components/employees/EmployeeFilters.jsx'
import { EmployeeTable } from '../components/employees/EmployeeTable.jsx'
import { errorMessage } from '../components/employees/messages.js'
import { filterEmployees, sortEmployees } from '../domain/employee/employee.js'
import { useEmployeeDirectory } from '../hooks/useEmployeeDirectory.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { employeeService } from '../services/employeeService.js'

// Employee management (Admin only; the route is behind RequireRole and the backend must
// enforce it too). The Admin lists, searches and filters employee accounts, creates them with
// an initial password, edits their name/username, sets new passwords, and deactivates or
// reactivates them. Accounts are never deleted, and a password is never shown.
//
// `service` can be replaced (tests); it defaults to the app's employee service.
export default function AdminEmployeesPage({ service = employeeService }) {
  const { t } = useTranslation()
  const directory = useEmployeeDirectory(service)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  // The open dialog: { kind: 'create' | 'edit' | 'password' | 'deactivate' | 'reactivate', employee? }
  const [dialog, setDialog] = useState(null)
  // The last success message: { key, name }
  const [notice, setNotice] = useState(null)

  const sorted = useMemo(() => sortEmployees(directory.items), [directory.items])
  const visible = useMemo(() => filterEmployees(sorted, { query, status }), [sorted, query, status])
  const filtering = query.trim() !== '' || status !== 'all'

  const close = () => setDialog(null)
  const finish = (key, name) => {
    setNotice({ key, name })
    close()
  }

  function renderDialog() {
    if (!dialog) return null
    const { kind, employee } = dialog
    if (kind === 'create') {
      // Only the account data is sent: the password confirmation stays in the form.
      return (
        <EmployeeFormDialog
          onSubmit={({ displayName, identifier, password }) => directory.create({ displayName, identifier, password })}
          onCancel={close}
          onDone={(result) => finish('created', result.employee.displayName)}
        />
      )
    }
    if (kind === 'edit') {
      return (
        <EmployeeFormDialog
          key={employee.id}
          employee={employee}
          onSubmit={({ displayName, identifier }) => directory.update(employee.id, { displayName, identifier })}
          onCancel={close}
          onDone={(result) => finish('updated', result.employee.displayName)}
        />
      )
    }
    if (kind === 'password') {
      return (
        <PasswordDialog
          key={employee.id}
          employee={employee}
          onSubmit={(password) => directory.setPassword(employee.id, password)}
          onCancel={close}
          onDone={() => finish('passwordSet', employee.displayName)}
        />
      )
    }
    const deactivate = kind === 'deactivate'
    return (
      <StatusDialog
        key={employee.id}
        employee={employee}
        deactivate={deactivate}
        onSubmit={() => (deactivate ? directory.deactivate(employee.id) : directory.reactivate(employee.id))}
        onCancel={close}
        onDone={() => finish(deactivate ? 'deactivated' : 'reactivated', employee.displayName)}
      />
    )
  }

  return (
    <div className="page">
      <section className="card page-intro" aria-labelledby="employees-title">
        <span className="page-intro__icon">
          <Icon name="users" size={26} />
        </span>
        <div className="page-intro__text">
          <h2 id="employees-title" className="page-intro__title">
            {t('nav.adminEmployees')}
          </h2>
          <p className="page-intro__description">{t('pages.adminEmployees.description')}</p>
        </div>
        <button type="button" className="button button--primary page-intro__action" onClick={() => setDialog({ kind: 'create' })}>
          <Icon name="plus" />
          {t('employees.create')}
        </button>
      </section>

      {service.isMock && (
        <Alert tone="info" title={t('employees.mock.title')}>
          <p>
            <DemoBadge /> {t('employees.mock.text')}
          </p>
        </Alert>
      )}
      <Alert tone="info">{t('employees.rules')}</Alert>

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {t(`employees.notice.${notice.key}`, { name: notice.name })}
        </Alert>
      )}

      {directory.status === 'error' && (
        <Alert tone="error" title={t('employees.states.error.title')}>
          <p>{errorMessage(t, { code: directory.error })}</p>
          <p>
            <button type="button" className="button button--secondary button--sm" onClick={() => directory.reload()}>
              <Icon name="refresh" size={16} />
              {t('employees.states.error.retry')}
            </button>
          </p>
        </Alert>
      )}

      {(directory.status === 'idle' || directory.status === 'loading') && (
        <p className="auth-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {t('employees.states.loading')}
        </p>
      )}

      {directory.status === 'ready' && (
        <section className="card employee-panel" aria-label={t('employees.table.caption')}>
          {directory.items.length === 0 ? (
            <div className="queue-empty">
              <p className="employee-empty__title">{t('employees.states.empty.title')}</p>
              <p>{t('employees.states.empty.text')}</p>
            </div>
          ) : (
            <>
              <EmployeeFilters
                query={query}
                status={status}
                shown={visible.length}
                total={directory.items.length}
                onQueryChange={setQuery}
                onStatusChange={setStatus}
              />
              {visible.length === 0 ? (
                <div className="queue-empty">
                  <p>{t('employees.states.noResults')}</p>
                  {filtering && (
                    <button
                      type="button"
                      className="button button--secondary button--sm"
                      onClick={() => {
                        setQuery('')
                        setStatus('all')
                      }}
                    >
                      {t('employees.states.clearFilters')}
                    </button>
                  )}
                </div>
              ) : (
                <EmployeeTable employees={visible} onAction={(kind, employee) => setDialog({ kind, employee })} />
              )}
            </>
          )}
        </section>
      )}

      {renderDialog()}
    </div>
  )
}
