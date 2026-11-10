import { useEffect, useRef, useState } from 'react'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { DocumentDropZone } from '../components/upload/DocumentDropZone.jsx'
import { DocumentPreview } from '../components/upload/DocumentPreview.jsx'
import { FileInfoPanel } from '../components/upload/FileInfoPanel.jsx'
import { MAX_FILES_PER_UPLOAD, MAX_UPLOAD_SIZE_BYTES, SUPPORTED_FORMAT_NAMES } from '../constants/upload.js'
import { useFileSizeFormatter } from '../hooks/useFileSizeFormatter.js'
import { useObjectUrl } from '../hooks/useObjectUrl.js'
import { useTranslation } from '../hooks/useTranslation.js'
import {
  ProcessingNotConnectedError,
  submitDocumentForProcessing,
} from '../services/documentProcessingService.js'
import { FILE_ERROR, validateDocumentFile } from '../utils/documentFile.js'

// Upload Document page (Phase 2): select one document, validate and preview
// it locally. The file lives only in component state (browser memory); it is
// not uploaded or stored, and AI processing is not connected yet.
//
// Desktop layout: controls column (~35%) at the inline start, preview (~65%)
// at the inline end — i.e. controls right / preview left in Arabic (RTL),
// mirrored in English (LTR). Tablet and mobile: single column.
export default function UploadDocumentPage() {
  const { t } = useTranslation()
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
    // Revokes the previous preview URL (if replacing) before creating a new one.
    setSelected({ file, type: result.type, previewUrl: createObjectUrl(file) })
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
  }

  async function handleStartProcessing() {
    if (!selected || isSubmitting) return
    setIsSubmitting(true)
    setProcessingNotice(null)
    try {
      await submitDocumentForProcessing(selected.file)
    } catch (submitError) {
      setProcessingNotice(submitError instanceof ProcessingNotConnectedError ? 'notConnected' : 'failed')
    } finally {
      setIsSubmitting(false)
    }
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
        disabled={!selected || isSubmitting}
        aria-describedby={selected ? undefined : 'start-processing-hint'}
        onClick={handleStartProcessing}
      >
        <Icon name="sparkles" />
        {isSubmitting ? t('upload.actions.starting') : t('upload.actions.start')}
      </button>
      {!selected && (
        <p id="start-processing-hint" className="upload-actions__hint">
          {t('upload.actions.startHint')}
        </p>
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
                onReplace={handleReplace}
                onRemove={handleRemove}
              >
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
