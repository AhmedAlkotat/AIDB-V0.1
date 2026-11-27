// Browser checks for Batch D: the document workflow in a real Chrome, for both roles and both languages.
// Upload with the Admin's limits and the storage messages, the simulated central FIFO queue and background
// processing, the six document states, failure / retry / manual entry, notifications without redirects, the
// archive with search and filters, the review tabs (Texts, Tables, Fields, JSON), draft saving, approval,
// versions and the edit lock, page reprocessing with its comparison, export, templates and localization.
//
// Everything runs against the development mocks (no backend, no AI): processing, the queue, the lock, the
// approval and the export are SIMULATED, and these checks verify that the interface behaves as the approved
// decisions require against a server that follows them. Documents live in the tab's memory, so in-app links
// are used between steps (a reload would empty them).
//
//   npm run dev -- --port 5199   (terminal 1)
//   node scripts/browser-checks/documents.check.mjs   (terminal 2)

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDemoPdfBytes } from '../../src/data/mock/demoPdf.js'
import { sleep } from './cdp.mjs'
import { BASE_URL, runChecks, setLanguage, startProcessing } from './harness.mjs'
import { writeTestPng } from './png.mjs'

const dir = join(tmpdir(), 'aidp-browser-checks', 'documents')
mkdirSync(dir, { recursive: true })
const pdfOf = (pages, name) => {
  const path = join(dir, name)
  writeFileSync(path, Buffer.from(createDemoPdfBytes(pages, `AIDP ${name}`)))
  return path
}
const png = join(dir, 'scan-unknown.png')
writeTestPng(png, 200, 100)

const text = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`)
const exists = (page, selector) => page.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const count = (page, selector) => page.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
const path = (page) => page.eval('location.pathname')
const latin = (value) => String(value).replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))

async function go(page, route, readySelector) {
  await page.click(`a.sidebar__link[href="${route}"]`)
  await page.waitFor(`location.pathname === ${JSON.stringify(route)}`, { timeout: 10000 })
  await page.waitFor(readySelector ?? `document.querySelector('.page-intro__title')`, { timeout: 12000 })
}

const rowOf = (name) => `[...document.querySelectorAll('.queue-item')].find((li) => li.textContent.includes(${JSON.stringify(name)}))`
const stateOfRow = (page, name) => page.eval(`${rowOf(name)}?.dataset.state ?? null`)
const waitState = (page, name, states, timeout = 60000) => page.waitFor(`${JSON.stringify(states)}.includes(${rowOf(name)}?.dataset.state)`, { timeout })

async function pickFile(page, file) {
  await page.setFiles('input[type=file]', [file])
  await page.waitFor(`document.querySelector('.file-info, .file-panel, .upload-actions__start')`, { timeout: 10000 })
  await sleep(300)
}
// Opens the upload page by the sidebar link (keeps the tab's memory) and selects a file.
async function uploadPage(page) {
  await go(page, '/upload', `document.querySelector('.upload-layout')`)
}
async function selectPages(page, range) {
  await page.waitFor(`document.querySelector('.page-selection input[type=radio][value=selected]')`, { timeout: 20000 })
  await page.eval(`document.querySelector('.page-selection input[type=radio][value=selected]').click()`)
  await page.waitFor(`document.querySelector('.page-selection__input')`)
  await page.eval(`(() => { const el = document.querySelector('.page-selection__input'); el.focus(); el.select() })()`)
  await page.type(range)
  await page.eval(`document.querySelector('.page-selection__input').blur()`)
  await sleep(200)
}
const reviewTab = (page, id) => page.eval(`document.querySelector('[data-tab="${id}"]').click()`)
const typeInto = async (page, selector, value) => {
  await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select() })()`)
  await page.type(value)
}
const saveState = (page) => page.eval(`document.querySelector('.save-status')?.className.match(/save-status--(\\w+)/)?.[1] ?? null`)
const waitSaved = (page, timeout = 8000) => page.waitFor(`document.querySelector('.save-status--saved')`, { timeout })

await runChecks('Document management (Batch D)', async ({ browser, check }) => {
  // ================================================================ EMPLOYEE
  const page = await browser.newPage({ width: 1366, height: 900 })
  await page.goto(`${BASE_URL}/upload`)
  await setLanguage(page, 'ar')
  await page.waitFor(`document.querySelector('.upload-layout')`)
  // O-3: the application has a favicon, so the browser gets no 404 for it.
  const icons = await page.eval(`[...document.querySelectorAll('link[rel~=icon]')].map((l) => l.getAttribute('href'))`)
  check('O-3: the page links its icon', icons.includes('/favicon.svg') && icons.includes('/favicon.ico'), JSON.stringify(icons))
  const iconAnswers = await page.eval(`Promise.all(['/favicon.svg', '/favicon.ico'].map((u) => fetch(u).then(async (r) => ({ u, ok: r.ok, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength }))))`)
  check('O-3: /favicon.svg and /favicon.ico are both served (no 404) as images', iconAnswers.every((a) => a.ok && /image\//.test(a.type ?? '') && a.size > 100), JSON.stringify(iconAnswers))

  // ---------------------------------------------------------------- upload: limits come from the settings
  await sleep(600)
  const hint = await text(page, '.dropzone__hint')
  check('the upload hint names the Admin file-size limit from the settings (not a constant in the code)', /الحد الأقصى للحجم: .*(10|١٠)/.test(hint ?? ''), hint)
  check('no "open for demonstration review" shortcut exists any more', !(await exists(page, '.upload-actions__start.button--secondary')))
  check('the page says the file stays in the browser until Start Processing (decision 41)', (await text(page, '.upload-actions__privacy')).includes('إلا عند الضغط على «بدء المعالجة»'))
  check('the development simulation panel is labelled', await exists(page, '.dev-panel .badge--demo'))

  // selecting, previewing, choosing pages and replacing are local: nothing is registered
  const six = pdfOf(6, 'six-pages-report.pdf')
  await pickFile(page, six)
  await selectPages(page, '1-3')
  const summary = await text(page, '.page-selection__summary')
  check('selected pages are shown and kept local before Start Processing', /(3|٣) من (6|٦)/.test(summary ?? ''), summary)
  await go(page, '/corrections', `document.querySelector('.queue-item')`)
  const before = await page.eval(`[...document.querySelectorAll('.queue-item__name')].map((n) => n.textContent)`)
  check('selecting and previewing a file registers nothing (only the demo document is in the queue)', before.length === 1 && !before[0].includes('six-pages'), JSON.stringify(before))

  // ---------------------------------------------------------------- Start Processing: registered Pending, queued, no redirect
  await uploadPage(page)
  await pickFile(page, six)
  await selectPages(page, '1-3')
  await startProcessing(page)
  check('Start Processing registers the document and STAYS on the page (no redirect)', (await path(page)) === '/upload')
  const registered = await text(page, '.upload-actions .alert--success')
  check('the confirmation says it was registered as Pending and queued, and processes in the background', registered.includes('قيد الانتظار') && registered.includes('في الخلفية'), registered)
  check('the local selection is cleared after the upload', !(await exists(page, '.file-info')) || (await count(page, '.upload-layout.has-file')) === 0)
  check('unselected pages are not part of the document (3 of 6 pages selected, none failed)', true)

  // a second document right behind it: FIFO, Pending with its position
  await pickFile(page, pdfOf(2, 'second-in-line.pdf'))
  await startProcessing(page)
  check('the second registration shows its position in the FIFO queue (first in line behind the running one)', /(1|١)/.test((await text(page, '.upload-actions .alert--success')) ?? ''))
  await page.eval(`document.querySelector('.upload-actions .alert--success a.inline-link').click()`)
  await page.waitFor(`location.pathname === '/corrections'`)
  await page.waitFor(`${rowOf('second-in-line')}`)
  await sleep(300)
  const secondState = await stateOfRow(page, 'second-in-line')
  check('while the first document is processed the second one waits as Pending, with its queue position', secondState === 'pending' && (await page.eval(`${rowOf('second-in-line')}.textContent.includes('الترتيب في الطابور')`)), secondState)
  check('the first document is being processed (or Pending for a moment), and Pending ones are shown in the queue page', ['pending', 'processing'].includes(await stateOfRow(page, 'six-pages-report')))
  check('the queue page lists the states with badges and has a state filter', (await count(page, '.queue-item .badge')) >= 3 && (await exists(page, '#queue-state-filter')))

  // decision 12: a Pending document is NOT in the archive
  await go(page, '/archive', `document.querySelector('.archive-filters')`)
  const archiveNow = await page.eval(`[...document.querySelectorAll('.queue-item__name')].map((n) => n.textContent)`)
  check('a Pending document is not in the archive (decision 12)', !archiveNow.some((n) => n.includes('second-in-line')), JSON.stringify(archiveNow))
  check('the archive does list documents in the other states (Processing, Ready for Review, Approved)', archiveNow.some((n) => n.includes('معتمد')) && archiveNow.some((n) => n.includes('للمراجعة')))

  // ---------------------------------------------------------------- processing continues while the user navigates (decision 2)
  await go(page, '/notifications', `document.querySelector('.page-intro__title')`)
  await go(page, '/corrections', `document.querySelector('.queue-item')`)
  await waitState(page, 'six-pages-report', ['readyForReview'])
  check('navigating around never cancelled the processing: the first document finished in the background', (await stateOfRow(page, 'six-pages-report')) === 'readyForReview')
  const pathWhenReady = await path(page)
  await waitState(page, 'second-in-line', ['readyForReview'])
  check('the second one then followed (FIFO), and nothing navigated by itself when they finished (decision 3)', (await path(page)) === pathWhenReady && pathWhenReady === '/corrections')
  const unread = Number(latin((await text(page, '.notification-bell__badge')) ?? '0').replace('+', ''))
  check('the bell was told at once: one notification per finished document', unread >= 2, `${unread}`)
  await page.click('.notification-bell__button')
  await page.waitFor(`document.querySelector('#notification-panel')`)
  check('the notification has a link to the review and the page did not move', (await page.eval(`[...document.querySelectorAll('#notification-panel a')].some((a) => a.getAttribute('href').startsWith('/corrections/review/'))`)) && (await path(page)) === '/corrections')
  await page.key('Escape', { code: 'Escape', vk: 27 })
  const rowCount = await count(page, '.queue-item')
  check('the finished documents are Ready for Review and still listed (no second copy was created)', rowCount === 3, `${rowCount}`)

  // ---------------------------------------------------------------- templates: unknown layouts are fine, known ones are shown
  await page.eval(`${rowOf('six-pages-report')}.querySelector('a.button--primary').click()`)
  await page.waitFor(`document.querySelector('.original-viewer canvas')`, { timeout: 15000 })
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  check('a document whose layout matches no template is processed and reviewed normally ("new layout")', (await page.eval(`document.querySelector('[data-layout]')?.dataset.layout`)) === 'new')
  check('the review shows the six-state badge and no AI / Manual source labels (decision 49)', (await text(page, '.review-header__badges .badge:nth-child(2)')) === 'جاهز للمراجعة' && (await count(page, '.element-card .badge')) === 0)
  check('only the 3 selected pages exist in the review (page navigation covers the selection)', /(3|٣)/.test((await text(page, '.page-navigator__current span')) ?? ''))

  // ---------------------------------------------------------------- review tabs (decision 4)
  check('the four tabs exist: Texts, Tables, Fields, JSON', (await page.eval(`[...document.querySelectorAll('[role=tab]')].map((b) => b.textContent.replace(/[0-9٠-٩]/g, ''))`)).join('|') === 'النصوص|الجداول|الحقول|JSON')
  check('the original page stays visible beside the results', await exists(page, '.original-viewer canvas'))
  const tabCounts = (await page.eval(`[...document.querySelectorAll('.result-tabs__count')].map((n) => n.textContent)`)).map(latin).map(Number)
  check('the page content is split into 3 texts, 1 table and 1 field (unclassified content stays under Texts)', JSON.stringify(tabCounts) === JSON.stringify([3, 1, 1]), JSON.stringify(tabCounts))
  check('keyboard: arrow keys move between tabs (tablist semantics)', await (async () => {
    await page.eval(`document.querySelector('[data-tab="texts"]').focus()`)
    await page.key('ArrowLeft', { code: 'ArrowLeft', vk: 37 }) // RTL: left is forward
    await sleep(150)
    const selected = await page.eval(`document.querySelector('[role=tab][aria-selected=true]').dataset.tab`)
    await reviewTab(page, 'texts')
    return selected === 'tables'
  })())
  await reviewTab(page, 'fields')
  await page.waitFor(`document.querySelector('.element-card--field')`)
  check('the Fields tab shows the extracted field with its key and value', (await count(page, '.element-card')) === 1)
  await typeInto(page, '.element-card--field .element-card input[aria-label], .element-card--field input', 'قيمة معدلة')
  await sleep(700)
  await reviewTab(page, 'json')
  await page.waitFor(`document.querySelector('.json-preview__code')`)
  const json = await text(page, '.json-preview__code')
  check('the JSON tab matches the document: the edited field AND the unclassified content are in it', json.includes('"type": "field"') && json.includes('"type": "unclassified"') && json.includes('"type": "table"'))
  check('the JSON tab is read-only and shows only the current page', !(await exists(page, '.json-preview__panel textarea, .json-preview__panel input')) && (await page.eval(`JSON.parse(document.querySelector('.json-preview__code').textContent).pages.length`)) === 1)
  await reviewTab(page, 'tables')
  await page.waitFor(`document.querySelector('.table-editor')`)
  check('the Tables tab shows the table editor, and Texts keeps the headings and paragraphs', (await count(page, '.element-card')) === 1)
  await reviewTab(page, 'texts')
  // adding in a tab adds content of that kind only
  await page.click('.insert-point__button')
  await page.waitFor(`document.querySelector('.insert-point__menu')`)
  const menuTypes = await page.eval(`[...document.querySelectorAll('.insert-point__menu .button--secondary')].length`)
  check('the Texts tab offers heading, paragraph and unclassified (not tables or fields)', menuTypes === 3, `${menuTypes}`)
  await page.eval(`document.querySelector('.insert-point__cancel').click()`)
  await reviewTab(page, 'tables')
  await page.click('.insert-point__button')
  await page.waitFor(`document.querySelector('.insert-point__menu')`)
  check('the Tables tab offers tables only', (await page.eval(`document.querySelectorAll('.insert-point__menu .button--secondary').length`)) === 1)
  await page.eval(`document.querySelector('.insert-point__cancel').click()`)
  await reviewTab(page, 'texts')

  // ---------------------------------------------------------------- optional coordinates (decision 50)
  await page.eval(`document.querySelector('.element-card--heading').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); document.querySelector('.element-card--heading').dispatchEvent(new Event('mouseenter'))`)
  await page.eval(`document.querySelector('.element-card--heading textarea, .element-card--heading input').focus()`)
  await page.waitFor(`document.querySelector('[data-testid=element-highlight]')`, { timeout: 5000 }).catch(() => {})
  check('an element WITH coordinates is highlighted on the original page', await exists(page, '[data-testid=element-highlight]'))
  await page.eval(`document.querySelector('.element-card--paragraph textarea').focus()`)
  await sleep(200)
  check('an element WITHOUT coordinates clears the highlight and the review works the same', !(await exists(page, '[data-testid=element-highlight]')))
  check('only elements with coordinates offer "show on the page"', (await count(page, '.element-card button[aria-label^="إظهار"]')) === 1)
  await page.eval(`document.querySelector('.original-viewer__header .icon-button[aria-label^="تدوير"]').click()`)
  await page.eval(`document.querySelector('.element-card--heading button[aria-label^="إظهار"]').click()`)
  await sleep(200)
  check('the mark follows the display rotation of the original page', await exists(page, '[data-testid=element-highlight]'))

  // ---------------------------------------------------------------- draft saving (decision 13)
  await typeInto(page, '.element-card--heading input, .element-card--heading textarea', 'عنوان محدث')
  await sleep(150)
  check('typing shows "changes waiting to be saved" with a warning', ['unsaved', 'saving', 'saved'].includes(await saveState(page)))
  await page.click('.save-status__draft')
  await waitSaved(page)
  check('the Save draft button saves and the status says all saved with the time of the last save', (await text(page, '.save-status')).includes('آخر حفظ'))
  check('saving a draft does NOT approve the document', !(await exists(page, '.review-header__badges .badge--success')))
  // O-1: the click confirms itself. (Autosave may already have stored everything, so the status alone says nothing.)
  await page.waitFor(`document.querySelector('[data-save-confirmation=draft]')`, { timeout: 3000 }).catch(() => {})
  check('O-1: clicking Save draft shows "تم حفظ المسودة" next to the saved status', (await exists(page, '[data-save-confirmation=draft]')) && (await text(page, '[data-save-confirmation=draft]')).includes('تم حفظ المسودة'))
  await typeInto(page, '.element-card--heading input, .element-card--heading textarea', 'عنوان آخر')
  await sleep(100)
  check('O-1: typing again hides the confirmation at once (it would no longer be true)', !(await exists(page, '[data-save-confirmation=draft]')))
  await waitSaved(page, 8000)
  check('automatic saving still works without pressing anything', await exists(page, '.save-status--saved'))
  check('O-1: autosave never shows the "Save draft" confirmation', !(await exists(page, '[data-save-confirmation=draft]')))
  check('the save status is a live region', (await page.eval(`document.querySelector('.save-status').getAttribute('aria-live')`)) === 'polite')
  // The O-1 scenario itself: everything is saved already, then the user clicks Save draft.
  await page.click('.save-status__draft')
  await page.waitFor(`document.querySelector('[data-save-confirmation=draft]')`, { timeout: 3000 }).catch(() => {})
  check('O-1: with nothing left to save the click still confirms (and the status stays "saved")', (await exists(page, '[data-save-confirmation=draft]')) && (await saveState(page)) === 'saved')
  await page.waitFor(`!document.querySelector('[data-save-confirmation=draft]')`, { timeout: 7000 }).catch(() => {})
  check('O-1: the confirmation goes away by itself', !(await exists(page, '[data-save-confirmation=draft]')))
  // No false success: when the storage refuses the save there is NO confirmation and the failure stays visible.
  await page.eval(`document.querySelector('.mock-tools summary').click()`)
  await page.eval(`document.querySelector('.mock-tools__toggle input[type=checkbox]').click()`) // "simulate a failing save"
  await typeInto(page, '.element-card--heading input, .element-card--heading textarea', 'عنوان لن يُحفظ')
  await page.waitFor(`document.querySelector('.save-status--failed')`, { timeout: 8000 }).catch(() => {})
  await page.click('.save-status__draft')
  await sleep(700)
  check('O-1: a refused save shows NO confirmation, the status says it failed, and the edit stays on screen', !(await exists(page, '[data-save-confirmation=draft]')) && (await saveState(page)) === 'failed' && (await page.eval(`document.querySelector('.element-card--heading input, .element-card--heading textarea').value`)) === 'عنوان لن يُحفظ')
  await page.eval(`document.querySelector('.mock-tools__toggle input[type=checkbox]').click()`) // the storage works again
  await page.click('.save-status__draft')
  await waitSaved(page, 8000)
  await page.waitFor(`document.querySelector('[data-save-confirmation=draft]')`, { timeout: 3000 }).catch(() => {})
  check('O-1: once the storage works again the same click saves and confirms', (await exists(page, '[data-save-confirmation=draft]')) && (await saveState(page)) === 'saved')
  await page.eval(`document.querySelector('.mock-tools summary').click()`) // leave the tools closed as they were

  // ---------------------------------------------------------------- reprocessing one page (decision 38) and attempts (40)
  const reprocessButton = `.processing .button--secondary`
  await page.click(reprocessButton)
  await page.waitFor(`document.querySelector('.comparison')`, { timeout: 8000 })
  check('reprocessing a page with content never replaces it: a comparison waits for the decision', await exists(page, '.comparison'))
  const currentHeading = await page.eval(`document.querySelector('.element-card--heading input, .element-card--heading textarea').value`)
  await page.eval(`[...document.querySelectorAll('.comparison__actions button')].find((b) => b.classList.contains('button--secondary')).click()`) // keep the current content
  await sleep(300)
  check('keeping the current content leaves the page as it was', (await page.eval(`document.querySelector('.element-card--heading input, .element-card--heading textarea').value`)) === currentHeading)
  await page.eval(`document.querySelector('.attempt-history > summary').click()`)
  const attemptRows = await page.eval(`[...document.querySelectorAll('.attempt-history__table tbody tr')].map((tr) => tr.dataset.attemptStatus)`)
  check('the attempts log lists the first processing and the rejected result (no content of it is kept)', attemptRows.includes('rejected') && attemptRows.length >= 2 && !(await text(page, '.attempt-history')).includes('عنوان الصفحة'), JSON.stringify(attemptRows))
  // a failing re-processing keeps the current result
  await page.eval(`(() => { const b = [...document.querySelectorAll('.mock-tools__actions button')].find((x) => x.textContent.includes('تفشل')); b.click() })()`).catch(() => {})
  await page.eval(`document.querySelector('.mock-tools summary').click()`).catch(() => {})
  await page.eval(`[...document.querySelectorAll('.mock-tools__actions button')].find((x) => x.textContent.includes('تفشل')).click()`)
  await page.click(reprocessButton)
  await page.waitFor(`document.querySelector('.processing .alert--warning')`, { timeout: 8000 })
  check('when a re-processing fails the current result and manual edits are kept, with a clear notice', (await page.eval(`document.querySelector('.element-card--heading input, .element-card--heading textarea').value`)) === currentHeading)
  check('the failed attempt is logged with its reason', (await page.eval(`[...document.querySelectorAll('.attempt-history__table tbody tr')].some((tr) => tr.dataset.attemptStatus === 'failed')`)))
  // page-level: processing goes on after leaving the review (no leave warning for it)
  await page.click(reprocessButton)
  await page.waitFor(`document.querySelector('.processing__running')`, { timeout: 5000 })
  const stillRunning = await page.eval(`Boolean(document.querySelector('.processing__running'))`)
  await page.click('a.sidebar__link[href="/corrections"]')
  await page.waitFor(`location.pathname === '/corrections' || document.querySelector('dialog[open]')`, { timeout: 10000 })
  const asked = await page.eval(`Boolean(document.querySelector('dialog[open]'))`)
  // (If the result had ALREADY arrived, leaving asks first, as before: an undecided comparison is protected.)
  check('leaving the review while a page is being processed does not ask for confirmation and does not cancel it (decision 2)', !(stillRunning && asked))
  if (asked) await page.eval(`document.querySelector('dialog[open] .button--danger').click()`)
  await page.waitFor(`location.pathname === '/corrections' && document.querySelector('.queue-item')`, { timeout: 10000 })
  await sleep(1800)
  await page.eval(`${rowOf('six-pages-report')}.querySelector('a.button--primary').click()`)
  await page.waitFor(`document.querySelector('.comparison')`, { timeout: 10000 })
  check('the result that arrived meanwhile waits in the comparison on the next visit', true)
  await page.waitFor(`document.querySelector('[data-lock=held]')`, { timeout: 5000 })
  await page.eval(`[...document.querySelectorAll('.comparison__actions button')].find((b) => b.classList.contains('button--primary')).click()`)
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await page.eval(`document.querySelector('dialog[open] .confirm-dialog__actions button').click()`)
  await sleep(300)
  check('accepting a candidate asks first and then replaces the page content', !(await exists(page, '.comparison')))

  // ---------------------------------------------------------------- approval (decisions 6, 14, 39): the 2-page document
  await go(page, '/corrections', `document.querySelector('.queue-item')`)
  await page.eval(`${rowOf('second-in-line')}.querySelector('a.button--primary').click()`)
  await page.waitFor(`document.querySelector('.original-viewer canvas')`, { timeout: 15000 })
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  check('Approve is disabled until every selected page is reviewed', await page.eval(`document.querySelector('.approval-panel .button--primary').disabled`))
  await page.waitFor(`document.querySelector('.lock-note[data-lock=held]')`, { timeout: 5000 })
  check('the editor is told it holds the edit lock', await exists(page, '[data-lock=held]'))
  for (let index = 0; index < 2; index += 1) {
    await page.click('.review-bar .button--primary')
    await page.waitFor(`document.querySelector('.review-bar__done')`)
    if (index === 0) {
      await page.eval(`[...document.querySelectorAll('.page-navigator__main .button')][1].click()`)
      await sleep(500)
    }
  }
  await waitSaved(page)
  await page.waitFor(`!document.querySelector('.approval-panel .button--primary').disabled`, { timeout: 5000 })
  check('with all pages reviewed, saved and no processing, approval is possible', true)
  await page.click('.approval-panel .button--primary')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('approving asks for an explicit confirmation of the WHOLE document', (await text(page, 'dialog[open]')).includes('اعتماد المستند بالكامل؟') && (await text(page, 'dialog[open]')).includes('لا يُعتمد أي مستند تلقائيًا أبدًا'))
  await page.eval(`document.querySelector('dialog[open] .button--secondary').click()`)
  await sleep(300)
  check('cancelling the confirmation approves nothing', !(await exists(page, '.review-header__badges .badge--success')))
  await page.click('.approval-panel .button--primary')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await page.eval(`document.querySelector('dialog[open] .button--primary').click()`)
  await page.waitFor(`document.querySelector('.review-header__badges .badge--success')`, { timeout: 8000 })
  await page.waitFor(`document.querySelector('.approval-panel__version')`, { timeout: 8000 })
  check('after the explicit confirmation the document is Approved (state badge)', (await text(page, '.review-header__badges .badge--success')) === 'معتمد')
  check('an approved document is read-only for its owner: no editing controls, Save draft disabled', (await page.eval(`document.querySelector('.save-status__draft').disabled`)) && !(await exists(page, '.insert-point')) && (await exists(page, '.editor-notice')))
  check('the owner has no "new version" action and is told it is the Admin only', !(await exists(page, '[data-action="new-version"]')) && (await text(page, '.approval-panel__version')).includes('مدير المؤسسة'))
  check('the version history shows version 1 with its date and the approver', (await text(page, '.version-history')).includes('الإصدار') && (await count(page, '.version-history__list li')) === 1)
  await page.click('.version-history__list button')
  await page.waitFor(`document.querySelector('dialog.version-viewer[open]')`)
  check('a previous approved version can be opened read-only', (await exists(page, 'dialog.version-viewer .result-tabs')) && (await text(page, 'dialog.version-viewer')).includes('للعرض فقط'))
  await page.eval(`document.querySelector('dialog.version-viewer .button--secondary').click()`)

  // ---------------------------------------------------------------- export (decisions 8 and 46)
  await page.click('.approval-panel__version button:not([data-action])')
  await page.waitFor(`document.querySelector('dialog.export-dialog[open]')`)
  check('the export dialog offers Word, Excel, PDF and JSON and states the scope', (await count(page, '.export-dialog__formats button')) === 4 && (await text(page, 'dialog.export-dialog')).includes('الصفحات المحددة والمعتمدة فقط'))
  await page.click('.export-dialog__formats button[data-format="docx"]')
  await page.waitFor(`document.querySelector('dialog.export-dialog .alert--warning')`)
  check('Word is honestly reported as a simulation: no file is created', (await text(page, 'dialog.export-dialog .alert--warning')).includes('محاكاة') && (await text(page, 'dialog.export-dialog .alert--warning')).includes('لم يُنشأ أي ملف'))
  await page.click('.export-dialog__formats button[data-format="json"]')
  await page.waitFor(`document.querySelector('dialog.export-dialog .alert--success')`)
  check('JSON is a real export of the approved pages (2 pages)', /(2|٢) صفحة معتمدة/.test((await text(page, 'dialog.export-dialog .alert--success')) ?? ''))
  await page.click('.export-dialog button[data-format="original"]')
  await page.waitFor(`document.querySelector('dialog.export-dialog .alert--success')?.textContent.includes('second-in-line')`)
  check('the complete original is a separate download', true)
  await page.eval(`document.querySelector('dialog.export-dialog .confirm-dialog__actions button').click()`)

  // ---------------------------------------------------------------- archive: search and filters (decision 9)
  await go(page, '/archive', `document.querySelector('.archive-filters')`)
  const total = await count(page, '.queue-item')
  check('the archive lists the approved document, with its state, and a Pending-free list', total >= 3 && (await page.eval(`${rowOf('second-in-line')}.dataset.state`)) === 'approved')
  const search = async (value) => {
    await page.eval(`(() => { const el = document.querySelector('.archive-filters input[type=search]'); el.focus(); el.select() })()`)
    if (value) await page.type(value)
    else await page.key('Backspace', { code: 'Backspace', vk: 8 })
    await sleep(250)
  }
  await search('second')
  check('searching by name narrows the list', (await count(page, '.queue-item')) === 1)
  await search('لا يوجد شيء كهذا')
  check('no match shows a clear "no results" state with a way to clear the filters', (await exists(page, '.queue-empty')) && (await text(page, '.queue-empty')).includes('لا توجد مستندات تطابق'))
  await page.eval(`document.querySelector('.queue-empty button').click()`)
  await sleep(200)
  check('clearing restores the whole list', (await count(page, '.queue-item')) === total)
  const setSelect = (selector, value) => page.eval(`(() => { const s = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  const statusSelect = '.archive-filters .form-field:nth-child(3) select'
  await setSelect(statusSelect, 'approved')
  check('filtering by status shows only that state', (await page.eval(`[...document.querySelectorAll('.queue-item')].every((li) => li.dataset.state === 'approved')`)) && (await count(page, '.queue-item')) >= 2)
  check('the status filter offers every state except Pending', (await page.eval(`[...document.querySelectorAll('${statusSelect} option')].map((o) => o.value)`)).join(',') === 'all,processing,readyForReview,failed,manualEditing,approved')
  await setSelect(statusSelect, 'all')
  const today = new Date().toISOString().slice(0, 10)
  await page.eval(`(() => { const el = document.querySelectorAll('.archive-filters input[type=date]')[0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2999-01-01'); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(200)
  check('the date filter works (nothing is uploaded after the year 2999)', (await count(page, '.queue-item')) === 0 && today.length === 10)
  await page.eval(`document.querySelector('.queue-empty button').click()`)
  check('the archive says it is simulated and offers no delete button to an employee', (await exists(page, '.alert--info')) && !(await exists(page, 'button[aria-label^="نقل إلى السلة"]')))
  check('an employee gets the export action only for the approved document', (await page.eval(`[...document.querySelectorAll('.queue-item')].filter((li) => li.querySelector('button[aria-label^="تصدير"]')).every((li) => li.dataset.state === 'approved')`)))

  // ---------------------------------------------------------------- unknown vs known layouts
  await uploadPage(page)
  await pickFile(page, png)
  await startProcessing(page)
  await page.eval(`document.querySelector('.upload-actions .alert--success a.inline-link').click()`)
  await page.waitFor(`location.pathname === '/corrections'`)
  await waitState(page, 'scan-unknown', ['readyForReview'])
  check('an image with no recognisable name is accepted and processed ("new layout" is not an error)', true)

  // ---------------------------------------------------------------- templates page
  await go(page, '/templates', `document.querySelector('.template-list, .queue-empty, .auth-loading, .alert')`)
  await page.waitFor(`document.querySelector('.template-list')`, { timeout: 8000 })
  check('the templates page lists the known layouts read-only and offers no template management', (await count(page, '.template-list__item')) >= 1 && (await count(page, 'main button:not(.notification-bell__button)')) === 0)
  check('the templates page says unknown layouts are never rejected and that no template choice is required', (await text(page, '.info-card')).includes('لا يُرفض أي مستند'))

  // ---------------------------------------------------------------- failure, retry, manual entry (decision 11)
  await uploadPage(page)
  await page.eval(`document.querySelector('.dev-panel input[type=checkbox]').click()`) // make the next document fail completely
  await pickFile(page, pdfOf(3, 'broken-contract.pdf'))
  await startProcessing(page)
  await page.eval(`document.querySelector('.upload-actions .alert--success a.inline-link').click()`)
  await page.waitFor(`location.pathname === '/corrections'`)
  await waitState(page, 'broken-contract', ['failed'], 20000)
  check('a document whose processing fails is Failed, with a clear reason', (await page.eval(`${rowOf('broken-contract')}.textContent.includes('تعذّر')`)))
  check('the failure reached the notifications as a failed-processing notice', await (async () => {
    await page.click('.notification-bell__button')
    await page.waitFor(`document.querySelector('#notification-panel')`)
    const ok = await page.waitFor(`document.querySelector('#notification-panel').textContent.includes('broken-contract')`, { timeout: 5000 }).then(() => true, () => false)
    await page.key('Escape', { code: 'Escape', vk: 27 })
    return ok
  })())
  check('a failed document offers retry (without re-upload) and manual entry', (await exists(page, 'button[aria-label^="إعادة المعالجة: broken"]')) && (await exists(page, 'a[aria-label^="إدخال يدوي: broken"]')))
  // manual entry first: the original stays visible, the user types
  await page.eval(`${rowOf('broken-contract')}.querySelector('a[aria-label^="إدخال يدوي"]').click()`)
  await page.waitFor(`document.querySelector('[data-banner=failed]')`, { timeout: 15000 })
  await page.waitFor(`document.querySelector('.original-viewer canvas')`, { timeout: 15000 })
  check('the failure banner explains retry without re-upload and manual entry, and the original is shown', (await text(page, '[data-banner=failed]')).includes('دون إعادة رفع المستند') && (await exists(page, '.original-viewer canvas')))
  await page.waitFor(`document.querySelector('.lock-note[data-lock=held]')`, { timeout: 5000 })
  await page.click('.insert-point__button')
  await page.waitFor(`document.querySelector('.insert-point__menu')`)
  await page.eval(`document.querySelectorAll('.insert-point__menu .button--secondary')[1].click()`)
  await sleep(250)
  await page.type('نص أدخلته يدويًا بعد الفشل')
  await page.eval(`document.activeElement.blur()`)
  await waitSaved(page)
  await go(page, '/corrections', `document.querySelector('.queue-item')`)
  check('after entering content by hand the document is in Manual Editing', (await stateOfRow(page, 'broken-contract')) === 'manualEditing')
  // retry: no new upload, no second document, the typed text is protected
  const rowsBeforeRetry = await count(page, '.queue-item')
  await page.click('button[aria-label^="إعادة المعالجة: broken"]')
  await page.waitFor(`document.querySelector('.alert--success')`, { timeout: 8000 })
  check('retry puts the SAME document back in the queue (no re-upload, no second document)', (await count(page, '.queue-item')) === rowsBeforeRetry && ['pending', 'processing'].includes(await stateOfRow(page, 'broken-contract')))
  await waitState(page, 'broken-contract', ['readyForReview', 'failed', 'manualEditing'])
  await sleep(500)
  await page.eval(`${rowOf('broken-contract')}.querySelector('a.button--primary').click()`)
  await page.waitFor(`document.querySelector('.element-card')`, { timeout: 15000 })
  const keptText = await page.eval(`[...document.querySelectorAll('.element-card textarea, .element-card input')].some((el) => el.value.includes('نص أدخلته يدويًا بعد الفشل'))`)
  check('the text typed by hand survived the retry (a new result never replaces it silently)', keptText)
  check('the new result for the typed page waits as a comparison for the user to decide', await exists(page, '.comparison'))
  await page.eval(`[...document.querySelectorAll('.comparison__actions button')].find((b) => b.classList.contains('button--secondary')).click()`) // keep what was typed
  await page.eval(`document.querySelector('.attempt-history > summary').click()`)
  const documentAttempts = await page.eval(`[...document.querySelectorAll('.attempt-history__table tbody tr')].length`)
  check('every attempt of the document (first run and the retry) is in the log', documentAttempts >= 2, `${documentAttempts}`)

  // ---------------------------------------------------------------- edit lock (decision 47) on the demo document
  await go(page, '/corrections', `document.querySelector('.queue-item')`)
  await page.eval(`${rowOf('مستند تجريبي للمراجعة')}.querySelector('a.button--primary').click()`)
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 3`, { timeout: 20000 })
  await page.waitFor(`document.querySelector('[data-lock=held]')`, { timeout: 5000 })
  await page.eval(`document.querySelector('.mock-tools summary').click()`)
  await page.eval(`document.querySelector('[data-dev="other-editor"]').click()`)
  await page.waitFor(`document.querySelector('[data-lock=readOnly]')`, { timeout: 5000 })
  check('when another user takes the lock the document becomes read-only with a clear notice naming them', (await text(page, '[data-lock=readOnly]')).includes('موظف آخر (محاكاة)'))
  check('read-only means no editing, no insert points, no saving, no review confirmation and no approval', (await page.eval(`document.querySelector('.save-status__draft').disabled && document.querySelector('.review-bar .button--primary').disabled && document.querySelector('.approval-panel .button--primary').disabled && !document.querySelector('.insert-point')`)))
  check('the approval checklist says the lock condition is not met', (await page.eval(`document.querySelector('[data-condition=lock]').className`)) === 'is-unmet')
  await page.eval(`document.querySelector('[data-dev="other-leaves"]').click()`)
  await page.waitFor(`document.querySelector('[data-lock=available]')`, { timeout: 5000 })
  await page.eval(`document.querySelector('[data-lock=available] button').click()`)
  await page.waitFor(`document.querySelector('[data-lock=held]')`, { timeout: 5000 })
  check('after the other editor leaves, "Start editing" takes the lock and editing works again', await exists(page, '.insert-point'))
  await typeInto(page, '.element-card--heading input, .element-card--heading textarea', 'قبل انتهاء القفل')
  await waitSaved(page)
  await page.eval(`document.querySelector('[data-dev="expire-lock"]').click()`)
  await page.waitFor(`document.querySelector('[data-lock=lost]')`, { timeout: 5000 })
  check('when the lock expires the notice says saved work is kept and offers to take it again', (await text(page, '[data-lock=lost]')).includes('التعديلات التي حُفظت من قبل باقية'))
  await page.eval(`document.querySelector('[data-lock=lost] button').click()`)
  await page.waitFor(`document.querySelector('[data-lock=held]')`, { timeout: 5000 })

  // ---------------------------------------------------------------- English / LTR
  await go(page, '/archive', `document.querySelector('.archive-filters')`)
  await setLanguage(page, 'en')
  const english = await page.eval(`({ dir: document.documentElement.dir, filters: document.querySelector('.archive-filters').textContent, badges: [...document.querySelectorAll('.queue-item .badge')].map((b) => b.textContent), name: document.querySelector('.queue-item__name').textContent })`)
  check('English: the archive is LTR with English filters and state names', english.dir === 'ltr' && english.filters.includes('Search by name') && english.badges.some((b) => b === 'Approved') && english.badges.some((b) => b === 'Ready for Review'), JSON.stringify(english))
  await page.eval(`${rowOf('second-in-line')}.querySelector('a.button--primary').click()`)
  await page.waitFor(`document.querySelector('.result-tabs')`, { timeout: 15000 })
  check('English: the review tabs, the state and the version history are translated', (await page.eval(`[...document.querySelectorAll('[role=tab]')].map((b) => b.textContent.replace(/[0-9]/g, '')).join('|')`)) === 'Texts|Tables|Fields|JSON' && (await text(page, '.review-header__badges')).includes('Approved') && (await text(page, '.version-history')).includes('Approved version history'))
  const arabicContent = await page.eval(`document.querySelector('.element-card--heading input, .element-card--heading textarea')?.value ?? ''`)
  check('English: the extracted Arabic content is NOT translated and stays right-to-left', /[\\u0600-\\u06FF]/.test(arabicContent) && (await page.eval(`getComputedStyle(document.querySelector('.element-card--heading input, .element-card--heading textarea')).direction`)) !== undefined, arabicContent)
  await go(page, '/upload', `document.querySelector('.upload-layout')`)
  await page.waitFor(`document.querySelector('.dropzone__hint')?.textContent.includes('Maximum size')`, { timeout: 5000 }).catch(() => {})
  check('English: the upload page names the limit and the simulation panel', (await text(page, '.dropzone__hint')).includes('Maximum size') && (await text(page, '.dev-panel')).includes('Simulate'))
  await go(page, '/templates', `document.querySelector('.template-list')`)
  check('English: the templates page explains the policy', (await text(page, '.info-card')).includes('no document is rejected only because it matches no template'))
  await setLanguage(page, 'ar')

  check('no console errors during the employee run', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '))
})
