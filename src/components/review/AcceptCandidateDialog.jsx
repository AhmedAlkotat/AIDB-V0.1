import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { getErrorMessageKey } from './errorMessages.js'

// Confirmation before a re-extraction replaces the page content. When accepting
// is refused, `errorCode` is set: the dialog stays open, nothing is replaced and
// the reason is shown (see runAcceptCandidate).
export function AcceptCandidateDialog({ open, errorCode, onConfirm, onCancel }) {
  const { t } = useTranslation()

  return (
    <ConfirmDialog
      open={open}
      title={t('review.processing.accept.title')}
      confirmLabel={t('review.processing.accept.confirm')}
      cancelLabel={t('review.confirm.cancel')}
      tone="danger"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {errorCode && (
        <Alert tone="error" title={t('review.processing.accept.failedTitle')}>
          <p>{t(getErrorMessageKey(errorCode))}</p>
          {errorCode !== 'PENDING_EDITS_COMMITTED' && <p>{t('review.processing.accept.failedNote')}</p>}
        </Alert>
      )}
      <p>{t('review.processing.accept.text')}</p>
      <ul className="confirm-list">
        <li>{t('review.processing.accept.replaces')}</li>
        <li>{t('review.processing.accept.history')}</li>
        <li>{t('review.processing.accept.review')}</li>
      </ul>
    </ConfirmDialog>
  )
}
