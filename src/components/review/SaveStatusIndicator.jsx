import { useTranslation } from '../../hooks/useTranslation.js'
import { SAVE_STATUS } from '../../domain/document/saveStatus.js'
import { Icon } from '../common/Icon.jsx'

const ICONS = {
  [SAVE_STATUS.saved]: 'checkCircle',
  [SAVE_STATUS.unsaved]: 'clock',
  [SAVE_STATUS.saving]: 'refresh',
  [SAVE_STATUS.failed]: 'alertCircle',
}

// Autosave status. It shows what the configured storage acknowledged, and says
// plainly when that storage is only this browser tab's memory. There is no
// manual "save" button; after a failure the only action is "try again".
export function SaveStatusIndicator({ status, isTemporary, onRetry }) {
  const { t } = useTranslation()

  return (
    <div className={`save-status save-status--${status}`} role="status" aria-live="polite">
      <span className="save-status__main">
        <Icon name={ICONS[status]} size={18} className={status === SAVE_STATUS.saving ? 'is-spinning' : ''} />
        <span className="save-status__label">{t(`review.save.${status}`)}</span>
      </span>
      {isTemporary && <span className="save-status__note">{t('review.save.temporaryShort')}</span>}
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
