// Browser checks for the Phase 3 integration: upload -> correction queue -> review ->
// archive. Navigation is done with in-app links only (a reload would empty the
// temporary in-memory store).

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE_URL, openUploadedReview, runChecks, setLanguage, startProcessing } from './harness.mjs'
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

  // Upload an image: "Start processing" registers it, the (simulated) queue processes it in the background,
  // and the review is opened from the list once it is ready (nothing opens by itself).
  await page.setFiles('input[type=file]', [image])
  await startProcessing(page)
  await openUploadedReview(page, 'integration-200x100.png')
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  const uploadedPath = await page.eval(`location.pathname`)
  check('the uploaded document opens in the review page', uploadedPath.includes('/corrections/review/'))
  check('a document that is not approved links back to the correction queue', (await page.eval(`document.querySelector('.review-page > p a')?.getAttribute('href')`)) === '/corrections')

  // It is in the queue, not in the archive.
  await goTo(page, '/corrections')
  const queue = await names(page)
  check('the uploaded document is listed in the correction queue', queue.length === 2 && queue.some((n) => n.includes('integration-200x100.png')), JSON.stringify(queue))
  check('the queue shows the pending demo document and not the approved one', queue.some((n) => n.includes('للمراجعة')) && !queue.some((n) => n.includes('معتمد')), JSON.stringify(queue))
  check('the queue states that roles and approval are simulated', await page.eval(`document.querySelector('.alert, [role=alert], .alert--info')?.parentElement.textContent.includes('محاكاة في الواجهة فقط') ?? document.body.textContent.includes('محاكاة في الواجهة فقط')`))

  // Decision 12: the archive lists every state EXCEPT Pending. Here nothing is Pending any more (the upload finished
  // processing), so it lists the approved demo document, the demo document waiting for review and the upload.
  await goTo(page, '/archive')
  const archive = await names(page)
  check('the archive lists every document that is not Pending: the approved demo, the demo to review and the upload', archive.length === 3 && archive.some((n) => n.includes('معتمد')) && archive.some((n) => n.includes('للمراجعة')) && archive.some((n) => n.includes('integration')), JSON.stringify(archive))
  check('every archived document shows its state', (await page.eval(`[...document.querySelectorAll('.queue-item')].every((li) => li.querySelector('.badge--success, .badge--info, .badge--danger, .badge--warning'))`)))
  check('the archive is no longer a placeholder', await page.eval(`!document.querySelector('.placeholder-card')`))

  // An approved document opens read-only, and "back" returns to the archive.
  await page.eval(`[...document.querySelectorAll('.queue-item')].find((li) => li.textContent.includes('معتمد')).querySelector('a.button--primary').click()`)
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
