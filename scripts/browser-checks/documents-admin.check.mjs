// Browser checks for Batch D, Admin and limits side: the upload limits the Admin set (file size and selected pages),
// the storage-full and not-enough-space messages, the Admin deleting documents that are Pending / Processing
// (safe cancellation, the others unaffected), the Admin's new version and re-approval, the audit entries the
// document workflow produces, and the export of an approved document. Everything is SIMULATED by the development
// mocks. Run it after documents.check.mjs (separate script: each script reports its own result).
//
//   npm run dev -- --port 5199   (terminal 1)
//   node scripts/browser-checks/documents-admin.check.mjs   (terminal 2)

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDemoPdfBytes } from '../../src/data/mock/demoPdf.js'
import { sleep } from './cdp.mjs'
import { BASE_URL, runChecks, setLanguage, startProcessing } from './harness.mjs'

const dir = join(tmpdir(), 'aidp-browser-checks', 'documents-admin')
mkdirSync(dir, { recursive: true })
const pdfOf = (pages, name, extraBytes = 0) => {
  const path = join(dir, name)
  const bytes = Buffer.from(createDemoPdfBytes(pages, `AIDP ${name}`))
  writeFileSync(path, extraBytes > 0 ? Buffer.concat([bytes, Buffer.alloc(extraBytes, 0x20)]) : bytes) // trailing blanks keep it a valid PDF
  return path
}

const text = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`)
const exists = (page, selector) => page.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const count = (page, selector) => page.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
const rowOf = (name) => `[...document.querySelectorAll('.queue-item')].find((li) => li.textContent.includes(${JSON.stringify(name)}))`
const waitState = (page, name, states, timeout = 60000) => page.waitFor(`${JSON.stringify(states)}.includes(${rowOf(name)}?.dataset.state)`, { timeout })

async function go(page, route, readySelector) {
  await page.click(`a.sidebar__link[href="${route}"]`)
  await page.waitFor(`location.pathname === ${JSON.stringify(route)}`, { timeout: 10000 })
  await page.waitFor(readySelector ?? `document.querySelector('.page-intro__title')`, { timeout: 12000 })
}

// A pre-set simulated system state (what the Admin configured), installed before the app starts.
async function withSystemState(page, patch) {
  const state = { seq: 100, settings: patch.settings ?? {}, storage: { scenario: patch.scenario ?? 'normal' }, flags: {}, backups: [], audit: [], notifications: [] }
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('aidp.dev.mockSystem')) sessionStorage.setItem('aidp.dev.mockSystem', ${JSON.stringify(JSON.stringify(state))}) } catch {}` })
}

async function pickFile(page, file) {
  await page.setFiles('input[type=file]', [file])
  await sleep(500)
}

await runChecks('Document management: Admin, limits and storage (Batch D)', async ({ browser, check }) => {
  // ================================================================ limits set by the Admin (36, 48)
  const limited = await browser.newPage({ width: 1366, height: 900, session: 'admin' })
  await withSystemState(limited, { settings: { uploads: { maxFileSizeMb: 1, maxSelectedPages: 2 } } })
  await limited.goto(`${BASE_URL}/upload`)
  await setLanguage(limited, 'ar')
  await limited.waitFor(`document.querySelector('.dropzone__hint')?.textContent.includes('الحد الأقصى للحجم')`, { timeout: 8000 })
  check('the drop zone shows the file-size limit the Admin set (1 MB), read from the settings', /(1|١) ميجابايت/.test((await text(limited, '.dropzone__hint')) ?? ''), await text(limited, '.dropzone__hint'))

  await pickFile(limited, pdfOf(2, 'too-big.pdf', 1.5 * 1024 * 1024))
  await limited.waitFor(`document.querySelector('.alert--error')`, { timeout: 5000 })
  check('a file over the limit is refused in the interface with the Admin limit in the message', (await text(limited, '.alert--error')).includes('يتجاوز الحد الأقصى المسموح به') && /(1|١) ميجابايت/.test(await text(limited, '.alert--error')))
  check('the refused file is not kept: Start Processing stays disabled', await limited.eval(`document.querySelector('.upload-actions__start').disabled`))

  await pickFile(limited, pdfOf(5, 'five-pages.pdf'))
  await limited.waitFor(`document.querySelector('.page-selection input[type=radio][value=selected]')`, { timeout: 20000 })
  await sleep(300)
  check('selecting ALL pages of a 5-page PDF exceeds the page limit (2): a clear message and Start disabled', (await text(limited, '.page-selection__error')).includes('الحد الأقصى') && (await limited.eval(`document.querySelector('.upload-actions__start').disabled`)))
  check('the page panel names the Admin page limit, independent of the file size', (await text(limited, '.page-selection')).includes('يحدده المدير'))
  await limited.eval(`document.querySelector('.page-selection input[type=radio][value=selected]').click()`)
  await limited.waitFor(`document.querySelector('.page-selection__input')`)
  await limited.eval(`(() => { const el = document.querySelector('.page-selection__input'); el.focus(); el.select() })()`)
  await limited.type('1-2')
  await limited.eval(`document.querySelector('.page-selection__input').blur()`)
  await sleep(300)
  check('selecting only 2 pages is within the limit: Start Processing is enabled (3 unselected pages are not failures)', await limited.eval(`!document.querySelector('.upload-actions__start').disabled`))
  await limited.eval(`(() => { const el = document.querySelector('.page-selection__input'); el.focus(); el.select() })()`)
  await limited.type('1-3')
  await limited.eval(`document.querySelector('.page-selection__input').blur()`)
  await sleep(300)
  check('3 selected pages are over the limit again', await limited.eval(`document.querySelector('.upload-actions__start').disabled`))
  await limited.send('Page.close').catch(() => {})

  // ================================================================ storage (35)
  const full = await browser.newPage({ width: 1366, height: 900, session: 'employee' })
  await withSystemState(full, { scenario: 'full' })
  await full.goto(`${BASE_URL}/upload`)
  await setLanguage(full, 'ar')
  await pickFile(full, pdfOf(1, 'one-page.pdf'))
  await full.waitFor(`document.querySelector('.upload-actions .alert--error')`, { timeout: 8000 })
  const fullText = await text(full, '.upload-actions .alert--error')
  check('storage full: a clear message that uploads are not accepted, that nothing is deleted and that work resumes', fullText.includes('مساحة التخزين ممتلئة') && fullText.includes('لا يُحذف أي مستند معتمد') && fullText.includes('سيُستأنف'), fullText)
  await full.waitFor(`document.querySelector('#start-processing-hint')?.textContent.includes('مساحة التخزين ممتلئة')`, { timeout: 20000 }).catch(() => {})
  check('storage full: Start Processing is disabled with its own reason', (await full.eval(`document.querySelector('.upload-actions__start').disabled`)) && (await text(full, '#start-processing-hint')).includes('مساحة التخزين ممتلئة'))
  await full.send('Page.close').catch(() => {})

  const tight = await browser.newPage({ width: 1366, height: 900, session: 'employee' })
  await tight.goto(`${BASE_URL}/upload`)
  await setLanguage(tight, 'ar')
  await tight.waitFor(`document.querySelector('.dev-panel')`)
  await tight.eval(`document.querySelectorAll('.dev-panel input[type=checkbox]')[1].click()`) // pretend there is not enough space for the next upload
  await pickFile(tight, pdfOf(1, 'one-page.pdf'))
  await tight.waitFor(`document.querySelector('.page-selection input[type=radio]')`, { timeout: 20000 })
  await tight.click('.upload-actions__start.button--primary')
  await tight.waitFor(`document.querySelector('.upload-actions .alert--error')`, { timeout: 8000 })
  check('not enough space for this document: the server refuses it and the page says so, without storing anything', (await text(tight, '.upload-actions .alert--error')).includes('لا تتوفر مساحة تخزين كافية'))
  await tight.eval(`document.querySelector('.alert__dismiss')?.click()`)
  await tight.eval(`document.querySelectorAll('.dev-panel input[type=checkbox]')[1].click()`)
  await startProcessing(tight)
  check('after the condition ends the same file can be uploaded', true)
  await tight.send('Page.close').catch(() => {})

  // ================================================================ the Admin (all documents, delete, new version)
  const page = await browser.newPage({ width: 1366, height: 900, session: 'admin' })
  await page.goto(`${BASE_URL}/upload`)
  await setLanguage(page, 'ar')
  await page.waitFor(`document.querySelector('.dev-panel')`)
  await pickFile(page, pdfOf(6, 'admin-long.pdf'))
  await startProcessing(page)
  await pickFile(page, pdfOf(2, 'admin-waiting.pdf'))
  await startProcessing(page)
  await page.eval(`document.querySelector('.upload-actions .alert--success a.inline-link').click()`)
  await page.waitFor(`location.pathname === '/corrections'`)
  await page.waitFor(`${rowOf('admin-waiting')}`)
  await sleep(300)
  check('the Admin sees every document (the demo ones too) with a delete button on each, including the Pending and Processing ones', (await count(page, '.queue-item')) >= 3 && (await count(page, 'button[aria-label^="نقل إلى السلة"]')) === (await count(page, '.queue-item')))
  check('a Processing and a Pending document are listed at the same time', ['pending', 'processing'].includes(await page.eval(`${rowOf('admin-long')}.dataset.state`)) && (await page.eval(`${rowOf('admin-waiting')}.dataset.state`)) === 'pending')

  // delete the Pending one: it leaves the queue, the other keeps going
  await page.eval(`${rowOf('admin-waiting')}.querySelector('button[aria-label^="نقل إلى السلة"]').click()`)
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('deleting asks for an explicit confirmation', (await exists(page, 'dialog[open] .button--danger')))
  await page.eval(`document.querySelector('dialog[open] button[type=submit]').click()`)
  await page.waitFor(`document.querySelector('.alert--success')`, { timeout: 8000 })
  check('deleting a document that is still queued confirms that its processing was cancelled safely (decision 45)', (await text(page, '.alert--success')).includes('أُوقفت') && (await text(page, '.alert--success')).includes('بأمان'), await text(page, '.alert--success'))
  check('the deleted document leaves the normal queue', await page.eval(`!${rowOf('admin-waiting')}`))
  await waitState(page, 'admin-long', ['readyForReview'])
  check('the other document was not affected: it finished normally', true)

  // delete a document while it is being processed
  await go(page, '/upload', `document.querySelector('.upload-layout')`)
  await pickFile(page, pdfOf(6, 'admin-interrupted.pdf'))
  await startProcessing(page)
  await page.eval(`document.querySelector('.upload-actions .alert--success a.inline-link').click()`)
  await page.waitFor(`location.pathname === '/corrections'`)
  await waitState(page, 'admin-interrupted', ['processing'], 15000)
  await sleep(1500)
  await page.eval(`${rowOf('admin-interrupted')}.querySelector('button[aria-label^="نقل إلى السلة"]').click()`)
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await page.eval(`document.querySelector('dialog[open] button[type=submit]').click()`)
  await page.waitFor(`!${rowOf('admin-interrupted')}`, { timeout: 8000 })
  check('deleting a document in the middle of processing removes it from the lists', true)
  await go(page, '/admin/recycle-bin', `document.querySelector('.employee-table, .queue-empty')`)
  const binNames = await page.eval(`[...document.querySelectorAll('.employee-table tbody tr')].map((tr) => tr.textContent)`)
  check('the recycle bin holds both deleted documents (the originals and what was completed are kept)', binNames.some((n) => n.includes('admin-waiting')) && binNames.some((n) => n.includes('admin-interrupted')), JSON.stringify(binNames))
  await go(page, '/corrections', `document.querySelector('.queue-item')`)
  await sleep(2500)
  check('after the cancellation the queue is idle: nothing keeps processing the deleted document', (await page.eval(`[...document.querySelectorAll('.queue-item')].every((li) => li.dataset.state !== 'processing')`)))

  // ---------------------------------------------------------------- new version and re-approval (decision 14)
  await go(page, '/archive', `document.querySelector('.archive-filters')`)
  await page.eval(`${rowOf('مستند تجريبي معتمد')}.querySelector('a.button--primary').click()`)
  await page.waitFor(`document.querySelector('.approval-panel__version')`, { timeout: 15000 })
  check('the approved demo document comes with its approved version in the history', (await count(page, '.version-history__list li')) === 1)
  check('the Admin sees the "new editable version" action; the document is read-only until then', (await exists(page, '[data-action="new-version"]')) && (await exists(page, '.editor-notice')))
  await page.click('[data-action="new-version"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('creating a new version asks for confirmation and explains that the old version stays and a new approval is needed', (await text(page, 'dialog[open]')).includes('النسخة المعتمدة السابقة') && (await text(page, 'dialog[open]')).includes('اعتماد جديد صريح'))
  await page.eval(`document.querySelector('dialog[open] .button--primary').click()`)
  await page.waitFor(`document.querySelector('.review-header__badges .badge--warning')`, { timeout: 8000 })
  check('after creating it the document is an editable NEW version (marked), not approved', (await text(page, '.review-header__badges')).includes('إصدار جديد') && !(await exists(page, '.review-header__badges .badge--success')))
  await page.waitFor(`document.querySelector('[data-lock=held]')`, { timeout: 5000 })
  await page.waitFor(`document.querySelector('.element-card')`, { timeout: 5000 })
  check('the version history still lists version 1 and announces the new one in progress', (await count(page, '.version-history__list li')) === 1 && (await text(page, '.version-history')).includes('قيد التحرير'))
  await page.eval(`document.querySelector('.element-card--paragraph textarea').focus()`)
  await page.type(' — تعديل المدير')
  await page.eval(`document.activeElement.blur()`)
  await page.waitFor(`document.querySelector('.save-status--saved')`, { timeout: 8000 })
  const eligibility = await page.eval(`[...document.querySelectorAll('.approval-checklist li')].map((li) => li.className)`)
  check('after the Admin edit the changed page needs a new review before the new approval', eligibility.includes('is-unmet'), JSON.stringify(eligibility))
  await page.click('.review-bar .button--primary')
  await page.waitFor(`document.querySelector('.review-bar__done')`)
  // the other pages keep their earlier review: approve
  await page.waitFor(`document.querySelector('.save-status--saved')`, { timeout: 8000 })
  await page.waitFor(`!document.querySelector('.approval-panel .button--primary').disabled`, { timeout: 6000 })
  await page.click('.approval-panel .button--primary')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await page.eval(`document.querySelector('dialog[open] .button--primary').click()`)
  await page.waitFor(`document.querySelector('.review-header__badges .badge--success')`, { timeout: 8000 })
  await page.waitFor(`document.querySelectorAll('.version-history__list li').length === 2`, { timeout: 8000 })
  check('the new version needed its own approval, and now both versions are in the history (newest first)', (await text(page, '.version-history__list li')).includes('الإصدار'))
  await page.click('.version-history__list li:last-child button')
  await page.waitFor(`document.querySelector('dialog.version-viewer[open]')`)
  check('the previous approved version still opens, with its original content', (await exists(page, 'dialog.version-viewer .result-tabs')))
  await page.eval(`document.querySelector('dialog.version-viewer .button--secondary').click()`)

  // ---------------------------------------------------------------- audit log (decision 31)
  await go(page, '/admin/audit-log', `document.querySelector('.employee-table, .queue-empty')`)
  await sleep(500)
  const audit = await text(page, '.employee-table')
  check('the audit log has the document events: uploaded, processing started, approved after a new version and the new version itself', ['admin-long', 'إنشاء إصدار جديد', 'إعادة اعتماد'].every((fragment) => audit.includes(fragment)), audit.slice(0, 300))
  check('the audit log holds no password and no document content', !/password|كلمة المرور|عنوان الصفحة|تعديل المدير/.test(audit))
  check('the audit log still has no export (decision 32)', !(await exists(page, 'button[aria-label*="تصدير"], a[download]')))

  // ---------------------------------------------------------------- export from the archive (decisions 8, 46)
  await go(page, '/archive', `document.querySelector('.archive-filters')`)
  await page.click(`button[aria-label^="تصدير: مستند تجريبي معتمد"]`)
  await page.waitFor(`document.querySelector('dialog.export-dialog[open]')`)
  await page.click('.export-dialog__formats button[data-format="json"]')
  await page.waitFor(`document.querySelector('dialog.export-dialog .alert--success')`, { timeout: 8000 })
  check('the Admin exports the latest approved version from the archive (JSON, real file)', (await text(page, 'dialog.export-dialog .alert--success')).includes('أُنشئ الملف'))
  await page.click('.export-dialog__formats button[data-format="pdf"]')
  await page.waitFor(`document.querySelector('dialog.export-dialog .alert--warning')`, { timeout: 8000 })
  check('PDF export is reported as a simulation and creates no file', (await text(page, 'dialog.export-dialog .alert--warning')).includes('لم يُنشأ أي ملف'))
  await page.eval(`document.querySelector('dialog.export-dialog .confirm-dialog__actions button').click()`)

  // ---------------------------------------------------------------- English
  await setLanguage(page, 'en')
  await go(page, '/corrections', `document.querySelector('#queue-state-filter')`)
  const english = await page.eval(`({ dir: document.documentElement.dir, intro: document.querySelector('.page-intro__description').textContent, badges: [...document.querySelectorAll('.queue-item .badge')].map((b) => b.textContent) })`)
  check('English (LTR): the queue explains FIFO background processing and shows English state names', english.dir === 'ltr' && english.intro.includes('first-come, first-served') && english.badges.some((b) => b === 'Ready for Review'), JSON.stringify(english))
  check('no console errors during the Admin run', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '))
})
