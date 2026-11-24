import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { documentStore } from '../../services/documentStore.js'
import { mockProcessingService } from '../../services/mockProcessingService.js'

// DEVELOPMENT-ONLY helpers to try the failure paths by hand. They only exist in
// the development build and only act on the mock services; real services would
// have nothing like them.
export function MockTools({ pageNumber }) {
  const { t, formatNumber } = useTranslation()
  const [failSaves, setFailSaves] = useState(documentStore.isSimulatingFailure())

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
              documentStore.setSimulatedFailure(event.target.checked)
            }}
          />
          {t('review.mockTools.failSaves')}
        </label>
        <button type="button" className="button button--secondary button--sm" onClick={() => mockProcessingService.forceFailure(pageNumber, 1)}>
          {t('review.mockTools.failNext', { page: formatNumber(pageNumber) })}
        </button>
      </div>
    </details>
  )
}
