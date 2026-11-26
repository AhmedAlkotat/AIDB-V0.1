// Batch A render tests: what a user actually sees for each authentication state and role.
// The real .jsx components are rendered to HTML through Vite's SSR loader (as in
// ui.test.js). Interactions and redirects need a real browser: see
// scripts/browser-checks/auth.check.mjs.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const require = createRequire(`${root}/package.json`)
const React = require('react')
const { renderToString } = require('react-dom/server')
const h = React.createElement

let server
let LanguageProvider
let AuthContext
let router
let translations
const modules = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/contexts/authContext.js'))
  ;({ translations } = await server.ssrLoadModule('/src/i18n/translations.js'))
  router = await server.ssrLoadModule('react-router')
})

after(async () => {
  await server?.close()
})

const EMPLOYEE = { id: 'u1', displayName: 'علي حسن', role: 'employee' }
const ADMIN = { id: 'u2', displayName: 'سارة محمد', role: 'orgAdmin' }
const noop = () => {}

const signedIn = (user) => ({ status: 'authenticated', user, error: null, isSubmitting: false, login: noop, logout: noop, clearError: noop, retryInitialize: noop, devAccounts: null })
const signedOut = (extra = {}) => ({ status: 'unauthenticated', user: null, error: null, isSubmitting: false, login: noop, logout: noop, clearError: noop, retryInitialize: noop, devAccounts: null, ...extra })

async function load(file) {
  if (!modules.has(file)) modules.set(file, await server.ssrLoadModule(file))
  return modules.get(file)
}

// Renders `Component` (a named or default export of `file`) with the given auth value.
async function render(file, auth, { exportName = 'default', props, path = '/' } = {}) {
  const Component = (await load(file))[exportName]
  return renderToString(h(LanguageProvider, null, h(AuthContext.Provider, { value: auth }, h(router.MemoryRouter, { initialEntries: [path] }, h(Component, props)))))
}

// Renders the real route tree pieces: guards around a probe page.
async function renderGuarded(auth, path) {
  const { RequireAuth } = await load('/src/components/auth/RequireAuth.jsx')
  const { RequireRole } = await load('/src/components/auth/RequireRole.jsx')
  const { ADMIN_ROLES } = await load('/src/constants/roles.js')
  const probe = (text) => h('p', null, text)
  const tree = h(
    router.Routes,
    null,
    h(
      router.Route,
      { element: h(RequireAuth) },
      h(router.Route, { path: '/', element: probe('PUBLIC-AREA') }),
      h(router.Route, { element: h(RequireRole, { roles: ADMIN_ROLES }) }, h(router.Route, { path: '/admin/employees', element: probe('ADMIN-SECRET') })),
    ),
  )
  return renderToString(h(LanguageProvider, null, h(AuthContext.Provider, { value: auth }, h(router.MemoryRouter, { initialEntries: [path] }, tree))))
}

describe('route guards', () => {
  test('a signed-out visitor never gets protected content', async () => {
    const html = await renderGuarded(signedOut(), '/')
    assert.doesNotMatch(html, /PUBLIC-AREA|ADMIN-SECRET/)
  })

  test('while the session is being checked a loading state is shown, not the page and not the login form', async () => {
    const html = await renderGuarded({ ...signedOut(), status: 'initializing' }, '/')
    assert.match(html, /جارٍ التحقق من الجلسة/)
    assert.match(html, /role="status"/)
    assert.doesNotMatch(html, /PUBLIC-AREA/)
  })

  test('a failed session check shows an error with a retry button', async () => {
    const html = await renderGuarded({ ...signedOut(), status: 'failed' }, '/')
    assert.match(html, /تعذر التحقق من الجلسة/)
    assert.match(html, /إعادة المحاولة/)
    assert.doesNotMatch(html, /PUBLIC-AREA/)
  })

  test('an employee opens ordinary pages but gets "access denied" on an Admin URL', async () => {
    assert.match(await renderGuarded(signedIn(EMPLOYEE), '/'), /PUBLIC-AREA/)
    const denied = await renderGuarded(signedIn(EMPLOYEE), '/admin/employees')
    assert.doesNotMatch(denied, /ADMIN-SECRET/)
    assert.match(denied, /لا تملك صلاحية الوصول/)
  })

  test('the Admin opens the Admin page', async () => {
    assert.match(await renderGuarded(signedIn(ADMIN), '/admin/employees'), /ADMIN-SECRET/)
  })
})

describe('sidebar', () => {
  const sidebar = (user) => render('/src/components/layout/Sidebar.jsx', signedIn(user), { exportName: 'Sidebar', props: { id: 's', isOpen: true, onClose: noop, onNavigate: noop } })

  test('an employee has no Admin section and no Admin link', async () => {
    const html = await sidebar(EMPLOYEE)
    assert.doesNotMatch(html, /href="\/admin\/employees"/)
    assert.doesNotMatch(html, /إدارة الموظفين/)
    assert.match(html, /href="\/upload"/)
    assert.match(html, /href="\/settings"/)
  })

  test('the Admin sees the Admin section with the employee-management link', async () => {
    const html = await sidebar(ADMIN)
    assert.match(html, /href="\/admin\/employees"/)
    assert.match(html, /الإدارة/)
    assert.match(html, /href="\/upload"/)
  })

  test('sign-out is a real link to the logout step, not a "coming soon" placeholder', async () => {
    const html = await sidebar(EMPLOYEE)
    assert.match(html, /<a class="sidebar__link sidebar__logout" href="\/logout"/)
    assert.match(html, /تسجيل الخروج/)
    assert.doesNotMatch(html, /قريبًا|aria-disabled/)
  })
})

describe('user badge', () => {
  const badge = (user) => render('/src/components/layout/UserBadge.jsx', signedIn(user), { exportName: 'UserBadge' })

  test('shows the signed-in user\'s own name, initials and role', async () => {
    const employee = await badge(EMPLOYEE)
    assert.match(employee, /علي حسن/)
    assert.match(employee, /ع ح/)
    assert.match(employee, />موظف</)
    assert.doesNotMatch(employee, /مستخدم تجريبي/)
    const admin = await badge(ADMIN)
    assert.match(admin, /سارة محمد/)
    assert.match(admin, /مدير المؤسسة/)
  })
})

describe('dashboard greeting', () => {
  test('greets the signed-in user by name', async () => {
    const html = await render('/src/pages/DashboardPage.jsx', signedIn(ADMIN))
    assert.match(html, /مرحبًا بك، سارة محمد/)
  })
})

describe('login page', () => {
  const login = (auth) => render('/src/pages/LoginPage.jsx', auth, { path: '/login' })

  test('has labelled username and password fields, a submit button and the language switch', async () => {
    const html = await login(signedOut())
    assert.match(html, /<label[^>]*for="login-identifier"[^>]*>اسم المستخدم<\/label>/)
    assert.match(html, /<label[^>]*for="login-password"[^>]*>كلمة المرور<\/label>/)
    assert.match(html, /type="password"/)
    assert.match(html, /autoComplete="current-password"|autocomplete="current-password"/i)
    assert.match(html, /type="submit"[^>]*>[^<]*(<span[^>]*><\/span>)?تسجيل الدخول/)
    assert.match(html, /lang-switch/)
    assert.doesNotMatch(html, /auth-dev/) // no development accounts without a mock service
  })

  test('shows each error clearly, as an alert', async () => {
    for (const [code, text] of [
      ['invalidCredentials', /اسم المستخدم أو كلمة المرور غير صحيحة/],
      ['missingFields', /أدخل اسم المستخدم وكلمة المرور/],
      ['accountDisabled', /هذا الحساب معطّل/],
      ['notConnected', /الخادم غير متصل/],
      ['network', /تعذر الوصول إلى الخادم/],
      ['sessionExpired', /انتهت جلستك/],
    ]) {
      const html = await login(signedOut({ error: code }))
      assert.match(html, text, code)
      assert.match(html, /class="alert /, code)
    }
  })

  test('while signing in the fields and the button are disabled', async () => {
    const html = await login(signedOut({ isSubmitting: true }))
    assert.match(html, /جارٍ تسجيل الدخول/)
    assert.equal((html.match(/disabled=""/g) ?? []).length >= 3, true)
  })

  test('the development account helper appears only when the service offers accounts', async () => {
    const html = await login(signedOut({ devAccounts: [{ identifier: 'employee', password: 'x', role: 'employee' }, { identifier: 'admin', password: 'y', role: 'orgAdmin' }] }))
    assert.match(html, /auth-dev/)
    assert.match(html, /للتطوير فقط/)
    assert.match(html, /تعبئة بيانات: موظف/)
    assert.match(html, /تعبئة بيانات: مدير المؤسسة/)
    assert.doesNotMatch(html, /value="x"|value="y"/) // nothing is filled in until a button is used
  })

  test('shows the loading state while the session is being checked', async () => {
    assert.match(await login({ ...signedOut(), status: 'initializing' }), /جارٍ التحقق من الجلسة/)
  })
})

describe('forbidden page', () => {
  test('explains the denial and offers a way back', async () => {
    const html = await render('/src/pages/ForbiddenPage.jsx', signedIn(EMPLOYEE))
    assert.match(html, /لا تملك صلاحية الوصول/)
    assert.match(html, /href="\/"/)
    assert.doesNotMatch(html, /قيد التطوير/)
  })
})

describe('translations of the new screens', () => {
  const flatten = (object, prefix = '') =>
    Object.entries(object).flatMap(([key, value]) => (typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]))
  const pick = (language, section) => section.split('.').reduce((value, key) => value[key], translations[language])

  test('Arabic and English have identical keys and no empty text', () => {
    for (const section of ['auth', 'pages.forbidden', 'pages.adminEmployees', 'nav.sections']) {
      assert.deepEqual(flatten(pick('en', section)).sort(), flatten(pick('ar', section)).sort(), section)
      for (const language of ['ar', 'en']) {
        for (const key of flatten(pick(language, section))) {
          const text = key.split('.').reduce((value, part) => value[part], pick(language, section))
          assert.ok(String(text).trim().length > 0, `${language} ${section}.${key}`)
        }
      }
    }
    for (const language of ['ar', 'en']) {
      assert.ok(translations[language].nav.adminEmployees)
      assert.equal(translations[language].demoUser, undefined) // the hardcoded demo identity is gone
    }
  })
})
