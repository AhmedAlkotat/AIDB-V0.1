import { getReviewConfirmationBlocker } from '../../domain/document/review.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'
import { PageStatusBadge, PageStatusDetails } from './PageStatusBadges.jsx'

// The explicit review action. A page becomes reviewed ONLY by this button;
// opening or editing never does it. When Phase 1 refuses (processing, or no
// valid content) the button is disabled and the reason is written next to it.
//
// Typing is committed to the document after a short pause, so `page` can be
// slightly behind what the reviewer sees. While text is pending (`hasPendingEdits`)
// the button therefore stays usable and `onConfirm` commits that text first (the
// session does it), then validates the result: the confirmation always covers the
// content on screen, and a click is never wasted on a button that is about to
// become enabled. A page shown as "reviewed" is not trusted while text is pending.
export function PageReviewBar({ page, isApproved, isApprovalPending = false, isLockedOut = false, hasPendingEdits = false, onConfirm }) {
  const { t, language } = useTranslation()
  const awaitsCommit = hasPendingEdits && page.processing.status !== 'processing'
  const blocker = isApproved || awaitsCommit ? null : getReviewConfirmationBlocker(page)
  // While text is pending, the statuses already show what they will show once it is
  // committed (a reviewed page becomes "needs a new review"). Otherwise committing on the
  // mouse-down of the click would change the layout under the pointer and swallow the click.
  const isSuperseded = awaitsCommit && page.review.status === 'reviewed'
  const shownPage = isSuperseded ? { ...page, review: { status: 'invalidated', confirmedAt: null } } : page
  const status = shownPage.review.status
  const confirmedAt = shownPage.review.confirmedAt

  let reason = null
  if (isApproved) reason = t('review.reviewBar.approved')
  else if (isApprovalPending) reason = t('review.reviewBar.approvalPending')
  else if (isLockedOut) reason = t('review.reviewBar.lock')
  else if (blocker) reason = t(`review.reviewBar.blocked.${blocker}`)

  return (
    <section className="review-bar" aria-label={t('review.reviewBar.label')}>
      <div className="review-bar__statuses">
        <PageStatusBadge page={shownPage} />
        <PageStatusDetails page={shownPage} />
      </div>

      {status === 'reviewed' ? (
        <p className="review-bar__done">
          <Icon name="checkCircle" size={20} />
          <span>
            {t('review.reviewBar.reviewed')}
            {confirmedAt && (
              <small>
                {' '}
                ({new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(confirmedAt))})
              </small>
            )}
          </span>
        </p>
      ) : (
        <div className="review-bar__action">
          {status === 'invalidated' && (
            <p className="review-bar__invalidated" role="status">
              <Icon name="fileWarning" size={18} />
              {t('review.reviewBar.invalidated')}
            </p>
          )}
          <button
            type="button"
            className="button button--primary"
            disabled={isApproved || isApprovalPending || isLockedOut || blocker !== null}
            aria-describedby={reason ? 'review-bar-reason' : undefined}
            onClick={onConfirm}
          >
            <Icon name="check" />
            {t('review.reviewBar.confirm')}
          </button>
        </div>
      )}
      {reason && (
        <p id="review-bar-reason" className="review-bar__reason">
          {reason}
        </p>
      )}
      <p className="review-bar__hint">{t('review.reviewBar.hint')}</p>
    </section>
  )
}
