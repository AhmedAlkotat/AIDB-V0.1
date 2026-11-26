import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'
import { Icon } from '../common/Icon.jsx'

// The document's edit lock (decision 47) as the reviewer sees it. ONE editor at a time: everybody else may
// only view, with a clear notice saying who is editing. When the lock ends (the user finished, was idle, or
// the lease expired) whatever was SAVED stays; unsaved text could not be stored while another user held the
// lock, and the notice says that too.
//
//   held       this user may edit: a short note says so
//   readOnly   someone else is editing: the document is view-only
//   lost       this user's own lock ended (expired / taken): view-only until it is taken again
//   available  the other editor left: "Start editing" takes the lock
//   checking   the lock is being requested
//
// `lock` is the session's view of it (null when the lock is not used); `hasUnsaved` says that changes made
// under the lock could not be saved yet.
export function LockBanner({ lock, isApproved, hasUnsaved, onRequest }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  if (!lock || isApproved) return null

  async function request() {
    setBusy(true)
    await onRequest()
    setBusy(false)
  }

  const takeButton = (
    <button type="button" className="button button--secondary button--sm" disabled={busy} onClick={request}>
      <Icon name="lock" size={16} />
      {t('review.lock.start')}
    </button>
  )

  switch (lock.status) {
    case 'held':
      return (
        <p className="lock-note" role="status" data-lock="held">
          <Icon name="lock" size={16} />
          {t('review.lock.held')}
        </p>
      )
    case 'readOnly':
      return (
        <Alert tone="warning" title={t('review.lock.readOnlyTitle')}>
          <div data-lock="readOnly">
            <p>{t('review.lock.readOnlyText', { name: lock.holderName ?? t('review.lock.someone') })}</p>
            <p>{t('review.lock.readOnlyHint')}</p>
          </div>
        </Alert>
      )
    case 'lost':
      return (
        <Alert tone="warning" title={t('review.lock.lostTitle')}>
          <div data-lock="lost">
            <p>{t('review.lock.lostText')}</p>
            {hasUnsaved && <p>{t('review.lock.lostUnsaved')}</p>}
            <p>{takeButton}</p>
          </div>
        </Alert>
      )
    case 'available':
      return (
        <Alert tone="info" title={t('review.lock.availableTitle')}>
          <div data-lock="available">
            <p>{t('review.lock.availableText')}</p>
            <p>{takeButton}</p>
          </div>
        </Alert>
      )
    default:
      return (
        <p className="lock-note" role="status" data-lock="checking">
          <span className="spinner" aria-hidden="true" />
          {t('review.lock.checking')}
        </p>
      )
  }
}
