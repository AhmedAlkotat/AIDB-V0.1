import { useEffect } from 'react'
import { useManualSaveConfirmation } from '../../hooks/useManualSaveConfirmation.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { SAVE_STATUS } from '../../domain/document/saveStatus.js'
import { Icon } from '../common/Icon.jsx'

const ICONS = {
  [SAVE_STATUS.saved]: 'checkCircle',
  [SAVE_STATUS.unsaved]: 'clock',
  [SAVE_STATUS.saving]: 'refresh',
  [SAVE_STATUS.failed]: 'alertCircle',
}

// Draft saving (decision 13): automatic saving, the explicit "Save draft" button, the status (saved, unsaved,
// saving, failed), the time of the last save and a warning about unsaved changes (the page also guards
// navigation). It shows what the configured storage ACKNOWLEDGED, and says plainly when that storage is only
// this browser tab's memory. SAVING IS NOT APPROVAL: the button never approves anything. After a failure the
// status offers "try again" (the draft button retries too).
//
// "Save draft" confirms itself (observation O-1): when autosave has already stored everything the click would change
// nothing on screen, so a short "Draft saved" appears. It appears ONLY when that save really ended "saved" (never after a
// failure, never for autosave) and it goes away when the status leaves "saved" (see components/review/manualSave.js).
export function SaveStatusIndicator({ status, isTemporary, lastSavedAt, canSave = true, onRetry, onSaveDraft }) {
  const { t, formatDateTime } = useTranslation()
  const draft = useManualSaveConfirmation(() => onSaveDraft())

  // A change after the confirmation (typing, a failed save) makes it untrue: hide it at once.
  const { dismiss } = draft
  useEffect(() => {
    if (status !== SAVE_STATUS.saved) dismiss()
  }, [status, dismiss])

  return (
    <div className={`save-status save-status--${status}`} role="status" aria-live="polite">
      <span className="save-status__main">
        <Icon name={ICONS[status]} size={18} className={status === SAVE_STATUS.saving ? 'is-spinning' : ''} />
        <span className="save-status__label">{t(`review.save.${status}`)}</span>
      </span>
      {lastSavedAt && status === SAVE_STATUS.saved && <span className="save-status__note">{t('review.save.lastSaved', { time: formatDateTime(lastSavedAt) })}</span>}
      {status === SAVE_STATUS.unsaved && <span className="save-status__note">{t('review.save.unsavedWarning')}</span>}
      {isTemporary && <span className="save-status__note">{t('review.save.temporaryShort')}</span>}
      {draft.isConfirmed && status === SAVE_STATUS.saved && (
        <span className="save-status__confirmed" data-save-confirmation="draft">
          <Icon name="checkCircle" size={16} />
          {t('review.save.draftSaved')}
        </span>
      )}
      {onSaveDraft && (
        <button type="button" className="button button--secondary button--sm save-status__draft" disabled={!canSave || draft.isSaving || status === SAVE_STATUS.saving} onClick={draft.run}>
          <Icon name="save" size={16} />
          {t('review.save.draft')}
        </button>
      )}
      {status === SAVE_STATUS.failed && (
        <span className="save-status__failure">
          {t('review.save.failedHelp')}
          <button type="button" className="button button--secondary button--sm" onClick={onRetry}>
            {t('review.save.retry')}
          </button>
        </span>
      )}
    </div>
  )
}
