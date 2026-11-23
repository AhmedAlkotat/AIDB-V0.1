import { useId, useState } from 'react'
import { PDF_PAGE_COUNT_STATUS } from '../../hooks/usePdfPageCount.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { formatNumber } from '../../i18n/translations.js'
import { PDF_METADATA_ERROR } from '../../services/pdfMetadataService.js'
import { formatPageRanges, PAGE_SELECTION_MODE } from '../../utils/pageSelection.js'
import { Alert } from '../common/Alert.jsx'
import { Icon } from '../common/Icon.jsx'

// Page selection for a PDF: shows the PDF reading state, then lets the user
// process all pages (default) or only the pages typed in a ranges field
// ("1-3, 5"). Selection state is owned by the parent (it builds the
// processing request); render with `key` per file so local state resets.
//
// Props:
// - pdf: { status, pageCount, errorCode, retry } from usePdfPageCount
// - mode / onModeChange: PAGE_SELECTION_MODE value
// - rangeInput / onRangeInputChange: the typed text
// - selection: result of parsePageSelection (null in "all" mode)
// - selectedPages: the pages that will be processed, or null if invalid
export function PageSelectionPanel({
  pdf,
  mode,
  onModeChange,
  rangeInput,
  onRangeInputChange,
  selection,
  selectedPages,
}) {
  const { t, language } = useTranslation()
  const baseId = useId()
  const headingId = `${baseId}-heading`
  const inputId = `${baseId}-input`
  const hintId = `${baseId}-hint`
  const errorId = `${baseId}-error`
  // Errors appear once the user leaves the field, then update live.
  const [isTouched, setIsTouched] = useState(false)

  const number = (value) => formatNumber(value, language)

  function renderStatus() {
    if (pdf.status === PDF_PAGE_COUNT_STATUS.loading) {
      return (
        <p className="page-selection__loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {t('upload.pages.loading')}
        </p>
      )
    }

    const code = pdf.errorCode ?? PDF_METADATA_ERROR.failed
    return (
      <Alert tone="error" title={t(`upload.pages.errors.${code}Title`)}>
        <p>{t(`upload.pages.errors.${code}Text`)}</p>
        {code === PDF_METADATA_ERROR.failed && (
          <button type="button" className="button button--secondary button--sm page-selection__retry" onClick={pdf.retry}>
            <Icon name="refresh" size={18} />
            {t('upload.pages.retry')}
          </button>
        )}
      </Alert>
    )
  }

  if (pdf.status !== PDF_PAGE_COUNT_STATUS.ready) {
    return (
      <section className="page-selection" aria-labelledby={headingId}>
        <h4 id={headingId} className="page-selection__heading">
          {t('upload.pages.heading')}
        </h4>
        {renderStatus()}
      </section>
    )
  }

  const totalPages = pdf.pageCount
  const isSelectedMode = mode === PAGE_SELECTION_MODE.selected
  const showError = isSelectedMode && isTouched && selection && !selection.ok
  const errorText = showError
    ? t(`upload.pages.selectionErrors.${selection.error}`, {
        page: selection.page === undefined ? '' : number(selection.page),
        token: selection.token ?? '',
        total: number(totalPages),
      })
    : ''

  let summary
  if (selectedPages) {
    summary = t('upload.pages.summary', { selected: number(selectedPages.length), total: number(totalPages) })
    if (isSelectedMode) {
      summary += ` (${formatPageRanges(selectedPages, { formatNumber: number, separator: t('upload.listSeparator') })})`
    }
  } else {
    summary = t('upload.pages.summaryNone', { total: number(totalPages) })
  }

  return (
    <section className="page-selection" aria-labelledby={headingId}>
      <h4 id={headingId} className="page-selection__heading">
        {t('upload.pages.heading')}
      </h4>

      <fieldset className="page-selection__modes">
        <legend className="visually-hidden">{t('upload.pages.modeLegend')}</legend>
        <label className="page-selection__option">
          <input
            type="radio"
            name={`${baseId}-mode`}
            value={PAGE_SELECTION_MODE.all}
            checked={!isSelectedMode}
            onChange={() => onModeChange(PAGE_SELECTION_MODE.all)}
          />
          <span>{t('upload.pages.modeAll', { total: number(totalPages) })}</span>
        </label>
        <label className="page-selection__option">
          <input
            type="radio"
            name={`${baseId}-mode`}
            value={PAGE_SELECTION_MODE.selected}
            checked={isSelectedMode}
            onChange={() => onModeChange(PAGE_SELECTION_MODE.selected)}
          />
          <span>{t('upload.pages.modeSelected')}</span>
        </label>
      </fieldset>

      {isSelectedMode && (
        <div className="page-selection__range">
          <label htmlFor={inputId} className="page-selection__label">
            {t('upload.pages.rangeLabel')}
          </label>
          <input
            id={inputId}
            type="text"
            className={`page-selection__input${showError ? ' is-invalid' : ''}`}
            value={rangeInput}
            placeholder={t('upload.pages.rangePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={showError ? 'true' : undefined}
            aria-describedby={showError ? `${hintId} ${errorId}` : hintId}
            onChange={(event) => onRangeInputChange(event.target.value)}
            onBlur={() => setIsTouched(true)}
          />
          <p id={hintId} className="page-selection__hint">
            {t('upload.pages.rangeHint', { total: number(totalPages) })}
          </p>
          <p id={errorId} className="page-selection__error" aria-live="polite">
            {showError && (
              <>
                <Icon name="alertCircle" size={16} />
                {errorText}
              </>
            )}
          </p>
        </div>
      )}

      <p className="page-selection__summary" aria-live="polite">
        {summary}
      </p>
    </section>
  )
}
