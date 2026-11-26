import { DOCUMENT_STATE } from '../../domain/document/lifecycle.js'
import { getSelectedPageIndex } from '../../domain/document/pageNavigation.js'
import { getReviewProgress } from '../../domain/document/review.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { DemoBadge } from '../common/DemoBadge.jsx'
import { Icon } from '../common/Icon.jsx'
import { DocumentStateBadge } from '../documents/DocumentStateBadge.jsx'
import { SaveStatusIndicator } from './SaveStatusIndicator.jsx'

// Title area of the review page: the document and its state (decision 12), where the reviewer is, how far the
// review has come, the layout the processing recognised (or that it is new: a document is never rejected for
// matching no template) and the draft saving state with its "Save draft" button.
export function ReviewHeader({ name, document, currentPage, usesMockProcessing, state, isNewVersion, template, documentType, saveStatus, lastSavedAt, isTemporaryStorage, canSave, onRetrySave, onSaveDraft }) {
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
            <DocumentStateBadge state={state} />
            {isNewVersion && <span className="badge badge--warning">{t('review.header.newVersion')}</span>}
            {documentType && <span className="badge badge--neutral">{t(`documents.types.${documentType}`)}</span>}
            {state !== DOCUMENT_STATE.failed && (
              <span className="badge badge--neutral" data-layout={template ? 'known' : 'new'}>
                {template ? t('documents.layout.known', { name: template.name }) : t('documents.layout.new')}
              </span>
            )}
          </div>
        </div>
        <SaveStatusIndicator status={saveStatus} isTemporary={isTemporaryStorage} lastSavedAt={lastSavedAt} canSave={canSave} onRetry={onRetrySave} onSaveDraft={onSaveDraft} />
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
