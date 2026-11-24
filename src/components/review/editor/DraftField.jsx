import { useLayoutEffect, useRef } from 'react'
import { splitByRanges } from '../../../domain/document/search.js'
import { useDraftText } from '../../../hooks/useDraftText.js'

// One text input of the editor. Typing stays local and is committed to the
// canonical document through `onCommit(text)` (see useDraftText). Matches of
// the page search are shown as highlighted text under the input, because an
// <input> cannot highlight part of its own text.
//
// ctx: { disabled, setPending(key, isPending, commitNow) }
export function DraftField({ value, onCommit, ctx, label, fieldKey, multiline = false, rows = 2, ranges, className = '' }) {
  const draft = useDraftText(value, onCommit, { onPendingChange: (isPending, commitNow) => ctx.setPending(fieldKey, isPending, commitNow) })
  const textareaRef = useRef(null)

  // Long (e.g. handwritten) paragraphs grow with their text instead of scrolling inside a tiny box.
  useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + 2}px`
  }, [draft.value])

  const common = {
    value: draft.value,
    dir: 'auto',
    readOnly: ctx.disabled,
    'aria-label': label,
    className: `editor-input ${className}`.trim(),
    onChange: (event) => draft.onChange(event.target.value),
    onBlur: draft.onBlur,
  }
  const hasMatches = ranges && ranges.length > 0

  return (
    <div className={`draft-field${hasMatches ? ' has-match' : ''}`}>
      {multiline ? <textarea ref={textareaRef} rows={rows} {...common} /> : <input type="text" {...common} />}
      {hasMatches && (
        <p className="match-preview" dir="auto">
          {splitByRanges(value, ranges).map((segment, index) =>
            segment.match ? (
              <mark key={index}>{segment.text}</mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
      )}
    </div>
  )
}
