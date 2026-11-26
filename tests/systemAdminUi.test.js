// Batch C render tests: what each role sees on the administration screens, the notification bell
// and page, the settings pages, and the delete action in the document lists. Components are
// rendered to HTML through Vite's SSR loader (as in ui.test.js). Data-dependent states and
// interactions run in a real browser: see scripts/browser-checks/admin.check.mjs.

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
let NotificationsContext
let router
const modules = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/contexts/authContext.js'))
  ;({ NotificationsContext } = await server.ssrLoadModule('/src/contexts/notificationsContext.js'))
  router = await server.ssrLoadModule('react-router')
})

after(async () => {
  await server?.close()
})

const EMPLOYEE = { id: 'demo-employee', displayName: 'علي حسن', role: 'employee' }
const ADMIN = { id: 'demo-admin', displayName: 'سارة محمد', role: 'orgAdmin' }
const noop = () => {}
const auth = (user) => ({ status: 'authenticated', user, error: null, isSubmitting: false, login: noop, logout: noop, clearError: noop, retryInitialize: noop, devAccounts: null, devReset: null })
const never = () => new Promise(() => {})

const NOTIFICATIONS = [
  { id: 'n1', type: 'processingFailed', createdAt: '2026-06-01T10:00:00.000Z', documentId: 'doc-1', documentName: 'فاتورة 12', params: {}, unread: true },
  { id: 'n2', type: 'processingCompleted', createdAt: '2026-05-31T10:00:00.000Z', documentId: 'doc-2', documentName: 'عقد', params: {}, unread: false },
  { id: 'n3', type: 'storageWarning', createdAt: '2026-05-30T10:00:00.000Z', documentId: null, documentName: null, params: { percent: 84 }, unread: true },
]
const notifications = (items = NOTIFICATIONS, extra = {}) => ({
  status: 'ready', items, error: null, unreadCount: items.filter((item) => item.unread).length, isMock: true, service: { isMock: true }, reload: noop, markRead: noop, markAllRead: noop, ...extra,
})

async function load(file) {
  if (!modules.has(file)) modules.set(file, await server.ssrLoadModule(file))
  return modules.get(file)
}

async function render(file, { exportName = 'default', props, user = ADMIN, notification, path = '/' } = {}) {
  const Component = (await load(file))[exportName]
  let tree = h(router.MemoryRouter, { initialEntries: [path] }, h(Component, props))
  if (notification) tree = h(NotificationsContext.Provider, { value: notification }, tree)
  return renderToString(h(LanguageProvider, null, h(AuthContext.Provider, { value: auth(user) }, tree)))
}

describe('Admin pages: header, simulation notice and loading state', () => {
  const cases = [
    ['/src/pages/RecycleBinPage.jsx', 'سلة المحذوفات', /محاكاة/, { service: { isMock: true, listDeleted: never }, settings: { getSettings: never } }],
    ['/src/pages/BackupsPage.jsx', 'النسخ الاحتياطي والاستعادة', /لا تُنشأ نسخ احتياطية فعلية/, { service: { isMock: true, listBackups: never }, settings: { getSettings: never } }],
    ['/src/pages/AuditLogPage.jsx', 'سجل التدقيق', /السجل هنا محاكاة/, { service: { isMock: true, listEntries: never } }],
    ['/src/pages/StoragePage.jsx', 'مراقبة التخزين', /لا يُقاس قرص فعلي/, { service: { isMock: true, getStatus: never } }],
    ['/src/pages/SystemSettingsPage.jsx', 'إعدادات النظام', /لا يقرؤها الخادم/, { service: { isMock: true, getSettings: never } }],
  ]

  for (const [file, title, simulation, props] of cases) {
    test(`${file.split('/').pop()} names itself, says it is simulated, and starts in a loading state`, async () => {
      const html = await render(file, { props })
      assert.match(html, new RegExp(title))
      assert.match(html, simulation)
      assert.match(html, /badge--demo">بيانات تجريبية/)
      assert.match(html, /role="status"/)
      assert.match(html, /جارٍ التحميل/)
    })

    test(`${file.split('/').pop()} says nothing about being simulated when the service is the real one`, async () => {
      const real = Object.fromEntries(Object.entries(props).map(([key, value]) => [key, { ...value, isMock: false }]))
      const html = await render(file, { props: real })
      assert.doesNotMatch(html, /badge--demo/)
      assert.doesNotMatch(html, /محاكاة للتطوير/)
    })
  }

  test('no Admin page offers an export of anything (decision 32)', async () => {
    for (const [file, , , props] of cases) assert.doesNotMatch(await render(file, { props }), /<(button|a)[^>]*>(<[^>]+>|[^<])*(تصدير|export|Excel|PDF)/i)
  })
})

describe('simulated operations are never presented as real', () => {
  test('the restore confirmation spells out the consequences, needs an acknowledgement and says it is a simulation', async () => {
    const backup = { id: 'b1', createdAt: '2026-05-30T02:00:00.000Z', status: 'completed', type: 'scheduled', locations: ['local'], sizeBytes: 1024, protected: false }
    const html = await render('/src/components/admin/RestoreDialog.jsx', { exportName: 'RestoreDialog', props: { backup, service: {}, onClose: noop, onFinished: noop } })
    for (const text of [/نسخة وقائية/, /ستُفقد/, /تُمنع الكتابة/, /تُلغى الاستعادة ولا يتغير شيء/, /محاكاة: لن يُستعاد أي شيء فعليًا/]) assert.match(html, text)
    assert.match(html, /type="checkbox"/)
    assert.match(html, /<button type="submit" class="button button--danger" disabled=""/) // off until the acknowledgement is ticked
  })

  test('the backup table offers test, protect and restore, and only for completed backups', async () => {
    const backups = [
      { id: 'ok', createdAt: '2026-05-30T02:00:00.000Z', status: 'completed', type: 'manual', locations: ['local', 'external'], sizeBytes: 3 * 1024 ** 3, protected: true, verifiedAt: '2026-05-31T00:00:00.000Z' },
      { id: 'bad', createdAt: '2026-05-29T02:00:00.000Z', status: 'failed', type: 'manual', locations: ['local'], sizeBytes: 0, protected: false, verifiedAt: null },
    ]
    const html = await render('/src/components/admin/BackupTable.jsx', { exportName: 'BackupTable', props: { backups, busyId: null, onAction: noop } })
    assert.match(html, /badge--success">مكتملة/)
    assert.match(html, /badge--demo">فاشلة/)
    assert.match(html, /محلي \+ جهاز مستقل/)
    assert.match(html, /3 جيجابايت|٣ جيجابايت/)
    assert.match(html, /محمية/)
    assert.equal((html.match(/button--outline-danger" disabled=""/g) ?? []).length, 1) // restore of the failed backup is off
    assert.doesNotMatch(html, /حذف|delete/i) // backups are never deleted by hand
  })

  test('the development simulation panel is clearly labelled', async () => {
    const html = await render('/src/components/admin/DevSimulationPanel.jsx', { exportName: 'DevSimulationPanel', props: { children: 'x' } })
    assert.match(html, /للتطوير فقط/)
    assert.match(html, /أدوات المحاكاة/)
  })
})

describe('system settings form', () => {
  const section = (props) => render('/src/components/settings/SettingsSection.jsx', { exportName: 'SettingsSection', props: { service: {}, ...props } })

  test('shows the section, labelled fields with hints, and a Save button that is off until something changes', async () => {
    const html = await section({ section: 'uploads', initial: { maxFileSizeMb: 10, maxSelectedPages: 100 }, fields: [{ name: 'maxFileSizeMb', type: 'number' }, { name: 'maxSelectedPages', type: 'number' }] })
    assert.match(html, />الرفع والمعالجة</)
    assert.match(html, />الحد الأقصى لحجم الملف \(ميجابايت\)</)
    assert.match(html, /القيمة الافتراضية مؤقتة وليست نهائية/)
    assert.match(html, /value="10"/)
    assert.match(html, /<button type="submit" class="button button--primary" disabled="">حفظ التغييرات/)
  })

  test('checkbox and select fields use their own translated labels and options', async () => {
    const html = await section({
      section: 'backups',
      initial: { scheduleEnabled: true, frequency: 'weekly', weekday: 5, time: '02:00', retentionMode: 'count', retentionCount: 7, retentionDays: 30, localPath: '', externalPath: '' },
      fields: [
        { name: 'scheduleEnabled', type: 'checkbox' },
        { name: 'frequency', type: 'select', options: ['daily', 'weekly'] },
        { name: 'weekday', type: 'select', numeric: true, options: [0, 5], showWhen: (values) => values.frequency === 'weekly' },
        { name: 'retentionDays', type: 'number', showWhen: (values) => values.retentionMode === 'days' },
      ],
    })
    assert.match(html, /تفعيل النسخ الاحتياطي التلقائي المجدول/)
    assert.match(html, /<option value="weekly" selected="">أسبوعيًا<\/option>/)
    assert.match(html, /<option value="5" selected="">الجمعة<\/option>/)
    assert.doesNotMatch(html, /مدة الاحتفاظ بالنسخ \(أيام\)/) // hidden while the mode is "by count"
  })
})

describe('preferences page (every role) and the Admin-only system settings link', () => {
  const page = (user) => render('/src/pages/SettingsPage.jsx', { user, props: { service: { isMock: true, getLimits: never } } })

  test('an employee sees language, their account and the read-only limits, no system settings, and the password rule', async () => {
    const html = await page(EMPLOYEE)
    assert.match(html, /لغة الواجهة/)
    assert.match(html, /type="radio"/)
    assert.match(html, /علي حسن/)
    assert.match(html, /لا يمكنك تغيير كلمة مرورك بنفسك/)
    assert.match(html, /حدود الرفع الحالية/)
    assert.doesNotMatch(html, /href="\/admin\/settings"/)
    assert.doesNotMatch(html, /id="system-heading"/)
  })

  test('the Admin additionally gets the link to the system settings and no employee-only password note', async () => {
    const html = await page(ADMIN)
    assert.match(html, /href="\/admin\/settings"/)
    assert.doesNotMatch(html, /لا يمكنك تغيير كلمة مرورك بنفسك/)
  })
})

describe('notification bell', () => {
  const bell = (notification) => render('/src/components/layout/NotificationBell.jsx', { exportName: 'NotificationBell', notification })

  test('shows the unread count in the accessible name, and no panel until it is opened', async () => {
    const html = await bell(notifications())
    assert.match(html, /aria-label="الإشعارات \(٢ غير مقروءة\)"|aria-label="الإشعارات \(2 غير مقروءة\)"/)
    assert.match(html, /aria-expanded="false"/)
    assert.match(html, /notification-bell__badge/)
    assert.doesNotMatch(html, /class="notification-panel"/)
  })

  test('with nothing unread there is no badge', async () => {
    const html = await bell(notifications(NOTIFICATIONS.map((item) => ({ ...item, unread: false }))))
    assert.doesNotMatch(html, /notification-bell__badge/)
    assert.match(html, /aria-label="الإشعارات"/)
  })
})

describe('notifications page and items', () => {
  const page = (notification, user = ADMIN) => render('/src/pages/NotificationsPage.jsx', { user, notification })

  test('lists each notification with what happened, when, and a link; unread ones are marked', async () => {
    const html = await page(notifications())
    assert.match(html, /فشلت معالجة مستند/)
    assert.match(html, /«فاتورة 12»/)
    assert.match(html, /href="\/corrections\/review\/doc-1"/)
    assert.match(html, /href="\/admin\/storage"/)
    assert.match(html, /is-unread/)
    assert.match(html, /<time dateTime="2026-06-01T10:00:00.000Z"|<time datetime="2026-06-01T10:00:00.000Z"/i)
    assert.match(html, /محاكاة/)
  })

  test('opening a document is a link the user follows; there is no automatic redirect anywhere', async () => {
    const html = await page(notifications())
    assert.doesNotMatch(html, /<meta[^>]*refresh|window\.location|navigate\(/i)
    assert.match(html, /<a class="inline-link"[^>]*href="\/corrections\/review\/doc-1"|href="\/corrections\/review\/doc-1"[^>]*class="inline-link"/)
  })

  test('an empty list, a failed load and a missing service each have their own message', async () => {
    assert.match(await page(notifications([])), /لا توجد إشعارات\./)
    assert.match(await page(notifications([], { status: 'error', error: 'notConnected' })), /الخادم غير متصل بالواجهة/)
    assert.match(await page(notifications([], { status: 'loading' })), /جارٍ التحميل/)
  })

  test('development simulation buttons appear only when the service offers them', async () => {
    const withDev = await page(notifications(NOTIFICATIONS, { service: { isMock: true, dev: { simulate: noop } } }))
    assert.match(withDev, /محاكاة: اكتملت معالجة مستند/)
    assert.doesNotMatch(await page(notifications(NOTIFICATIONS, { isMock: false, service: { isMock: false } })), /محاكاة: اكتملت/)
  })
})

describe('document lists: the delete action belongs to the Admin only (decision 42)', () => {
  const item = { id: 'd1', name: 'مستند', approvalStatus: 'none', usesMockProcessing: false, selectedCount: 1, totalPages: 1, reviewedCount: 0 }
  const list = (props) => render('/src/components/review/DocumentListItem.jsx', { exportName: 'DocumentListItem', props: { item, ...props } })

  test('without onDelete (an employee) there is no delete button', async () => {
    assert.doesNotMatch(await list({}), /نقل إلى السلة|trash/)
  })

  test('with onDelete (the Admin) the button names the document', async () => {
    const html = await list({ onDelete: noop })
    assert.match(html, /aria-label="نقل إلى السلة: مستند"/)
    assert.match(html, /button--outline-danger/)
  })

  test('the move-to-bin confirmation promises a soft delete, warns about processing, and is a danger confirmation', async () => {
    const dialog = (processingCount) => render('/src/components/documents/MoveToBinDialog.jsx', { exportName: 'MoveToBinDialog', props: { item: { ...item, processingCount }, service: {}, onCancel: noop, onDone: noop } })
    const idle = await dialog(0)
    assert.match(idle, /نقل «مستند» إلى سلة المحذوفات/)
    assert.match(idle, /يبقى الأصل والنتائج والمسودات والإصدارات محفوظة/)
    assert.match(idle, /button--danger/)
    assert.doesNotMatch(idle, /قيد المعالجة الآن/)
    assert.match(await dialog(2), /قيد المعالجة الآن/)
  })

  test('the hook gives employees no delete handler and the Admin one', async () => {
    const { useDocumentDeletion } = await load('/src/hooks/useDocumentDeletion.jsx')
    // The probe renders what the hook returned, so the test reads it from the HTML.
    const probe = (user) => {
      function Probe() {
        const { onDelete } = useDocumentDeletion({ service: {} })
        return h('p', null, `onDelete:${typeof onDelete}`)
      }
      return renderToString(h(LanguageProvider, null, h(AuthContext.Provider, { value: auth(user) }, h(Probe))))
    }
    assert.match(probe(EMPLOYEE), /onDelete:undefined/)
    assert.match(probe(ADMIN), /onDelete:function/)
  })
})

describe('Admin routes and navigation', () => {
  const paths = ['/admin/employees', '/admin/recycle-bin', '/admin/backups', '/admin/audit-log', '/admin/storage', '/admin/settings']

  test('an employee gets "access denied" on every Admin URL and never the Admin page', async () => {
    const { RequireAuth } = await load('/src/components/auth/RequireAuth.jsx')
    const { RequireRole } = await load('/src/components/auth/RequireRole.jsx')
    const { ADMIN_ROLES } = await load('/src/constants/roles.js')
    const tree = h(router.Routes, null, h(router.Route, { element: h(RequireAuth) }, h(router.Route, { element: h(RequireRole, { roles: ADMIN_ROLES }) }, ...paths.map((path) => h(router.Route, { key: path, path, element: h('p', null, `SECRET:${path}`) })))))
    for (const path of paths) {
      const asEmployee = renderToString(h(LanguageProvider, null, h(AuthContext.Provider, { value: auth(EMPLOYEE) }, h(router.MemoryRouter, { initialEntries: [path] }, tree))))
      assert.doesNotMatch(asEmployee, /SECRET/, path)
      assert.match(asEmployee, /لا تملك صلاحية الوصول/, path)
      const asAdmin = renderToString(h(LanguageProvider, null, h(AuthContext.Provider, { value: auth(ADMIN) }, h(router.MemoryRouter, { initialEntries: [path] }, tree))))
      assert.match(asAdmin, new RegExp(`SECRET:${path}`), path)
    }
  })

  test('the sidebar lists the six Admin pages for the Admin only, and notifications for both', async () => {
    const sidebar = (user) => render('/src/components/layout/Sidebar.jsx', { user, exportName: 'Sidebar', props: { id: 's', isOpen: true, onClose: noop, onNavigate: noop } })
    const employee = await sidebar(EMPLOYEE)
    const admin = await sidebar(ADMIN)
    for (const path of paths) {
      assert.doesNotMatch(employee, new RegExp(`href="${path}"`), path)
      assert.match(admin, new RegExp(`href="${path}"`), path)
    }
    assert.match(employee, /href="\/notifications"/)
    assert.match(admin, /href="\/notifications"/)
    assert.match(employee, /href="\/settings"/)
  })
})
