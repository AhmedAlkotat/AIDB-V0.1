// Batch D render tests: what each role sees in the document lists, the archive filters, the review tabs, the
// edit-lock notice, the processing status, the approved-version history, the processing attempts, the export
// dialog and the templates page, in Arabic (RTL) and English (LTR). Components are rendered to HTML through
// Vite's SSR loader (as in ui.test.js). The data-dependent flows and the interactions run in a real browser:
// see scripts/browser-checks/documents.check.mjs. Nothing here is real processing or security.

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'
import { makeEditor, NOW, paragraph, field, table, unclassified } from './helpers.js'
import { makeSnapshot } from './sessionHelpers.js'

const root = process.cwd()
const require = createRequire(`${root}/package.json`)
const React = require('react')
const { renderToString } = require('react-dom/server')
const h = React.createElement

let server
let LanguageProvider
let LanguageContext
let AuthContext
let router
const modules = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
  ;({ LanguageContext } = await server.ssrLoadModule('/src/contexts/languageContext.js'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/contexts/authContext.js'))
  router = await server.ssrLoadModule('react-router')
})

after(async () => {
  await server?.close()
})

const EMPLOYEE = { id: 'demo-employee', displayName: 'علي حسن', role: 'employee' }
const ADMIN = { id: 'demo-admin', displayName: 'سارة محمد', role: 'orgAdmin' }
const noop = () => {}
const auth = (user) => ({ status: 'authenticated', user, error: null, isSubmitting: false, login: noop, logout: noop, clearError: noop, retryInitialize: noop, devAccounts: null, devReset: null })

async function load(file) {
  if (!modules.has(file)) modules.set(file, await server.ssrLoadModule(file))
  return modules.get(file)
}

async function render(file, { exportName = 'default', props, user = EMPLOYEE, language = 'ar' } = {}) {
  const Component = (await load(file))[exportName]
  const tree = h(router.MemoryRouter, { initialEntries: ['/'] }, h(Component, props))
  const withAuth = h(AuthContext.Provider, { value: auth(user) }, tree)
  if (language === 'ar') return renderToString(h(LanguageProvider, null, withAuth))
  return renderToString(h(LanguageContext.Provider, { value: { language, direction: 'ltr', setLanguage: noop } }, withAuth))
}

// Store summaries for every lifecycle state.
function summaries() {
  const store = createMemoryDocumentStore({ now: () => NOW })
  const make = (name, init = {}) => store.create({ name, snapshot: makeSnapshot({ selectedPages: [1, 2, 3], totalPages: 3 }), ownerId: 'demo-employee', ...init })
  const ids = {
    pending: make('قيد الانتظار.pdf', { workflow: { phase: 'pending', queuedAt: NOW } }),
    processing: make('قيد المعالجة.pdf', { workflow: { phase: 'processing', startedAt: NOW } }),
    ready: make('جاهز.pdf', { documentType: 'invoice', template: { id: 't', name: 'فاتورة تجريبية' } }),
    failed: make('فاشل.pdf', { workflow: { phase: 'failed', errorCode: 'MOCK_OCR_FAILED' } }),
    approved: make('معتمد.pdf', { approval: { status: 'approved' }, versions: [{ number: 1, approvedAt: NOW, approvedBy: 'demo-admin', approvedByName: 'مدير', snapshot: makeSnapshot({ selectedPages: [1], totalPages: 3 }) }] }),
  }
  return { store, ids, list: store.list() }
}
const itemOf = ({ list, ids }, key) => list.find((item) => item.id === ids[key])

describe('document list rows: the six states and what each offers', () => {
  const row = (item, props = {}, user = EMPLOYEE, language = 'ar') => render('/src/components/review/DocumentListItem.jsx', { exportName: 'DocumentListItem', props: { item, onDelete: undefined, onRetry: noop, onExport: noop, ...props }, user, language })

  test('every state has its own badge, in Arabic and English', async () => {
    const data = summaries()
    const ar = { pending: 'قيد الانتظار', processing: 'قيد المعالجة', ready: 'جاهز للمراجعة', failed: 'فشلت المعالجة', approved: 'معتمد' }
    const en = { pending: 'Pending', processing: 'Processing', ready: 'Ready for Review', failed: 'Failed', approved: 'Approved' }
    for (const key of Object.keys(ar)) {
      assert.match(await row(itemOf(data, key)), new RegExp(`badge badge--[a-z]+">${ar[key]}<`), key)
      assert.match(await row(itemOf(data, key), {}, EMPLOYEE, 'en'), new RegExp(`badge badge--[a-z]+">${en[key]}<`), key)
    }
  })

  test('Pending shows its FIFO position, Processing its progress, Failed its reason', async () => {
    const data = summaries()
    assert.match(await row(itemOf(data, 'pending'), { queuePosition: 3 }), /الترتيب في الطابور: (3|٣)/)
    assert.match(await row(itemOf(data, 'pending'), { queuePosition: null }), /بانتظار دوره في الطابور/)
    assert.match(await row(itemOf(data, 'processing')), /تمت معالجة (0|٠) من (3|٣) صفحة/)
    assert.match(await row(itemOf(data, 'failed')), /تعذّر استخراج محتوى الصفحة/)
    assert.match(await row(itemOf(data, 'pending'), { queuePosition: 2 }, EMPLOYEE, 'en'), /Queue position: 2/)
  })

  test('only a Pending or Processing document has no review: it offers the status; the others open the review (read-only once approved)', async () => {
    const data = summaries()
    assert.match(await row(itemOf(data, 'pending')), /عرض حالة المعالجة/)
    assert.match(await row(itemOf(data, 'processing')), /عرض حالة المعالجة/)
    assert.match(await row(itemOf(data, 'ready')), /فتح المراجعة/)
    assert.match(await row(itemOf(data, 'approved')), /عرض المستند \(للقراءة فقط\)/)
  })

  test('a failed document offers a retry (no re-upload) and manual entry, and an approved one does not', async () => {
    const data = summaries()
    const failed = await row(itemOf(data, 'failed'))
    assert.match(failed, /aria-label="إعادة المعالجة: فاشل\.pdf"/)
    assert.match(failed, /aria-label="إدخال يدوي: فاشل\.pdf"/)
    const approved = await row(itemOf(data, 'approved'))
    assert.doesNotMatch(approved, /إعادة المعالجة|إدخال يدوي/)
    assert.doesNotMatch(await row(itemOf(data, 'ready')), /إعادة المعالجة/)
  })

  test('export is offered only for a document with an approved version, and only when the page gives the handler', async () => {
    const data = summaries()
    assert.match(await row(itemOf(data, 'approved')), /aria-label="تصدير: معتمد\.pdf"/)
    assert.doesNotMatch(await row(itemOf(data, 'ready')), /تصدير/)
    assert.doesNotMatch(await row(itemOf(data, 'approved'), { onExport: undefined }), /تصدير/)
  })

  test('only the Admin gets the delete button (decision 42), also on the Admin view of pending and processing documents', async () => {
    const data = summaries()
    for (const key of ['pending', 'processing', 'ready', 'failed', 'approved']) {
      assert.doesNotMatch(await row(itemOf(data, key), { onDelete: noop }), /نقل إلى السلة/, `employee ${key}`)
      assert.match(await row(itemOf(data, key), { onDelete: noop }, ADMIN), /aria-label="نقل إلى السلة:/, `admin ${key}`)
    }
  })

  test('a new version in progress is marked, and an unclassified layout adds nothing', async () => {
    const store = createMemoryDocumentStore({ now: () => NOW })
    const id = store.create({ name: 'م.pdf', snapshot: makeSnapshot(), ownerId: 'demo-employee', versions: [{ number: 1, approvedAt: NOW, approvedBy: 'x', snapshot: makeSnapshot() }] })
    const html = await row(store.list().find((item) => item.id === id))
    assert.match(html, /إصدار جديد قيد التحرير \((2|٢)\)/)
    assert.doesNotMatch(html, /badge--neutral">غير مصنّف/)
  })
})

describe('the archive and the queue pages', () => {
  test('the archive page has a search form with name, type, status and date filters, and says it is simulated', async () => {
    const html = await render('/src/pages/DocumentArchivePage.jsx')
    assert.match(html, /role="search"/)
    assert.match(html, /type="search"/)
    for (const label of ['بحث بالاسم', 'نوع المستند', 'الحالة', 'من تاريخ الرفع', 'إلى تاريخ الرفع']) assert.match(html, new RegExp(label))
    assert.equal((html.match(/type="date"/g) ?? []).length, 2)
    assert.match(html, /محاكاة/)
  })

  test('the status filter lists exactly the archive states: every one except Pending', async () => {
    const html = await render('/src/components/documents/ArchiveFilters.jsx', {
      exportName: 'ArchiveFilters',
      props: { filters: { query: '', type: 'all', state: 'all', from: '', to: '' }, types: ['invoice', 'unclassified'], shown: 2, total: 2, canClear: false, onChange: noop, onClear: noop },
    })
    const select = /<select[^>]*>[\s\S]*?<\/select>/g
    const options = [...html.matchAll(select)].map((match) => match[0]).find((markup) => markup.includes('قيد المعالجة'))
    for (const label of ['قيد المعالجة', 'جاهز للمراجعة', 'فشلت المعالجة', 'تحرير يدوي', 'معتمد']) assert.match(options, new RegExp(label))
    assert.doesNotMatch(options, /قيد الانتظار/)
    assert.match(html, /فاتورة/)
    assert.match(html, /غير مصنّف/)
  })

  test('the queue page filters by state and lists Pending too', async () => {
    const html = await render('/src/pages/CorrectionQueuePage.jsx')
    assert.match(html, /id="queue-state-filter"/)
    assert.match(html, /الأسبق وصولًا أولًا/)
  })

  test('the dashboard shows a count for each of the six states', async () => {
    const html = await render('/src/pages/DashboardPage.jsx')
    assert.match(html, /class="state-counts"/)
    assert.equal((html.match(/<li data-state="/g) ?? []).length, 6)
  })
})

describe('review tabs: Texts, Tables, Fields, JSON (decision 4)', () => {
  const content = () => {
    const editor = makeEditor()
    const g = createSequentialIdGenerator(900)
    editor.dispatch({ type: 'elementAdded', pageNumber: 1, element: paragraph(g, 'فقرة أولى') })
    editor.dispatch({ type: 'elementAdded', pageNumber: 1, element: field(g, 'الاسم', 'أحمد') })
    editor.dispatch({ type: 'elementAdded', pageNumber: 1, element: table(g) })
    editor.dispatch({ type: 'elementAdded', pageNumber: 1, element: unclassified(g, 'ختم غير مصنف', { raw: true }) })
    return { document: editor.state.document, page: editor.page(1) }
  }
  const tabs = (tab, language = 'ar') => {
    const { document, page } = content()
    return render('/src/components/review/ResultTabs.jsx', { exportName: 'ResultTabs', language, props: { document, page, tab, onTabChange: noop, query: '', disabled: false, dispatch: noop, setPending: noop, onActivate: noop } })
  }

  test('there are exactly four tabs, as an accessible tab list with the counts of what each holds', async () => {
    const html = await tabs('texts')
    assert.match(html, /role="tablist"/)
    assert.equal((html.match(/role="tab"/g) ?? []).length, 4)
    for (const label of ['النصوص', 'الجداول', 'الحقول', 'JSON']) assert.match(html, new RegExp(`>${label}`))
    assert.match(html, /role="tabpanel"/)
    assert.match(html, /aria-selected="true"[^>]*data-tab="texts"|data-tab="texts"[^>]*aria-selected="true"/)
    assert.match(await tabs('texts', 'en'), />Texts</)
  })

  test('the Texts tab shows headings, paragraphs and the unclassified content, nothing else', async () => {
    const html = await tabs('texts')
    assert.match(html, /فقرة أولى/)
    assert.match(html, /ختم غير مصنف/) // unclassified content is preserved, not lost to the tabs
    assert.doesNotMatch(html, /أحمد/)
    assert.equal((html.match(/data-element-id=/g) ?? []).length, 2)
  })

  test('the Tables tab shows tables and the Fields tab shows fields', async () => {
    const tablesHtml = await tabs('tables')
    assert.equal((tablesHtml.match(/data-element-id=/g) ?? []).length, 1)
    assert.match(tablesHtml, /element-card--table/)
    const fieldsHtml = await tabs('fields')
    assert.match(fieldsHtml, /أحمد/)
    assert.equal((fieldsHtml.match(/data-element-id=/g) ?? []).length, 1)
  })

  test('the JSON tab is always open, read only, and holds EVERY element of the page (so it stays consistent with the other tabs)', async () => {
    const html = await tabs('json')
    assert.match(html, /json-preview--embedded/)
    assert.doesNotMatch(html, /json-preview__toggle/) // no toggle: it is a tab
    for (const text of ['فقرة أولى', 'أحمد', 'ختم غير مصنف']) assert.ok(html.includes(text) || html.includes(JSON.stringify(text).slice(1, -1)) || html.includes(text.replace(/"/g, '&quot;')), text)
    assert.match(html, /&quot;pageNumber&quot;: 1/)
  })

  test('no AI / AI Edited / Manual label appears anywhere (decision 49), in either language', async () => {
    for (const language of ['ar', 'en']) {
      const all = (await Promise.all(['texts', 'tables', 'fields', 'json'].map((tab) => tabs(tab, language)))).join('')
      assert.doesNotMatch(all, /أُضيف يدويًا|مستخرج بالذكاء الاصطناعي|مستخرج \(تجريبي\)|Added manually|Extracted by AI|AI Edited/)
    }
  })

  test('an empty tab offers to add content of ITS kind only', async () => {
    const editor = makeEditor()
    const html = await render('/src/components/review/ResultTabs.jsx', { exportName: 'ResultTabs', props: { document: editor.state.document, page: editor.page(1), tab: 'tables', onTabChange: noop, query: '', disabled: false, dispatch: noop, setPending: noop, onActivate: noop } })
    assert.match(html, /insert-point is-prominent/)
    assert.doesNotMatch(html, /الجداول<span class="result-tabs__count">[^0٠]/)
  })

  test('a read-only document (approved, or without the lock) shows the tabs without editing controls', async () => {
    const { document, page } = content()
    const html = await render('/src/components/review/ResultTabs.jsx', { exportName: 'ResultTabs', props: { document, page, tab: 'texts', onTabChange: noop, query: '', disabled: true, dispatch: noop, setPending: noop, onActivate: noop } })
    assert.match(html, /editor-notice/)
    assert.doesNotMatch(html, /draggable="true"/)
    assert.doesNotMatch(html, /class="insert-point/)
  })

  test('an element with coordinates offers "show on the page"; one without it works the same, without the button', async () => {
    const editor = makeEditor()
    const g = createSequentialIdGenerator(950)
    const withLocation = { ...paragraph(g, 'له إحداثيات'), location: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } }
    editor.dispatch({ type: 'elementAdded', pageNumber: 1, element: withLocation })
    editor.dispatch({ type: 'elementAdded', pageNumber: 1, element: paragraph(g, 'بلا إحداثيات') })
    const html = await render('/src/components/review/ResultTabs.jsx', { exportName: 'ResultTabs', props: { document: editor.state.document, page: editor.page(1), tab: 'texts', onTabChange: noop, query: '', disabled: false, dispatch: noop, setPending: noop, onActivate: noop } })
    assert.equal((html.match(/إظهار على الصفحة/g) ?? []).length, 1)
    assert.match(html, /بلا إحداثيات/)
  })
})

describe('edit lock, state banner and processing status', () => {
  const banner = (lock, props = {}, language = 'ar') => render('/src/components/review/LockBanner.jsx', { exportName: 'LockBanner', language, props: { lock, isApproved: false, hasUnsaved: false, onRequest: noop, ...props } })

  test('nothing is shown when the lock is not used, or the document is approved', async () => {
    assert.equal(await banner(null), '')
    assert.equal(await banner({ status: 'held' }, { isApproved: true }), '')
  })

  test('another editor: a clear read-only notice with their name, and no way to edit, save, reprocess or approve', async () => {
    const html = await banner({ status: 'readOnly', holderName: 'سارة' })
    assert.match(html, /data-lock="readOnly"/)
    assert.match(html, /سارة يحرر هذا المستند الآن/)
    assert.match(html, /لا يمكنك تعديله أو حفظه أو إعادة معالجة صفحاته أو اعتماده/)
    assert.doesNotMatch(html, /<button/)
    assert.match(await banner({ status: 'readOnly', holderName: 'Sara' }, {}, 'en'), /Sara is editing this document now/)
  })

  test('a lost lock says saved work is kept, warns about unsaved work and offers to take the lock again', async () => {
    const html = await banner({ status: 'lost' }, { hasUnsaved: true })
    assert.match(html, /التعديلات التي حُفظت من قبل باقية/)
    assert.match(html, /توجد تعديلات لم تُحفظ بعد/)
    assert.match(html, /بدء التحرير/)
    assert.doesNotMatch(await banner({ status: 'lost' }), /توجد تعديلات لم تُحفظ بعد/)
  })

  test('available and held', async () => {
    assert.match(await banner({ status: 'available' }), /بدء التحرير/)
    assert.match(await banner({ status: 'held' }), /أنت المحرر الوحيد/)
    assert.match(await banner({ status: 'checking' }), /data-lock="checking"/)
  })

  test('the state banner explains a failure, offers retry without re-upload and manual entry; nothing for the other states', async () => {
    const banner2 = (state, props = {}) => render('/src/components/review/DocumentStateBanner.jsx', { exportName: 'DocumentStateBanner', props: { state, failureCode: 'MOCK_OCR_FAILED', canRetry: true, onRetry: noop, ...props } })
    const failed = await banner2('failed')
    assert.match(failed, /data-banner="failed"/)
    assert.match(failed, /دون إعادة رفع المستند/)
    assert.match(failed, /إدخال النصوص والجداول والحقول يدويًا/)
    assert.match(failed, /إعادة المعالجة دون إعادة الرفع/)
    assert.match(await banner2('manualEditing'), /لن تحل أي نتيجة جديدة محل ما أدخلته/)
    assert.doesNotMatch(await banner2('failed', { canRetry: false }), /<button/)
    assert.equal(await banner2('readyForReview'), '')
    assert.equal(await banner2('approved'), '')
  })

  test('the processing status keeps working in the background, says nothing navigates by itself, and has no automatic redirect', async () => {
    const data = summaries()
    const props = (key) => ({ summary: itemOf(data, key), file: null, firstPage: 1, onOpenReview: noop })
    const processing = await render('/src/components/review/ProcessingStatusView.jsx', { exportName: 'ProcessingStatusView', props: props('processing') })
    assert.match(processing, /data-processing-status="processing"/)
    assert.match(processing, /المعالجة تعمل في الخلفية/)
    assert.match(processing, /ولن يُفتح المستند تلقائيًا/)
    assert.match(processing, /role="progressbar"/)
    assert.doesNotMatch(processing, /بدء المراجعة/) // not ready: no review button yet
    const pending = await render('/src/components/review/ProcessingStatusView.jsx', { exportName: 'ProcessingStatusView', props: props('pending') })
    assert.match(pending, /في الطابور بانتظار دوره/)
    // once finished the page OFFERS the review; it never opens it
    const ready = await render('/src/components/review/ProcessingStatusView.jsx', { exportName: 'ProcessingStatusView', props: props('ready') })
    assert.match(ready, /<button[^>]*>[\s\S]*بدء المراجعة/)
    assert.match(ready, /انتهت المعالجة/)
  })
})

describe('versions and attempts (decisions 14, 40)', () => {
  const versions = [
    { number: 2, approvedAt: '2026-06-02T10:00:00.000Z', approvedBy: 'demo-admin', approvedByName: 'سارة', pageCount: 3, isLatest: true },
    { number: 1, approvedAt: '2026-06-01T10:00:00.000Z', approvedBy: 'demo-employee', approvedByName: 'علي', pageCount: 2, isLatest: false },
  ]

  test('the history lists every approved version with its date and approver, newest first, each with a "view" button', async () => {
    const html = await render('/src/components/review/VersionHistoryPanel.jsx', { exportName: 'VersionHistoryPanel', props: { versions, isDraft: false, getVersion: () => null } })
    assert.match(html, /data-version="2"/)
    assert.match(html, /data-version="1"/)
    assert.ok(html.indexOf('data-version="2"') < html.indexOf('data-version="1"'))
    assert.match(html, /بواسطة سارة/)
    assert.match(html, /بواسطة علي/)
    assert.equal((html.match(/>عرض</g) ?? []).length, 2)
    assert.match(html, /لا يعدّل الموظف مستندًا معتمدًا/)
    assert.doesNotMatch(html, /إصدار جديد \(.*\) قيد التحرير/)
  })

  test('a new version in progress is announced; no history means no panel', async () => {
    const html = await render('/src/components/review/VersionHistoryPanel.jsx', { exportName: 'VersionHistoryPanel', props: { versions, isDraft: true, getVersion: () => null } })
    assert.match(html, /إصدار جديد \((3|٣)\) قيد التحرير وينتظر الاعتماد/)
    assert.equal(await render('/src/components/review/VersionHistoryPanel.jsx', { exportName: 'VersionHistoryPanel', props: { versions: [], isDraft: false, getVersion: () => null } }), '')
  })

  test('the attempts log shows date, scope, reason, status and failure reason, newest first, and says rejected content is not kept', async () => {
    const attempts = [
      { id: 'a', scope: 'document', pageNumber: null, attempt: 1, trigger: 'upload', status: 'failed', startedAt: '2026-06-01T10:00:00.000Z', finishedAt: NOW, errorCode: 'MOCK_OCR_FAILED' },
      { id: 'b', scope: 'page', pageNumber: 2, attempt: 2, trigger: 'reprocess', status: 'rejected', startedAt: '2026-06-01T11:00:00.000Z', finishedAt: NOW, errorCode: null },
    ]
    const html = await render('/src/components/review/AttemptHistoryPanel.jsx', { exportName: 'AttemptHistoryPanel', props: { attempts, acceptedResultCounts: { 1: 2 } } })
    assert.ok(html.indexOf('data-attempt-status="rejected"') < html.indexOf('data-attempt-status="failed"'))
    assert.match(html, /تعذّر استخراج محتوى الصفحة/)
    assert.match(html, /إعادة معالجة صفحة/)
    assert.match(html, /رُفضت نتيجتها/)
    assert.match(html, /لا يُحفظ محتوى النتائج المرفوضة/)
    assert.match(html, /(2|٢)/)
    assert.match(await render('/src/components/review/AttemptHistoryPanel.jsx', { exportName: 'AttemptHistoryPanel', props: { attempts: [] } }), /لا توجد محاولات معالجة مسجلة بعد/)
  })
})

describe('export dialog (decisions 8, 46)', () => {
  const item = { id: 'doc', name: 'تقرير.pdf' }

  test('offers the four formats and the complete original as a separate download, and states the scope', async () => {
    const service = { isMock: true, exportDocument: noop, getOriginal: noop }
    const html = await render('/src/components/documents/ExportDialog.jsx', { exportName: 'ExportDialog', props: { item, onClose: noop, service } })
    for (const format of ['docx', 'xlsx', 'pdf', 'json', 'original']) assert.match(html, new RegExp(`data-format="${format}"`))
    assert.match(html, /الصفحات المحددة والمعتمدة فقط، بترتيبها الأصلي/)
    assert.match(html, /رقم كل صفحة في المستند الأصلي/)
    assert.match(html, /المستند الأصلي الكامل \(بكل صفحاته\) متاح للتنزيل بشكل مستقل/)
    const english = await render('/src/components/documents/ExportDialog.jsx', { exportName: 'ExportDialog', language: 'en', props: { item, onClose: noop, service } })
    assert.match(english, /only the selected and approved pages, in their original order/)
    assert.match(english, />Word \(\.docx\)</)
  })
})

describe('templates page (the decisions define no template management)', () => {
  test('explains that unknown layouts are fine and that choosing a template is never required, and offers no management', async () => {
    const html = await render('/src/pages/DocumentTemplatesPage.jsx', { props: { service: { isMock: true, list: () => new Promise(() => {}) } } })
    assert.match(html, /لا يُرفض أي مستند لمجرد أنه لا يطابق قالبًا/)
    assert.match(html, /اختيار القالب غير مطلوب/)
    assert.match(html, /غير محددة في القرارات المعتمدة/)
    assert.match(html, /badge--demo/) // the simulated catalogue is labelled
    assert.doesNotMatch(html, /إنشاء قالب|حذف القالب|تدريب النموذج|<button/)
    const english = await render('/src/pages/DocumentTemplatesPage.jsx', { language: 'en', props: { service: { isMock: false, list: () => new Promise(() => {}) } } })
    assert.match(english, /no document is rejected only because it matches no template/)
    assert.doesNotMatch(english, /badge--demo/)
  })
})

describe('upload screen (decisions 36, 37, 41, 48)', () => {
  const never = () => new Promise(() => {})

  test('has no "demonstration review" shortcut any more: documents enter only through Start Processing', async () => {
    const html = await render('/src/pages/UploadDocumentPage.jsx', { props: { workflow: { getUploadAvailability: never, registerDocument: never }, settings: { getLimits: never } } })
    assert.doesNotMatch(html, /فتح للمراجعة التجريبية/)
    assert.match(html, /بدء المعالجة/)
    assert.match(html, /إلا عند الضغط على «بدء المعالجة»/) // the file stays in the browser until then
  })

  test('no upload limit is hard-coded: the size and page limits come from the settings service', () => {
    const files = []
    const walk = (directory) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(js|jsx)$/.test(name)) files.push(path)
      }
    }
    walk('src')
    const offenders = files.filter((path) => /MAX_UPLOAD_SIZE|VITE_MAX_UPLOAD|DEFAULT_MAX_UPLOAD/.test(readFileSync(path, 'utf8')))
    assert.deepEqual(offenders, [])
    const page = readFileSync('src/pages/UploadDocumentPage.jsx', 'utf8')
    assert.match(page, /useUploadLimits/)
    assert.match(page, /checkSelectedPageCount/)
    assert.match(page, /checkFileSize/)
  })

  test('the page selection panel names the Admin page limit and objects when it is exceeded', async () => {
    const pdf = { status: 'ready', pageCount: 50, errorCode: null, retry: noop }
    const base = { pdf, mode: 'all', onModeChange: noop, rangeInput: '', onRangeInputChange: noop, selection: null }
    const pages = (n) => Array.from({ length: n }, (_, index) => index + 1)
    const exceeded = await render('/src/components/upload/PageSelectionPanel.jsx', { exportName: 'PageSelectionPanel', props: { ...base, selectedPages: pages(50), maxSelectedPages: 20 } })
    assert.match(exceeded, /الحد الأقصى للصفحات المحددة للمعالجة في المستند الواحد: (20|٢٠)/)
    assert.match(exceeded, /role="alert"/)
    assert.match(exceeded, /حددت (50|٥٠) صفحة/)
    const fine = await render('/src/components/upload/PageSelectionPanel.jsx', { exportName: 'PageSelectionPanel', props: { ...base, selectedPages: pages(10), maxSelectedPages: 20 } })
    assert.doesNotMatch(fine, /حددت/)
    const unknown = await render('/src/components/upload/PageSelectionPanel.jsx', { exportName: 'PageSelectionPanel', props: { ...base, selectedPages: pages(50) } })
    assert.doesNotMatch(unknown, /الحد الأقصى للصفحات/)
  })

  test('the drop zone names the Admin size limit when it is known, and does not invent one when it is not', async () => {
    const withLimit = await render('/src/components/upload/DocumentDropZone.jsx', { exportName: 'DocumentDropZone', props: { inputRef: { current: null }, browseButtonRef: { current: null }, maxFileSizeBytes: 25 * 1024 * 1024, onFilesSelected: noop } })
    assert.match(withLimit, /الحد الأقصى للحجم: /)
    assert.match(withLimit, /(25|٢٥)/)
    const without = await render('/src/components/upload/DocumentDropZone.jsx', { exportName: 'DocumentDropZone', props: { inputRef: { current: null }, browseButtonRef: { current: null }, onFilesSelected: noop } })
    assert.doesNotMatch(without, /الحد الأقصى للحجم/)
  })

  test('the workflow error texts (storage full, not enough space, limits, lock) exist in both languages', async () => {
    const { workflowErrorMessage } = await load('/src/components/common/workflowErrorMessage.js')
    const { translate } = await load('/src/i18n/translations.js')
    for (const language of ['ar', 'en']) {
      const t = (key, params) => translate(language, key, params)
      for (const code of ['storageFull', 'insufficientStorage', 'fileTooLarge', 'tooManyPages', 'invalidState', 'notEligible', 'lockHeld', 'lockLost', 'forbidden', 'notFound', 'notConnected']) {
        const text = workflowErrorMessage(t, code, { max: '10' })
        assert.ok(text && !text.startsWith('workflow.errors') && !text.startsWith('systemErrors'), `${language} ${code}`)
      }
    }
    const t = (key, params) => translate('en', key, params)
    assert.match(workflowErrorMessage(t, 'storageFull'), /Storage is full/)
    assert.match(workflowErrorMessage(t, 'insufficientStorage'), /not enough storage space/)
  })
})
