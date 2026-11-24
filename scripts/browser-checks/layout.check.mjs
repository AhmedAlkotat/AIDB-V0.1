// Browser checks for L1 (sticky viewer vs. header) and L2 (split pane overflow
// around 1024px, RTL/LTR, sidebar open/closed).

import { openReview, runChecks, setLanguage, setSidebarOpen } from './harness.mjs'
import { sleep } from './cdp.mjs'

await runChecks('Layout: sticky viewer and split pane', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 720 })
  await openReview(page, { width: 1280, height: 720 })

  // ---- L1: the sticky viewer (and divider) stay below the sticky header -------------
  await page.eval(`window.scrollTo(0, 0)`)
  const tall = await page.eval(`document.documentElement.scrollHeight > window.innerHeight + 300`)
  check('L1 precondition: the review page is taller than the window', tall)
  for (const scrollY of [150, 400, 700]) {
    await page.eval(`window.scrollTo(0, ${scrollY})`)
    await sleep(150)
    const m = await page.eval(`(() => {
      const header = document.querySelector('.app-header').getBoundingClientRect()
      const viewer = document.querySelector('.original-viewer').getBoundingClientRect()
      const divider = document.querySelector('.split-pane__grip')?.getBoundingClientRect()
      const button = document.querySelector('.viewer-toolbar button:not([disabled])')
      const r = button.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { headerBottom: header.bottom, viewerTop: viewer.top, dividerTop: divider ? divider.top : null,
        toolbarReachable: button === hit || button.contains(hit), scrolled: window.scrollY, viewerBottom: viewer.bottom, windowHeight: window.innerHeight }
    })()`)
    check(`L1 scrollY=${m.scrolled}: viewer starts below the header (${m.viewerTop.toFixed(0)} >= ${m.headerBottom.toFixed(0)})`, m.viewerTop >= m.headerBottom - 0.5)
    check(`L1 scrollY=${m.scrolled}: zoom/rotate controls are not covered by the header`, m.toolbarReachable)
    const isStuck = Math.abs(m.viewerTop - (m.headerBottom + 16)) < 1
    if (m.scrolled >= 700) check(`L1 scrollY=${m.scrolled}: the viewer is really sticky (top ${m.viewerTop.toFixed(0)} == header bottom + 16)`, isStuck)
    if (isStuck) check(`L1 scrollY=${m.scrolled}: the whole stuck viewer card fits in the window (bottom ${m.viewerBottom.toFixed(0)} <= ${m.windowHeight})`, m.viewerBottom <= m.windowHeight + 0.5)
    if (m.dividerTop !== null) check(`L1 scrollY=${m.scrolled}: divider grip starts below the header`, m.dividerTop >= m.headerBottom - 0.5)
  }
  await page.eval(`window.scrollTo(0, 0)`)

  // ---- L2: no horizontal overflow around 1024px --------------------------------------
  for (const language of ['ar', 'en']) {
    for (const sidebarOpen of [true, false]) {
      for (const width of [1024, 1025, 1029, 1100, 1200, 1280]) {
        await page.setViewport(width, 800)
        await setLanguage(page, language)
        await setSidebarOpen(page, sidebarOpen)
        await sleep(300)
        const m = await page.eval(`(() => {
          const root = document.documentElement
          const split = document.querySelector('.split-pane')
          const panels = [...split.querySelectorAll(':scope > .split-pane__panel')].map((p) => p.getBoundingClientRect())
          const box = split.getBoundingClientRect()
          const sideBySide = !split.classList.contains('is-stacked')
          return {
            pageOverflow: root.scrollWidth - root.clientWidth,
            splitOverflow: split.scrollWidth - split.clientWidth,
            insidePanels: panels.every((p) => p.left >= box.left - 0.5 && p.right <= box.right + 0.5),
            sideBySide, containerWidth: Math.round(box.width), dir: root.dir,
          }
        })()`)
        const label = `L2 ${language.toUpperCase()}/${m.dir} sidebar ${sidebarOpen ? 'open' : 'closed'} @${width}px (container ${m.containerWidth}px, ${m.sideBySide ? 'side-by-side' : 'stacked'})`
        check(`${label}: no horizontal page overflow`, m.pageOverflow <= 0, `overflow ${m.pageOverflow}px`)
        check(`${label}: panels stay inside the container`, m.splitOverflow <= 0 && m.insidePanels, `splitOverflow ${m.splitOverflow}`)
        if (m.containerWidth >= 700) check(`${label}: stays side-by-side when there is room`, m.sideBySide)
      }
    }
  }
  check('no console errors', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
