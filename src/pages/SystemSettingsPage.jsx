import { PageIntro } from '../components/common/PageIntro.jsx'
import { ResourceState } from '../components/common/ResourceState.jsx'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { SettingsSection } from '../components/settings/SettingsSection.jsx'
import { AUDIT_CATEGORIES } from '../domain/settings/settings.js'
import { useResource } from '../hooks/useResource.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { settingsService } from '../services/settingsService.js'

// The Admin's system settings (Admin only: the route is behind RequireRole and the settings
// service refuses other callers; the backend must enforce it too). The settings are grouped by
// what they govern: uploads, the recycle bin, the audit log, backups and storage alerts. The
// employee-accessible preferences are on a different page (/settings).
//
// Every default and every allowed range is PROVISIONAL (domain/settings/settings.js): the
// decisions give examples only. While the service is the development mock nothing here has an
// effect beyond the mock itself (for instance the upload screen does not read the limits yet).
//
// `service` can be replaced (tests).
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

const FIELDS = {
  uploads: [
    { name: 'maxFileSizeMb', type: 'number' },
    { name: 'maxSelectedPages', type: 'number' },
  ],
  recycleBin: [
    { name: 'autoDelete', type: 'checkbox' },
    { name: 'retentionDays', type: 'number', disabledWhen: (values) => !values.autoDelete },
  ],
  audit: [{ name: 'retentionDays', type: 'number' }],
  backups: [
    { name: 'scheduleEnabled', type: 'checkbox' },
    { name: 'frequency', type: 'select', options: ['daily', 'weekly'], disabledWhen: (values) => !values.scheduleEnabled },
    { name: 'weekday', type: 'select', numeric: true, options: WEEKDAYS, showWhen: (values) => values.frequency === 'weekly', disabledWhen: (values) => !values.scheduleEnabled },
    { name: 'time', type: 'time', disabledWhen: (values) => !values.scheduleEnabled },
    { name: 'retentionMode', type: 'select', options: ['count', 'days'] },
    { name: 'retentionCount', type: 'number', showWhen: (values) => values.retentionMode === 'count' },
    { name: 'retentionDays', type: 'number', showWhen: (values) => values.retentionMode === 'days' },
    { name: 'localPath', type: 'text' },
    { name: 'externalPath', type: 'text' },
  ],
  storage: [
    { name: 'warningPercent', type: 'number' },
    { name: 'criticalPercent', type: 'number' },
  ],
}

export default function SystemSettingsPage({ service = settingsService }) {
  const { t } = useTranslation()
  const settings = useResource(() => service.getSettings())
  const data = settings.data

  return (
    <div className="page">
      <PageIntro id="settings-title" icon="settings" title={t('nav.adminSettings')} description={t('systemSettings.description')} />

      {service.isMock && <SimulationNotice textKey="systemSettings.simulation" />}

      <ResourceState resource={settings}>
        {data && (
          <>
            <SettingsSection section="uploads" initial={data.uploads} fields={FIELDS.uploads} service={service} />
            <SettingsSection section="recycleBin" initial={data.recycleBin} fields={FIELDS.recycleBin} service={service} />
            <SettingsSection section="audit" initial={data.audit} fields={FIELDS.audit} service={service}>
              {({ values, setField, busy }) => (
                <fieldset className="check-group" disabled={busy}>
                  <legend className="form-field__label">{t('systemSettings.audit.categories.label')}</legend>
                  <p className="form-field__hint">{t('systemSettings.audit.categories.hint')}</p>
                  {AUDIT_CATEGORIES.map((category) => (
                    <label key={category} className="check-row">
                      <input type="checkbox" checked={Boolean(values.categories[category])} onChange={(event) => setField('categories', { ...values.categories, [category]: event.target.checked })} />
                      <span>{t(`audit.categories.${category}`)}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </SettingsSection>
            <SettingsSection section="backups" initial={data.backups} fields={FIELDS.backups} service={service} />
            <SettingsSection section="storage" initial={data.storage} fields={FIELDS.storage} service={service} />
          </>
        )}
      </ResourceState>
    </div>
  )
}
