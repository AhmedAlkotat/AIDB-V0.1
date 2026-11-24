import { getPageUiStatus, PAGE_UI_STATUS } from '../../domain/document/pageStatus.js'
import { useTranslation } from '../../hooks/useTranslation.js'

const UI_TONES = {
  [PAGE_UI_STATUS.pending]: 'neutral',
  [PAGE_UI_STATUS.processing]: 'info',
  [PAGE_UI_STATUS.readyForReview]: 'info',
  [PAGE_UI_STATUS.failed]: 'danger',
  [PAGE_UI_STATUS.manualEditing]: 'warning',
  [PAGE_UI_STATUS.reviewed]: 'success',
}

// One badge with the reviewer-facing status (used in lists).
export function PageStatusBadge({ page }) {
  const { t } = useTranslation()
  const status = getPageUiStatus(page)
  return <span className={`badge badge--${UI_TONES[status]}`}>{t(`review.pageStatus.${status}`)}</span>
}

// The two statuses kept apart: what the AI did, and what the human did.
export function PageStatusDetails({ page }) {
  const { t } = useTranslation()
  return (
    <dl className="status-details">
      <div className="status-details__item">
        <dt>{t('review.ai.label')}</dt>
        <dd>
          <span className={`badge badge--${page.processing.status === 'failed' ? 'danger' : page.processing.status === 'succeeded' ? 'success' : 'neutral'}`}>
            {t(`review.ai.${page.processing.status}`)}
          </span>
        </dd>
      </div>
      <div className="status-details__item">
        <dt>{t('review.reviewState.label')}</dt>
        <dd>
          <span className={`badge badge--${page.review.status === 'reviewed' ? 'success' : page.review.status === 'invalidated' ? 'warning' : 'neutral'}`}>
            {t(`review.reviewState.${page.review.status}`)}
          </span>
        </dd>
      </div>
    </dl>
  )
}
