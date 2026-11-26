import { useId, useState } from 'react'
import { coerceSection, SETTINGS_LIMITS, validateSettingsSection } from '../../domain/settings/settings.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'
import { ConfirmActionDialog } from '../common/ConfirmActionDialog.jsx'
import { FormField } from '../common/FormField.jsx'
import { systemErrorMessage } from '../common/systemErrorMessage.js'

// One group of system settings with its own Save button. The browser validates for quick feedback
// (the backend validates again), and a change that would delete things (a shorter retention
// period, automatic deletion switched on) first shows exactly what will be removed and needs an
// acknowledged confirmation. Fields are described by `fields`: { name, type: 'number' | 'text' |
// 'time' | 'select' | 'checkbox', options?, showWhen?(values), disabledWhen?(values), dir? }.
//
// Labels come from systemSettings.<section>.<field>.label (and .hint); `service` is the settings
// service: previewImpact(section, values) and updateSection(section, values).
export function SettingsSection({ section, initial, fields, children, service, onSaved }) {
  const { t, formatNumber } = useTranslation()
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { tone, text }
  const [impact, setImpact] = useState(null) // what saving would delete, awaiting confirmation
  const headingId = useId()

  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
    setNotice(null)
  }

  async function save(confirmed = false) {
    const found = validateSettingsSection(section, values)
    setErrors(found)
    setNotice(null)
    if (Object.keys(found).length > 0) {
      setTimeout(() => document.querySelector(`#${CSS.escape(headingId)} ~ form [aria-invalid="true"]`)?.focus(), 0)
      return
    }
    setBusy(true)
    try {
      const coerced = coerceSection(section, values)
      if (!confirmed) {
        const preview = await service.previewImpact(section, coerced)
        if (preview.recycleBinExpiring + preview.auditEntriesExpiring + preview.backupsExpiring > 0) {
          setImpact(preview)
          return
        }
      }
      const result = await service.updateSection(section, coerced)
      setSaved(result[section])
      setValues(result[section])
      setNotice({ tone: 'success', text: t('systemSettings.saved') })
      onSaved?.(result)
    } catch (error) {
      const fieldErrors = error?.fields ?? {}
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors)
      else setNotice({ tone: 'error', text: systemErrorMessage(t, error?.code) })
    } finally {
      setBusy(false)
    }
  }

  const message = (name) => {
    const code = errors[name]
    if (!code) return undefined
    const limit = SETTINGS_LIMITS[name] ?? SETTINGS_LIMITS.percent
    return t(`systemSettings.validation.${code}`, { min: formatNumber(limit.min ?? 0), max: formatNumber(limit.max ?? 0) })
  }

  return (
    <section className="card info-card settings-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{t(`systemSettings.${section}.title`)}</h2>
      <p className="settings-section__description">{t(`systemSettings.${section}.description`)}</p>
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        {typeof children === 'function' ? children({ values, setField, busy }) : children}
        {fields
          .filter((field) => !field.showWhen || field.showWhen(values))
          .map((field) => {
            const label = t(`systemSettings.${section}.${field.name}.label`)
            const hint = field.hint === false ? undefined : t(`systemSettings.${section}.${field.name}.hint`)
            const disabled = busy || Boolean(field.disabledWhen?.(values))
            if (field.type === 'checkbox') {
              return (
                <label key={field.name} className="check-row">
                  <input type="checkbox" checked={Boolean(values[field.name])} disabled={disabled} onChange={(event) => setField(field.name, event.target.checked)} />
                  <span>
                    {label}
                    {hint && <small className="form-field__hint">{hint}</small>}
                  </span>
                </label>
              )
            }
            if (field.type === 'select') {
              return (
                <SelectField key={field.name} label={label} hint={hint} value={String(values[field.name])} disabled={disabled} onChange={(value) => setField(field.name, field.numeric ? Number(value) : value)}>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {t(`systemSettings.${section}.${field.name}.options.${option}`)}
                    </option>
                  ))}
                </SelectField>
              )
            }
            return (
              <FormField
                key={field.name}
                label={label}
                hint={hint}
                error={message(field.name)}
                type={field.type === 'number' ? 'text' : field.type}
                inputMode={field.type === 'number' ? 'numeric' : undefined}
                dir={field.dir ?? 'ltr'}
                value={String(values[field.name] ?? '')}
                disabled={disabled}
                autoComplete="off"
                onChange={(event) => setField(field.name, event.target.value)}
              />
            )
          })}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <div>
          <button type="submit" className="button button--primary" disabled={busy || !dirty}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t(busy ? 'systemSettings.saving' : 'systemSettings.save')}
          </button>
        </div>
      </form>

      {impact && (
        <ConfirmActionDialog
          title={t('systemSettings.impact.title')}
          confirmLabel={t('systemSettings.impact.confirm')}
          acknowledgement={t('systemSettings.impact.acknowledge')}
          onConfirm={async () => {
            try {
              const result = await service.updateSection(section, coerceSection(section, values))
              setSaved(result[section])
              setValues(result[section])
              setNotice({ tone: 'success', text: t('systemSettings.saved') })
              onSaved?.(result)
              return { ok: true }
            } catch (error) {
              return { ok: false, message: systemErrorMessage(t, error?.code) }
            }
          }}
          onCancel={() => setImpact(null)}
          onDone={() => setImpact(null)}
        >
          <p>{t('systemSettings.impact.text')}</p>
          <ul className="confirm-list">
            {impact.recycleBinExpiring > 0 && <li>{t('systemSettings.impact.recycleBin', { count: formatNumber(impact.recycleBinExpiring) })}</li>}
            {impact.auditEntriesExpiring > 0 && <li>{t('systemSettings.impact.audit', { count: formatNumber(impact.auditEntriesExpiring) })}</li>}
            {impact.backupsExpiring > 0 && <li>{t('systemSettings.impact.backups', { count: formatNumber(impact.backupsExpiring) })}</li>}
          </ul>
        </ConfirmActionDialog>
      )}
    </section>
  )
}

function SelectField({ label, hint, value, disabled, onChange, children }) {
  const id = useId()
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="form-field__input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      {hint && <p className="form-field__hint">{hint}</p>}
    </div>
  )
}
