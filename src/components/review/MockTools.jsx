import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { documentService } from '../../services/documentService.js'
import { editLockService } from '../../services/editLockService.js'
import { mockProcessingService } from '../../services/mockProcessingService.js'

// DEVELOPMENT-ONLY helpers to try the failure paths by hand. They only exist in
// the development build and only act on the mock services; real services would
// have nothing like them. With the lock simulation (decision 47) the document's edit lock can be taken by a
// pretend colleague, released, or expired.
export function MockTools({ pageNumber, documentId }) {
  const { t, formatNumber } = useTranslation()
  // The simulated server's store (only the development simulation has the failure switch).
  const store = documentService.getSessionStore(documentId)
  const [failSaves, setFailSaves] = useState(store.isSimulatingFailure?.() ?? false)
  const lockDev = editLockService.dev

  return (
    <details className="card mock-tools">
      <summary>{t('review.mockTools.title')}</summary>
      <p>{t('review.mockTools.note')}</p>
      <div className="mock-tools__actions">
        <label className="mock-tools__toggle">
          <input
            type="checkbox"
            checked={failSaves}
            onChange={(event) => {
              setFailSaves(event.target.checked)
              store.setSimulatedFailure?.(event.target.checked)
            }}
          />
          {t('review.mockTools.failSaves')}
        </label>
        <button type="button" className="button button--secondary button--sm" onClick={() => mockProcessingService.forceFailure(pageNumber, 1)}>
          {t('review.mockTools.failNext', { page: formatNumber(pageNumber) })}
        </button>
        {lockDev && (
          <>
            <button type="button" className="button button--secondary button--sm" data-dev="other-editor" onClick={() => lockDev.simulateOtherEditor(documentId)}>
              {t('review.mockTools.otherEditor')}
            </button>
            <button type="button" className="button button--secondary button--sm" data-dev="other-leaves" onClick={() => lockDev.releaseOtherEditor(documentId)}>
              {t('review.mockTools.otherLeaves')}
            </button>
            <button type="button" className="button button--secondary button--sm" data-dev="expire-lock" onClick={() => lockDev.expire(documentId)}>
              {t('review.mockTools.expireLock')}
            </button>
          </>
        )}
      </div>
    </details>
  )
}
