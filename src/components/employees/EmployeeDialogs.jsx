import { useState } from 'react'
import { EMPLOYEE_RULES, validateEmployeeForm, validatePasswordForm } from '../../domain/employee/employee.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { FormDialog } from '../common/FormDialog.jsx'
import { FormField } from '../common/FormField.jsx'
import { errorMessage, fieldMessage } from './messages.js'

// The dialogs of the employee-management screen. Each one is mounted only while it is open
// (so its form always starts empty), validates in the browser for quick feedback, then asks
// `onSubmit(values)` to perform the action. `onSubmit` resolves to the result of the
// directory action: { ok: true } or { ok: false, error: { code, fields } }. The backend
// validates again; the browser validation is only a convenience.

// Shared by the three form dialogs: validation errors, the busy flag and the general error.
function useActionForm({ validate, onSubmit, onDone }) {
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(values) {
    const found = validate(values)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) {
      focusFirstInvalid()
      return
    }
    setBusy(true)
    const result = await onSubmit(values)
    setBusy(false)
    if (result.ok) {
      onDone(result)
      return
    }
    const fieldErrors = result.error.fields ?? {}
    if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors)
    else setServerError(result.error)
    focusFirstInvalid()
  }

  return { errors, serverError, busy, submit, clearField: (field) => setErrors((current) => ({ ...current, [field]: undefined })) }
}

// After a failed submit the first field with a problem in the open dialog gets the focus
// (once the error state is rendered).
function focusFirstInvalid() {
  setTimeout(() => document.querySelector('dialog[open] [aria-invalid="true"]')?.focus(), 0)
}

// Create (`employee` omitted) or edit an employee's name and username.
export function EmployeeFormDialog({ employee = null, onSubmit, onCancel, onDone }) {
  const { t } = useTranslation()
  const isEdit = employee !== null
  const [displayName, setDisplayName] = useState(employee?.displayName ?? '')
  const [identifier, setIdentifier] = useState(employee?.identifier ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const form = useActionForm({
    validate: (values) => validateEmployeeForm(values, { requirePassword: !isEdit }),
    onSubmit,
    onDone,
  })
  const { errors } = form
  const message = (field) => (errors[field] ? fieldMessage(t, field, errors[field]) : undefined)

  return (
    <FormDialog
      title={t(isEdit ? 'employees.form.editTitle' : 'employees.form.createTitle')}
      submitLabel={t(form.busy ? 'employees.form.saving' : isEdit ? 'employees.form.editSubmit' : 'employees.form.createSubmit')}
      cancelLabel={t('employees.form.cancel')}
      busy={form.busy}
      error={form.serverError ? errorMessage(t, form.serverError) : null}
      onSubmit={() => form.submit({ displayName, identifier, password, confirmation })}
      onCancel={onCancel}
    >
      <div className="form-stack">
        <FormField
          label={t('employees.form.name')}
          value={displayName}
          error={message('displayName')}
          autoComplete="off"
          disabled={form.busy}
          onChange={(event) => {
            setDisplayName(event.target.value)
            form.clearField('displayName')
          }}
        />
        <FormField
          label={t('employees.form.username')}
          hint={t('employees.form.usernameHint')}
          value={identifier}
          error={message('identifier')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          disabled={form.busy}
          onChange={(event) => {
            setIdentifier(event.target.value)
            form.clearField('identifier')
          }}
        />
        {!isEdit && (
          <>
            <FormField
              label={t('employees.form.password')}
              hint={t('employees.form.passwordHint', { min: EMPLOYEE_RULES.passwordMinLength })}
              type="password"
              value={password}
              error={message('password')}
              autoComplete="new-password"
              dir="ltr"
              disabled={form.busy}
              onChange={(event) => {
                setPassword(event.target.value)
                form.clearField('password')
              }}
            />
            <FormField
              label={t('employees.form.confirmPassword')}
              type="password"
              value={confirmation}
              error={message('confirmation')}
              autoComplete="new-password"
              dir="ltr"
              disabled={form.busy}
              onChange={(event) => {
                setConfirmation(event.target.value)
                form.clearField('confirmation')
              }}
            />
          </>
        )}
      </div>
    </FormDialog>
  )
}

// Set a new password for an employee: covers both "reset a forgotten password" (decision 17)
// and "change a password" (decision 19), which are the same action for the Admin. The
// current password can never be shown.
export function PasswordDialog({ employee, onSubmit, onCancel, onDone }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const form = useActionForm({
    validate: validatePasswordForm,
    onSubmit: ({ password: value }) => onSubmit(value),
    onDone,
  })
  const message = (field) => (form.errors[field] ? fieldMessage(t, field, form.errors[field]) : undefined)

  return (
    <FormDialog
      title={t('employees.password.title', { name: employee.displayName })}
      submitLabel={t(form.busy ? 'employees.form.saving' : 'employees.password.submit')}
      cancelLabel={t('employees.form.cancel')}
      busy={form.busy}
      error={form.serverError ? errorMessage(t, form.serverError) : null}
      onSubmit={() => form.submit({ password, confirmation })}
      onCancel={onCancel}
    >
      <p>{t('employees.password.intro')}</p>
      <div className="form-stack">
        <FormField
          label={t('employees.password.newPassword')}
          hint={t('employees.form.passwordHint', { min: EMPLOYEE_RULES.passwordMinLength })}
          type="password"
          value={password}
          error={message('password')}
          autoComplete="new-password"
          dir="ltr"
          disabled={form.busy}
          onChange={(event) => {
            setPassword(event.target.value)
            form.clearField('password')
          }}
        />
        <FormField
          label={t('employees.form.confirmPassword')}
          type="password"
          value={confirmation}
          error={message('confirmation')}
          autoComplete="new-password"
          dir="ltr"
          disabled={form.busy}
          onChange={(event) => {
            setConfirmation(event.target.value)
            form.clearField('confirmation')
          }}
        />
      </div>
    </FormDialog>
  )
}

// Confirmation before deactivating or reactivating an account.
export function StatusDialog({ employee, deactivate, onSubmit, onCancel, onDone }) {
  const { t } = useTranslation()
  const form = useActionForm({ validate: () => ({}), onSubmit, onDone })
  const key = deactivate ? 'deactivate' : 'reactivate'

  return (
    <FormDialog
      title={t(`employees.${key}.title`, { name: employee.displayName })}
      submitLabel={t(form.busy ? 'employees.form.saving' : `employees.${key}.confirm`)}
      cancelLabel={t('employees.form.cancel')}
      tone={deactivate ? 'danger' : 'primary'}
      busy={form.busy}
      error={form.serverError ? errorMessage(t, form.serverError) : null}
      onSubmit={() => form.submit({})}
      onCancel={onCancel}
    >
      <p>{t(`employees.${key}.text`)}</p>
    </FormDialog>
  )
}
