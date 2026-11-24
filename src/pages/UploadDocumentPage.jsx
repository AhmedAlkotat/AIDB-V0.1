import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { DocumentDropZone } from '../components/upload/DocumentDropZone.jsx'
import { DocumentPreview } from '../components/upload/DocumentPreview.jsx'
import { FileInfoPanel } from '../components/upload/FileInfoPanel.jsx'
import { PageSelectionPanel } from '../components/upload/PageSelectionPanel.jsx'
import { MAX_FILES_PER_UPLOAD, MAX_UPLOAD_SIZE_BYTES, SUPPORTED_FORMAT_NAMES } from '../constants/upload.js'
import { useFileSizeFormatter } from '../hooks/useFileSizeFormatter.js'
import { useObjectUrl } from '../hooks/useObjectUrl.js'
import { PDF_PAGE_COUNT_STATUS, usePdfPageCount } from '../hooks/usePdfPageCount.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { documentStore } from '../services/documentStore.js'
import { reviewPath } from '../routes/paths.js'
import { createReviewDocumentFromRequest } from '../services/reviewDocuments.js'
import {
  createProcessingRequest,
  ProcessingNotConnectedError,
  submitDocumentForProcessing,
} from '../services/documentProcessingService.js'
import { FILE_ERROR, validateDocumentFile } from '../utils/documentFile.js'
import { getAllPages, PAGE_SELECTION_MODE, parsePageSelection } from '../utils/pageSelection.js'

// Why "Start processing" is disabled (maps to upload.actions.blocked.*).
function getStartBlockReason(selected, pdf, selectedPages) {
  if (!selected) return 'noFile'
  if (selected.type.kind !== 'pdf') return null
  if (pdf.status === PDF_PAGE_COUNT_STATUS.loading) return 'readingPdf'
  if (pdf.status !== PDF_PAGE_COUNT_STATUS.ready) return 'pdfError'
  if (!selectedPages) return 'pageSelection'
  return null
}

// Upload Document page (Phase 2): select one document, validate and preview
// it locally. The file lives only in component state (browser memory); it is
// not uploaded or stored, and AI processing is not connected yet.
// For PDFs the page count is read locally (PDF.js) and the user can choose
// all pages or specific pages; the original file is always kept whole and
// the selected page numbers are passed separately in the request.
//
// Desktop layout: controls column (~35%) at the inline start, preview (~65%)
// at the inline end — i.e. controls right / preview left in Arabic (RTL),
// mirrored in English (LTR). Tablet and mobile: single column.
export default function UploadDocumentPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
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
  // 'notConnected' | 'failed' | null
  const [processingNotice, setProcessingNotice] = useState(null)
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

  const startBlockReason = getStartBlockReason(selected, pdf, selectedPages)
  const canStart = !startBlockReason && !isSubmitting

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
    if (files.length > MAX_FILES_PER_UPLOAD) {
      setError({ code: FILE_ERROR.multiple })
      return
    }

    const [file] = files
    const result = validateDocumentFile(file)
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
      await submitDocumentForProcessing(request)
    } catch (submitError) {
      setProcessingNotice(submitError instanceof ProcessingNotConnectedError ? 'notConnected' : 'failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Opens the selected document in the review page with MOCK processing (there is
  // no real AI yet). The request is the same one "Start processing" builds; the
  // document stays in this browser tab's memory only.
  function handleOpenMockReview() {
    if (!canStart) return
    const request = createProcessingRequest({
      file: selected.file,
      documentKind: selected.type.kind,
      totalPages,
      mode: isPdf ? pageMode : PAGE_SELECTION_MODE.all,
      pages: selectedPages,
    })
    navigate(reviewPath(createReviewDocumentFromRequest(documentStore, request)))
  }

  function getErrorMessage() {
    const formats = SUPPORTED_FORMAT_NAMES.join(t('upload.listSeparator'))
    return t(`upload.errors.${error.code}`, {
      name: error.fileName ?? '',
      size: error.fileSize === undefined ? '' : formatFileSize(error.fileSize),
      max: formatFileSize(MAX_UPLOAD_SIZE_BYTES),
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

  const processingActions = (
    <div className="upload-actions">
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
          {startBlockReason === 'noFile' ? t('upload.actions.startHint') : t(`upload.actions.blocked.${startBlockReason}`)}
        </p>
      )}
      {selected && (
        <>
          <button type="button" className="button button--secondary upload-actions__start" disabled={!canStart} onClick={handleOpenMockReview}>
            <Icon name="fileText" />
            {t('upload.actions.mockReview')}
          </button>
          <p className="upload-actions__hint">{t('upload.actions.mockReviewHint')}</p>
        </>
      )}

      {processingNotice === 'notConnected' && (
        <Alert tone="warning" title={t('upload.processing.notConnectedTitle')}>
          {t('upload.processing.notConnectedText')}
        </Alert>
      )}
      {processingNotice === 'failed' && (
        <Alert tone="error" title={t('upload.processing.failedTitle')}>
          {t('upload.processing.failedText')}
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
                  />
                )}
                {processingActions}
              </FileInfoPanel>
              {errorAlert}
              <section className="card upload-card upload-card--compact" aria-label={t('upload.dropzone.ariaLabel')}>
                <DocumentDropZone compact inputRef={inputRef} onFilesSelected={handleFilesSelected} />
              </section>
            </>
          ) : (
            <>
              <section className="card upload-card" aria-label={t('upload.dropzone.ariaLabel')}>
                <DocumentDropZone
                  inputRef={inputRef}
                  browseButtonRef={browseButtonRef}
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

      <p className="visually-hidden" role="status">
        {selected ? t('upload.file.selectedAnnouncement', { name: selected.file.name }) : ''}
      </p>
    </div>
  )
}
