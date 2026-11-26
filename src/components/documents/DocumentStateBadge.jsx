import { STATE_TONE } from '../../domain/document/lifecycle.js'
import { useTranslation } from '../../hooks/useTranslation.js'

// The lifecycle state of a document (decision 12) as one badge: Pending, Processing, Ready for Review,
// Failed, Manual Editing or Approved. The state itself is derived in domain/document/lifecycle.js.
export function DocumentStateBadge({ state }) {
  const { t } = useTranslation()
  return <span className={`badge badge--${STATE_TONE[state] ?? 'neutral'}`}>{t(`documents.state.${state}`)}</span>
}
