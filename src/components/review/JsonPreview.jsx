import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { serializeDocumentPage } from '../../domain/document/serialization.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'

// Read-only JSON of the CURRENT page, generated from the same canonical
// document the editor changes. It has no state of its own (only open/closed and
// the copy feedback): it is recomputed from the document, so it always matches
// the editor and can never be edited or drift. It is only computed while it is open.
//
// Copying reports success ONLY after the clipboard accepted the text; when it
// refuses (no permission, an insecure page, an unsupported browser) a visible
// error is shown instead.
export function JsonPreview({ document, pageNumber }) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  // Feedback of the last copy attempt; it only counts for the page that was copied.
  const [copyResult, setCopyResult] = useState({ state: 'idle', pageNumber })
  const copyState = copyResult.pageNumber === pageNumber ? copyResult.state : 'idle' // idle | copied | failed
  const setCopyState = (state) => setCopyResult({ state, pageNumber })
  const resetTimer = useRef(null)
  const panelId = useId()

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const json = useMemo(
    () => (isOpen ? JSON.stringify(serializeDocumentPage(document, pageNumber), null, 2) : ''),
    [isOpen, document, pageNumber],
  )

  async function copy() {
    clearTimeout(resetTimer.current)
    try {
      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
        throw new Error('The clipboard is not available.')
      }
      await navigator.clipboard.writeText(json)
      setCopyState('copied')
      resetTimer.current = setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <section className="json-preview">
      <button
        type="button"
        className="json-preview__toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          setCopyState('idle')
          setIsOpen((open) => !open)
        }}
      >
        <Icon name="code" size={18} />
        {isOpen ? t('review.json.hide') : t('review.json.show')}
        <span className="badge badge--neutral">{t('review.json.readOnly')}</span>
      </button>
      {isOpen && (
        <div id={panelId} className="json-preview__panel">
          <p className="json-preview__note">{t('review.json.note')}</p>
          <div className="json-preview__actions">
            <button type="button" className="button button--secondary button--sm" onClick={copy}>
              <Icon name="copy" size={16} />
              {copyState === 'copied' ? t('review.json.copied') : t('review.json.copy')}
            </button>
          </div>
          {copyState === 'failed' && (
            <p className="json-preview__error" role="alert">
              {t('review.json.copyFailed')}
            </p>
          )}
          <pre className="json-preview__code" dir="ltr" tabIndex={0} aria-label={t('review.json.label')}>
            {json}
          </pre>
        </div>
      )}
    </section>
  )
}
