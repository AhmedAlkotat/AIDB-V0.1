import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { PageIntro } from '../components/common/PageIntro.jsx'
import { ResourceState } from '../components/common/ResourceState.jsx'
import { systemErrorMessage } from '../components/common/systemErrorMessage.js'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { BackupTable } from '../components/admin/BackupTable.jsx'
import { DevSimulationPanel } from '../components/admin/DevSimulationPanel.jsx'
import { RestoreDialog } from '../components/admin/RestoreDialog.jsx'
import { BACKUP_STATUS, getNextScheduledBackup } from '../domain/backup/backup.js'
import { useResource } from '../hooks/useResource.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { backupService } from '../services/backupService.js'
import { settingsService } from '../services/settingsService.js'

// Backup and restore (Admin only, decisions 25-30). EVERYTHING HERE IS SIMULATED while the
// service is the development mock: no backup is written, nothing is encrypted, nothing is
// restored, and the page says so. The schedule, retention and locations are edited in the system
// settings (one place for all settings); this page shows them, makes a manual backup, tests a
// backup (the "restore test"), protects backups from retention, and restores with the full
// confirmation of decision 30.
//
// `service` and `settings` can be replaced (tests).
export default function BackupsPage({ service = backupService, settings = settingsService }) {
  const { t, formatDate, formatDateTime } = useTranslation()
  const backups = useResource(() => service.listBackups())
  const config = useResource(() => settings.getSettings())
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null) // { tone, key, params }
  const [restoreTarget, setRestoreTarget] = useState(null)

  const flagsLoaded = service.dev?.getFlags
  const [flags, setFlags] = useState(() => (flagsLoaded ? service.dev.getFlags() : {}))

  async function createBackup() {
    setCreating(true)
    setNotice(null)
    try {
      const backup = await service.createBackup()
      setNotice(backup.status === BACKUP_STATUS.completed ? { tone: 'success', key: 'created' } : { tone: 'error', key: 'createFailed' })
      setFlags(flagsLoaded ? service.dev.getFlags() : {})
      await backups.reload({ quiet: true })
    } catch (error) {
      setNotice({ tone: 'error', text: systemErrorMessage(t, error?.code) })
    } finally {
      setCreating(false)
    }
  }

  async function handleAction(kind, backup) {
    setNotice(null)
    if (kind === 'restore') {
      setRestoreTarget(backup)
      return
    }
    setBusyId(backup.id)
    try {
      if (kind === 'toggleProtect') {
        await service.setProtected(backup.id, !backup.protected)
        setNotice({ tone: 'success', key: backup.protected ? 'unprotected' : 'protected' })
      } else {
        const result = await service.verifyBackup(backup.id)
        setNotice(result.ok ? { tone: 'success', key: 'verified' } : { tone: 'error', key: 'verifyFailed' })
      }
      await backups.reload({ quiet: true })
    } catch (error) {
      setNotice({ tone: 'error', text: systemErrorMessage(t, error?.code) })
    } finally {
      setBusyId(null)
    }
  }

  // A finished restore adds a protective backup: refresh the list.
  const restoreFinished = useCallback(() => backups.reload({ quiet: true }), [backups])

  const settingsData = config.data?.backups
  const list = backups.data ?? []
  const lastGood = list.find((backup) => backup.status === BACKUP_STATUS.completed)
  const next = settingsData ? getNextScheduledBackup(settingsData) : null

  return (
    <div className="page">
      <PageIntro id="backups-title" icon="database" title={t('nav.adminBackups')} description={t('backups.description')}>
        <button type="button" className="button button--primary page-intro__action" disabled={creating} onClick={createBackup}>
          {creating ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" />}
          {t(creating ? 'backups.creating' : 'backups.create')}
        </button>
      </PageIntro>

      {service.isMock && <SimulationNotice textKey="backups.simulation" />}

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text ?? t(`backups.notice.${notice.key}`)}
        </Alert>
      )}

      <ResourceState resource={config}>
        {settingsData && (
          <section className="card info-card" aria-labelledby="backup-config-heading">
            <div className="section-heading">
              <h2 id="backup-config-heading">{t('backups.config.title')}</h2>
              <Link to={ROUTES.adminSettings} className="button button--secondary button--sm">
                <Icon name="settings" size={16} />
                {t('backups.config.change')}
              </Link>
            </div>
            <dl className="info-list">
              <div>
                <dt>{t('backups.config.schedule')}</dt>
                <dd>
                  {settingsData.scheduleEnabled
                    ? t(settingsData.frequency === 'weekly' ? 'backups.config.weekly' : 'backups.config.daily', { time: settingsData.time, day: t(`systemSettings.weekdays.${settingsData.weekday}`) })
                    : t('backups.config.manualOnly')}
                </dd>
              </div>
              <div>
                <dt>{t('backups.config.next')}</dt>
                <dd>{next ? formatDateTime(next) : '—'}</dd>
              </div>
              <div>
                <dt>{t('backups.config.retention')}</dt>
                <dd>{t(settingsData.retentionMode === 'days' ? 'backups.config.retentionDays' : 'backups.config.retentionCount', { count: settingsData.retentionCount, days: settingsData.retentionDays })}</dd>
              </div>
              <div>
                <dt>{t('backups.config.locations')}</dt>
                <dd>
                  {t('backups.config.local')}: {settingsData.localPath || t('backups.config.notSet')}
                  <br />
                  {t('backups.config.external')}: {settingsData.externalPath || t('backups.config.notSet')}
                </dd>
              </div>
              <div>
                <dt>{t('backups.config.encryption')}</dt>
                <dd>{t('backups.config.encryptionText')}</dd>
              </div>
              <div>
                <dt>{t('backups.config.last')}</dt>
                <dd>{lastGood ? formatDate(lastGood.createdAt) : '—'}</dd>
              </div>
            </dl>
            {!settingsData.externalPath && <Alert tone="warning">{t('backups.config.noExternal')}</Alert>}
          </section>
        )}
      </ResourceState>

      <ResourceState resource={backups}>
        <section className="card employee-panel" aria-label={t('backups.table.caption')}>
          {list.length === 0 ? (
            <div className="queue-empty">
              <p className="employee-empty__title">{t('backups.empty.title')}</p>
              <p>{t('backups.empty.text')}</p>
            </div>
          ) : (
            <BackupTable backups={list} busyId={busyId} onAction={handleAction} />
          )}
        </section>
      </ResourceState>

      {service.dev && (
        <DevSimulationPanel>
          {['failNextBackup', 'failProtectiveBackup'].map((name) => (
            <label key={name} className="check-row">
              <input
                type="checkbox"
                checked={Boolean(flags[name])}
                onChange={(event) => {
                  service.dev.setFlag(name, event.target.checked)
                  setFlags(service.dev.getFlags())
                }}
              />
              <span>{t(`backups.dev.${name}`)}</span>
            </label>
          ))}
        </DevSimulationPanel>
      )}

      {restoreTarget && <RestoreDialog key={restoreTarget.id} backup={restoreTarget} service={service} onClose={() => setRestoreTarget(null)} onFinished={restoreFinished} />}
    </div>
  )
}
