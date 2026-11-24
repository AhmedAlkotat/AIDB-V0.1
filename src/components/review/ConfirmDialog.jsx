import { useEffect, useId, useRef } from 'react'

// Modal confirmation built on the native <dialog> (focus trap, Escape and focus
// restore come from the browser), the same approach as the document preview.
// `onCancel` runs for the cancel button, Escape and a click on the backdrop.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel()
      }}
    >
      {open && (
        <div className="confirm-dialog__inner">
          <h2 id={titleId} className="confirm-dialog__title">
            {title}
          </h2>
          <div className="confirm-dialog__body">{children}</div>
          <div className="confirm-dialog__actions">
            {onConfirm && (
              <button
                type="button"
                className={`button ${tone === 'danger' ? 'button--danger' : 'button--primary'}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            )}
            <button type="button" className="button button--secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
