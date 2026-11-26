import { useEffect, useId, useRef, useState } from 'react'
import { FILE_INPUT_ACCEPT, SUPPORTED_FORMAT_NAMES } from '../../constants/upload.js'
import { useFileSizeFormatter } from '../../hooks/useFileSizeFormatter.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

// Drag-and-drop area with a "browse" button. Reports the raw FileList via
// `onFilesSelected`; validation is the caller's responsibility.
// `inputRef` / `browseButtonRef` let the parent open the picker (e.g. for
// "Replace") and move focus back here after the file is removed.
// `compact` renders a slim "drop here to replace" strip without the browse
// button (used once a document is selected; the panel has a Replace button).
// `maxFileSizeBytes` is the Admin's limit (decision 36), shown in the hint when it is known.
export function DocumentDropZone({ inputRef, browseButtonRef, compact = false, maxFileSizeBytes = null, onFilesSelected }) {
  const { t } = useTranslation()
  const formatFileSize = useFileSizeFormatter()
  const [isDragActive, setIsDragActive] = useState(false)
  const dragDepth = useRef(0)
  const hintId = useId()

  // Stop the browser from opening a file dropped outside the zone, which
  // would navigate away from the app.
  useEffect(() => {
    function preventFileNavigation(event) {
      if (isFileDrag(event)) event.preventDefault()
    }
    window.addEventListener('dragover', preventFileNavigation)
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventFileNavigation)
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  function openFilePicker() {
    inputRef.current?.click()
  }

  function handleDragEnter(event) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setIsDragActive(true)
  }

  function handleDragOver(event) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event) {
    if (!isFileDrag(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragActive(false)
  }

  function handleDrop(event) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setIsDragActive(false)
    onFilesSelected(event.dataTransfer.files)
  }

  function handleInputChange(event) {
    onFilesSelected(event.target.files)
    // Reset so choosing the same file again still fires `change`.
    event.target.value = ''
  }

  let title = t('upload.dropzone.title')
  if (isDragActive) title = t('upload.dropzone.titleActive')
  else if (compact) title = t('upload.dropzone.titleReplace')

  return (
    <div
      className={`dropzone${isDragActive ? ' is-drag-active' : ''}${compact ? ' is-compact' : ''}`}
      onClick={openFilePicker}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="dropzone__icon">
        <Icon name="upload" size={compact ? 20 : 30} />
      </span>
      <div className="dropzone__text">
        <p className="dropzone__title" aria-live="polite">
          {title}
        </p>
        {!compact && <p className="dropzone__or">{t('upload.dropzone.or')}</p>}
        {!compact && (
          <button
            ref={browseButtonRef}
            type="button"
            className="button button--secondary"
            aria-describedby={hintId}
            onClick={(event) => {
              event.stopPropagation()
              openFilePicker()
            }}
          >
            <Icon name="fileText" />
            {t('upload.dropzone.browse')}
          </button>
        )}
        <p id={hintId} className="dropzone__hint">
          {Number.isFinite(maxFileSizeBytes)
            ? t('upload.dropzone.hint', { formats: SUPPORTED_FORMAT_NAMES.join(t('upload.listSeparator')), max: formatFileSize(maxFileSizeBytes) })
            : t('upload.dropzone.hintNoLimit', { formats: SUPPORTED_FORMAT_NAMES.join(t('upload.listSeparator')) })}
          {!compact && (
            <>
              <br />
              {t('upload.dropzone.single')}
            </>
          )}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        hidden
        tabIndex={-1}
        aria-label={t('upload.dropzone.inputLabel')}
        onChange={handleInputChange}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}
