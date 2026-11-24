import { getSelectedPageIndex } from '../../domain/document/pageNavigation.js'
import { getReviewProgress } from '../../domain/document/review.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { DemoBadge } from '../common/DemoBadge.jsx'
import { Icon } from '../common/Icon.jsx'
import { SaveStatusIndicator } from './SaveStatusIndicator.jsx'

// Title area of the review page: the document, where the reviewer is, how far
// the review has come, and the autosave state.
export function ReviewHeader({ name, document, currentPage, usesMockProcessing, isApproved, saveStatus, isTemporaryStorage, onRetrySave }) {
  const { t, formatNumber } = useTranslation()
  const progress = getReviewProgress(document)
  const index = getSelectedPageIndex(document.selectedPages, currentPage)

  return (
    <section className="card review-header" aria-labelledby="review-title">
      <div className="review-header__top">
        <span className="page-intro__icon">
          <Icon name="fileText" size={24} />
        </span>
        <div className="review-header__text">
          <h2 id="review-title" className="review-header__title" dir="auto" title={name}>
            {name}
          </h2>
          <p className="review-header__meta">
            <span>{t('review.header.page', { page: formatNumber(currentPage) })}</span>
            <span>{t('review.header.position', { index: formatNumber(index + 1), count: formatNumber(document.selectedPages.length) })}</span>
            <span>{t('review.header.totalPages', { total: formatNumber(document.file.totalPages) })}</span>
          </p>
          <div className="review-header__badges">
            {usesMockProcessing && <DemoBadge />}
            {isApproved && <span className="badge badge--success">{t('review.header.approvedBadge')}</span>}
          </div>
        </div>
        <SaveStatusIndicator status={saveStatus} isTemporary={isTemporaryStorage} onRetry={onRetrySave} />
      </div>

      <div className="review-progress">
        <div className="review-progress__text">
          <span>{t('review.header.progress', { reviewed: formatNumber(progress.reviewedCount), total: formatNumber(progress.totalPages) })}</span>
          <span>{t('review.header.percent', { percent: formatNumber(progress.percent) })}</span>
        </div>
        <div
          className="review-progress__bar"
          role="progressbar"
          aria-label={t('review.header.progressLabel')}
          aria-valuemin={0}
          aria-valuemax={progress.totalPages}
          aria-valuenow={progress.reviewedCount}
          aria-valuetext={t('review.header.progress', { reviewed: formatNumber(progress.reviewedCount), total: formatNumber(progress.totalPages) })}
        >
          <span style={{ inlineSize: `${progress.percent}%` }} />
        </div>
        <p className="review-progress__note">{t('review.nav.unselectedNote')}</p>
      </div>
    </section>
  )
}
