import { useState } from 'react'
import { APPROVAL_BLOCKER } from '../../domain/document/approval.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'
import { Icon } from '../common/Icon.jsx'
import { ConfirmDialog } from './ConfirmDialog.jsx'

const CONDITIONS = [
  { blocker: APPROVAL_BLOCKER.pagesNotReviewed, key: 'pages' },
  { blocker: APPROVAL_BLOCKER.unsavedChanges, key: 'saved' },
  { blocker: APPROVAL_BLOCKER.processingActive, key: 'processing' },
  { blocker: APPROVAL_BLOCKER.noPermission, key: 'permission' },
  { blocker: APPROVAL_BLOCKER.editLock, key: 'lock' },
]

// Which notice a refused or failed request gets (review.approval.notice.*).
function noticeFor(code) {
  switch (code) {
    case 'APPROVAL_NOT_CONNECTED':
    case 'notConnected':
      return 'notConnected'
    case 'forbidden':
    case 'NO_PERMISSION':
      return 'forbidden'
    case 'lockHeld':
    case 'lockLost':
    case 'LOCK_NOT_HELD':
      return 'lock'
    case 'notEligible':
    case 'NOT_ELIGIBLE':
      return 'notEligible'
    default:
      return 'refused'
  }
}

// Document approval (decisions 6, 14, 39). Approving the WHOLE document is explicit: the button opens a
// confirmation that says what approval means, and nothing is approved automatically (decision 6); saving a
// draft never approves. The checklist is real (computed from the review): every selected page reviewed, all
// changes saved, nothing processing, the user may approve (an employee: own documents; the Admin: any,
// decision 39) and holds the document's edit lock (decision 47). The server checks all of it again.
//
// An approved document is read-only for everyone, the owner included; only the Admin may start a NEW editable
// version, which keeps the previous approved version and needs its own approval (decision 14). Approval and
// versions are SIMULATED until a backend records them; the panel says so and never claims success the service
// did not acknowledge.
export function ApprovalPanel({ eligibility, isApproved, canCreateNewVersion, role, isApprovalPending, onApprove, onNewVersion, onExport }) {
  const { t, formatNumber } = useTranslation()
  const [notice, setNotice] = useState(null) // { tone, key }
  const [isBusy, setIsBusy] = useState(false)
  const [dialog, setDialog] = useState(null) // 'approve' | 'newVersion'

  async function run(action, successKey) {
    setDialog(null)
    setIsBusy(true)
    const result = await action()
    setIsBusy(false)
    if (result.ok) setNotice({ tone: 'success', key: successKey })
    else setNotice({ tone: 'warning', key: noticeFor(result.code) })
  }

  const busy = isBusy || isApprovalPending

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
                <li key={key} className={met ? 'is-met' : 'is-unmet'} data-condition={key}>
                  <Icon name={met ? 'checkCircle' : 'alertCircle'} size={18} />
                  <span>{t(`review.approval.conditions.${key}`, { reviewed: formatNumber(eligibility.reviewedCount), total: formatNumber(eligibility.totalPages) })}</span>
                </li>
              )
            })}
          </ul>
          <button type="button" className="button button--primary" disabled={!eligibility.eligible || busy} aria-describedby="approval-note" onClick={() => setDialog('approve')}>
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
            <button type="button" className="button button--secondary" data-action="new-version" disabled={busy} onClick={() => setDialog('newVersion')}>
              <Icon name="refresh" />
              {t('review.approval.newVersion')}
            </button>
          ) : (
            <p className="approval-panel__note">{t('review.approval.adminOnly', { role: t(`roles.${role}`) })}</p>
          )}
          {onExport && (
            <button type="button" className="button button--secondary" onClick={onExport}>
              <Icon name="download" />
              {t('documents.actions.export')}
            </button>
          )}
        </div>
      )}

      {notice && (
        <Alert tone={notice.tone} title={t(`review.approval.notice.${notice.key}.title`)} onDismiss={() => setNotice(null)} dismissLabel={t('review.errors.dismiss')}>
          {t(`review.approval.notice.${notice.key}.text`)}
        </Alert>
      )}

      <ConfirmDialog
        open={dialog === 'approve'}
        title={t('review.approval.confirm.title')}
        confirmLabel={t('review.approval.confirm.approve')}
        cancelLabel={t('review.confirm.cancel')}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(onApprove, 'approved')}
      >
        <p>{t('review.approval.confirm.text', { reviewed: formatNumber(eligibility.reviewedCount), total: formatNumber(eligibility.totalPages) })}</p>
        <ul className="confirm-list">
          <li>{t('review.approval.confirm.readOnly')}</li>
          <li>{t('review.approval.confirm.archive')}</li>
          <li>{t('review.approval.confirm.adminOnlyVersion')}</li>
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'newVersion'}
        title={t('review.approval.confirm.versionTitle')}
        confirmLabel={t('review.approval.confirm.versionCreate')}
        cancelLabel={t('review.confirm.cancel')}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(onNewVersion, 'versionCreated')}
      >
        <p>{t('review.approval.confirm.versionText')}</p>
      </ConfirmDialog>
    </section>
  )
}
