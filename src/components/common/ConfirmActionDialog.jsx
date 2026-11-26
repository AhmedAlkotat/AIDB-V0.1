import { useId, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { FormDialog } from './FormDialog.jsx'

// A confirmation for a sensitive or destructive action. `onConfirm()` resolves to
// { ok: true } or { ok: false, message } (shown in the dialog). With `acknowledgement` (a text)
// the confirm button stays off until the user ticks it: the "extra confirmation" of decisions
// 30 and 43 for irreversible or risky actions. Mount it only while it is open (see FormDialog).
export function ConfirmActionDialog({ title, children, confirmLabel, tone = 'danger', acknowledgement = null, onConfirm, onCancel, onDone }) {
  const { t } = useTranslation()
  const checkboxId = useId()
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit() {
    setBusy(true)
    setError(null)
    const result = await onConfirm()
    setBusy(false)
    if (result.ok) onDone?.(result)
    else setError(result.message)
  }

  return (
    <FormDialog
      title={title}
      submitLabel={confirmLabel}
      cancelLabel={t('common.cancel')}
      tone={tone}
      busy={busy}
      submitDisabled={acknowledgement !== null && !acknowledged}
      error={error}
      onSubmit={submit}
      onCancel={onCancel}
    >
      {children}
      {acknowledgement !== null && (
        <label className="check-row" htmlFor={checkboxId}>
          <input id={checkboxId} type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />
          <span>{acknowledgement}</span>
        </label>
      )}
    </FormDialog>
  )
}
