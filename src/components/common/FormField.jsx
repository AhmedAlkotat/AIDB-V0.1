import { useId } from 'react'

// A labelled text input with an optional hint and error message, wired for assistive
// technology (aria-invalid, aria-describedby). Uses the form-field styles (auth.css).
// Extra props go to the <input>.
export function FormField({ label, hint, error, inputRef, ...inputProps }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} ref={inputRef} className="form-field__input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
      {hint && (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="form-field__error">
          {error}
        </p>
      )}
    </div>
  )
}
