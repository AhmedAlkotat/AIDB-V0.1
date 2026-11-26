import { useEffect, useId, useRef } from 'react'
import { Alert } from './Alert.jsx'

// Modal dialog with a form (or a plain confirmation), built on the native <dialog> like
// ConfirmDialog (focus trap, Escape). It is MOUNTED only while it is open, so every use
// starts with fresh form state; unmounting closes it and returns focus to what opened it.
//
// `onSubmit` runs for the submit button and Enter; the parent decides what happens next.
// While `busy` the buttons are disabled and Escape / backdrop do not close it.
// `error` is shown as an alert above the buttons. `submitDisabled` keeps the submit button off
// (e.g. until an acknowledgement is ticked); `hideCancel` leaves only the submit button (a result
// the user just closes).
export function FormDialog({ title, children, submitLabel, cancelLabel, tone = 'primary', busy = false, submitDisabled = false, hideCancel = false, error = null, onSubmit, onCancel }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const busyRef = useRef(busy)

  useEffect(() => {
    busyRef.current = busy
  })

  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
      if (opener?.isConnected) opener.focus?.()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busyRef.current) onCancel()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busyRef.current) onCancel()
      }}
    >
      <form
        className="confirm-dialog__inner"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && !submitDisabled) onSubmit()
        }}
      >
        <h2 id={titleId} className="confirm-dialog__title">
          {title}
        </h2>
        <div className="confirm-dialog__body">{children}</div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="confirm-dialog__actions">
          <button type="submit" className={`button ${tone === 'danger' ? 'button--danger' : 'button--primary'}`} disabled={busy || submitDisabled}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {submitLabel}
          </button>
          {!hideCancel && (
            <button type="button" className="button button--secondary" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
