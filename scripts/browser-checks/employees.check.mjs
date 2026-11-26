// Browser checks for Batch B: the Admin's employee management, its consistency with the mock
// sign-in, direct-URL protection, role-based dashboards and English/LTR. They drive the
// development server, whose mock employee service and mock sign-in share one account store.
//
//   npm run dev -- --port 5199   (terminal 1)
//   node scripts/browser-checks/employees.check.mjs   (terminal 2)

import { sleep } from './cdp.mjs'
import { BASE_URL, runChecks } from './harness.mjs'

const text = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`)
const exists = (page, selector) => page.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const path = (page) => page.eval('location.pathname')
const rowNames = (page) => page.eval(`[...document.querySelectorAll('.employee-table tbody th')].map((el) => el.textContent.trim())`)
const dialogOpen = (page) => exists(page, 'dialog[open]')

// Focuses the input whose <label> has this text (inside the open dialog or the page) and types.
async function fill(page, label, value, { scope = 'dialog[open]' } = {}) {
  await page.eval(`(() => {
    const label = [...document.querySelectorAll(${JSON.stringify(`${scope} label`)})].find((el) => el.textContent.trim() === ${JSON.stringify(label)})
    if (!label) throw new Error('No field labelled ${label}')
    const input = document.getElementById(label.htmlFor)
    input.focus(); input.select()
  })()`)
  if (value) await page.type(value)
}

const fieldErrors = (page) => page.eval(`[...document.querySelectorAll('dialog[open] .form-field__error')].map((el) => el.textContent.trim())`)
const invalidCount = (page) => page.eval(`document.querySelectorAll('dialog[open] [aria-invalid="true"]').length`)
const submitDialog = (page) => page.click('dialog[open] button[type=submit]')
const waitDialogClosed = (page) => page.waitFor(`!document.querySelector('dialog[open]')`, { timeout: 10000 })
const waitList = (page) => page.waitFor(`document.querySelector('.employee-table')`, { timeout: 10000 })
const noticeText = (page) => text(page, '.alert--success')

async function signIn(page, identifier, password) {
  await page.waitFor(`document.querySelector('#login-identifier')`)
  await page.eval(`(() => { const el = document.querySelector('#login-identifier'); el.focus(); el.select() })()`)
  await page.type(identifier)
  await page.eval(`(() => { const el = document.querySelector('#login-password'); el.focus(); el.select() })()`)
  await page.type(password)
  await page.click('.auth-form__submit')
}

async function signInOk(page, identifier, password) {
  await signIn(page, identifier, password)
  await page.waitFor(`document.querySelector('.user-badge')`, { timeout: 10000 })
}

async function signOut(page) {
  await page.click('a.sidebar__logout')
  await page.waitFor(`location.pathname === '/login'`, { timeout: 10000 })
}

await runChecks('Employee management and role-based dashboards (Batch B)', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 900, session: null })
  await page.goto(`${BASE_URL}/login`)
  await signInOk(page, 'admin', 'admin-dev')

  // ---------------------------------------------------------------- list
  await page.goto(`${BASE_URL}/admin/employees`)
  await page.waitFor(`document.querySelector('.employee-panel, .employees-loading, .auth-loading')`)
  await waitList(page)
  check('the Admin sees the employee list (employees only, not the Admin account)', JSON.stringify((await rowNames(page)).sort()) === JSON.stringify(['موظف تجريبي', 'موظف معطل'].sort()), (await rowNames(page)).join(','))
  check('the page says the data is demo data (development mock)', await exists(page, '.alert--info .badge--demo'))
  check('the business rules (no deletion, no self-service passwords) are stated', (await page.eval(`document.body.textContent`)).includes('لا يمكن حذف حساب موظف نهائيًا'))
  check('there is no delete action anywhere', !(await page.eval(`/حذف/.test(document.querySelector('.employee-table').textContent)`)))
  check('status badges: active and deactivated', (await page.eval(`[...document.querySelectorAll('.employee-table tbody tr')].map((tr) => tr.dataset.status).sort().join()`)) === 'active,deactivated')

  // ---------------------------------------------------------------- search and filter
  await fill(page, 'بحث بالاسم أو اسم المستخدم', 'معطل', { scope: '.employee-filters' })
  await sleep(150)
  check('search by name narrows the list', JSON.stringify(await rowNames(page)) === JSON.stringify(['موظف معطل']))
  check('the result summary updates', (await text(page, '.employee-filters__summary')).length > 0)
  await page.eval(`(() => { const el = document.querySelector('.employee-filters input'); el.focus(); el.select() })()`)
  await page.type('disabled')
  await sleep(150)
  check('search by username works too', JSON.stringify(await rowNames(page)) === JSON.stringify(['موظف معطل']))
  await page.eval(`(() => { const el = document.querySelector('.employee-filters input'); el.focus(); el.select() })()`)
  await page.type('لا يوجد أحد بهذا الاسم')
  await sleep(150)
  check('no match shows the "no results" state with a way to clear the filters', (await exists(page, '.queue-empty button')) && !(await exists(page, '.employee-table')))
  await page.click('.queue-empty button')
  await sleep(150)
  check('clearing the filters brings the list back', (await rowNames(page)).length === 2)
  await page.eval(`(() => { const select = document.querySelector('.employee-filters select'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, 'deactivated'); select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await sleep(150)
  check('the status filter shows deactivated accounts only', JSON.stringify(await rowNames(page)) === JSON.stringify(['موظف معطل']))
  await page.eval(`(() => { const select = document.querySelector('.employee-filters select'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, 'all'); select.dispatchEvent(new Event('change', { bubbles: true })) })()`)

  // ---------------------------------------------------------------- create
  await page.click('.page-intro__action')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('the create dialog opens as a modal with focus inside it', await page.eval(`document.querySelector('dialog[open]').contains(document.activeElement)`))
  await submitDialog(page)
  await sleep(200)
  check('submitting an empty form shows required-field errors and keeps the dialog open', (await invalidCount(page)) >= 3 && (await dialogOpen(page)))
  check('focus moves to the first invalid field', await page.eval(`document.activeElement?.getAttribute('aria-invalid') === 'true'`))
  await fill(page, 'الاسم الكامل', 'سارة أحمد')
  await fill(page, 'اسم المستخدم', 'sara ahmed')
  await fill(page, 'كلمة المرور الأولية', 'short')
  await fill(page, 'تأكيد كلمة المرور', 'different')
  await submitDialog(page)
  await sleep(200)
  const errors = await fieldErrors(page)
  check('a username with a space and a short password are rejected with specific messages', errors.some((message) => message.includes('الأحرف الإنجليزية')) && errors.some((message) => message.includes('لا تقل كلمة المرور')), errors.join(' | '))
  await fill(page, 'اسم المستخدم', 'sara.ahmed')
  await fill(page, 'كلمة المرور الأولية', 'Initial-pass-1')
  await fill(page, 'تأكيد كلمة المرور', 'Initial-pass-2')
  await submitDialog(page)
  await sleep(200)
  check('a password confirmation that does not match is reported', (await fieldErrors(page)).some((message) => message.includes('غير متطابقتين')))
  await fill(page, 'تأكيد كلمة المرور', 'Initial-pass-1')
  await submitDialog(page)
  await waitDialogClosed(page)
  await page.waitFor(`document.querySelector('.alert--success')`)
  check('creating shows a success message with the name', (await noticeText(page)).includes('سارة أحمد'))
  check('the new employee appears in the list as active', (await rowNames(page)).includes('سارة أحمد') && (await page.eval(`document.querySelector('.employee-table tr[data-status="active"] .employee-table__username')?.textContent !== undefined`)))
  check('the password is nowhere in the page', !(await page.eval(`document.documentElement.innerHTML.includes('Initial-pass-1')`)))

  // duplicate username
  await page.click('.page-intro__action')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await fill(page, 'الاسم الكامل', 'شخص آخر')
  await fill(page, 'اسم المستخدم', 'SARA.AHMED')
  await fill(page, 'كلمة المرور الأولية', 'Initial-pass-1')
  await fill(page, 'تأكيد كلمة المرور', 'Initial-pass-1')
  await submitDialog(page)
  await page.waitFor(`document.querySelector('dialog[open] .form-field__error')`, { timeout: 10000 })
  check('a username already in use (ignoring case) is refused next to the field and the dialog stays open', (await fieldErrors(page)).some((message) => message.includes('مستخدم بالفعل')) && (await dialogOpen(page)))
  await page.key('Escape', { code: 'Escape', vk: 27 })
  await waitDialogClosed(page)
  check('Escape closes the dialog without creating anything', (await rowNames(page)).length === 3)

  // ---------------------------------------------------------------- edit
  await page.click('button[aria-label="تعديل: سارة أحمد"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('editing shows the current name and username and no password fields', (await page.eval(`document.querySelectorAll('dialog[open] input[type=password]').length`)) === 0 && (await page.eval(`[...document.querySelectorAll('dialog[open] input')].map((el) => el.value).join('|')`)) === 'سارة أحمد|sara.ahmed')
  await fill(page, 'الاسم الكامل', 'سارة أحمد المحمود')
  await submitDialog(page)
  await waitDialogClosed(page)
  check('saving an edit updates the row and confirms', (await rowNames(page)).includes('سارة أحمد المحمود') && (await noticeText(page)).includes('سارة أحمد المحمود'))

  // ---------------------------------------------------------------- set password
  await page.click('button[aria-label="تعيين كلمة مرور: سارة أحمد المحمود"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('the password dialog never shows the current password', !(await page.eval(`document.querySelector('dialog[open]').textContent.includes('Initial-pass-1')`)) && (await page.eval(`[...document.querySelectorAll('dialog[open] input')].every((el) => el.type === 'password' && el.value === '')`)))
  await fill(page, 'كلمة المرور الجديدة', 'Second-pass-22')
  await fill(page, 'تأكيد كلمة المرور', 'Second-pass-22')
  await submitDialog(page)
  await waitDialogClosed(page)
  check('setting a password confirms it, without echoing it', (await noticeText(page)).includes('سارة أحمد المحمود') && !(await page.eval(`document.documentElement.innerHTML.includes('Second-pass-22')`)))

  // ---------------------------------------------------------------- deactivate
  await page.click('button[aria-label="تعطيل: سارة أحمد المحمود"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('deactivating asks for confirmation and says documents and history are kept', (await text(page, 'dialog[open]')).includes('تبقى مستنداته وسجل أعماله محفوظة') && (await exists(page, 'dialog[open] .button--danger')))
  await page.eval(`document.querySelector('dialog[open] .button--secondary').click()`)
  await waitDialogClosed(page)
  check('cancelling changes nothing', (await page.eval(`document.querySelector('.employee-table tbody tr:nth-child(1)') !== null`)) && (await page.eval(`[...document.querySelectorAll('.employee-table tbody tr')].filter((tr) => tr.dataset.status === 'deactivated').length`)) === 1)
  await page.click('button[aria-label="تعطيل: سارة أحمد المحمود"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await submitDialog(page)
  await waitDialogClosed(page)
  check('confirming deactivates the account (badge and action change); it stays in the list', (await page.eval(`[...document.querySelectorAll('.employee-table tbody tr')].filter((tr) => tr.dataset.status === 'deactivated').length`)) === 2 && (await exists(page, 'button[aria-label="إعادة التفعيل: سارة أحمد المحمود"]')))

  // ---------------------------------------------------------------- the mock sign-in agrees
  await signOut(page)
  await signIn(page, 'sara.ahmed', 'Second-pass-22')
  await page.waitFor(`document.querySelector('.alert--error')`)
  check('a deactivated employee cannot sign in (clear message)', (await text(page, '.alert--error')).includes('معطّل') && !(await exists(page, '.user-badge')))

  await page.eval(`(() => { const el = document.querySelector('#login-identifier'); el.focus(); el.select() })()`)
  await page.type('admin')
  await page.eval(`(() => { const el = document.querySelector('#login-password'); el.focus(); el.select() })()`)
  await page.type('admin-dev')
  await page.click('.auth-form__submit')
  await page.waitFor(`document.querySelector('.user-badge')`, { timeout: 10000 })
  await page.goto(`${BASE_URL}/admin/employees`)
  await waitList(page)
  await page.click('button[aria-label="إعادة التفعيل: سارة أحمد المحمود"]')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('reactivating is a plain confirmation', !(await exists(page, 'dialog[open] .button--danger')))
  await submitDialog(page)
  await waitDialogClosed(page)
  check('reactivating makes the account active again', (await noticeText(page)).includes('إعادة تفعيل') || (await exists(page, 'button[aria-label="تعطيل: سارة أحمد المحمود"]')))

  await signOut(page)
  await signIn(page, 'sara.ahmed', 'Initial-pass-1')
  await page.waitFor(`document.querySelector('.alert--error')`)
  check('the OLD password no longer works after the Admin changed it', (await text(page, '.alert--error')).includes('غير صحيحة'))
  await signInOk(page, 'sara.ahmed', 'Second-pass-22')
  check('the NEW password works, and the user badge shows the employee\'s edited name', (await text(page, '.user-badge__name')) === 'سارة أحمد المحمود' && (await text(page, '.user-badge__role')) === 'موظف')

  // ---------------------------------------------------------------- employee: no admin access, own dashboard
  const links = await page.eval(`[...document.querySelectorAll('.sidebar a.sidebar__link')].map((a) => a.getAttribute('href'))`)
  check('the employee has no employee-management link', !links.includes('/admin/employees'))
  check('the employee dashboard is about their own documents and has no administrative section', (await text(page, '#overview-heading')) === 'ملخص مستنداتي' && !(await exists(page, '#employees-heading')) && (await text(page, '#recent-heading')) === 'آخر مستنداتي')
  check('the employee dashboard labels temporary data as demo data', (await exists(page, '.section-heading .badge--demo')) && (await exists(page, '.demo-note')))
  await page.goto(`${BASE_URL}/admin/employees`)
  check('a direct URL to employee management gives the employee "access denied"', (await path(page)) === '/admin/employees' && (await text(page, '.placeholder-card__title')) === 'لا تملك صلاحية الوصول')
  check('no employee data or controls are rendered for the employee', !(await exists(page, '.employee-table')) && !(await exists(page, '.page-intro__action')) && !(await page.eval(`document.body.textContent.includes('sara.ahmed')`)))
  // Even calling the (mock) service directly is refused: the server-side check is simulated.
  const refused = await page.eval(`import('/src/services/employeeService.js').then((m) => m.employeeService.listEmployees().then(() => 'allowed', (error) => error.code))`)
  check('the employee service itself refuses a non-Admin caller (simulated server check)', refused === 'forbidden', String(refused))
  await signOut(page)

  // ---------------------------------------------------------------- admin dashboard
  await signInOk(page, 'admin', 'admin-dev')
  check('the Admin dashboard shows institution-wide documents and the employee accounts', (await text(page, '#overview-heading')) === 'ملخص مستندات المؤسسة' && (await text(page, '#employees-heading')) === 'حسابات الموظفين' && (await text(page, '#recent-heading')) === 'آخر المستندات في المؤسسة')
  await page.waitFor(`document.querySelectorAll('#employees-heading ~ .stats-grid .stat-card').length === 3`, { timeout: 10000 }).catch(() => {})
  const cards = await page.eval(`[...document.querySelectorAll('section[aria-labelledby="employees-heading"] .stat-card')].map((card) => card.querySelector('.stat-card__label').textContent.trim())`)
  check('the Admin sees total, active and deactivated employee figures', cards.length === 3 && cards[0] === 'إجمالي الموظفين', cards.join('|'))
  check('the employee figures are labelled as demo data', await exists(page, 'section[aria-labelledby="employees-heading"] .badge--demo'))
  check('a link leads to employee management', await exists(page, 'section[aria-labelledby="employees-heading"] a[href="/admin/employees"]'))

  // ---------------------------------------------------------------- English / LTR
  await page.goto(`${BASE_URL}/admin/employees`)
  await waitList(page)
  await page.eval(`document.querySelector('.lang-switch__option[lang=en]').click()`)
  await page.waitFor(`document.documentElement.lang === 'en'`)
  check('the employee screen switches to English (LTR)', (await page.eval(`document.documentElement.dir`)) === 'ltr' && (await text(page, '#employees-title')) === 'Employee management' && (await text(page, '.employee-table thead th')) === 'Name')
  await page.click('.page-intro__action')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  check('dialogs are translated too', (await text(page, 'dialog[open] h2')) === 'Add employee' && (await text(page, 'dialog[open] .button--primary')) === 'Create account')
  await submitDialog(page)
  await sleep(200)
  check('validation messages are English', (await fieldErrors(page)).length >= 3 && (await fieldErrors(page)).every((message) => /^[ -]+$/.test(message)))
  await page.key('Escape', { code: 'Escape', vk: 27 })
  await waitDialogClosed(page)

  // ---------------------------------------------------------------- narrow screen
  await page.setViewport(390, 800)
  await sleep(200)
  check('on a phone the page does not scroll sideways (the table scrolls inside its box)', await page.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`))

  check('no console errors during the whole run', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
