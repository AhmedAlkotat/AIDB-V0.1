// Browser checks for P3: a blocked in-app navigation (React Router useBlocker) proceeds
// exactly once per confirmed attempt, staying works, and repeated re-rendering while the
// dialog is open changes nothing. History writes are counted by wrapping
// history.pushState / replaceState.

import { openReview, runChecks, BASE_URL } from './harness.mjs'
import { sleep } from './cdp.mjs'

const typeIn = async (page, index, text) => {
  await page.eval(`(() => { const el = document.querySelectorAll('.element-card .editor-input')[${index}]; el.focus(); el.select() })()`)
  await page.type(text)
}

await runChecks('Navigation guard (P3)', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 900 })
  await openReview(page, { width: 1280, height: 900 })
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 3`, { timeout: 15000 })

  // ---------------------------------------------------------------- P3 (navigation guard)
  await page.eval(`window.__pushes = 0; const push = history.pushState.bind(history); history.pushState = (...a) => { window.__pushes += 1; return push(...a) }; const rep = history.replaceState.bind(history); history.replaceState = (...a) => { window.__pushes += 1; return rep(...a) }`)
  await typeIn(page, 0, 'تعديل غير محفوظ بعد')
  await page.click('a.sidebar__link[href="/corrections"]')
  await page.waitFor(`location.pathname === '/corrections'`, { timeout: 10000 })
  await sleep(600)
  const pushes = await page.eval(`window.__pushes`)
  check('P3 unsaved typing is saved and the navigation then proceeds exactly once (no dialog needed)', pushes === 1, `history writes: ${pushes}`)
  check('P3 no "leave" dialog was shown for a successful save', await page.eval(`!document.querySelector('dialog[open]')`))

  // A running extraction no longer blocks leaving (decision 2: processing goes on in the background); a result
  // waiting for the user's decision still does, so the user is asked: stay, then leave.
  await page.goto(`${BASE_URL}/corrections/review/demo-review-8-pages`)
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  await page.waitFor(`document.querySelector('[data-lock=held]')`, { timeout: 5000 })
  await page.eval(`window.__pushes = 0; const push = history.pushState.bind(history); history.pushState = (...a) => { window.__pushes += 1; return push(...a) }; const rep = history.replaceState.bind(history); history.replaceState = (...a) => { window.__pushes += 1; return rep(...a) }`)
  await page.click('.processing .button--secondary') // re-extract
  await page.waitFor(`document.querySelector('.comparison')`, { timeout: 10000 }) // the result waits for a decision
  await page.click('a.sidebar__link[href="/corrections"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('P3 a result waiting for a decision blocks the navigation and asks the user', await page.eval(`location.pathname.includes('/review/')`))
  await page.eval(`window.dispatchEvent(new Event('resize'))`) // re-render while the dialog is open
  await sleep(500)
  await page.eval(`document.querySelector('dialog[open] .button--secondary')?.click()`) // "stay"
  await sleep(300)
  check('P3 "stay" keeps the user on the page', await page.eval(`location.pathname.includes('/review/') && !document.querySelector('dialog[open]')`))
  check('P3 staying did not navigate or write history', (await page.eval(`window.__pushes`)) === 0)
  await page.click('a.sidebar__link[href="/corrections"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await page.eval(`window.dispatchEvent(new Event('resize'))`)
  await page.eval(`document.querySelector('dialog[open] .button--danger').click()`) // "leave"
  await page.waitFor(`location.pathname === '/corrections'`, { timeout: 10000 })
  await sleep(500)
  check('P3 confirming "leave" navigates exactly once', (await page.eval(`window.__pushes`)) === 1, `history writes: ${await page.eval(`window.__pushes`)}`)

  check('no console errors during the whole run', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
