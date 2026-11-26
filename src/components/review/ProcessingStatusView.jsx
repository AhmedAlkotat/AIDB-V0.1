import { Link } from 'react-router'
import { DOCUMENT_STATE, isReviewable } from '../../domain/document/lifecycle.js'
import { getDocumentQueuePosition, useProcessingQueue } from '../../hooks/useProcessingQueue.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { ROUTES } from '../../routes/paths.js'
import { Alert } from '../common/Alert.jsx'
import { DemoBadge } from '../common/DemoBadge.jsx'
import { Icon } from '../common/Icon.jsx'
import { DocumentStateBadge } from '../documents/DocumentStateBadge.jsx'
import { OriginalViewer } from './OriginalViewer.jsx'
import { SplitPane } from './SplitPane.jsx'

// What the review address shows while the document has no content to review yet: Pending (waiting in the
// central FIFO queue) or Processing (the queue is extracting the pages). Processing is NOT tied to this page
// (decisions 2 and 3): the user may leave at any time, the work goes on in the background, and a notification
// with a link says when it is done. When the state changes this view does NOT open the review by itself:
// it offers a button (no automatic redirect).
//
// The original is shown meanwhile, so the person can already look at it.
export function ProcessingStatusView({ summary, file, firstPage, onOpenReview }) {
  const { t, formatNumber } = useTranslation()
  const queue = useProcessingQueue()
  const position = getDocumentQueuePosition(queue.jobs, summary.id)
  const finished = summary.processedCount + summary.failedPageCount
  const percent = summary.selectedCount === 0 ? 0 : Math.round((finished / summary.selectedCount) * 100)
  const ready = isReviewable(summary.state) || summary.state === DOCUMENT_STATE.approved

  return (
    <div className="page review-page">
      <section className="card review-header" aria-labelledby="review-title">
        <div className="review-header__top">
          <span className="page-intro__icon">
            <Icon name="fileText" size={24} />
          </span>
          <div className="review-header__text">
            <h2 id="review-title" className="review-header__title" dir="auto" title={summary.name}>
              {summary.name}
            </h2>
            <p className="review-header__meta">
              <span>{t('queue.pages', { selected: formatNumber(summary.selectedCount), total: formatNumber(summary.totalPages) })}</span>
            </p>
            <div className="review-header__badges">
              {summary.usesMockProcessing && <DemoBadge />}
              <DocumentStateBadge state={summary.state} />
            </div>
          </div>
        </div>
      </section>

      <p>
        <Link className="button button--secondary button--sm" to={ROUTES.corrections}>
          <Icon name="chevronLeft" size={16} className="icon--flip-rtl" />
          {t('review.back')}
        </Link>
      </p>

      <SplitPane
        start={<OriginalViewer file={file} pageNumber={firstPage} />}
        end={
          <section className="card editor-panel processing-status" aria-labelledby="processing-status-title" data-processing-status={summary.state}>
            <h3 id="processing-status-title">{t('review.status.title')}</h3>
            {ready ? (
              <Alert tone="success" title={t('review.status.readyTitle')}>
                <p>{t('review.status.readyText')}</p>
                <p>
                  <button type="button" className="button button--primary" onClick={onOpenReview}>
                    <Icon name="fileText" />
                    {t('review.status.openReview')}
                  </button>
                </p>
              </Alert>
            ) : (
              <>
                <p className="processing__running" role="status">
                  <span className="spinner" aria-hidden="true" />
                  {summary.state === DOCUMENT_STATE.pending
                    ? position
                      ? t('review.status.pendingPosition', { position: formatNumber(position) })
                      : t('review.status.pending')
                    : t('review.status.processing', { done: formatNumber(finished), total: formatNumber(summary.selectedCount) })}
                </p>
                <div className="review-progress__bar" role="progressbar" aria-label={t('review.status.progressLabel')} aria-valuemin={0} aria-valuemax={summary.selectedCount} aria-valuenow={finished}>
                  <span style={{ inlineSize: `${percent}%` }} />
                </div>
                {queue.blocked === 'storageFull' && (
                  <Alert tone="warning" title={t('queue.pausedTitle')}>
                    {t('queue.pausedText')}
                  </Alert>
                )}
                <Alert tone="info" title={t('review.status.backgroundTitle')}>
                  <p>{t('review.status.backgroundText')}</p>
                </Alert>
              </>
            )}
          </section>
        }
      />
    </div>
  )
}
