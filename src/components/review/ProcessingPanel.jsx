import { useState } from 'react'
import { getPageUiStatus, PAGE_UI_STATUS } from '../../domain/document/pageStatus.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'
import { Icon } from '../common/Icon.jsx'
import { runAcceptCandidate } from './acceptFlow.js'
import { AcceptCandidateDialog } from './AcceptCandidateDialog.jsx'
import { summarizeElement } from './elementSummary.js'

function ElementColumn({ title, elements: rawElements, otherElements: rawOthers }) {
  const { t } = useTranslation()
  // Candidates are validated before they are kept; this only guards the view.
  const elements = Array.isArray(rawElements) ? rawElements : []
  const otherElements = Array.isArray(rawOthers) ? rawOthers : []
  return (
    <section className="comparison__column" aria-label={title}>
      <h4>{title}</h4>
      {elements.length === 0 ? (
        <p className="comparison__empty">{t('review.processing.comparison.empty')}</p>
      ) : (
        <ol className="comparison__list">
          {elements.map((element, index) => {
            const summary = summarizeElement(element)
            const other = otherElements[index] ? summarizeElement(otherElements[index]) : null
            const differs = !other || other.type !== summary.type || other.text !== summary.text
            return (
              <li key={element?.id ?? index} className={differs ? 'is-different' : ''}>
                <span className="comparison__type">{t(`review.element.types.${summary.type}`)}</span>
                <span className="comparison__text" dir="auto">
                  {summary.text || '—'}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

// Everything about the AI side of a page: its state, the failure message and
// retry, the mock re-extraction, and the comparison that must be decided before
// any existing content is replaced.
//
// The extraction here is a MOCK (clearly labelled): no real AI runs in this phase.
export function ProcessingPanel({ page, isMock, isApproved, notice, candidate, onProcess, onDismissNotice, onAccept, onKeep }) {
  const { t, formatNumber } = useTranslation()
  const [isAcceptOpen, setIsAcceptOpen] = useState(false)
  const [acceptError, setAcceptError] = useState(null)
  const status = getPageUiStatus(page)
  const isRunning = status === PAGE_UI_STATUS.processing
  const canStart = !isApproved && !isRunning

  const mockNote = isMock && <p className="processing__mock">{t('review.processing.mockNote')}</p>

  let body = null
  if (isRunning) {
    body = (
      <p className="processing__running" role="status">
        <span className="spinner" aria-hidden="true" />
        {t('review.processing.running')}
      </p>
    )
  } else if (status === PAGE_UI_STATUS.failed) {
    body = (
      <Alert tone="error" title={t('review.processing.failedTitle')}>
        <p>{t('review.processing.failedText', { code: page.processing.errorCode ?? '—' })}</p>
        {page.processing.errorCode === 'INVALID_EXTRACTION_RESULT' && <p>{t('review.processing.invalidResultFailed')}</p>}
        <p>{t('review.processing.failedManual')}</p>
        {canStart && (
          <button type="button" className="button button--secondary button--sm" onClick={onProcess}>
            <Icon name="refresh" size={16} />
            {t('review.processing.retry')}
          </button>
        )}
      </Alert>
    )
  } else if (status === PAGE_UI_STATUS.manualEditing) {
    body = (
      <Alert tone="warning" title={t('review.processing.manualTitle')}>
        <p>{t(page.processing.status === 'failed' ? 'review.processing.manualAfterFailure' : 'review.processing.manualBeforeProcessing')}</p>
        {canStart && (
          <button type="button" className="button button--secondary button--sm" onClick={onProcess}>
            <Icon name="refresh" size={16} />
            {t('review.processing.reprocess')}
          </button>
        )}
      </Alert>
    )
  } else if (status === PAGE_UI_STATUS.pending) {
    body = (
      <div className="processing__pending">
        <p>{t('review.processing.pending')}</p>
        {canStart && (
          <button type="button" className="button button--secondary button--sm" onClick={onProcess}>
            <Icon name="sparkles" size={16} />
            {t('review.processing.start')}
          </button>
        )}
      </div>
    )
  } else if (canStart && !candidate) {
    body = (
      <button type="button" className="button button--secondary button--sm" onClick={onProcess}>
        <Icon name="refresh" size={16} />
        {t('review.processing.reprocess')}
      </button>
    )
  }

  return (
    <section className="processing" aria-label={t('review.processing.label')}>
      {mockNote}
      {body}
      {notice && (
        <Alert tone="warning" title={t('review.processing.reprocessFailedTitle')} onDismiss={onDismissNotice} dismissLabel={t('review.errors.dismiss')}>
          {notice.errorCode === 'INVALID_EXTRACTION_RESULT'
            ? t('review.processing.invalidResultNotice')
            : t('review.processing.reprocessFailedText')}
        </Alert>
      )}

      {candidate && (
        <section className="comparison card" aria-label={t('review.processing.comparison.title')}>
          <h3>{t('review.processing.comparison.title')}</h3>
          <p>{t('review.processing.comparison.intro', { attempt: formatNumber(candidate.attempt) })}</p>
          <div className="comparison__columns">
            <ElementColumn title={t('review.processing.comparison.current')} elements={page.elements} otherElements={candidate.elements} />
            <ElementColumn title={t('review.processing.comparison.new', { attempt: formatNumber(candidate.attempt) })} elements={candidate.elements} otherElements={page.elements} />
          </div>
          <div className="comparison__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={isApproved || isRunning}
              onClick={() => {
                setAcceptError(null)
                setIsAcceptOpen(true)
              }}
            >
              {t('review.processing.comparison.accept')}
            </button>
            <button type="button" className="button button--secondary" onClick={onKeep}>
              {t('review.processing.comparison.keep')}
            </button>
          </div>
          <AcceptCandidateDialog
            open={isAcceptOpen}
            errorCode={acceptError}
            onCancel={() => {
              setIsAcceptOpen(false)
              setAcceptError(null)
            }}
            onConfirm={() => {
              // A refusal keeps the dialog open and shows why; only success closes it.
              const outcome = runAcceptCandidate(onAccept)
              setAcceptError(outcome.errorCode)
              if (outcome.closeDialog) setIsAcceptOpen(false)
            }}
          />
        </section>
      )}
    </section>
  )
}
