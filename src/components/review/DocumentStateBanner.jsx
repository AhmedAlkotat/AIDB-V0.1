import { useState } from 'react'
import { DOCUMENT_STATE } from '../../domain/document/lifecycle.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'
import { Icon } from '../common/Icon.jsx'
import { workflowErrorMessage } from '../common/workflowErrorMessage.js'
import { failureMessageKey } from '../documents/failureMessage.js'

// What the document's state means for the reviewer (decisions 11 and 12), shown above the editor:
//   Failed          processing could not extract the document: the error, "retry" (no new upload) and the way to
//                   enter the content manually while the original stays on screen
//   Manual Editing  the content is being entered by hand after a failure; "retry" is still possible, and the
//                   result of a retry never replaces what was typed without the user's decision (decision 38)
// Other states need no banner. `onRetry` saves pending work first (the page does that) and resolves to
// { ok } or { ok: false, code }.
export function DocumentStateBanner({ state, failureCode, canRetry, onRetry }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (state !== DOCUMENT_STATE.failed && state !== DOCUMENT_STATE.manualEditing) return null

  async function retry() {
    setBusy(true)
    setError(null)
    const result = await onRetry()
    setBusy(false)
    if (!result.ok) setError(result.code ?? 'unknown')
  }

  return (
    <Alert tone={state === DOCUMENT_STATE.failed ? 'error' : 'warning'} title={t(`review.stateBanner.${state}.title`)}>
      <div data-banner={state}>
        {state === DOCUMENT_STATE.failed && <p>{t(failureMessageKey(failureCode))}</p>}
        <p>{t(`review.stateBanner.${state}.text`)}</p>
        {canRetry && (
          <p>
            <button type="button" className="button button--secondary button--sm" disabled={busy} onClick={retry}>
              <Icon name="refresh" size={16} />
              {t('review.stateBanner.retry')}
            </button>
          </p>
        )}
        {error && <p role="alert">{workflowErrorMessage(t, error)}</p>}
      </div>
    </Alert>
  )
}
