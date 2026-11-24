import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Local text state for ONE input of the editor.
//
// Typing is kept locally and committed to the canonical document after a short
// pause, on blur, and when the input goes away, so one burst of typing is ONE
// undoable edit (not one per character) and the document is never mutated
// directly. While text is typed but not committed, `onPendingChange(true, flush)`
// lets the page count it as unsaved and lets it commit the text on demand (before
// a review confirmation, a re-extraction or accepting one: see commitPendingEdits
// in the review session). `onPendingChange(false)` follows once it is committed.
//
// `commit(text)` should return { ok } (the session's dispatch result). When the
// commit is refused the input goes back to the committed `value`.
export function useDraftText(value, commit, { delayMs = 400, onPendingChange } = {}) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)
  const timer = useRef(null)
  const latest = useRef({ draft: value, value, commit, onPendingChange })
  // Handlers read the newest props through this ref (updated after every render).
  useLayoutEffect(() => {
    latest.current.value = value
    latest.current.commit = commit
    latest.current.onPendingChange = onPendingChange
  })

  // Follow outside changes (undo, redo, an accepted re-extraction) unless the user is typing.
  useEffect(() => {
    if (!dirty.current) {
      latest.current.draft = value
      setDraft(value)
    }
  }, [value])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    latest.current.onPendingChange?.(false)
    const { draft: text, value: committed } = latest.current
    if (text === committed) return
    const result = latest.current.commit(text)
    if (result && result.ok === false) {
      latest.current.draft = committed
      setDraft(committed)
    }
  }, [])

  const onChange = useCallback(
    (next) => {
      latest.current.draft = next
      setDraft(next)
      if (!dirty.current) {
        dirty.current = true
        latest.current.onPendingChange?.(true, flush)
      }
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, delayMs)
    },
    [delayMs, flush],
  )

  // Commit what is typed when the input goes away (e.g. another page opens).
  useEffect(() => flush, [flush])

  return { value: draft, onChange, onBlur: flush }
}
