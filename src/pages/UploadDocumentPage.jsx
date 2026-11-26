import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { workflowErrorMessage } from '../components/common/workflowErrorMessage.js'
import { DocumentDropZone } from '../components/upload/DocumentDropZone.jsx'
import { DocumentPreview } from '../components/upload/DocumentPreview.jsx'
import { FileInfoPanel } from '../components/upload/FileInfoPanel.jsx'
import { PageSelectionPanel } from '../components/upload/PageSelectionPanel.jsx'
import { UploadSimulationPanel } from '../components/upload/UploadSimulationPanel.jsx'
import { MAX_FILES_PER_UPLOAD, SUPPORTED_FORMAT_NAMES } from '../constants/upload.js'
import { useFileSizeFormatter } from '../hooks/useFileSizeFormatter.js'
import { useObjectUrl } from '../hooks/useObjectUrl.js'
import { PDF_PAGE_COUNT_STATUS, usePdfPageCount } from '../hooks/usePdfPageCount.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { useUploadLimits } from '../hooks/useUploadLimits.js'
import { ROUTES } from '../routes/paths.js'
import { createProcessingRequest } from '../services/documentProcessingService.js'
import { documentWorkflowService } from '../services/documentWorkflowService.js'
import { settingsService } from '../services/settingsService.js'
import { FILE_ERROR, validateDocumentFile } from '../utils/documentFile.js'
import { getAllPages, PAGE_SELECTION_MODE, parsePageSelection } from '../utils/pageSelection.js'
import { checkFileSize, checkSelectedPageCount, mbToBytes } from '../utils/uploadLimits.js'

// Why "Start processing" is disabled (maps to upload.actions.blocked.*).
function getStartBlockReason({ selected, pdf, selectedPages, limits, availability, fileLimit, pageLimit }) {
  if (!selected) return 'noFile'
  if (limits.status === 'loading') return 'limitsLoading'
  if (limits.status === 'error') return 'limitsError'
  if (fileLimit) return 'fileTooLarge'
  if (selected.type.kind === 'pdf') {
    if (pdf.status === PDF_PAGE_COUNT_STATUS.loading) return 'readingPdf'
    if (pdf.status !== PDF_PAGE_COUNT_STATUS.ready) return 'pdfError'
    if (!selectedPages) return 'pageSelection'
  }
  if (pageLimit) return 'pageLimit'
  if (availability?.reason === 'storageFull') return 'storageFull'
  return null
}

// Upload Document page: choose one document, check it against the Admin's limits and preview it, all LOCALLY
// (decision 41): the file lives only in component state (browser memory) until the user clicks "Start
// processing". Only then is the document registered (the server checks the file, the size, the pages and the
// space, stores it as Pending and queues it, decisions 35, 36, 41, 48) and the work goes on in the
// background even if the browser is closed or the user leaves (decision 2): there is NO automatic redirect.
// The maximum file size and the maximum number of selected pages are read from the system settings
// (decisions 36 and 48), never hard-coded.
// For PDFs the page count is read locally (PDF.js) and the user can choose all pages or specific pages; the
// original file is always kept whole and the selected page numbers are passed separately in the request
// (unselected pages are not failures, decision 37).
//
// Desktop layout: controls column (~35%) at the inline start, preview (~65%)
// at the inline end — i.e. controls right / preview left in Arabic (RTL),
// mirrored in English (LTR). Tablet and mobile: single column.
export default function UploadDocumentPage({ workflow = documentWorkflowService, settings = settingsService }) {
  const { t, formatNumber } = useTranslation()
  const limits = useUploadLimits({ service: settings })
  const [availability, setAvailability] = useState(null) // { available, reason } from the server
  const formatFileSize = useFileSizeFormatter()
  const { createObjectUrl, revokeObjectUrl } = useObjectUrl()
  const inputRef = useRef(null)
  const browseButtonRef = useRef(null)
  const focusBrowseAfterRemove = useRef(false)

  // { file, type, previewUrl } where `type` is an entry of
  // ACCEPTED_DOCUMENT_TYPES and `previewUrl` a temporary object URL.
  const [selected, setSelected] = useState(null)
  // { code, fileName?, fileSize? } — translated at render time so the text
  // follows language changes.
  const [error, setError] = useState(null)
  // { code } of a refused or failed registration, or null
  const [processingNotice, setProcessingNotice] = useState(null)
  // { documentId, name, queuePosition } once the document was registered
  const [registered, setRegistered] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Page selection (PDF only). Reset whenever the file changes.
  const [pageMode, setPageMode] = useState(PAGE_SELECTION_MODE.all)
  const [pageRangeInput, setPageRangeInput] = useState('')

  const isPdf = selected?.type.kind === 'pdf'
  const pdf = usePdfPageCount(isPdf ? selected.file : null)

  // Images are single-page documents.
  let totalPages = null
  if (selected && !isPdf) totalPages = 1
  else if (pdf.status === PDF_PAGE_COUNT_STATUS.ready) totalPages = pdf.pageCount

  const pageSelection =
    isPdf && totalPages && pageMode === PAGE_SELECTION_MODE.selected
      ? parsePageSelection(pageRangeInput, totalPages)
      : null
  let selectedPages = null
  if (totalPages) {
    if (pageMode === PAGE_SELECTION_MODE.all || !isPdf) selectedPages = getAllPages(totalPages)
    else if (pageSelection?.ok) selectedPages = pageSelection.pages
  }

  // The Admin's limits (decisions 36 and 48): the same checks the server makes again.
  const fileLimit = selected && limits.limits ? checkFileSize(selected.file.size, limits.limits) : null
  const pageLimit = selectedPages && limits.limits ? checkSelectedPageCount(selectedPages.length, limits.limits) : null
  const maxFileSizeBytes = limits.limits ? mbToBytes(limits.limits.maxFileSizeMb) : null

  const startBlockReason = getStartBlockReason({ selected, pdf, selectedPages, limits, availability, fileLimit, pageLimit })
  const canStart = !startBlockReason && !isSubmitting

  // Whether the server would take an upload right now (decision 35: not when storage is full).
  useEffect(() => {
    let cancelled = false
    workflow.getUploadAvailability().then(
      (answer) => !cancelled && setAvailability(answer),
      () => !cancelled && setAvailability(null),
    )
    return () => {
      cancelled = true
    }
  }, [workflow])

  // After removal the full drop zone (with its browse button) is rendered
  // again; move keyboard focus there once it exists.
  useEffect(() => {
    if (!selected && focusBrowseAfterRemove.current) {
      focusBrowseAfterRemove.current = false
      browseButtonRef.current?.focus()
    }
  }, [selected])

  function handleFilesSelected(fileList) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return

    setProcessingNotice(null)
    setRegistered(null)
    if (files.length > MAX_FILES_PER_UPLOAD) {
      setError({ code: FILE_ERROR.multiple })
      return
    }

    const [file] = files
    const result = validateDocumentFile(file, maxFileSizeBytes ?? undefined)
    if (!result.valid) {
      // Keep any previously selected valid document.
      setError({ code: result.error, fileName: file.name, fileSize: file.size })
      return
    }

    setError(null)
    resetPageSelection()
    // Revokes the previous preview URL (if replacing) before creating a new one.
    setSelected({ file, type: result.type, previewUrl: createObjectUrl(file) })
  }

  function resetPageSelection() {
    setPageMode(PAGE_SELECTION_MODE.all)
    setPageRangeInput('')
  }

  function handlePageModeChange(mode) {
    setPageMode(mode)
    setProcessingNotice(null)
  }

  function handlePageRangeInputChange(value) {
    setPageRangeInput(value)
    setProcessingNotice(null)
  }

  function handleReplace() {
    inputRef.current?.click()
  }

  function handleRemove() {
    revokeObjectUrl()
    focusBrowseAfterRemove.current = true
    setSelected(null)
    setError(null)
    setProcessingNotice(null)
    resetPageSelection()
  }

  // The ONLY place a document leaves the browser (decision 41). Nothing is sent before this click.
  async function handleStartProcessing() {
    if (!canStart) return
    setIsSubmitting(true)
    setProcessingNotice(null)
    try {
      // The complete original file, with the selected pages stored separately.
      const request = createProcessingRequest({
        file: selected.file,
        documentKind: selected.type.kind,
        totalPages,
        mode: isPdf ? pageMode : PAGE_SELECTION_MODE.all,
        pages: selectedPages,
      })
      const result = await workflow.registerDocument(request)
      setRegistered({ documentId: result.documentId, name: selected.file.name, queuePosition: result.queuePosition ?? null })
      // The upload is done: the local selection is cleared. Nothing navigates by itself.
      revokeObjectUrl()
      setSelected(null)
      resetPageSelection()
    } catch (submitError) {
      setProcessingNotice({ code: typeof submitError?.code === 'string' ? submitError.code : 'unknown' })
      // The answer may have changed (e.g. the disk filled up): ask again.
      workflow.getUploadAvailability().then(setAvailability, () => {})
    } finally {
      setIsSubmitting(false)
    }
  }

  function getErrorMessage() {
    const formats = SUPPORTED_FORMAT_NAMES.join(t('upload.listSeparator'))
    return t(`upload.errors.${error.code}`, {
      name: error.fileName ?? '',
      size: error.fileSize === undefined ? '' : formatFileSize(error.fileSize),
      max: maxFileSizeBytes === null ? '' : formatFileSize(maxFileSizeBytes),
      formats,
    })
  }

  const errorAlert = error && (
    <Alert
      tone="error"
      title={t('upload.errors.title')}
      onDismiss={() => setError(null)}
      dismissLabel={t('upload.errors.dismiss')}
    >
      {getErrorMessage()}
    </Alert>
  )

  const blockedHint = {
    fileTooLarge: fileLimit ? t('upload.actions.blocked.fileTooLarge', { max: formatFileSize(maxFileSizeBytes) }) : '',
    pageLimit: pageLimit ? t('upload.pages.limitExceeded', { selected: formatNumber(pageLimit.selected), max: formatNumber(pageLimit.max) }) : '',
  }
  const noticeParams = limits.limits ? { max: processingNotice?.code === 'tooManyPages' ? formatNumber(limits.limits.maxSelectedPages) : formatFileSize(maxFileSizeBytes) } : undefined

  const processingActions = (
    <div className="upload-actions">
      {availability?.reason === 'storageFull' && (
        <Alert tone="error" title={t('workflow.errors.storageFullTitle')}>
          {t('workflow.errors.storageFull')}
        </Alert>
      )}
      {limits.status === 'error' && (
        <Alert tone="error" title={t('upload.limits.errorTitle')}>
          <p>{t('upload.limits.errorText')}</p>
          <button type="button" className="button button--secondary button--sm" onClick={limits.reload}>
            <Icon name="refresh" size={16} />
            {t('common.retry')}
          </button>
        </Alert>
      )}

      <button
        type="button"
        className="button button--primary upload-actions__start"
        disabled={!canStart}
        aria-describedby={startBlockReason ? 'start-processing-hint' : undefined}
        onClick={handleStartProcessing}
      >
        <Icon name="sparkles" />
        {isSubmitting ? t('upload.actions.starting') : t('upload.actions.start')}
      </button>
      {startBlockReason && (
        <p id="start-processing-hint" className="upload-actions__hint">
          {startBlockReason === 'noFile' ? t('upload.actions.startHint') : blockedHint[startBlockReason] || t(`upload.actions.blocked.${startBlockReason}`)}
        </p>
      )}

      {processingNotice?.code === 'notConnected' && (
        <Alert tone="warning" title={t('upload.processing.notConnectedTitle')}>
          {t('upload.processing.notConnectedText')}
        </Alert>
      )}
      {processingNotice && processingNotice.code !== 'notConnected' && (
        <Alert tone="error" title={t('upload.processing.failedTitle')} onDismiss={() => setProcessingNotice(null)}>
          {workflowErrorMessage(t, processingNotice.code, noticeParams)}
        </Alert>
      )}

      {registered && (
        <Alert tone="success" title={t('upload.registered.title')} onDismiss={() => setRegistered(null)}>
          <p dir="auto">{t('upload.registered.text', { name: registered.name })}</p>
          {registered.queuePosition && <p>{t('upload.registered.position', { position: formatNumber(registered.queuePosition) })}</p>}
          <p>{t('upload.registered.background')}</p>
          <p>
            <Link className="inline-link" to={ROUTES.corrections}>
              {t('upload.registered.viewQueue')}
            </Link>
          </p>
        </Alert>
      )}

      <p className="upload-actions__privacy">
        <Icon name="lock" size={16} />
        {t('upload.privacy')}
      </p>
    </div>
  )

  return (
    <div className="page upload-page">
      <section className="card page-intro" aria-labelledby="upload-title">
        <span className="page-intro__icon">
          <Icon name="upload" size={26} />
        </span>
        <div className="page-intro__text">
          <h2 id="upload-title" className="page-intro__title">
            {t('upload.title')}
          </h2>
          <p className="page-intro__description">{t('upload.description')}</p>
        </div>
      </section>

      <div className={`upload-layout${selected ? ' has-file' : ''}`}>
        <div className="upload-layout__side">
          {selected ? (
            <>
              <FileInfoPanel
                file={selected.file}
                documentType={selected.type}
                pageCountStatus={isPdf ? pdf.status : PDF_PAGE_COUNT_STATUS.ready}
                pageCount={totalPages}
                onReplace={handleReplace}
                onRemove={handleRemove}
              >
                {isPdf && (
                  <PageSelectionPanel
                    key={selected.previewUrl}
                    pdf={pdf}
                    mode={pageMode}
                    onModeChange={handlePageModeChange}
                    rangeInput={pageRangeInput}
                    onRangeInputChange={handlePageRangeInputChange}
                    selection={pageSelection}
                    selectedPages={selectedPages}
                    maxSelectedPages={limits.limits?.maxSelectedPages ?? null}
                  />
                )}
                {processingActions}
              </FileInfoPanel>
              {errorAlert}
              <section className="card upload-card upload-card--compact" aria-label={t('upload.dropzone.ariaLabel')}>
                <DocumentDropZone compact inputRef={inputRef} maxFileSizeBytes={maxFileSizeBytes} onFilesSelected={handleFilesSelected} />
              </section>
            </>
          ) : (
            <>
              <section className="card upload-card" aria-label={t('upload.dropzone.ariaLabel')}>
                <DocumentDropZone
                  inputRef={inputRef}
                  browseButtonRef={browseButtonRef}
                  maxFileSizeBytes={maxFileSizeBytes}
                  onFilesSelected={handleFilesSelected}
                />
                <div className="upload-note">
                  <Icon name="sparkles" size={20} />
                  <div>
                    <p className="upload-note__title">{t('upload.autoClassify.title')}</p>
                    <p className="upload-note__text">{t('upload.autoClassify.text')}</p>
                  </div>
                </div>
              </section>
              {errorAlert}
              <section className="card upload-actions-card" aria-label={t('upload.actions.ariaLabel')}>
                {processingActions}
              </section>
            </>
          )}
        </div>

        <div className="upload-layout__preview">
          <DocumentPreview
            key={selected?.previewUrl ?? 'empty'}
            file={selected?.file ?? null}
            kind={selected?.type.kind}
            url={selected?.previewUrl ?? null}
          />
        </div>
      </div>

      {import.meta.env?.DEV && workflow.dev && <UploadSimulationPanel dev={workflow.dev} />}

      <p className="visually-hidden" role="status">
        {selected ? t('upload.file.selectedAnnouncement', { name: selected.file.name }) : ''}
      </p>
    </div>
  )
}
