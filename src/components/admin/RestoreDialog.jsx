import { useEffect, useRef, useState } from 'react'
import { RESTORE_STEPS } from '../../domain/backup/backup.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { ConfirmActionDialog } from '../common/ConfirmActionDialog.jsx'
import { FormDialog } from '../common/FormDialog.jsx'
import { systemErrorMessage } from '../common/systemErrorMessage.js'

// The restore of decision 30, in two parts. FIRST an explicit confirmation that warns about what
// will happen: the backup is verified and decrypted, a protective backup of the current state is
// taken, data newer than the backup is lost, and writing is blocked while it runs. THEN the
// progress of the steps. If the protective backup fails the restore is cancelled and nothing is
// changed. IN THE FRONTEND THIS IS A SIMULATION: nothing is restored.
export function RestoreDialog({ backup, service, onClose, onFinished }) {
  const { t, formatDate } = useTranslation()
  const [started, setStarted] = useState(false)

  if (!started) {
    return (
      <ConfirmActionDialog
        title={t('backups.restore.title')}
        confirmLabel={t('backups.restore.confirm')}
        acknowledgement={t('backups.restore.acknowledge')}
        onConfirm={async () => {
          setStarted(true)
          return { ok: true }
        }}
        onCancel={onClose}
      >
        <p>{t('backups.restore.intro', { date: formatDate(backup.createdAt) })}</p>
        <ol className="confirm-list">
          <li>{t('backups.restore.points.verify')}</li>
          <li>{t('backups.restore.points.protective')}</li>
          <li>{t('backups.restore.points.dataLoss', { date: formatDate(backup.createdAt) })}</li>
          <li>{t('backups.restore.points.writesBlocked')}</li>
          <li>{t('backups.restore.points.cancelled')}</li>
        </ol>
        <p className="confirm-warning">{t('backups.restore.simulation')}</p>
      </ConfirmActionDialog>
    )
  }
  return <RestoreProgress backup={backup} service={service} onClose={onClose} onFinished={onFinished} />
}

function RestoreProgress({ backup, service, onClose, onFinished }) {
  const { t } = useTranslation()
  const [steps, setSteps] = useState({})
  const [outcome, setOutcome] = useState(null) // { ok, errorCode? } once finished
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    service
      .restoreBackup(backup.id, { acknowledged: true, onStep: ({ step, status }) => setSteps((current) => ({ ...current, [step]: status })) })
      .then((result) => {
        setOutcome({ ok: result.ok })
        onFinished(result)
      })
      .catch((error) => setOutcome({ ok: false, errorCode: error?.code ?? 'unknown' }))
  }, [backup.id, service, onFinished])

  const running = outcome === null
  return (
    <FormDialog
      title={t('backups.restore.progressTitle')}
      submitLabel={t('common.close')}
      cancelLabel={t('common.close')}
      hideCancel
      busy={running}
      onSubmit={onClose}
      onCancel={onClose}
    >
      <ol className="restore-steps" aria-live="polite">
        {RESTORE_STEPS.map((step) => {
          const status = steps[step] ?? (running ? 'pending' : 'skipped')
          return (
            <li key={step} className={`restore-steps__item restore-steps__item--${status}`}>
              <span className="restore-steps__label">{t(`backups.restore.steps.${step}`)}</span>
              <span className="badge badge--neutral">{t(`backups.restore.stepStatus.${status}`)}</span>
            </li>
          )
        })}
      </ol>
      {outcome?.ok && <p className="confirm-success">{t('backups.restore.done')}</p>}
      {outcome && !outcome.ok && <p className="confirm-warning">{outcome.errorCode ? systemErrorMessage(t, outcome.errorCode) : t('backups.restore.cancelled')}</p>}
      <p className="confirm-warning">{t('backups.restore.simulation')}</p>
    </FormDialog>
  )
}
