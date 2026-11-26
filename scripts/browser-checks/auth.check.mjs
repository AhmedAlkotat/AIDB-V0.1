// Browser checks for Batch A: login, route guards, role-based navigation, logout, data
// separation between sessions, and unsaved-work protection on logout. They drive the
// development server, which uses the mock authentication (src/dev/mockAuthService.js).
//
//   npm run dev -- --port 5199   (terminal 1)
//   node scripts/browser-checks/auth.check.mjs   (terminal 2)

import { sleep } from './cdp.mjs'
import { BASE_URL, REVIEW_URL, runChecks } from './harness.mjs'

const MOCK_KEY = 'aidp.dev.mockSession'
const text = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`)
const exists = (page, selector) => page.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const path = (page) => page.eval('location.pathname')

async function fillAndSubmit(page, identifier, password) {
  await page.waitFor(`document.querySelector('#login-identifier')`)
  await page.eval(`(() => { const el = document.querySelector('#login-identifier'); el.focus(); el.select() })()`)
  if (identifier) await page.type(identifier)
  await page.eval(`(() => { const el = document.querySelector('#login-password'); el.focus(); el.select() })()`)
  if (password) await page.type(password)
  await page.click('.auth-form__submit')
}

async function signIn(page, identifier, password) {
  await fillAndSubmit(page, identifier, password)
  await page.waitFor(`document.querySelector('.user-badge')`, { timeout: 10000 })
}

async function signOut(page) {
  await page.click('a.sidebar__logout')
  await page.waitFor(`location.pathname === '/login'`, { timeout: 10000 })
}

await runChecks('Authentication and role-based access (Batch A)', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 900, session: null })

  // ---------------------------------------------------------------- unauthenticated access
  await page.goto(`${BASE_URL}/archive`)
  await page.waitFor(`location.pathname === '/login'`)
  check('a signed-out visitor of a protected URL is redirected to the login page', (await path(page)) === '/login')
  check('the login page shows the form and no application shell', (await exists(page, '#login-identifier')) && (await exists(page, '#login-password')) && !(await exists(page, '.sidebar')))
  check('the login page is RTL Arabic by default', await page.eval(`document.documentElement.dir === 'rtl' && document.querySelector('.auth-card__title').textContent.includes('تسجيل الدخول')`))
  check('the development account helper is offered (development build only)', await exists(page, '.auth-dev'))

  await page.goto(`${BASE_URL}/admin/employees`)
  await page.waitFor(`location.pathname === '/login'`)
  check('an Admin URL is also behind the login', (await path(page)) === '/login')

  // ---------------------------------------------------------------- invalid logins
  await fillAndSubmit(page, '', '')
  await page.waitFor(`document.querySelector('.alert--error')`)
  check('empty fields show a clear error and stay on the login page', (await text(page, '.alert--error')).includes('أدخل اسم المستخدم وكلمة المرور') && (await path(page)) === '/login')
  await fillAndSubmit(page, 'employee', 'wrong-password')
  await page.waitFor(`document.querySelector('.alert--error')?.textContent.includes('غير صحيحة')`)
  check('a wrong password shows an "incorrect" error', true)
  check('the password field is cleared after a failed attempt, the username is kept', await page.eval(`document.querySelector('#login-password').value === '' && document.querySelector('#login-identifier').value === 'employee'`))
  check('a failed login does not open the application', (await path(page)) === '/login' && !(await exists(page, '.sidebar')))
  await fillAndSubmit(page, 'disabled', 'disabled-dev')
  await page.waitFor(`document.querySelector('.alert--error')?.textContent.includes('معطّل')`)
  check('a deactivated account is told it is deactivated', true)
  check('typing clears the error', await (async () => {
    await page.eval(`document.querySelector('#login-identifier').focus()`)
    await page.type('x')
    await sleep(100)
    return !(await exists(page, '.alert--error'))
  })())

  // ---------------------------------------------------------------- language
  await page.eval(`document.querySelector('.lang-switch__option[lang=en]').click()`)
  await page.waitFor(`document.documentElement.lang === 'en'`)
  check('the login page switches to English (LTR)', await page.eval(`document.documentElement.dir === 'ltr' && document.querySelector('.auth-card__title').textContent === 'Sign in' && document.querySelector('label[for=login-password]').textContent === 'Password'`))
  await page.eval(`document.querySelector('.lang-switch__option[lang=ar]').click()`)
  await page.waitFor(`document.documentElement.lang === 'ar'`)

  // ---------------------------------------------------------------- employee
  await page.goto(`${BASE_URL}/corrections/review/demo-review-8-pages`)
  await page.waitFor(`location.pathname === '/login'`)
  await signIn(page, 'employee', 'employee-dev')
  check('after login the user returns to the page they originally asked for', (await path(page)).startsWith('/corrections/review/'))
  check('the user badge shows the authenticated employee', (await text(page, '.user-badge__name')) === 'موظف تجريبي' && (await text(page, '.user-badge__role')) === 'موظف')
  check('the avatar shows the initials of the name', (await text(page, '.avatar')) === 'م ت')
  await page.waitFor(`document.querySelector('.original-viewer')`)
  check('the review page works for the signed-in employee (editor shown)', await exists(page, '.editor-panel'))

  await page.goto(`${BASE_URL}/`)
  check('the dashboard greets the employee by name', (await text(page, '.welcome-card__title')).includes('موظف تجريبي'))
  const employeeLinks = await page.eval(`[...document.querySelectorAll('.sidebar a.sidebar__link')].map((a) => a.getAttribute('href'))`)
  check('the employee sidebar has no Admin link and no Admin section', !employeeLinks.includes('/admin/employees') && !(await page.eval(`[...document.querySelectorAll('.sidebar__section-label')].some((el) => el.textContent.includes('الإدارة'))`)))
  check('the employee sidebar keeps the workspace links', ['/upload', '/archive', '/corrections', '/settings'].every((href) => employeeLinks.includes(href)), employeeLinks.join(','))

  await page.goto(`${BASE_URL}/admin/employees`)
  check('an employee opening an Admin URL gets the access-denied page', (await path(page)) === '/admin/employees' && (await text(page, '.placeholder-card__title')) === 'لا تملك صلاحية الوصول')
  check('the Admin page itself is not rendered for the employee', !(await page.eval(`document.body.textContent.includes('إنشاء حسابات الموظفين')`)))

  await page.goto(`${BASE_URL}/login`)
  check('an already signed-in user opening /login is sent into the app', (await path(page)) === '/')

  await page.goto(`${BASE_URL}/does-not-exist`)
  check('an unknown URL still shows "not found" for a signed-in user', (await text(page, '.placeholder-card__title')) === 'الصفحة غير موجودة')

  // ---------------------------------------------------------------- session persistence + logout
  await page.eval(`location.reload()`)
  await page.waitFor(`document.querySelector('.user-badge')`, { timeout: 10000 })
  check('a reload keeps the development session', Boolean(await exists(page, '.user-badge')))

  // Data separation: put a private record in the in-memory store, then sign out.
  await page.eval(`import('/src/services/documentStore.js').then((m) => m.documentStore.create({ id: 'private-leak-check', name: 'LEAK', ownerId: 'demo-employee', snapshot: { file: { totalPages: 1 }, pages: [] } }))`)
  check('the in-memory store holds the employee\'s record before logout', await page.eval(`import('/src/services/documentStore.js').then((m) => m.documentStore.has('private-leak-check'))`))
  await signOut(page)
  check('logout returns to the login page', (await path(page)) === '/login')
  check('logout clears the session marker', await page.eval(`sessionStorage.getItem(${JSON.stringify(MOCK_KEY)}) === null`))
  check('logout wipes the in-memory documents of the previous user', await page.eval(`import('/src/services/documentStore.js').then((m) => m.documentStore.list().length === 0)`))
  await page.eval(`history.back()`)
  await sleep(600)
  check('the browser Back button cannot reopen protected pages after logout', (await path(page)) === '/login' || (await path(page)) === '/logout')
  await page.goto(`${BASE_URL}/`)
  check('after logout a protected URL goes to the login again', (await path(page)) === '/login')

  // ---------------------------------------------------------------- Admin
  await signIn(page, 'admin', 'admin-dev')
  check('the Admin signs in and sees the user badge with their own name and role', (await text(page, '.user-badge__name')) === 'مدير تجريبي' && (await text(page, '.user-badge__role')) === 'مدير المؤسسة')
  const adminLinks = await page.eval(`[...document.querySelectorAll('.sidebar a.sidebar__link')].map((a) => a.getAttribute('href'))`)
  check('the Admin sidebar adds the employee-management link', adminLinks.includes('/admin/employees') && adminLinks.includes('/upload'), adminLinks.join(','))
  check('the Admin did not inherit the previous user\'s records', await page.eval(`import('/src/services/documentStore.js').then((m) => !m.documentStore.has('private-leak-check'))`))
  await page.click('a.sidebar__link[href="/admin/employees"]')
  await page.waitFor(`location.pathname === '/admin/employees'`)
  check('the Admin opens the Admin page (not the access-denied page)', (await text(page, '.page-intro__title')) === 'إدارة الموظفين')

  // The existing approved-document rule now follows the authenticated role (it used to
  // follow VITE_DEMO_ROLE): only the Admin may ask for a new editable version.
  await page.goto(`${BASE_URL}/corrections/review/demo-approved-3-pages`)
  await page.waitFor(`document.querySelector('.approval-panel__version')`)
  check('the Admin sees the "new editable version" action on an approved document', await exists(page, '.approval-panel__version button'))
  await signOut(page)
  await signIn(page, 'employee', 'employee-dev')
  await page.goto(`${BASE_URL}/corrections/review/demo-approved-3-pages`)
  await page.waitFor(`document.querySelector('.approval-panel__version')`)
  check('the employee sees only the Admin-only note on the same document', !(await exists(page, '.approval-panel__version button')) && (await text(page, '.approval-panel__version')).includes('مدير المؤسسة'))
  await signOut(page)

  // ---------------------------------------------------------------- unsaved work on logout
  const work = await browser.newPage({ width: 1280, height: 900, session: 'employee' })
  await work.goto(REVIEW_URL)
  await work.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  await work.click('.processing .button--secondary') // re-extract: now running
  await work.click('a.sidebar__logout')
  await work.waitFor(`document.querySelector('dialog[open]')`)
  check('logging out while a page is being processed asks first (same guard as navigation)', (await path(work)).includes('/review/'))
  check('the user is still signed in while the question is open', await exists(work, '.user-badge'))
  await work.eval(`document.querySelector('dialog[open] .button--secondary').click()`) // stay
  await sleep(400)
  check('"stay" keeps the user signed in on the review page', (await path(work)).includes('/review/') && (await exists(work, '.user-badge')))
  await work.click('a.sidebar__logout')
  await work.waitFor(`document.querySelector('dialog[open]')`)
  await work.eval(`document.querySelector('dialog[open] .button--danger').click()`) // leave
  await work.waitFor(`location.pathname === '/login'`, { timeout: 10000 })
  check('confirming "leave" then signs the user out', (await path(work)) === '/login' && (await work.eval(`sessionStorage.getItem(${JSON.stringify(MOCK_KEY)}) === null`)))

  // Typed text that can be saved is saved first, then the logout simply continues.
  const typed = await browser.newPage({ width: 1280, height: 900, session: 'employee' })
  await typed.goto(REVIEW_URL)
  await typed.waitFor(`document.querySelectorAll('.element-card .editor-input').length >= 1`, { timeout: 15000 })
  await typed.eval(`(() => { const el = document.querySelector('.element-card .editor-input'); el.focus(); el.select() })()`)
  await typed.type('نص غير محفوظ قبل الخروج')
  await typed.click('a.sidebar__logout')
  await typed.waitFor(`location.pathname === '/login'`, { timeout: 10000 })
  check('unsaved typing is saved by the guard and the logout then completes without a prompt', (await path(typed)) === '/login' && !(await exists(typed, 'dialog[open]')))

  const errors = [...page.consoleErrors, ...work.consoleErrors, ...typed.consoleErrors]
  check('no console errors during the whole run', errors.length === 0, errors.join(' | '))
})
