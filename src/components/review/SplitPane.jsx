import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { clampSplitRatio, DIVIDER_PX, ratioFromDistance } from './splitMath.js'

const STACK_QUERY = '(max-width: 899.98px)'
const KEY_STEP = 0.02

// Two panels side by side that the user can resize by dragging the divider (or
// with the arrow keys). The first panel sits at the inline start (right in
// Arabic/RTL), so the ratio always refers to it.
//
// The panels stack (start above end, no divider) when
//   - the window is narrower than 900px, or
//   - the width this component REALLY has cannot hold both minimum widths and the
//     divider. That width depends on the sidebar, the page padding and the language
//     direction, not only on the window: at 1024px with the sidebar open the
//     content area is ~673px, less than 320 + 14 + 360.
// Otherwise (enough room) they stay side by side.
//
// The two columns are `fr` tracks whose factors add up to exactly 1, with NO pixel minimums in
// the CSS: the minimum widths are enforced by clamping the ratio. (With `minmax(320px, 0.25fr)`
// style tracks, a track held at its minimum leaves a flex sum below 1, and CSS Grid then gives
// the other track only that fraction of the free space: up to ~250px stayed empty.)
export function SplitPane({ start, end, defaultRatio = 0.5, minStartPx = 320, minEndPx = 360 }) {
  const { t, direction } = useTranslation()
  const isNarrowWindow = useMediaQuery(STACK_QUERY)
  const containerRef = useRef(null)
  const [availableWidth, setAvailableWidth] = useState(null) // null until measured
  const [ratio, setRatio] = useState(defaultRatio)
  const [isDragging, setIsDragging] = useState(false)
  const isStacked = isNarrowWindow || (availableWidth !== null && availableWidth < minStartPx + DIVIDER_PX + minEndPx)

  // The container is the same element in both modes, so its width does not depend on the
  // layout that is chosen (no flip-flopping); measured before paint to avoid a flash.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const measure = () => setAvailableWidth(container.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // `ratio` is the share of the width left after the divider (the two panels together) that
  // goes to the first panel. Keeps both panels at least their minimum width for a container of
  // `width` px.
  const clampTo = useCallback((value, width) => clampSplitRatio(value, width, { minStartPx, minEndPx }), [minStartPx, minEndPx])
  const clamp = useCallback((value) => clampTo(value, containerRef.current?.getBoundingClientRect().width), [clampTo])
  // The user's ratio is kept as chosen; what is shown never breaks the minimum widths
  // of the CURRENT width (so it recovers when the window grows again).
  const shownRatio = clampTo(ratio, availableWidth)

  const moveTo = useCallback(
    (clientX) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      // Distance of the divider's centre from the inline start, as a share of the usable width.
      const fromStart = direction === 'rtl' ? rect.right - clientX : clientX - rect.left
      setRatio(clamp(ratioFromDistance(fromStart, rect.width)))
    },
    [clamp, direction],
  )

  function handleKeyDown(event) {
    // Arrow keys move the divider in the direction they point on screen.
    const screenStep = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (screenStep !== 0) {
      event.preventDefault()
      const towardsStart = direction === 'rtl' ? -screenStep : screenStep
      setRatio(clamp(shownRatio + towardsStart * KEY_STEP))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setRatio(clamp(0))
    } else if (event.key === 'End') {
      event.preventDefault()
      setRatio(clamp(1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      setRatio(clamp(defaultRatio))
    }
  }

  if (isStacked) {
    return (
      <div className="split-pane is-stacked" ref={containerRef}>
        <div key="start" className="split-pane__panel">{start}</div>
        <div key="end" className="split-pane__panel">{end}</div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`split-pane${isDragging ? ' is-dragging' : ''}`}
      style={{ gridTemplateColumns: `minmax(0, ${shownRatio}fr) ${DIVIDER_PX}px minmax(0, ${1 - shownRatio}fr)` }}
    >
      <div key="start" className="split-pane__panel">{start}</div>
      <div
        key="divider"
        className="split-pane__divider"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('review.split.label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shownRatio * 100)}
        tabIndex={0}
        title={t('review.split.hint')}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => setRatio(clamp(defaultRatio))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setIsDragging(true)
        }}
        onPointerMove={(event) => {
          if (isDragging) moveTo(event.clientX)
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          setIsDragging(false)
        }}
        onPointerCancel={() => setIsDragging(false)}
      >
        <span className="split-pane__grip" aria-hidden="true" />
      </div>
      <div key="end" className="split-pane__panel">{end}</div>
    </div>
  )
}
