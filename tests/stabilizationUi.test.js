// Render tests for the UI parts of the stabilization work (L3, L6, P4, P8). Same
// approach as ui.test.js: the real .jsx components are loaded through Vite's SSR
// loader and rendered to HTML. What needs a browser (focus moving, the real
// clipboard, typing) is covered by scripts/browser-checks/*.check.mjs.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { translate } from '../src/i18n/translations.js'
import { getErrorMessageKey } from '../src/components/review/errorMessages.js'
import { makeEditor, paragraph } from './helpers.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'

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

const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const noop = () => {}

describe('L3: insert points are named by position and expose their state', () => {
  const insert = (props) => render('/src/components/review/editor/InsertPoint.jsx', 'InsertPoint', { onAdd: noop, ...props })

  test('every trigger says where the element would go (the page has many identical buttons)', async () => {
    const first = decode(await insert({ index: 0, count: 3 }))
    const middle = decode(await insert({ index: 2, count: 3 }))
    const end = decode(await insert({ index: 3, count: 3 }))
    assert.match(first, /aria-label="إضافة عنصر هنا، قبل العنصر 1 من 3"/)
    assert.match(middle, /aria-label="إضافة عنصر هنا، قبل العنصر 3 من 3"/)
    assert.match(end, /aria-label="إضافة عنصر هنا، في نهاية الصفحة بعد العنصر 3"/)
    assert.notEqual(first.match(/aria-label="[^"]*"/)[0], middle.match(/aria-label="[^"]*"/)[0])
  })

  test('the visible text is part of the accessible name', async () => {
    const html = decode(await insert({ index: 1, count: 2 }))
    assert.match(html, /aria-label="إضافة عنصر هنا[^"]*"[^>]*>.*إضافة عنصر هنا/s)
  })

  test('an empty page offers "add the first element"', async () => {
    const html = decode(await insert({ index: 0, count: 0, isProminent: true }))
    assert.match(html, /aria-label="إضافة أول عنصر"/)
    assert.match(html, /insert-point is-prominent/)
  })

  test('the trigger is a real button with aria-expanded="false" while closed, and no menu is rendered', async () => {
    const html = await insert({ index: 0, count: 1 })
    assert.match(html, /<button[^>]*type="button"[^>]*aria-expanded="false"/)
    assert.doesNotMatch(html, /aria-controls/)
    assert.doesNotMatch(html, /insert-point__menu/)
  })
})

describe('L6: JSON preview stays read-only and shows no copy feedback until something happened', () => {
  test('closed by default, no error and no "copied" message, never an editable control', async () => {
    const editor = makeEditor()
    const html = await render('/src/components/review/JsonPreview.jsx', 'JsonPreview', { document: editor.state.document, pageNumber: 1 })
    assert.match(html, /aria-expanded="false"/)
    assert.doesNotMatch(html, /role="alert"/)
    assert.doesNotMatch(html, /تم النسخ/)
    assert.doesNotMatch(html, /<textarea|<input|contenteditable/i)
  })

  test('the failure message exists in Arabic and tells the user what to do', () => {
    const message = translate('ar', 'review.json.copyFailed')
    assert.notEqual(message, 'review.json.copyFailed')
    assert.match(message, /تعذّر النسخ/)
    assert.match(message, /يدويًا/)
    assert.notEqual(translate('ar', 'review.json.copyFailed'), translate('ar', 'review.json.copied'))
  })
})

describe('P4: the review button while text is pending', () => {
  const bar = (editor, props) =>
    render('/src/components/review/PageReviewBar.jsx', 'PageReviewBar', { page: editor.page(1), isApproved: false, onConfirm: noop, ...props })
  const confirmButton = (html) => html.match(/<button[^>]*class="button button--primary"[^>]*>/)?.[0] ?? ''

  test('an empty page: the button is disabled with its reason when nothing is pending', async () => {
    const editor = makeEditor()
    const html = await bar(editor, {})
    assert.match(confirmButton(html), /disabled/)
    assert.match(decode(html), /review-bar__reason/)
  })

  test('an empty page with pending text: the button is usable (the session commits, then validates)', async () => {
    const editor = makeEditor()
    const html = await bar(editor, { hasPendingEdits: true })
    assert.doesNotMatch(confirmButton(html), /disabled/)
    assert.doesNotMatch(html, /review-bar__reason/)
  })

  test('a reviewed page with pending text is not shown as reviewed (its content is about to change)', async () => {
    const editor = makeEditor()
    const p = paragraph(editor.generateId, 'نص')
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: p })
    editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber: 1, at: '2026-11-23T10:00:00.000Z' })
    const calm = await bar(editor, {})
    assert.match(calm, /review-bar__done/)
    const typing = await bar(editor, { hasPendingEdits: true })
    assert.doesNotMatch(typing, /review-bar__done/)
    assert.match(confirmButton(typing), /button--primary/)
  })

  test('approved documents and pending approvals stay locked whatever is pending', async () => {
    const editor = makeEditor()
    assert.match(confirmButton(await bar(editor, { isApproved: true, hasPendingEdits: true })), /disabled/)
    assert.match(confirmButton(await bar(editor, { isApprovalPending: true, hasPendingEdits: true })), /disabled/)
  })
})

describe('P5 / P8: messages and controls', () => {
  test('both refusals have their own Arabic message', () => {
    for (const code of ['PAGE_PROCESSING', 'PENDING_EDITS_COMMITTED']) {
      const key = getErrorMessageKey(code)
      assert.equal(key, `review.errors.${code}`)
      assert.notEqual(translate('ar', key), key)
    }
    assert.match(translate('ar', 'review.errors.PENDING_EDITS_COMMITTED'), /لم يُستبدل شيء/)
  })

  test('the accept dialog explains a refused accept after typing, without claiming "nothing changed"', async () => {
    const dialog = (errorCode) =>
      render('/src/components/review/AcceptCandidateDialog.jsx', 'AcceptCandidateDialog', { open: true, errorCode, onConfirm: noop, onCancel: noop })
    const typed = decode(await dialog('PENDING_EDITS_COMMITTED'))
    assert.match(typed, /كان لديك نص قيد الكتابة/)
    assert.doesNotMatch(typed, /لم يتغير محتوى الصفحة/)
    const other = decode(await dialog('INVALID_DOCUMENT'))
    assert.match(other, /لم يتغير محتوى الصفحة/)
  })
})

describe('L2: the split pane renders side by side before it has measured anything', () => {
  test('server render has the separator and both panels (stacking is decided after measuring)', async () => {
    const html = await render('/src/components/review/SplitPane.jsx', 'SplitPane', { start: h('p', null, 'أ'), end: h('p', null, 'ب') })
    assert.match(html, /role="separator"/)
    assert.doesNotMatch(html, /is-stacked/)
    assert.equal((html.match(/split-pane__panel/g) ?? []).length, 2)
  })
})
