// Render tests for the review UI. The real .jsx components are loaded through
// Vite's SSR loader (no extra dependency) and rendered to HTML, so these tests
// check what the user would see: Arabic labels, states, disabled/read-only
// controls and accessibility attributes. Interactions (typing, dragging,
// resizing, navigation blocking) cannot run without a browser; they were
// exercised separately in a real browser (see the report).

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { createElement as createCanonicalElement } from '../src/domain/document/elements.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { createMockProcessingService } from '../src/services/mockProcessingService.js'
import { field, makeEditor, NOW, paragraph, table, unclassified } from './helpers.js'

const root = process.cwd()
const require = createRequire(`${root}/package.json`)
const React = require('react')
const { renderToString } = require('react-dom/server')
const h = React.createElement

let server
let LanguageProvider
const loaded = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
})

after(async () => {
  await server?.close()
})

async function render(file, exportName, props) {
  if (!loaded.has(file)) loaded.set(file, await server.ssrLoadModule(file))
  return renderToString(h(LanguageProvider, null, h(loaded.get(file)[exportName], props)))
}

const noop = () => {}
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

function pageWith(editor, pageNumber = 1) {
  return editor.page(pageNumber)
}

describe('save status', () => {
  const show = (status, isTemporary = true) => render('/src/components/review/SaveStatusIndicator.jsx', 'SaveStatusIndicator', { status, isTemporary, onRetry: noop })

  test('uses the four exact Arabic states', async () => {
    assert.match(await show('saved'), /تم حفظ جميع التعديلات/)
    assert.match(await show('unsaved'), /تغييرات بانتظار الحفظ/)
    assert.match(await show('saving'), /جارٍ الحفظ/)
    assert.match(await show('failed'), /فشل الحفظ/)
  })

  test('is a live status region; a "Save draft" button exists only when a handler is given (decision 13)', async () => {
    const html = await show('unsaved')
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.doesNotMatch(html, /<button/)
    const withDraft = await render('/src/components/review/SaveStatusIndicator.jsx', 'SaveStatusIndicator', { status: 'unsaved', isTemporary: false, onRetry: noop, onSaveDraft: noop })
    assert.match(withDraft, /<button[^>]*class="button button--secondary button--sm save-status__draft"/)
    assert.match(withDraft, /حفظ المسودة/)
    assert.match(withDraft, /الحفظ لا يعني الاعتماد/) // saving is not approval
  })

  test('shows when the last save happened, only while everything is saved', async () => {
    const saved = await render('/src/components/review/SaveStatusIndicator.jsx', 'SaveStatusIndicator', { status: 'saved', isTemporary: false, lastSavedAt: '2026-06-01T10:00:00.000Z', onRetry: noop })
    assert.match(saved, /آخر حفظ/)
    const failed = await render('/src/components/review/SaveStatusIndicator.jsx', 'SaveStatusIndicator', { status: 'failed', isTemporary: false, lastSavedAt: '2026-06-01T10:00:00.000Z', onRetry: noop })
    assert.doesNotMatch(failed, /آخر حفظ/)
  })

  test('says plainly that the storage is temporary and not a server', async () => {
    const html = await show('saved', true)
    assert.match(html, /مؤقت في ذاكرة المتصفح/)
    assert.match(html, /لا يُرسل إلى خادم/)
    assert.doesNotMatch(await show('saved', false), /مؤقت في ذاكرة المتصفح/)
  })

  test('only a failure offers "try again" (not a save button)', async () => {
    assert.match(await show('failed'), /إعادة المحاولة/)
    assert.doesNotMatch(await show('saved'), /<button/)
    assert.doesNotMatch(await show('saving'), /<button/)
  })

  test('the saved status does not claim anything for a failed or unsaved state', async () => {
    assert.doesNotMatch(await show('failed'), /تم حفظ جميع التعديلات/)
    assert.doesNotMatch(await show('unsaved'), /تم حفظ جميع التعديلات/)
  })
})

describe('page review bar', () => {
  const bar = (page, isApproved = false) => render('/src/components/review/PageReviewBar.jsx', 'PageReviewBar', { page, isApproved, onConfirm: noop })
  const confirmButton = (html) => /<button[^>]*class="button button--primary"[^>]*>/.exec(html)?.[0]

  test('shows the exact Arabic action and keeps it disabled without valid content, saying why', async () => {
    const editor = makeEditor()
    const html = await bar(pageWith(editor))
    assert.match(html, /تمت مراجعة الصفحة/)
    assert.match(confirmButton(html), /disabled/)
    assert.match(html, /قبل وجود محتوى صالح/)
    assert.match(html, /aria-describedby="review-bar-reason"/)
  })

  test('is enabled once the page has valid content, with no warning', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'نص') })
    const html = await bar(pageWith(editor))
    assert.doesNotMatch(confirmButton(html), /disabled/)
    assert.doesNotMatch(html, /review-bar__reason/)
  })

  test('explains each blocker in Arabic', async () => {
    const processing = makeEditor()
    processing.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(processing.generateId, 'نص') })
    processing.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'processing' })
    assert.match(await bar(pageWith(processing)), /أثناء معالجة الصفحة/)

    const failed = makeEditor()
    failed.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: 'X' })
    assert.match(await bar(pageWith(failed)), /فشل استخراج هذه الصفحة[\s\S]*محتوى صالح يدويًا/)
  })

  test('a failed page with valid manual content can be confirmed', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: 'X' })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'يدوي') })
    assert.doesNotMatch(confirmButton(await bar(pageWith(editor))), /disabled/)
  })

  test('a reviewed page shows the confirmation and no confirm button; an invalidated one says to confirm again', async () => {
    const editor = makeEditor()
    const p = paragraph(editor.generateId, 'نص')
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: p })
    editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber: 1, at: NOW })
    const reviewed = await bar(pageWith(editor))
    assert.match(reviewed, /تمت مراجعة هذه الصفحة/)
    assert.doesNotMatch(reviewed, /button--primary/)

    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: p.id, patch: { text: 'تغيير' } })
    const invalidated = await bar(pageWith(editor))
    assert.match(invalidated, /تغيّر محتوى الصفحة بعد تأكيد مراجعتها/)
    assert.doesNotMatch(confirmButton(invalidated), /disabled/)
  })

  test('on an approved document the action is disabled', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'نص') })
    const html = await bar(pageWith(editor), true)
    assert.match(confirmButton(html), /disabled/)
    assert.match(html, /المستند معتمد/)
  })

  test('shows AI status and human review status as separate things', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: 'X' })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'يدوي') })
    const html = await bar(pageWith(editor))
    assert.match(html, /المعالجة الآلية[\s\S]*فشل الاستخراج/)
    assert.match(html, /المراجعة البشرية[\s\S]*لم تتم المراجعة/)
    assert.match(html, /تحرير يدوي/)
  })
})

describe('processing panel (AI failure, retry and comparison)', () => {
  const panel = (page, extra = {}) =>
    render('/src/components/review/ProcessingPanel.jsx', 'ProcessingPanel', {
      page, isMock: true, isApproved: false, notice: null, candidate: null,
      onProcess: noop, onDismissNotice: noop, onAccept: noop, onKeep: noop, ...extra,
    })

  test('a failed page shows the error, keeps retry and explains manual entry', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: 'MOCK_OCR_FAILED' })
    const html = await panel(pageWith(editor))
    assert.match(html, /role="alert"/)
    assert.match(html, /فشل استخراج هذه الصفحة/)
    assert.match(html, /MOCK_OCR_FAILED/)
    assert.match(html, /إعادة معالجة الصفحة \(تجريبي\)/)
    assert.match(html, /إدخال محتوى الصفحة يدويًا/)
  })

  test('manual editing after a failure stays labelled as a failed extraction', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: 'X' })
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'يدوي') })
    const html = await panel(pageWith(editor))
    assert.match(html, /تحرير يدوي/)
    assert.match(html, /ولن تُعتبر نتيجة ذكاء اصطناعي ناجحة/)
  })

  test('pending, processing and ready pages show the matching state', async () => {
    const pending = makeEditor()
    assert.match(await panel(pageWith(pending)), /لم تُعالَج هذه الصفحة بعد[\s\S]*بدء المعالجة \(تجريبي\)/)

    const running = makeEditor()
    running.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'processing' })
    const runningHtml = await panel(pageWith(running))
    assert.match(runningHtml, /جارٍ معالجة الصفحة \(تجريبي\)/)
    assert.doesNotMatch(runningHtml, /<button/)

    const ready = makeEditor()
    ready.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(ready.generateId, 'نتيجة')] })
    assert.match(await panel(pageWith(ready)), /إعادة المعالجة \(تجريبي\)/)
  })

  test('says clearly that processing is a mock, and offers nothing on approved documents', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'نتيجة')] })
    assert.match(await panel(pageWith(editor)), /لا يوجد ذكاء اصطناعي حقيقي/)
    assert.doesNotMatch(await panel(pageWith(editor), { isMock: false }), /لا يوجد ذكاء اصطناعي حقيقي/)
    assert.doesNotMatch(await panel(pageWith(editor), { isApproved: true }), /<button/)
  })

  test('a candidate is shown next to the current content and nothing is replaced until accepted', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'المحتوى الحالي')] })
    const service = createMockProcessingService({ delayMs: 0 })
    const { elements } = await service.extractPage({ pageNumber: 1, attempt: 2 })
    const html = decode(await panel(pageWith(editor), { candidate: { attempt: 2, elements, receivedAt: NOW } }))
    assert.match(html, /مقارنة نتيجة إعادة المعالجة/)
    assert.match(html, /المحتوى الحالي/)
    assert.match(html, /نتيجة إعادة المعالجة \(المحاولة 2\)|نتيجة إعادة المعالجة \(المحاولة ٢\)/)
    assert.match(html, /لم يُستبدل شيء بعد/)
    assert.match(html, /اعتماد النتيجة الجديدة/)
    assert.match(html, /الإبقاء على المحتوى الحالي/)
  })

  test('a failed re-extraction says the current content did not change', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'نتيجة')] })
    const html = await panel(pageWith(editor), { notice: { code: 'reprocessFailed' } })
    assert.match(html, /فشلت إعادة المعالجة/)
    assert.match(html, /لم يتغير المحتوى الحالي للصفحة/)
  })
})

describe('structured editor', () => {
  const editorHtml = (elements, extra = {}) =>
    render('/src/components/review/editor/StructuredEditor.jsx', 'StructuredEditor', {
      pageNumber: 1, elements, query: '', disabled: false, dispatch: () => ({ ok: true }), setPending: noop, ...extra,
    })

  test('lists every element in order with its type', async () => {
    const editor = makeEditor()
    const g = editor.generateId
    const elements = [paragraph(g, 'فقرة'), createCanonicalElement('heading', { content: { text: 'عنوان', level: 2 } }, { generateId: g }), field(g, 'الاسم', 'سارة'), table(g), unclassified(g, 'ختم')]
    const html = await editorHtml(elements)
    const order = [...html.matchAll(/element-card element-card--(\w+)/g)].map((match) => match[1])
    assert.deepEqual(order, ['paragraph', 'heading', 'field', 'table', 'unclassified'])
    assert.match(html, /<ol[^>]*aria-label="عناصر الصفحة بترتيبها في المستند"/)
  })

  test('long Arabic text is kept whole in a growing multi-line input with automatic direction', async () => {
    const editor = makeEditor()
    const long = 'نص عربي طويل يشبه خط اليد. '.repeat(120)
    const html = decode(await editorHtml([paragraph(editor.generateId, long)]))
    assert.ok(html.includes(long.trim().slice(0, 40)))
    assert.match(html, /<textarea[^>]*dir="auto"/)
  })

  test('shows NO AI / AI Edited / Manual source labels (decision 49); the source stays in the data', async () => {
    const editor = makeEditor()
    const g = editor.generateId
    const mock = createCanonicalElement('paragraph', { content: { text: 'ا' }, source: { kind: 'ai', details: { mock: true } } }, { generateId: g })
    const ai = createCanonicalElement('paragraph', { content: { text: 'ب' }, source: { kind: 'ai', details: {} } }, { generateId: g })
    const manual = paragraph(g, 'ج')
    const html = await editorHtml([manual, mock, ai])
    assert.doesNotMatch(html, /أُضيف يدويًا|مستخرج \(تجريبي\)|مستخرج بالذكاء الاصطناعي/)
    assert.doesNotMatch(html, /Added manually|Extracted by AI|Extracted \(demo\)/)
    assert.equal(manual.source.kind, 'manual')
    assert.equal(mock.source.details.mock, true)
    assert.equal(ai.source.kind, 'ai')
  })

  test('offers editing tools: type, move up/down, delete, drag handle and insert points', async () => {
    const editor = makeEditor()
    const g = editor.generateId
    const html = await editorHtml([paragraph(g, 'أ'), paragraph(g, 'ب')])
    assert.equal((html.match(/class="insert-point"/g) ?? []).length, 3)
    assert.match(html, /تحريك فقرة \(العنصر 1 من 2\) إلى الأعلى/)
    assert.match(html, /حذف فقرة/)
    assert.match(html, /draggable="true"/)
    assert.match(html, /<select/)
    // the first element cannot move up, the last cannot move down
    assert.match(html, /disabled=""[^>]*aria-label="تحريك فقرة \(العنصر 1 من 2\) إلى الأعلى"|aria-label="تحريك فقرة \(العنصر 1 من 2\) إلى الأعلى"[^>]*disabled=""/)
  })

  test('renders tables as editable cells with row and column tools and a caption', async () => {
    const editor = makeEditor()
    const html = await editorHtml([table(editor.generateId, [['أ', 'ب'], ['ج', 'د']])])
    assert.equal((html.match(/<td>/g) ?? []).length, 4)
    assert.match(html, /<caption class="visually-hidden">جدول من/)
    assert.match(html, /إضافة صف بعد الصف/)
    assert.match(html, /إضافة عمود بعد العمود/)
    assert.match(html, /حذف الصف/)
    assert.match(html, /aria-label="الصف 1، العمود 2"/)
  })

  test('shows preserved raw data of unclassified content read-only', async () => {
    const editor = makeEditor()
    const html = await editorHtml([unclassified(editor.generateId, 'ختم', { label: 'stamp' })])
    assert.match(html, /بيانات خام محفوظة/)
    assert.match(html, /<pre[^>]*dir="ltr"/)
    assert.match(html, /stamp/)
  })

  test('is fully read-only when the page cannot be edited: no tools, no insert points, read-only inputs', async () => {
    const editor = makeEditor()
    const g = editor.generateId
    const html = await editorHtml([paragraph(g, 'نص'), table(g)], { disabled: true })
    assert.doesNotMatch(html, /element-card__tools/)
    assert.doesNotMatch(html, /insert-point/)
    assert.doesNotMatch(html, /draggable/)
    assert.match(html, /هذه الصفحة للقراءة فقط الآن/)
    assert.match(html, /readOnly=""|readonly=""/)
    assert.match(html, /<select[^>]*disabled=""/)
  })

  test('an empty page offers a prominent way to add the first element', async () => {
    const html = await editorHtml([])
    assert.match(html, /insert-point is-prominent/)
    assert.match(html, /إضافة أول عنصر/)
  })

  test('search highlights matches in the current page only and reports the count', async () => {
    const editor = makeEditor()
    const g = editor.generateId
    const html = await editorHtml([paragraph(g, 'هذا تقرير سنوي'), paragraph(g, 'نص آخر'), field(g, 'نوع التقرير', 'سنوي')], { query: 'تقرير' })
    assert.equal((html.match(/element-card[^"]*is-match/g) ?? []).length, 2)
    assert.equal((html.match(/<mark>/g) ?? []).length, 2)
    assert.match(html, /عدد التطابقات في هذه الصفحة: (2|٢)/)
    assert.doesNotMatch(await editorHtml([paragraph(g, 'نص')], { query: 'غير موجود' }), /is-match/)
    assert.match(await editorHtml([paragraph(g, 'نص')], { query: 'غير موجود' }), /لا توجد تطابقات في هذه الصفحة/)
  })

  test('has no next/previous-match navigation', async () => {
    const editor = makeEditor()
    const html = await editorHtml([paragraph(editor.generateId, 'تقرير')], { query: 'تقرير' })
    assert.doesNotMatch(html, /التطابق التالي|التطابق السابق/)
  })
})

describe('page navigation', () => {
  const nav = (currentPage, selectedPages = [2, 5, 9]) => {
    const editor = makeEditor({ selectedPages, totalPages: 12 })
    return render('/src/components/review/PageNavigator.jsx', 'PageNavigator', { pages: editor.state.document.pages, selectedPages, currentPage, onGoTo: noop })
  }
  const buttons = (html) => [...html.matchAll(/<button[^>]*class="button button--secondary"[^>]*>/g)].map((m) => m[0])

  test('previous is disabled on the first selected page, next on the last', async () => {
    const [previous, next] = buttons(await nav(2))
    assert.match(previous, /disabled/)
    assert.doesNotMatch(next, /disabled/)
    const [previousLast, nextLast] = buttons(await nav(9))
    assert.doesNotMatch(previousLast, /disabled/)
    assert.match(nextLast, /disabled/)
  })

  test('shows the current page, its position among the selected pages, and a jump field', async () => {
    const html = await nav(5)
    assert.match(html, /الصفحة (5|٥)/)
    assert.match(html, /الصفحة المختارة (2|٢) من (3|٣)/)
    assert.match(html, /<label for="review-jump">الانتقال إلى الصفحة/)
    assert.match(html, /inputMode="numeric"|inputmode="numeric"/)
  })

  test('the header states that unselected pages are not part of the review (once, not repeated)', async () => {
    const editor = makeEditor({ selectedPages: [2, 5], totalPages: 8 })
    const header = await render('/src/components/review/ReviewHeader.jsx', 'ReviewHeader', {
      name: 'م', document: editor.state.document, currentPage: 2, usesMockProcessing: false, isApproved: false, saveStatus: 'saved', isTemporaryStorage: true, onRetrySave: noop,
    })
    assert.match(header, /لا تُحتسب بقية صفحات الملف كصفحات فاشلة أو غير مراجَعة/)
    assert.doesNotMatch(await nav(2), /لا تُحتسب بقية صفحات الملف/)
  })

  test('is a labelled navigation landmark', async () => {
    assert.match(await nav(2), /<nav[^>]*aria-label="التنقل بين الصفحات المختارة"/)
  })
})

describe('header and progress', () => {
  test('shows the name, original page, position, total and an accessible progress bar', async () => {
    const editor = makeEditor({ selectedPages: [1, 2, 3, 4], totalPages: 9 })
    for (const pageNumber of [1, 2]) {
      editor.dispatch({ type: ACTION.elementAdded, pageNumber, element: paragraph(editor.generateId, 'نص') })
      editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber, at: NOW })
    }
    const html = decode(await render('/src/components/review/ReviewHeader.jsx', 'ReviewHeader', {
      name: 'تقرير.pdf', document: editor.state.document, currentPage: 2, usesMockProcessing: true, state: 'readyForReview', saveStatus: 'saved', isTemporaryStorage: true, onRetrySave: noop,
    }))
    assert.match(html, /جاهز للمراجعة/) // the document state (decision 12)
    assert.match(html, /تقرير\.pdf/)
    assert.match(html, /role="progressbar"/)
    assert.match(html, /aria-valuenow="2"/)
    assert.match(html, /aria-valuemax="4"/)
    assert.match(html, /تمت مراجعة (2|٢) من (4|٤) صفحة/)
    assert.match(html, /إجمالي صفحات الملف: (9|٩)/)
    assert.match(html, /بيانات تجريبية/)
    assert.match(html, /تم حفظ جميع التعديلات/)
  })

  test('marks an approved document with its state badge, and says whether the layout is known or new', async () => {
    const editor = makeEditor()
    const base = { name: 'م', document: editor.state.document, currentPage: 1, usesMockProcessing: false, state: 'approved', saveStatus: 'saved', isTemporaryStorage: true, onRetrySave: noop }
    const html = await render('/src/components/review/ReviewHeader.jsx', 'ReviewHeader', base)
    assert.match(html, /badge--success">معتمد</)
    assert.doesNotMatch(html, /بيانات تجريبية/)
    assert.match(html, /data-layout="new"/) // an unknown layout is fine: it is simply "new"
    const known = await render('/src/components/review/ReviewHeader.jsx', 'ReviewHeader', { ...base, template: { id: 't', name: 'فاتورة' }, isNewVersion: true })
    assert.match(known, /data-layout="known"/)
    assert.match(known, /إصدار جديد قيد التحرير/)
  })
})

describe('approval panel', () => {
  const panel = (eligibility, extra = {}) =>
    render('/src/components/review/ApprovalPanel.jsx', 'ApprovalPanel', {
      eligibility: { eligible: false, blockers: [], reviewedCount: 1, totalPages: 3, ...eligibility },
      isApproved: false, canCreateNewVersion: false, role: 'employee', onApprove: noop, onNewVersion: noop, ...extra,
    })
  const approveButton = (html) => /<button[^>]*class="button button--primary"[^>]*>/.exec(html)?.[0]

  test('lists the four conditions and disables approval while any is unmet', async () => {
    const html = await panel({ blockers: ['pagesNotReviewed', 'unsavedChanges'] })
    assert.match(html, /تمت مراجعة جميع الصفحات المختارة/)
    assert.match(html, /تم حفظ جميع التعديلات/)
    assert.match(html, /لا توجد معالجة جارية/)
    assert.match(html, /يملك المستخدم صلاحية الاعتماد/)
    assert.equal((html.match(/class="is-unmet"/g) ?? []).length, 2)
    assert.match(approveButton(html), /disabled/)
    assert.match(html, /اعتماد المستند بالكامل/)
  })

  test('an eligible document can be approved; the panel says approval is simulated here and that saving is not approval', async () => {
    const html = await panel({ eligible: true })
    assert.doesNotMatch(approveButton(html), /disabled/)
    assert.match(html, /محاكاة/)
    assert.match(html, /الحفظ ليس اعتمادًا/)
  })

  test('approving the whole document is explicit: the button only opens a confirmation, and the lock is a condition', async () => {
    const html = await panel({ eligible: true, blockers: ['editLock'] })
    assert.match(html, /data-condition="lock"/)
    assert.match(html, /قفل التحرير/)
    // the button does not approve by itself: it opens one of the two (closed) confirmation dialogs
    assert.equal((html.match(/<dialog/g) ?? []).length, 2)
    assert.doesNotMatch(html, /اعتماد المستند بالكامل؟/) // nothing about the confirmation is shown until the user asks to approve
  })

  test('an approved document is read-only: employees get the admin-only note and no new-version button', async () => {
    const html = await panel({ blockers: ['alreadyApproved'] }, { isApproved: true })
    assert.match(html, /المستند معتمد/)
    assert.match(html, /من صلاحيات مدير المؤسسة فقط/)
    assert.doesNotMatch(html, /إنشاء إصدار جديد قابل للتعديل<\/button>/)
    assert.doesNotMatch(html, /button--primary/)
  })

  test('only the admin sees the new-version action', async () => {
    const html = await panel({ blockers: ['alreadyApproved'] }, { isApproved: true, canCreateNewVersion: true, role: 'orgAdmin' })
    assert.match(html, /إنشاء إصدار جديد قابل للتعديل/)
  })
})

describe('toolbar, viewer and JSON preview', () => {
  test('undo/redo are disabled when there is nothing to undo or redo, and show how many steps exist', async () => {
    const empty = await render('/src/components/review/EditorToolbar.jsx', 'EditorToolbar', { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, disabled: false, onUndo: noop, onRedo: noop, query: '', onQueryChange: noop })
    assert.equal((empty.match(/<button[^>]*disabled/g) ?? []).length, 2)
    const some = await render('/src/components/review/EditorToolbar.jsx', 'EditorToolbar', { canUndo: true, canRedo: false, undoDepth: 3, redoDepth: 0, disabled: false, onUndo: noop, onRedo: noop, query: '', onQueryChange: noop })
    assert.equal((some.match(/<button[^>]*disabled/g) ?? []).length, 1)
    assert.match(some, /editor-toolbar__count">(3|٣)</)
  })

  test('search is labelled for the current page and has no next/previous buttons', async () => {
    const html = await render('/src/components/review/EditorToolbar.jsx', 'EditorToolbar', { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, disabled: false, onUndo: noop, onRedo: noop, query: '', onQueryChange: noop })
    assert.match(html, /بحث في محتوى الصفحة الحالية/)
    assert.equal((html.match(/<button/g) ?? []).length, 2)
  })

  test('the original viewer explains when the original file is unavailable and has all view controls', async () => {
    const html = await render('/src/components/review/OriginalViewer.jsx', 'OriginalViewer', { file: null, pageNumber: 1 })
    assert.match(html, /الملف الأصلي غير متاح/)
    for (const label of ['تصغير', 'تكبير', 'تدوير العرض ٩٠ درجة', 'إعادة ضبط العرض']) assert.ok(html.includes(label), label)
    assert.match(html, /التدوير للعرض فقط ولا يغيّر الملف الأصلي/)
  })

  test('the JSON preview is closed by default and clearly read-only', async () => {
    const editor = makeEditor()
    const html = await render('/src/components/review/JsonPreview.jsx', 'JsonPreview', { document: editor.state.document, pageNumber: 1 })
    assert.match(html, /عرض JSON للصفحة الحالية/)
    assert.match(html, /للقراءة فقط/)
    assert.match(html, /aria-expanded="false"/)
    assert.doesNotMatch(html, /<pre/)
    assert.doesNotMatch(html, /<textarea/)
  })

  test('the split divider is an accessible keyboard-operable separator', async () => {
    const html = await render('/src/components/review/SplitPane.jsx', 'SplitPane', { start: h('p', null, 'أ'), end: h('p', null, 'ب') })
    assert.match(html, /role="separator"/)
    assert.match(html, /aria-orientation="vertical"/)
    assert.match(html, /tabindex="0"/i)
    assert.match(html, /aria-valuenow="50"/)
  })
})

describe('review fixes: invalid results, refused accept, pending approval', () => {
  const acceptDialog = (props) =>
    render('/src/components/review/AcceptCandidateDialog.jsx', 'AcceptCandidateDialog', { open: true, errorCode: null, onConfirm: noop, onCancel: noop, ...props })
  const panel = (page, extra = {}) =>
    render('/src/components/review/ProcessingPanel.jsx', 'ProcessingPanel', {
      page, isMock: true, isApproved: false, notice: null, candidate: null,
      onProcess: noop, onDismissNotice: noop, onAccept: noop, onKeep: noop, ...extra,
    })

  test('the accept dialog warns about what is replaced and offers confirm and cancel, with no error at first', async () => {
    const html = await acceptDialog()
    assert.match(html, /استبدال المحتوى الحالي/)
    assert.match(html, /يُمسح سجل التراجع/)
    assert.match(html, /button--danger/)
    assert.doesNotMatch(html, /role="alert"/)
  })

  test('when accepting is refused the dialog stays, keeps its confirm button and explains why', async () => {
    const html = decode(await acceptDialog({ errorCode: 'INVALID_DOCUMENT' }))
    assert.match(html, /role="alert"/)
    assert.match(html, /تعذر اعتماد النتيجة الجديدة/)
    assert.match(html, /غير صالحة أو تتعارض مع بيانات أخرى/)
    assert.match(html, /لم يتغير محتوى الصفحة ولم يُمسح سجل التراجع/)
    assert.match(html, /button--danger/)
    assert.doesNotMatch(html, /raw|review\.errors/)
  })

  test('an unexpected error code still shows an Arabic message, never a raw key', async () => {
    const html = await acceptDialog({ errorCode: 'SOMETHING_NEW' })
    assert.match(html, /لم يتم تنفيذ العملية/)
    assert.doesNotMatch(html, /review\.errors\.generic/)
  })

  test('a closed dialog renders no content', async () => {
    assert.doesNotMatch(await acceptDialog({ open: false, errorCode: 'INVALID_DOCUMENT' }), /تعذر اعتماد النتيجة الجديدة/)
  })

  test('an invalid extraction result is explained on a failed page and in the re-extraction notice', async () => {
    const failed = makeEditor()
    failed.dispatch({ type: ACTION.pageProcessingStatusSet, pageNumber: 1, status: 'failed', errorCode: 'INVALID_EXTRACTION_RESULT' })
    const failedHtml = await panel(pageWith(failed))
    assert.match(failedHtml, /نتيجة الاستخراج غير صالحة \(بنية خاطئة أو معرّفات مكررة\)/)
    assert.match(failedHtml, /إعادة معالجة الصفحة \(تجريبي\)/)

    const ready = makeEditor()
    ready.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(ready.generateId, 'نتيجة')] })
    const invalidNotice = await panel(pageWith(ready), { notice: { code: 'reprocessFailed', errorCode: 'INVALID_EXTRACTION_RESULT' } })
    assert.match(invalidNotice, /نتيجة إعادة المعالجة غير صالحة/)
    assert.match(invalidNotice, /لم يتغير المحتوى الحالي للصفحة/)
    const plainNotice = await panel(pageWith(ready), { notice: { code: 'reprocessFailed', errorCode: 'MOCK_OCR_FAILED' } })
    assert.doesNotMatch(plainNotice, /غير صالحة/)
  })

  test('the comparison view renders even if a candidate is malformed', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements: [paragraph(editor.generateId, 'الحالي')] })
    const malformed = [null, undefined, 'x', { id: 'a', type: 'table', content: { rows: [] } }, { id: 'b', type: 'field', content: null }, { type: 'chart' }]
    const html = await panel(pageWith(editor), { candidate: { attempt: 2, elements: malformed, receivedAt: NOW } })
    assert.match(html, /مقارنة نتيجة إعادة المعالجة/)
    assert.match(html, /اعتماد النتيجة الجديدة/)
    const notAList = await panel(pageWith(editor), { candidate: { attempt: 2, elements: 'not a list', receivedAt: NOW } })
    assert.match(notAList, /مقارنة نتيجة إعادة المعالجة/)
  })

  test('while an approval request is pending the review button is locked with its own reason', async () => {
    const editor = makeEditor()
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(editor.generateId, 'نص') })
    const html = await render('/src/components/review/PageReviewBar.jsx', 'PageReviewBar', { page: pageWith(editor), isApproved: false, isApprovalPending: true, onConfirm: noop })
    assert.match(/<button[^>]*class="button button--primary"[^>]*>/.exec(html)[0], /disabled/)
    assert.match(html, /طلب الاعتماد قيد التنفيذ/)
    assert.doesNotMatch(html, /المستند معتمد/)
  })
})

describe('Arabic dictionary', () => {
  test('every translation key used by the review UI exists in Arabic', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { translations } = await import('../src/i18n/translations.js')
    const files = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = `${dir}/${name}`
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(jsx|js)$/.test(name)) files.push(path)
      }
    }
    for (const dir of ['src/components/review', 'src/hooks']) walk(dir)
    files.push('src/pages/DocumentReviewPage.jsx', 'src/pages/CorrectionQueuePage.jsx')

    const lookup = (key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), translations.ar)
    const missing = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) if (typeof lookup(match[1]) !== 'string') missing.push(`${file}: ${match[1]}`)
      // dynamic keys: the prefix must be a dictionary section with entries
      for (const match of source.matchAll(/\bt\(\s*`([^`$]+)\$\{/g)) {
        const section = lookup(match[1].replace(/\.$/, ''))
        if (!section || typeof section !== 'object') missing.push(`${file}: ${match[1]}…`)
      }
    }
    assert.deepEqual(missing, [])
  })

  test('the dynamic keys the UI builds all resolve', async () => {
    const { translations } = await import('../src/i18n/translations.js')
    const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], translations.ar)
    const expected = {
      'review.pageStatus': ['pending', 'processing', 'readyForReview', 'failed', 'manualEditing', 'reviewed'],
      'review.ai': ['notProcessed', 'processing', 'succeeded', 'failed'],
      'review.reviewState': ['notReviewed', 'reviewed', 'invalidated'],
      'review.save': ['saved', 'unsaved', 'saving', 'failed'],
      'review.element.types': ['heading', 'paragraph', 'table', 'field', 'unclassified'],
      'review.reviewBar.blocked': ['processing', 'noContent', 'failedWithoutContent'],
      'review.nav.jumpErrors': ['empty', 'invalid', 'notSelected'],
      'review.convert.lost': ['tableStructure', 'fieldRelationship', 'unclassifiedRaw'],
      'review.viewer.errors': ['encrypted', 'invalid', 'failed'],
      'review.leave.reasons': ['unsavedChanges', 'processingActive', 'pendingComparison', 'temporaryStorage'],
      'review.approval.conditions': ['pages', 'saved', 'processing', 'permission'],
      'review.approval.notice': ['approved', 'versionCreated', 'notConnected', 'refused'],
    }
    for (const [prefix, keys] of Object.entries(expected)) {
      for (const key of keys) assert.equal(typeof lookup(`${prefix}.${key}`) === 'string' || typeof lookup(`${prefix}.${key}`) === 'object', true, `${prefix}.${key}`)
    }
    const { getErrorMessageKey } = await import('../src/components/review/errorMessages.js')
    for (const code of ['DOCUMENT_APPROVED', 'PAGE_PROCESSING', 'REVIEW_NOT_ALLOWED', 'DUPLICATE_ID', 'LAST_TABLE_ROW', 'APPROVAL_PENDING', 'INVALID_DOCUMENT', 'UNKNOWN_CODE']) {
      assert.equal(typeof lookup(getErrorMessageKey(code)), 'string', code)
    }
  })
})
