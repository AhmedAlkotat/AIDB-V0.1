// Browser checks for the Phase 3 integration: upload -> correction queue -> review ->
// archive. Navigation is done with in-app links only (a reload would empty the
// temporary in-memory store).

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE_URL, runChecks, setLanguage } from './harness.mjs'
import { sleep } from './cdp.mjs'
import { writeTestPng } from './png.mjs'

const dir = join(tmpdir(), 'aidp-browser-checks')
mkdirSync(dir, { recursive: true })
const image = join(dir, 'integration-200x100.png')
writeTestPng(image, 200, 100)

const names = (page) => page.eval(`[...document.querySelectorAll('.queue-item__name')].map((n) => n.textContent)`)
const goTo = async (page, href) => {
  await page.click(`a.sidebar__link[href="${href}"]`)
  await page.waitFor(`location.pathname === '${href}'`, { timeout: 10000 })
  await sleep(300)
}

await runChecks('Integration: upload, queue, review, archive', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 900 })
  await page.goto(`${BASE_URL}/upload`)
  await setLanguage(page, 'ar')

  // Upload an image and open it for (mock) review.
  await page.setFiles('input[type=file]', [image])
  await page.waitFor(`document.querySelector('.upload-actions__start.button--secondary:not([disabled])')`, { timeout: 15000 })
  await page.click('.upload-actions__start.button--secondary')
  await page.waitFor(`location.pathname.includes('/corrections/review/')`)
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  const uploadedPath = await page.eval(`location.pathname`)
  check('the uploaded document opens in the review page', uploadedPath.includes('/corrections/review/'))
  check('a pending document links back to the correction queue', (await page.eval(`document.querySelector('.review-page > p a')?.getAttribute('href')`)) === '/corrections')

  // It is in the queue, not in the archive.
  await goTo(page, '/corrections')
  const queue = await names(page)
  check('the uploaded document is listed in the correction queue', queue.length === 2 && queue.some((n) => n.includes('integration-200x100.png')), JSON.stringify(queue))
  check('the queue shows the pending demo document and not the approved one', queue.some((n) => n.includes('للمراجعة')) && !queue.some((n) => n.includes('معتمد')), JSON.stringify(queue))
  check('the queue states that roles and approval are simulated', await page.eval(`document.querySelector('.alert, [role=alert], .alert--info')?.parentElement.textContent.includes('محاكاة في الواجهة فقط') ?? document.body.textContent.includes('محاكاة في الواجهة فقط')`))

  await goTo(page, '/archive')
  const archive = await names(page)
  check('the archive lists only the approved demo document', archive.length === 1 && archive[0].includes('معتمد'), JSON.stringify(archive))
  check('no pending document (the upload, the pending demo) is in the archive', !archive.some((n) => n.includes('integration') || n.includes('للمراجعة')))
  check('the archive is no longer a placeholder', await page.eval(`!document.querySelector('.placeholder-card')`))

  // An approved document opens read-only, and "back" returns to the archive.
  await page.click('.queue-item a.button--primary')
  await page.waitFor(`location.pathname.includes('/corrections/review/')`)
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  check('an approved document opens read-only (no review button, editor locked)', await page.eval(`!document.querySelector('.review-bar .button--primary') || document.querySelector('.review-bar .button--primary').disabled`))
  check('an approved document links back to the archive', (await page.eval(`document.querySelector('.review-page > p a')?.getAttribute('href')`)) === '/archive')
  await page.click('.review-page > p a')
  await page.waitFor(`location.pathname === '/archive'`)
  check('"back" from an approved document lands on the archive', true)

  // The temporary in-memory documents survived all of the in-app navigation.
  await goTo(page, '/corrections')
  check('the uploaded document is still in the queue after navigating around', (await names(page)).some((n) => n.includes('integration-200x100.png')))
  check('no console errors', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
