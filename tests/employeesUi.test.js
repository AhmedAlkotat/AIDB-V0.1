// Batch B render tests: what the Admin sees on the employee screen and its dialogs, and what
// each role sees on its dashboard. Components are rendered to HTML through Vite's SSR loader
// (as in ui.test.js). Interactions need a real browser: see
// scripts/browser-checks/employees.check.mjs.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { makeSnapshot } from './sessionHelpers.js'

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
let documentStore
const modules = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/contexts/authContext.js'))
  ;({ translations } = await server.ssrLoadModule('/src/i18n/translations.js'))
  ;({ documentStore } = await server.ssrLoadModule('/src/services/documentStore.js'))
  router = await server.ssrLoadModule('react-router')
})

after(async () => {
  await server?.close()
})

const EMPLOYEE_USER = { id: 'demo-employee', displayName: 'علي حسن', role: 'employee' }
const ADMIN_USER = { id: 'demo-admin', displayName: 'سارة محمد', role: 'orgAdmin' }
const noop = () => {}
const authValue = (user) => ({ status: 'authenticated', user, error: null, isSubmitting: false, login: noop, logout: noop, clearError: noop, retryInitialize: noop, devAccounts: null, devReset: null })

async function load(file) {
  if (!modules.has(file)) modules.set(file, await server.ssrLoadModule(file))
  return modules.get(file)
}

async function render(file, { exportName = 'default', props, user = ADMIN_USER } = {}) {
  const Component = (await load(file))[exportName]
  return renderToString(h(LanguageProvider, null, h(AuthContext.Provider, { value: authValue(user) }, h(router.MemoryRouter, null, h(Component, props)))))
}

const EMPLOYEES = [
  { id: 'e1', displayName: 'أحمد علي', identifier: 'ahmed', status: 'active', createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' },
  { id: 'e2', displayName: 'منى خالد', identifier: 'mona.k', status: 'deactivated', createdAt: '2026-03-02T10:00:00.000Z', updatedAt: '2026-03-02T10:00:00.000Z' },
]

describe('employee table', () => {
  const table = (employees = EMPLOYEES) => render('/src/components/employees/EmployeeTable.jsx', { exportName: 'EmployeeTable', props: { employees, onAction: noop } })

  test('lists each employee with name, username, status and creation date as a labelled table', async () => {
    const html = await table()
    assert.match(html, /<caption class="visually-hidden">قائمة الموظفين<\/caption>/)
    for (const heading of ['الاسم', 'اسم المستخدم', 'الحالة', 'تاريخ الإنشاء', 'الإجراءات']) assert.match(html, new RegExp(`<th scope="col">${heading}</th>`))
    assert.match(html, /أحمد علي/)
    assert.match(html, /<td dir="ltr"[^>]*>ahmed<\/td>/)
    assert.match(html, /badge--success">نشط</)
    assert.match(html, /badge--neutral">معطّل</)
  })

  test('active accounts offer "deactivate", deactivated ones offer "reactivate"; both can be edited and get a password', async () => {
    const html = await table()
    assert.match(html, /aria-label="تعطيل: أحمد علي"/)
    assert.match(html, /aria-label="إعادة التفعيل: منى خالد"/)
    assert.doesNotMatch(html, /aria-label="إعادة التفعيل: أحمد علي"/)
    assert.doesNotMatch(html, /aria-label="تعطيل: منى خالد"/)
    for (const name of ['أحمد علي', 'منى خالد']) {
      assert.match(html, new RegExp(`aria-label="تعديل: ${name}"`))
      assert.match(html, new RegExp(`aria-label="تعيين كلمة مرور: ${name}"`))
    }
  })

  test('there is no delete action and no password anywhere', async () => {
    const html = await table([{ ...EMPLOYEES[0], password: 'SHOULD-NEVER-APPEAR' }])
    assert.doesNotMatch(html, /حذف|delete|remove/i)
    assert.doesNotMatch(html, /SHOULD-NEVER-APPEAR|type="password"/)
  })
})

describe('employee filters', () => {
  test('has a labelled search box, a status filter with the three choices and a result summary', async () => {
    const html = await render('/src/components/employees/EmployeeFilters.jsx', {
      exportName: 'EmployeeFilters',
      props: { query: '', status: 'all', shown: 1, total: 2, onQueryChange: noop, onStatusChange: noop },
    })
    assert.match(html, /type="search"/)
    assert.match(html, />بحث بالاسم أو اسم المستخدم</)
    for (const label of ['جميع الحسابات', 'النشطة', 'المعطّلة']) assert.match(html, new RegExp(`<option[^>]*>${label}</option>`))
    assert.match(html, /role="status"/)
  })
})

describe('employee dialogs', () => {
  const dialog = (name, props) => render('/src/components/employees/EmployeeDialogs.jsx', { exportName: name, props: { onSubmit: noop, onCancel: noop, onDone: noop, ...props } })

  test('creating asks for name, username, an initial password and its confirmation', async () => {
    const html = await dialog('EmployeeFormDialog')
    assert.match(html, /<dialog[^>]*class="confirm-dialog"/)
    assert.match(html, />إضافة موظف<\/h2>/)
    for (const label of ['الاسم الكامل', 'اسم المستخدم', 'كلمة المرور الأولية', 'تأكيد كلمة المرور']) assert.match(html, new RegExp(`>${label}</label>`))
    assert.equal((html.match(/type="password"/g) ?? []).length, 2)
    assert.match(html, /autoComplete="new-password"|autocomplete="new-password"/i)
    assert.match(html, /لا يُلزم الموظف بتغييرها عند أول دخول/)
    assert.match(html, /إنشاء الحساب/)
    assert.doesNotMatch(html, /aria-invalid="true"/) // no error before the first submit
  })

  test('editing shows name and username only, filled in; no password fields', async () => {
    const html = await dialog('EmployeeFormDialog', { employee: EMPLOYEES[0] })
    assert.match(html, />تعديل بيانات الموظف<\/h2>/)
    assert.match(html, /value="أحمد علي"/)
    assert.match(html, /value="ahmed"/)
    assert.doesNotMatch(html, /type="password"/)
    assert.match(html, /حفظ التعديلات/)
  })

  test('setting a password names the employee, never shows the current one, and asks for confirmation', async () => {
    const html = await dialog('PasswordDialog', { employee: EMPLOYEES[0] })
    assert.match(html, /تعيين كلمة مرور جديدة للموظف أحمد علي/)
    assert.match(html, /لا يمكن عرض كلمة المرور الحالية/)
    assert.equal((html.match(/type="password"/g) ?? []).length, 2)
    assert.doesNotMatch(html, /value="[^"]+"/) // nothing pre-filled
  })

  test('deactivating is a danger confirmation that says documents and history are kept; reactivating is a plain one', async () => {
    const off = await dialog('StatusDialog', { employee: EMPLOYEES[0], deactivate: true })
    assert.match(off, /تعطيل حساب أحمد علي؟/)
    assert.match(off, /تبقى مستنداته وسجل أعماله محفوظة/)
    assert.match(off, /button--danger/)
    const on = await dialog('StatusDialog', { employee: EMPLOYEES[1], deactivate: false })
    assert.match(on, /إعادة تفعيل حساب منى خالد؟/)
    assert.doesNotMatch(on, /button--danger/)
  })
})

describe('employee management page', () => {
  const never = () => new Promise(() => {})
  const page = (service) => render('/src/pages/AdminEmployeesPage.jsx', { props: { service } })

  test('shows the title, the create button, the business-rules note and a loading state at first', async () => {
    const html = await page({ isMock: false, listEmployees: never })
    assert.match(html, /إدارة الموظفين/)
    assert.match(html, />\s*إضافة موظف\s*<\/button>/)
    assert.match(html, /لا يمكن حذف حساب موظف نهائيًا/)
    assert.match(html, /جارٍ تحميل الموظفين/)
    assert.doesNotMatch(html, /employee-table/)
    assert.doesNotMatch(html, /<dialog/) // dialogs are mounted only when opened
  })

  test('labels mock employee data as demo data, and says nothing about demo data for a real service', async () => {
    assert.match(await page({ isMock: true, listEmployees: never }), /badge--demo">بيانات تجريبية/)
    assert.doesNotMatch(await page({ isMock: false, listEmployees: never }), /badge--demo/)
  })
})

describe('role-based dashboards', () => {
  before(() => {
    documentStore.create({ id: 'dash-foreign-1', name: 'مستند موظف آخر للوحة', snapshot: makeSnapshot(), ownerId: 'another-employee' })
  })

  const dashboard = (user) => render('/src/pages/DashboardPage.jsx', { user })

  test('an employee sees only their own figures and activity, and no administrative section', async () => {
    const html = await dashboard(EMPLOYEE_USER)
    assert.match(html, /مرحبًا بك، علي حسن/)
    assert.match(html, /ملخص مستنداتي/)
    assert.match(html, /آخر مستنداتي/)
    assert.doesNotMatch(html, /مستندات المؤسسة|حسابات الموظفين|إدارة الموظفين/)
    assert.doesNotMatch(html, /مستند موظف آخر للوحة/) // someone else's document
    assert.match(html, /مستند تجريبي للمراجعة/) // their own demonstration document
  })

  test('the Admin sees institution-wide figures, the employee accounts section and everyone\'s recent documents', async () => {
    const html = await dashboard(ADMIN_USER)
    assert.match(html, /مرحبًا بك، سارة محمد/)
    assert.match(html, /ملخص مستندات المؤسسة/)
    assert.match(html, /id="employees-heading"[^>]*>حسابات الموظفين</)
    assert.match(html, /href="\/admin\/employees"/)
    assert.match(html, /آخر المستندات في المؤسسة/)
    assert.match(html, /مستند موظف آخر للوحة/)
    assert.doesNotMatch(html, /ملخص مستنداتي/)
  })

  test('figures that come from temporary or mock data are labelled as such (never as real server data)', async () => {
    for (const user of [EMPLOYEE_USER, ADMIN_USER]) {
      const html = await dashboard(user)
      assert.match(html, /badge--demo">بيانات تجريبية/)
      assert.match(html, /ليست بيانات حقيقية من الخادم/)
    }
    // The Admin's employee figures come from the (mock) employee service and say so too.
    assert.ok(((await dashboard(ADMIN_USER)).match(/badge--demo/g) ?? []).length >= 2)
  })

  test('the old fixed demonstration numbers are gone', async () => {
    const html = await dashboard(ADMIN_USER)
    assert.doesNotMatch(html, /١٢٨|128|٩٤|>94</)
  })
})

describe('translations of Batch B', () => {
  const flatten = (object, prefix = '') =>
    Object.entries(object).flatMap(([key, value]) => (typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]))
  const lookup = (language, path) => path.split('.').reduce((value, key) => value[key], translations[language])

  test('Arabic and English have identical keys, none empty', () => {
    for (const section of ['employees', 'dashboard', 'auth.dev', 'pages.adminEmployees']) {
      assert.deepEqual(flatten(lookup('en', section)).sort(), flatten(lookup('ar', section)).sort(), section)
      for (const language of ['ar', 'en']) {
        for (const key of flatten(lookup(language, section))) {
          assert.ok(String(lookup(language, `${section}.${key}`)).trim().length > 0, `${language} ${section}.${key}`)
        }
      }
    }
  })

  test('every message the forms can show resolves in both languages', () => {
    const codes = {
      displayName: ['required', 'tooLong'],
      identifier: ['required', 'tooShort', 'tooLong', 'invalidChars', 'duplicateIdentifier'],
      password: ['required', 'tooShort', 'tooLong'],
      confirmation: ['required', 'mismatch'],
    }
    const t = (language) => (key) => key.split('.').reduce((value, part) => value?.[part], translations[language])
    return import('../src/components/employees/messages.js').then(({ fieldMessage, errorMessage }) => {
      for (const language of ['ar', 'en']) {
        for (const [field, list] of Object.entries(codes)) {
          for (const code of list) assert.equal(typeof fieldMessage(t(language), field, code), 'string', `${language} ${field}.${code}`)
        }
        for (const code of ['forbidden', 'notFound', 'invalidInput', 'notConnected', 'network', 'unknown', 'mystery']) {
          assert.equal(typeof errorMessage(t(language), { code }), 'string', `${language} ${code}`)
        }
      }
    })
  })
})
