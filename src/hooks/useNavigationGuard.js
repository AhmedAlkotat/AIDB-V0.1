import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router'

// What happens after React Router blocked a navigation: pending changes are
// saved first; the user is only asked when work could really be lost, otherwise
// the navigation simply continues. Framework-independent so it can be tested.
//
// `isCurrent()` says whether this attempt is still the one being handled (the
// effect that started it was not cleaned up). `proceed()` is called AT MOST ONCE.
export async function resolveBlockedNavigation(session, { isCurrent, proceed, showReasons }) {
  await session.flushSave()
  if (!isCurrent()) return 'superseded'
  const guard = session.getNavigationGuard()
  if (guard.shouldBlock) {
    showReasons(guard.reasons)
    return 'asked'
  }
  proceed()
  return 'proceeded'
}

// Protects unsaved or interrupted work.
//
// - In-app navigation: React Router's useBlocker (needs the data router that
//   main.jsx sets up). Before showing a warning it tries to save pending
//   changes; if that succeeds the navigation simply continues. The user is only
//   asked when the work could really be lost (a failed save, a running
//   extraction, or a comparison waiting for a decision).
// - Closing/reloading the tab: the browser's own "leave site?" prompt, also
//   shown when the temporary store holds edits, because a reload erases them.
//
// The blocker object is replaced by the router whenever its state changes, so
// the effect below depends on the blocked STATE and on the id of the blocked
// attempt (its location key), never on the object itself, and reads the newest
// blocker through a ref. One blocked attempt therefore starts one save-and-decide
// run and calls proceed() once, however often the page re-renders.
//
// Returns { isBlocked, reasons, stay, leave } for the confirmation dialog.
export function useNavigationGuard(session) {
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        currentLocation.pathname !== nextLocation.pathname && session.getNavigationGuard().shouldBlock,
      [session],
    ),
  )
  const [reasons, setReasons] = useState([])
  const isBlocked = blocker.state === 'blocked'
  const attemptId = isBlocked ? (blocker.location?.key ?? 'blocked') : null

  const blockerRef = useRef(blocker)
  useEffect(() => {
    blockerRef.current = blocker
  })

  useEffect(() => {
    if (attemptId === null) return undefined
    let current = true
    resolveBlockedNavigation(session, {
      isCurrent: () => current,
      proceed: () => blockerRef.current.proceed?.(),
      showReasons: setReasons,
    })
    return () => {
      current = false
    }
  }, [attemptId, session])

  useEffect(() => {
    function warnBeforeUnload(event) {
      if (!session.getUnloadWarning().shouldWarn) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [session])

  return {
    isBlocked: isBlocked && reasons.length > 0,
    reasons,
    stay() {
      setReasons([])
      blockerRef.current.reset?.()
    },
    leave() {
      setReasons([])
      blockerRef.current.proceed?.()
    },
  }
}
