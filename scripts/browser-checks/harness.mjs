// Tiny runner for the browser checks. Every check is recorded as PASS or FAIL and
// the process exits with a non-zero code when one fails. Nothing is simulated:
// the checks drive a real Chrome/Edge against the running dev server.
//
//   npm run dev -- --port 5199        (in one terminal)
//   node scripts/browser-checks/layout.check.mjs   (in another)
//
// BASE_URL overrides the address (default http://localhost:5199).

import { launchBrowser } from './cdp.mjs'

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
export const REVIEW_URL = `${BASE_URL}/corrections/review/demo-review-8-pages`

export async function runChecks(title, body) {
  const results = []
  const browser = await launchBrowser()
  const check = (name, passed, detail = '') => {
    results.push({ name, passed: Boolean(passed), detail })
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail && !passed ? `  -> ${detail}` : ''}`)
  }
  console.log(`\n=== ${title} ===`)
  try {
    await body({ browser, check })
  } catch (error) {
    check(`script error: ${error.message}`, false)
  } finally {
    await browser.close()
  }
  const failed = results.filter((result) => !result.passed).length
  console.log(`--- ${title}: ${results.length - failed} passed, ${failed} failed`)
  process.exitCode = failed > 0 ? 1 : 0
  return results
}

// Opens the demo review page and waits until the editor and the original page are shown.
export async function openReview(page, { width = 1280, height = 800, language = 'ar' } = {}) {
  await page.setViewport(width, height)
  await page.goto(REVIEW_URL)
  await page.waitFor(`document.querySelector('.original-viewer')`)
  await setLanguage(page, language)
  await page.waitFor(`document.querySelector('.element-list')`)
  // The viewer toolbar is disabled until the PDF has been opened.
  await page.waitFor(`document.querySelector('.viewer-toolbar button:not([disabled])')`, { timeout: 15000 })
}

export async function setLanguage(page, language) {
  await page.eval(`document.querySelector('.lang-switch__option[lang=${language}]').click()`)
  await page.waitFor(`document.documentElement.lang === '${language}'`)
}

// Collapses (false) or expands (true) the docked sidebar with the header menu button.
export async function setSidebarOpen(page, open) {
  const isOpen = await page.eval(`getComputedStyle(document.querySelector('.sidebar')).display !== 'none'`)
  if (isOpen !== open) await page.click('.app-header__menu')
  await page.waitFor(`(getComputedStyle(document.querySelector('.sidebar')).display !== 'none') === ${open}`)
}
