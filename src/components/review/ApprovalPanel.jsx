import { useState } from 'react'
import { APPROVAL_BLOCKER } from '../../domain/document/approval.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'
import { Icon } from '../common/Icon.jsx'

const CONDITIONS = [
  { blocker: APPROVAL_BLOCKER.pagesNotReviewed, key: 'pages' },
  { blocker: APPROVAL_BLOCKER.unsavedChanges, key: 'saved' },
  { blocker: APPROVAL_BLOCKER.processingActive, key: 'processing' },
  { blocker: APPROVAL_BLOCKER.noPermission, key: 'permission' },
]

// Document approval. The checklist is real (it is computed from the review),
// but approval itself needs a backend that records it, and none exists: the
// button reports that plainly and nothing is approved. An approved document is
// read-only for everyone; only the admin may start a NEW editable version.
export function ApprovalPanel({ eligibility, isApproved, canCreateNewVersion, role, onApprove, onNewVersion }) {
  const { t, formatNumber } = useTranslation()
  const [notice, setNotice] = useState(null) // { tone, code }
  const [isBusy, setIsBusy] = useState(false)

  async function run(action, successKey) {
    setIsBusy(true)
    const result = await action()
    setIsBusy(false)
    if (result.ok) setNotice({ tone: 'info', key: successKey })
    else setNotice({ tone: 'warning', key: result.code === 'APPROVAL_NOT_CONNECTED' ? 'notConnected' : 'refused' })
  }

  return (
    <section className="card approval-panel" aria-labelledby="approval-title">
      <h3 id="approval-title">{t('review.approval.title')}</h3>

      {isApproved ? (
        <Alert tone="info" title={t('review.approval.approvedTitle')}>
          {t('review.approval.approvedText')}
        </Alert>
      ) : (
        <>
          <p>{t('review.approval.intro')}</p>
          <ul className="approval-checklist">
            {CONDITIONS.map(({ blocker, key }) => {
              const met = !eligibility.blockers.includes(blocker)
              return (
                <li key={key} className={met ? 'is-met' : 'is-unmet'}>
                  <Icon name={met ? 'checkCircle' : 'alertCircle'} size={18} />
                  <span>
                    {t(`review.approval.conditions.${key}`, { reviewed: formatNumber(eligibility.reviewedCount), total: formatNumber(eligibility.totalPages) })}
                  </span>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="button button--primary"
            disabled={!eligibility.eligible || isBusy}
            aria-describedby="approval-note"
            onClick={() => run(onApprove, 'approved')}
          >
            <Icon name="lock" />
            {t('review.approval.action')}
          </button>
          <p id="approval-note" className="approval-panel__note">
            {t('review.approval.noBackend')}
          </p>
        </>
      )}

      {isApproved && (
        <div className="approval-panel__version">
          {canCreateNewVersion ? (
            <button type="button" className="button button--secondary" disabled={isBusy} onClick={() => run(onNewVersion, 'versionCreated')}>
              <Icon name="refresh" />
              {t('review.approval.newVersion')}
            </button>
          ) : (
            <p className="approval-panel__note">{t('review.approval.adminOnly', { role: t(`roles.${role}`) })}</p>
          )}
        </div>
      )}

      {notice && (
        <Alert tone={notice.tone} title={t(`review.approval.notice.${notice.key}.title`)} onDismiss={() => setNotice(null)} dismissLabel={t('review.errors.dismiss')}>
          {t(`review.approval.notice.${notice.key}.text`)}
        </Alert>
      )}
    </section>
  )
}
