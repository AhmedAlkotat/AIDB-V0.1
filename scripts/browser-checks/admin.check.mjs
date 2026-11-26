// Browser checks for Batch C: recycle bin, backup and restore (simulated), audit log, storage
// monitoring, notifications and system settings, for both roles and both languages. They drive the
// development server, whose mock services share one session, one account store and one system
// state. Nothing real is backed up, restored or deleted.
//
//   npm run dev -- --port 5199   (terminal 1)
//   node scripts/browser-checks/admin.check.mjs   (terminal 2)

import { sleep } from './cdp.mjs'
import { BASE_URL, runChecks } from './harness.mjs'

const text = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`)
const exists = (page, selector) => page.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const count = (page, selector) => page.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
const path = (page) => page.eval('location.pathname')
const REVIEW_DOC = 'مستند تجريبي للمراجعة'

async function signIn(page, identifier, password) {
  await page.waitFor(`document.querySelector('#login-identifier')`)
  await page.eval(`(() => { const el = document.querySelector('#login-identifier'); el.focus(); el.select() })()`)
  await page.type(identifier)
  await page.eval(`(() => { const el = document.querySelector('#login-password'); el.focus(); el.select() })()`)
  await page.type(password)
  await page.click('.auth-form__submit')
  await page.waitFor(`document.querySelector('.user-badge')`, { timeout: 10000 })
}

async function signOut(page) {
  await page.click('a.sidebar__logout')
  await page.waitFor(`location.pathname === '/login'`, { timeout: 10000 })
}

async function open(page, route, readySelector) {
  await page.goto(`${BASE_URL}${route}`)
  await page.waitFor(readySelector ?? `document.querySelector('.page-intro__title')`, { timeout: 12000 })
}

// In-app navigation through the sidebar. The documents live in the browser tab's memory (no
// backend yet), so a full page load (goto) would forget them: use this between steps that depend on them.
async function go(page, route, readySelector) {
  await page.click(`a.sidebar__link[href="${route}"]`)
  await page.waitFor(`location.pathname === ${JSON.stringify(route)}`)
  await page.waitFor(readySelector ?? `document.querySelector('.page-intro__title')`, { timeout: 12000 })
}

// Types into the field labelled `label` inside `scope`.
async function fill(page, label, value, scope) {
  await page.eval(`(() => {
    const label = [...document.querySelectorAll(${JSON.stringify(`${scope} label`)})].find((el) => el.textContent.trim().startsWith(${JSON.stringify(label)}))
    if (!label) throw new Error('No field labelled ${label}')
    const input = document.getElementById(label.htmlFor)
    input.focus(); input.select()
  })()`)
  await page.type(value)
}

const sectionEval = (page, heading, body) =>
  page.eval(`(() => { const section = [...document.querySelectorAll('.settings-section')].find((s) => s.querySelector('h2').textContent.trim() === ${JSON.stringify(heading)}); return ${body} })()`)

async function setSelect(page, selector, value) {
  await page.eval(`(() => { const select = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
}

const confirmDisabled = (page) => page.eval(`document.querySelector('dialog[open] button[type=submit]').disabled`)
const submitDialog = (page) => page.click('dialog[open] button[type=submit]')
const cancelDialog = (page) => page.eval(`document.querySelector('dialog[open] .button--secondary').click()`)
const waitDialogClosed = (page) => page.waitFor(`!document.querySelector('dialog[open]')`, { timeout: 10000 })
const tickAcknowledgement = (page) => page.eval(`document.querySelector('dialog[open] input[type=checkbox]').click()`)
// The badge uses the page's own digits (Arabic-Indic in Arabic): convert before comparing.
const unread = async (page) => Number(((await text(page, '.notification-bell__badge')) ?? '0').replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace('+', ''))

const ADMIN_PAGES = ['/admin/employees', '/admin/recycle-bin', '/admin/backups', '/admin/audit-log', '/admin/storage', '/admin/settings']

await runChecks('System administration, notifications and settings (Batch C)', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 900, session: null })
  await page.goto(`${BASE_URL}/login`)
  await page.eval(`(() => { const b = [...document.querySelectorAll('.auth-dev button')].pop(); b.click() })()`) // reset mock data
  await sleep(300)
  await signIn(page, 'admin', 'admin-dev')

  // ---------------------------------------------------------------- navigation
  const links = await page.eval(`[...document.querySelectorAll('.sidebar a.sidebar__link')].map((a) => a.getAttribute('href'))`)
  check('the Admin sidebar lists all six Admin pages and notifications', ADMIN_PAGES.every((href) => links.includes(href)) && links.includes('/notifications'), links.join(','))

  // ---------------------------------------------------------------- recycle bin
  await open(page, '/corrections', `document.querySelector('.queue-item')`)
  check('the Admin sees a "move to the bin" button on each document', (await count(page, 'button[aria-label^="نقل إلى السلة"]')) >= 1)
  await page.click(`button[aria-label="نقل إلى السلة: ${REVIEW_DOC}"]`).catch(async () => page.click('.queue-item button.button--outline-danger'))
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('deleting asks for explicit confirmation and promises a soft delete', (await text(page, 'dialog[open]')).includes('يبقى الأصل والنتائج والمسودات والإصدارات محفوظة') && (await exists(page, 'dialog[open] .button--danger')))
  await cancelDialog(page)
  await waitDialogClosed(page)
  check('cancelling deletes nothing', (await count(page, '.queue-item')) >= 1)
  const before = await count(page, '.queue-item')
  await page.click('.queue-item button.button--outline-danger')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await submitDialog(page)
  await waitDialogClosed(page)
  await page.waitFor(`document.querySelector('.alert--success')`)
  check('confirming moves the document out of the normal list and confirms', (await count(page, '.queue-item')) === before - 1 && (await text(page, '.alert--success')).includes('سلة المحذوفات'))

  await go(page, '/admin/recycle-bin', `document.querySelector('.employee-table, .queue-empty')`)
  check('the bin lists the deleted document with the days left before automatic deletion', (await count(page, '.employee-table tbody tr')) === 1 && (await page.eval(`document.querySelector('.employee-table tbody').textContent.includes('30')`)))
  check('the bin states the retention policy and that the archive is not affected', (await page.eval(`document.querySelector('.alert--info').textContent.includes('الأرشيف العادي')`)))
  check('the bin says it is simulated', await exists(page, '.alert--warning .badge--demo'))
  await page.click('button[aria-label^="استعادة:"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await submitDialog(page)
  await waitDialogClosed(page)
  await page.waitFor(`document.querySelector('.alert--success')`)
  check('restoring (after a confirmation) empties the bin', (await exists(page, '.queue-empty')) && (await text(page, '.alert--success')).includes('تمت استعادة'))
  await go(page, '/corrections', `document.querySelector('.queue-item')`)
  check('the restored document is back in the normal list', (await count(page, '.queue-item')) === before)
  await page.click('.queue-item button.button--outline-danger')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await submitDialog(page)
  await waitDialogClosed(page)
  await go(page, '/admin/recycle-bin', `document.querySelector('.employee-table')`)
  await page.click('button[aria-label^="حذف نهائي:"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('a permanent deletion cannot be confirmed until the irreversibility is acknowledged', (await confirmDisabled(page)) && (await text(page, 'dialog[open]')).includes('لا يمكن التراجع'))
  await tickAcknowledgement(page)
  check('ticking the acknowledgement enables the confirmation', !(await confirmDisabled(page)))
  await submitDialog(page)
  await waitDialogClosed(page)
  await page.waitFor(`document.querySelector('.queue-empty')`)
  check('after the permanent deletion the bin is empty', (await text(page, '.alert--success')).includes('نهائيًا'))

  // ---------------------------------------------------------------- backups
  await open(page, '/admin/backups', `document.querySelector('.employee-table')`)
  check('the backups page states plainly that everything is simulated', (await page.eval(`document.querySelector('.alert--warning').textContent.includes('لا تُنشأ نسخ احتياطية فعلية')`)) && (await exists(page, '.alert--warning .badge--demo')))
  const backupsBefore = await count(page, '.employee-table tbody tr')
  await page.click('.page-intro__action')
  await page.waitFor(`document.querySelector('.alert--success')`, { timeout: 10000 })
  await page.waitFor(`document.querySelectorAll('.employee-table tbody tr').length === ${backupsBefore + 1} && !document.querySelector('.page-intro__action').disabled`, { timeout: 8000 })
  check('creating a backup adds a manual (simulated) backup', (await count(page, '.employee-table tbody tr')) === backupsBefore + 1 && (await text(page, '.alert--success')).includes('محاكاة'))
  await page.eval(`document.querySelectorAll('.dev-panel input[type=checkbox]')[0].click()`)
  await page.click('.page-intro__action')
  await page.waitFor(`document.querySelector('.alert--error')`, { timeout: 10000 })
  await page.waitFor(`document.querySelectorAll('.employee-table tbody tr').length === ${backupsBefore + 2} && !document.querySelector('.page-intro__action').disabled`, { timeout: 8000 })
  check('a failed backup is reported as a failure and appears as failed', (await text(page, '.alert--error')).includes('فشل إنشاء النسخة الاحتياطية') && (await exists(page, '.employee-table tr[data-status="failed"]')))
  check('the failed backup cannot be restored or tested', await page.eval(`[...document.querySelectorAll('.employee-table tr[data-status="failed"] button')].filter((b) => b.textContent.includes('استعادة')).every((b) => b.disabled)`))
  await page.click('.employee-table tbody tr[data-status="completed"] button[aria-pressed]')
  await page.waitFor(`document.querySelector('.alert--success')`)
  check('a backup can be protected from the retention policy', (await text(page, '.alert--success')).includes('محمية'))
  await page.waitFor(`!document.querySelector('.employee-table tbody tr[data-status="completed"] .employee-table__actions button:first-child').disabled`)
  await page.click('.employee-table tbody tr[data-status="completed"] .employee-table__actions button:first-child')
  await page.waitFor(`document.querySelector('.alert--success')?.textContent.includes('اختبار الاستعادة')`)
  await page.waitFor(`!document.querySelector('.employee-table tbody tr[data-status="completed"] button.button--outline-danger').disabled`)
  check('"test restore" reports success (simulated)', (await text(page, '.alert--success')).includes('نجح اختبار الاستعادة'))

  // the restore of decision 30
  await page.click('.employee-table tbody tr[data-status="completed"] button.button--outline-danger')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  const restoreText = await text(page, 'dialog[open]')
  check('the restore confirmation lists verification, a protective backup, data loss, blocked writes and cancellation', ['نسخة وقائية', 'ستُفقد', 'تُمنع الكتابة', 'تُلغى الاستعادة'].every((part) => restoreText.includes(part)))
  check('it says nothing is really restored', restoreText.includes('محاكاة: لن يُستعاد أي شيء فعليًا'))
  check('the restore cannot start without the explicit acknowledgement', await confirmDisabled(page))
  await cancelDialog(page)
  await waitDialogClosed(page)
  check('cancelling the confirmation changes nothing', (await count(page, '.employee-table tbody tr')) === backupsBefore + 2)

  const rowsBeforeRestore = await count(page, '.employee-table tbody tr')
  await page.click('.employee-table tbody tr[data-status="completed"] button.button--outline-danger')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await tickAcknowledgement(page)
  await submitDialog(page)
  await page.waitFor(`document.querySelectorAll('dialog[open] .restore-steps__item--done').length === 3`, { timeout: 15000 })
  check('a restore runs verify, protective backup, restore and ends successfully', (await text(page, 'dialog[open]')).includes('اكتملت الاستعادة (محاكاة)'))
  await page.waitFor(`!document.querySelector('dialog[open] button[type=submit]').disabled`)
  await submitDialog(page)
  await waitDialogClosed(page)
  await page.waitFor(`document.querySelectorAll('.employee-table tbody tr').length === ${rowsBeforeRestore + 1}`, { timeout: 8000 })
  check('the restore added a protective backup of the previous state', await page.eval(`[...document.querySelectorAll('.employee-table tbody td')].some((td) => td.textContent.includes('وقائية'))`))

  await page.eval(`document.querySelectorAll('.dev-panel input[type=checkbox]')[1].click()`)
  const rowsBeforeCancel = await count(page, '.employee-table tbody tr')
  await page.click('.employee-table tbody tr[data-status="completed"] button.button--outline-danger')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await tickAcknowledgement(page)
  await submitDialog(page)
  await page.waitFor(`document.querySelectorAll('dialog[open] .restore-steps__item--failed').length === 1`, { timeout: 15000 })
  await page.waitFor(`!document.querySelector('dialog[open] button[type=submit]').disabled`)
  check('if the protective backup fails the restore is cancelled and nothing changes', (await text(page, 'dialog[open]')).includes('أُلغيت الاستعادة ولم يتغير شيء') && (await count(page, 'dialog[open] .restore-steps__item--done')) === 1)
  await submitDialog(page)
  await waitDialogClosed(page)
  check('no protective backup was created by the cancelled restore', (await count(page, '.employee-table tbody tr')) === rowsBeforeCancel)
  await page.eval(`document.querySelectorAll('.dev-panel input[type=checkbox]')[1].click()`)

  // ---------------------------------------------------------------- audit log
  await open(page, '/admin/audit-log', `document.querySelector('.employee-table')`)
  const entriesText = await text(page, '.employee-table')
  check('the audit log lists sign-ins, backups and restores that just happened', ['تسجيل دخول ناجح', 'إنشاء نسخة احتياطية', 'فشل إنشاء نسخة احتياطية', 'اكتملت استعادة نسخة', 'أُلغيت استعادة نسخة'].every((part) => entriesText.includes(part)))
  check('no password appears anywhere in the log', !(await page.eval(`document.body.textContent.includes('admin-dev')`)))
  check('there is no export control, only the statement that none exists', !(await page.eval(`[...document.querySelectorAll('button, a')].some((el) => /تصدير|export|excel|pdf/i.test(el.textContent))`)))
  const allEntries = await count(page, '.employee-table tbody tr')
  await setSelect(page, '.employee-filters select', 'backups')
  await sleep(150)
  const onlyBackups = await page.eval(`[...document.querySelectorAll('.employee-table tbody tr')].every((tr) => tr.children[1].textContent.includes('إنشاء النسخ'))`)
  check('filtering by category shows only that category', onlyBackups && (await count(page, '.employee-table tbody tr')) < allEntries)
  await setSelect(page, '.employee-filters select', 'all')
  await setSelect(page, '.employee-filters .form-field:nth-child(2) select', 'failure')
  await sleep(150)
  check('filtering by outcome shows only failures', await page.eval(`[...document.querySelectorAll('.employee-table tbody tr')].every((tr) => tr.dataset.outcome === 'failure')`))
  await setSelect(page, '.employee-filters .form-field:nth-child(2) select', 'all')
  await page.eval(`(() => { const el = document.querySelector('.employee-filters input[type=search]'); el.focus(); el.select() })()`)
  await page.type('لا يوجد شيء بهذا الاسم')
  await sleep(150)
  check('a search with no match shows "no results" and a way to clear', (await text(page, '.queue-empty p')).includes('لا توجد إدخالات تطابق') && (await exists(page, '.queue-empty button')))

  // ---------------------------------------------------------------- storage and notifications
  await open(page, '/admin/storage', `document.querySelector('[role=meter]')`)
  check('storage starts normal, says it is simulated, and has a meter with thresholds', (await exists(page, '.alert--success')) && (await exists(page, '.alert--warning .badge--demo')) && (await page.eval(`document.querySelector('[role=meter]').getAttribute('aria-valuenow') === '42'`)))
  const unreadBefore = await unread(page)
  await setSelect(page, '#storage-scenario', 'warning')
  await page.waitFor(`[...document.querySelectorAll('.alert__title')].some((el) => el.textContent.includes('المساحة تقترب من النفاد'))`)
  check('a warning level changes the alert and the meter', await page.eval(`document.querySelector('[role=meter]').getAttribute('aria-valuenow') === '84'`))
  await setSelect(page, '#storage-scenario', 'full')
  await page.waitFor(`document.querySelector('.alert--error')`)
  check('a full disk explains that uploads and processing are suspended, and that approved documents are never deleted', (await page.eval(`document.body.textContent.includes('لا يُحذف أي مستند معتمد تلقائيًا بسبب امتلاء التخزين')`)) && (await exists(page, '.info-card .alert--error')))
  await page.eval(`window.dispatchEvent(new Event('focus'))`)
  for (let attempt = 0; attempt < 40 && (await unread(page)) <= unreadBefore; attempt += 1) await sleep(200) // the refresh is asynchronous
  check('storage alerts reached the Admin\'s notifications', (await unread(page)) > unreadBefore)

  // bell
  await page.click('.notification-bell__button')
  await page.waitFor(`document.querySelector('#notification-panel')`)
  await page.waitFor(`document.querySelector('#notification-panel').textContent.includes('التخزين ممتلئ')`, { timeout: 8000 })
  check('the bell opens a panel with the alerts and does not navigate', (await path(page)) === '/admin/storage' && (await page.eval(`document.querySelector('#notification-panel').textContent.includes('التخزين ممتلئ')`)))
  check('the bell\'s accessible name carries the unread count', (await page.eval(`document.querySelector('.notification-bell__button').getAttribute('aria-label')`)).includes('غير مقروءة'))
  await page.key('Escape', { code: 'Escape', vk: 27 })
  check('Escape closes the panel and returns focus to the bell', !(await exists(page, '#notification-panel')) && (await page.eval(`document.activeElement.classList.contains('notification-bell__button')`)))
  await page.click('.notification-bell__button')
  await page.waitFor(`document.querySelector('#notification-panel')`)
  await page.click('.notification-panel__all')
  await page.waitFor(`location.pathname === '/notifications'`)
  check('"view all" opens the notifications page', (await text(page, '.page-intro__title')) === 'الإشعارات' && !(await exists(page, '#notification-panel')))
  check('the notifications page says it is simulated', await exists(page, '.alert--warning .badge--demo'))
  const pathBefore = await path(page)
  await page.eval(`[...document.querySelectorAll('.dev-panel button')][0].click()`)
  await page.waitFor(`[...document.querySelectorAll('.notification-item')].some((li) => li.dataset.type === 'processingCompleted' && li.textContent.includes('اكتملت معالجة مستند'))`)
  await sleep(500)
  check('a finished processing adds a notification with a link but never navigates by itself (decision 3)', (await path(page)) === pathBefore && (await page.eval(`[...document.querySelectorAll('.notification-item a')].some((a) => a.getAttribute('href').startsWith('/corrections/review/'))`)))
  await page.eval(`[...document.querySelectorAll('.dev-panel button')][1].click()`)
  await page.waitFor(`document.querySelector('.notification-item[data-type="processingFailed"]')`)
  check('a failed processing is notified too', true)
  await page.eval(`[...document.querySelectorAll('.employee-filters button')][0].click()`)
  await page.waitFor(`!document.querySelector('.notification-bell__badge')`)
  check('"mark all as read" clears the badge', (await count(page, '.notification-item.is-unread')) === 0)

  // ---------------------------------------------------------------- system settings
  await open(page, '/admin/settings', `document.querySelector('.settings-section')`)
  check('the settings are grouped into five sections', (await count(page, '.settings-section')) === 5)
  check('the settings say that values are provisional and simulated', (await page.eval(`document.querySelector('.alert--warning').textContent.includes('لا يقرؤها الخادم ولا شاشة الرفع بعد')`)))
  check('Save is off until something changes', await sectionEval(page, 'الرفع والمعالجة', `section.querySelector('button[type=submit]').disabled`))
  await fill(page, 'الحد الأقصى لحجم الملف', '0', '.settings-section')
  await sectionEval(page, 'الرفع والمعالجة', `section.querySelector('button[type=submit]').click()`)
  await sleep(250)
  check('an out-of-range value is refused next to the field and nothing is saved', (await sectionEval(page, 'الرفع والمعالجة', `section.querySelector('.form-field__error')?.textContent`))?.includes('بين') === true)
  await fill(page, 'الحد الأقصى لحجم الملف', '25', '.settings-section')
  await sectionEval(page, 'الرفع والمعالجة', `section.querySelector('button[type=submit]').click()`)
  await page.waitFor(`[...document.querySelectorAll('.settings-section')].find((s) => s.querySelector('h2').textContent.trim() === 'الرفع والمعالجة').querySelector('.alert--success')`, { timeout: 8000 }) // fails the run if the save is not confirmed
  await fill(page, 'حد التنبيه', '95', '.settings-section')
  await sectionEval(page, 'تنبيهات التخزين', `section.querySelector('button[type=submit]').click()`)
  await sleep(300)
  check('a warning threshold above the critical one is refused', (await sectionEval(page, 'تنبيهات التخزين', `section.querySelector('.form-field__error')?.textContent`))?.includes('أقل من الحد الحرج') === true)

  // a shorter audit retention deletes entries: warned and confirmed first
  await fill(page, 'مدة الاحتفاظ بالسجل', '1', '.settings-section')
  await sectionEval(page, 'سجل التدقيق', `section.querySelector('button[type=submit]').click()`)
  await page.waitFor(`document.querySelector('dialog[open]')`, { timeout: 8000 })
  check('a change that deletes data first says exactly what will be deleted and needs an acknowledgement', (await text(page, 'dialog[open]')).includes('إدخالات في سجل التدقيق') && (await confirmDisabled(page)))
  await cancelDialog(page)
  await waitDialogClosed(page)
  await open(page, '/admin/audit-log', `document.querySelector('.employee-table')`)
  const entriesBeforeRetention = await count(page, '.employee-table tbody tr')
  await open(page, '/admin/settings', `document.querySelector('.settings-section')`)
  await fill(page, 'مدة الاحتفاظ بالسجل', '1', '.settings-section')
  await sectionEval(page, 'سجل التدقيق', `section.querySelector('button[type=submit]').click()`)
  await page.waitFor(`document.querySelector('dialog[open]')`, { timeout: 8000 })
  await tickAcknowledgement(page)
  await submitDialog(page)
  await waitDialogClosed(page)
  await open(page, '/admin/audit-log', `document.querySelector('.employee-table')`)
  check('after confirming, the old entries are really gone', (await count(page, '.employee-table tbody tr')) < entriesBeforeRetention)
  await open(page, '/admin/settings', `document.querySelector('.settings-section')`)
  check('all eight audit categories can be switched', (await sectionEval(page, 'سجل التدقيق', `section.querySelectorAll('fieldset input[type=checkbox]').length`)) === 8)

  // ---------------------------------------------------------------- English / LTR on every new screen
  await page.eval(`document.querySelector('.lang-switch__option[lang=en]').click()`)
  await page.waitFor(`document.documentElement.lang === 'en'`)
  // Arabic letters left in the UI text. The language names (lang attribute) and document names
  // (dir=auto) are data, shown as they are, so they are ignored.
  const arabic = (selector) =>
    page.eval(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => { const copy = el.cloneNode(true); copy.querySelectorAll('[lang], [dir=auto]').forEach((n) => n.remove()); return copy.textContent }).join(' ').match(/[\\u0600-\\u06FF]+/g) ?? []`)
  for (const [route, title] of [['/admin/recycle-bin', 'Recycle bin'], ['/admin/backups', 'Backup and restore'], ['/admin/audit-log', 'Audit log'], ['/admin/storage', 'Storage monitoring'], ['/admin/settings', 'System settings'], ['/notifications', 'Notifications'], ['/settings', 'Settings']]) {
    await page.goto(`${BASE_URL}${route}`)
    await page.waitFor(`document.querySelector('.page-intro__title')`, { timeout: 12000 })
    await page.waitFor(`document.documentElement.lang === 'en' || true`)
    // The language is lost on reload (it is not persisted): switch again.
    await page.eval(`document.querySelector('.lang-switch__option[lang=en]').click()`)
    await page.waitFor(`document.documentElement.lang === 'en'`)
    await sleep(500)
    const leaked = await arabic('.page-intro, .alert, label, th, h2, h3, .badge, .button, legend')
    check(`${route} is fully English in LTR (title "${title}")`, (await text(page, '.page-intro__title')) === title && (await page.eval(`document.documentElement.dir`)) === 'ltr' && leaked.length === 0, leaked.join(' '))
  }
  await page.goto(`${BASE_URL}/corrections`)
  await page.eval(`document.querySelector('.lang-switch__option[lang=en]').click()`)
  await page.waitFor(`document.documentElement.lang === 'en'`)
  await page.waitFor(`document.querySelector('.queue-item')`)
  const queueArabic = await arabic('.page-intro, .alert, .queue-item__badges, .queue-item__meta, .queue-item .button')
  check('the correction queue (previously Arabic-only) is now English', queueArabic.length === 0, queueArabic.join(' '))
  await page.click('.queue-item a.button--primary')
  await page.waitFor(`document.querySelector('.review-page')`, { timeout: 15000 })
  await sleep(800)
  const reviewArabic = await arabic('.review-page .review-header, .review-page .page-navigator, .review-page .editor-toolbar, .review-page .review-bar, .review-page .approval-panel, .review-page h3, .review-page label, .review-page button')
  check('the review screen (previously Arabic-only) is now English', reviewArabic.length === 0, reviewArabic.slice(0, 8).join(' '))

  check('no console errors during the Admin run', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
  await page.eval(`document.querySelector('.lang-switch__option[lang=ar]').click()`)
  await signOut(page)

  // ---------------------------------------------------------------- the employee
  await page.goto(`${BASE_URL}/login`)
  await signIn(page, 'employee', 'employee-dev')
  const employeeLinks = await page.eval(`[...document.querySelectorAll('.sidebar a.sidebar__link')].map((a) => a.getAttribute('href'))`)
  check('the employee sees notifications and preferences but no Admin page', employeeLinks.includes('/notifications') && employeeLinks.includes('/settings') && !ADMIN_PAGES.some((href) => employeeLinks.includes(href)), employeeLinks.join(','))
  for (const route of ADMIN_PAGES) {
    await page.goto(`${BASE_URL}${route}`)
    await page.waitFor(`document.querySelector('.placeholder-card__title, .page-intro__title')`)
    check(`a direct URL to ${route} gives the employee "access denied"`, (await path(page)) === route && (await text(page, '.placeholder-card__title')) === 'لا تملك صلاحية الوصول' && !(await exists(page, '.employee-table, .settings-section, [role=meter]')))
  }
  await open(page, '/corrections', `document.querySelector('.queue-item')`)
  check('the employee has no delete button anywhere in the document lists (decision 42)', (await count(page, 'button[aria-label^="نقل إلى السلة"]')) === 0 && (await count(page, '.button--outline-danger')) === 0)
  await open(page, '/', `document.querySelector('.welcome-card')`)
  check('nor on the dashboard', (await count(page, '.button--outline-danger')) === 0)
  const refusal = await page.eval(`Promise.all([import('/src/services/settingsService.js').then((m) => m.settingsService.getSettings().then(() => 'allowed', (e) => e.code)), import('/src/services/recycleBinService.js').then((m) => m.recycleBinService.moveToBin('demo-review-8-pages').then(() => 'allowed', (e) => e.code)), import('/src/services/backupService.js').then((m) => m.backupService.restoreBackup('bkp-seed-1', { acknowledged: true }).then(() => 'allowed', (e) => e.code)), import('/src/services/auditLogService.js').then((m) => m.auditLogService.listEntries().then(() => 'allowed', (e) => e.code))])`)
  check('the services themselves refuse an employee (simulated server-side check)', refusal.every((code) => code === 'forbidden'), refusal.join(','))
  await open(page, '/notifications', `document.querySelector('.notification-item, .queue-empty')`)
  const kinds = await page.eval(`[...document.querySelectorAll('.notification-item')].map((li) => li.dataset.type)`)
  check('the employee only sees notifications about their own documents, never storage or backup alerts', kinds.length > 0 && kinds.every((kind) => kind.startsWith('processing')), kinds.join(','))
  await open(page, '/settings')
  check('the preferences page shows language, account and the limit the Admin set (25 MB), and no system settings link', (await page.eval(`document.body.textContent.includes('٢٥ ميجابايت') || document.body.textContent.includes('25 ميجابايت')`)) && !(await exists(page, 'a[href="/admin/settings"]')) && (await exists(page, 'input[type=radio]')))
  check('an employee is told that only the Admin changes passwords', (await text(page, '.page')).includes('لا يمكنك تغيير كلمة مرورك بنفسك'))
  check('no console errors during the employee run', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
