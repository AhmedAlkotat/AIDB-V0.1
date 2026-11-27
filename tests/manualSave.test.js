// O-1: the explicit "Save draft" confirms itself, without ever showing a false success.
// O-3: the application has a real favicon, so the browser no longer gets a 404 for /favicon.ico.
//
// The confirmation logic is framework-free (components/review/manualSave.js) and is tested here with a fake clock and with
// the REAL review session on the temporary store (including a store that refuses saves). The button itself is clicked in
// a real browser by scripts/browser-checks/review.check.mjs.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { createManualSaveConfirmation, MANUAL_SAVE, SAVE_CONFIRMATION_MS } from '../src/components/review/manualSave.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { paragraph } from './helpers.js'
import { makeSession, settle } from './sessionHelpers.js'

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10))

// A clock driven by hand.
function fakeClock() {
  const timers = new Map()
  let next = 1
  return {
    setTimeoutImpl: (callback, delay) => {
      const handle = next++
      timers.set(handle, { callback, delay })
      return handle
    },
    clearTimeoutImpl: (handle) => timers.delete(handle),
    pending: () => timers.size,
    delays: () => [...timers.values()].map((timer) => timer.delay),
    fireAll: () => [...timers.values()].forEach((timer) => timer.callback()),
  }
}
const record = (controller) => {
  const seen = []
  controller.subscribe(() => seen.push(controller.getState().status))
  return seen
}

describe('the confirmation of "Save draft" (O-1)', () => {
  test('a save that ended "saved" shows the confirmation, which goes away by itself', async () => {
    const clock = fakeClock()
    const controller = createManualSaveConfirmation({ save: async () => ({ ok: true, status: 'saved' }), ...clock })
    const seen = record(controller)
    assert.equal(controller.getState().status, MANUAL_SAVE.idle)
    assert.equal(await controller.run(), true)
    assert.deepEqual(seen, ['saving', 'confirmed'])
    assert.deepEqual(clock.delays(), [SAVE_CONFIRMATION_MS])
    clock.fireAll()
    assert.equal(controller.getState().status, MANUAL_SAVE.idle)
  })

  test('NO FALSE SUCCESS: a failed save, a thrown error, a missing or non-true answer never shows the confirmation', async () => {
    for (const outcome of [async () => ({ ok: false, status: 'failed' }), async () => Promise.reject(new Error('storage down')), async () => undefined, async () => null, async () => ({ ok: 'yes' }), async () => ({ status: 'saved' })]) {
      const clock = fakeClock()
      const controller = createManualSaveConfirmation({ save: outcome, ...clock })
      const seen = record(controller)
      assert.equal(await controller.run(), false)
      assert.deepEqual(seen, ['saving', 'idle']) // never "confirmed"
      assert.equal(clock.pending(), 0)
    }
  })

  test('a second click while a save is running is ignored (one save, no duplicate)', async () => {
    let calls = 0
    let finish
    // Only the FIRST save waits; if a second one were ever started it would answer at once (so a missing guard fails
    // the assertions below instead of hanging the test run).
    const controller = createManualSaveConfirmation({ save: () => { calls += 1; return calls === 1 ? new Promise((resolve) => (finish = resolve)) : Promise.resolve({ ok: true }) }, ...fakeClock() })
    const first = controller.run()
    assert.equal(await controller.run(), false)
    assert.equal(calls, 1)
    finish({ ok: true })
    assert.equal(await first, true)
  })

  test('a new click restarts the time of the confirmation (one timer, never two)', async () => {
    const clock = fakeClock()
    const controller = createManualSaveConfirmation({ save: async () => ({ ok: true }), ...clock })
    await controller.run()
    await controller.run()
    assert.equal(clock.pending(), 1)
  })

  test('a failure after a confirmation replaces it: the status goes through "saving" to idle, never staying "confirmed"', async () => {
    let ok = true
    const controller = createManualSaveConfirmation({ save: async () => ({ ok }), ...fakeClock() })
    await controller.run()
    assert.equal(controller.getState().status, MANUAL_SAVE.confirmed)
    ok = false
    await controller.run()
    assert.equal(controller.getState().status, MANUAL_SAVE.idle)
  })

  test('dismiss() hides it at once (the document changed after it, so it would no longer be true)', async () => {
    const clock = fakeClock()
    const controller = createManualSaveConfirmation({ save: async () => ({ ok: true }), ...clock })
    await controller.run()
    controller.dismiss()
    assert.equal(controller.getState().status, MANUAL_SAVE.idle)
    assert.equal(clock.pending(), 0)
    controller.dismiss() // nothing to hide: harmless
  })

  test('leaving the screen cancels what is pending: a late answer shows nothing, and the controller stays usable (React\'s development double-mount)', async () => {
    const clock = fakeClock()
    let finish
    let first = true
    const controller = createManualSaveConfirmation({ save: () => (first ? ((first = false), new Promise((resolve) => (finish = resolve))) : Promise.resolve({ ok: true })), ...clock })
    const pending = controller.run()
    controller.cancel() // the cleanup of the first mount
    finish({ ok: true }) // the save finishes after the screen was left
    assert.equal(await pending, false)
    assert.equal(controller.getState().status, MANUAL_SAVE.idle)
    assert.equal(clock.pending(), 0)
    assert.equal(await controller.run(), true) // the second mount works
    controller.cancel()
    assert.equal(clock.pending(), 0)
  })

  test('the newest save function is used (the screen passes a new one on every render); a save already running is not affected', async () => {
    let finishFirst
    const calls = []
    const controller = createManualSaveConfirmation({ save: () => { calls.push('first'); return new Promise((resolve) => (finishFirst = resolve)) }, ...fakeClock() })
    const running = controller.run()
    controller.setSave(async () => { calls.push('second'); return { ok: true } })
    finishFirst({ ok: false })
    assert.equal(await running, false) // the running save kept its own function and its own answer
    assert.equal(await controller.run(), true)
    assert.deepEqual(calls, ['first', 'second'])
  })

  test('autosave never triggers it: the controller does nothing until the button calls run()', async () => {
    let calls = 0
    const controller = createManualSaveConfirmation({ save: async () => void (calls += 1), ...fakeClock() })
    await settle()
    assert.equal(calls, 0)
    assert.equal(controller.getState().status, MANUAL_SAVE.idle)
  })
})

describe('the confirmation with the REAL review session (the O-1 scenario)', () => {
  test('autosave already stored everything: the click changes nothing in the status, and NOW it confirms', async () => {
    const { session } = makeSession()
    const controller = createManualSaveConfirmation({ save: () => session.saveDraft(), ...fakeClock() })
    assert.equal(session.getView().save.status, 'saved')
    assert.equal(await controller.run(), true)
    assert.equal(session.getView().save.status, 'saved') // unchanged: this is why a confirmation was needed
    assert.equal(controller.getState().status, MANUAL_SAVE.confirmed)
  })

  test('pending changes: the click saves them and confirms', async () => {
    const { session, store, id, ids } = makeSession()
    session.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(ids, 'نص جديد') })
    const controller = createManualSaveConfirmation({ save: () => session.saveDraft(), ...fakeClock() })
    assert.equal(await controller.run(), true)
    assert.equal(store.get(id).snapshot.pages[0].elements.length, 1) // really stored
    assert.equal(controller.getState().status, MANUAL_SAVE.confirmed)
  })

  test('the storage refuses the save: NO confirmation, the failure stays visible, the edit stays, and a later successful save confirms', async () => {
    const { session, store, id, ids } = makeSession()
    session.dispatch({ type: ACTION.elementAdded, pageNumber: 1, element: paragraph(ids, 'لا يجب فقده') })
    store.setSimulatedFailure(true)
    const controller = createManualSaveConfirmation({ save: () => session.saveDraft(), ...fakeClock() })
    const seen = record(controller)
    assert.equal(await controller.run(), false)
    assert.deepEqual(seen, ['saving', 'idle'])
    assert.equal(session.getView().save.status, 'failed') // the existing failure state is what the user sees
    assert.equal(session.getView().editor.document.pages[0].elements.length, 1) // the unsaved edit is not lost
    assert.equal(store.get(id).snapshot.pages[0].elements.length, 0) // and nothing was stored
    store.setSimulatedFailure(false)
    assert.equal(await controller.run(), true)
    assert.equal(session.getView().save.status, 'saved')
    assert.equal(store.get(id).snapshot.pages[0].elements.length, 1)
  })
})

describe('the save indicator keeps its behaviour (rendered)', () => {
  const root = process.cwd()
  const require = createRequire(`${root}/package.json`)
  const React = require('react')
  const { renderToString } = require('react-dom/server')
  const h = React.createElement
  let server
  let Indicator
  let LanguageProvider
  let LanguageContext

  before(async () => {
    const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
    server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
    ;({ SaveStatusIndicator: Indicator } = await server.ssrLoadModule('/src/components/review/SaveStatusIndicator.jsx'))
    ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
    ;({ LanguageContext } = await server.ssrLoadModule('/src/contexts/languageContext.js'))
  })
  after(async () => {
    await server?.close()
  })

  const noop = () => {}
  const show = (props, language = 'ar') =>
    language === 'ar'
      ? renderToString(h(LanguageProvider, null, h(Indicator, props)))
      : renderToString(h(LanguageContext.Provider, { value: { language, direction: 'ltr', setLanguage: noop } }, h(Indicator, props)))

  test('before any click there is no confirmation, whatever the status; the button and the statuses are unchanged', () => {
    for (const status of ['saved', 'unsaved', 'saving', 'failed']) {
      const html = show({ status, isTemporary: false, onRetry: noop, onSaveDraft: noop })
      assert.doesNotMatch(html, /save-status__confirmed/, status)
      assert.match(html, /حفظ المسودة/)
    }
    assert.match(show({ status: 'saved', isTemporary: false, lastSavedAt: '2026-06-01T10:00:00.000Z', onSaveDraft: noop }), /آخر حفظ/)
    assert.match(show({ status: 'failed', isTemporary: false, onRetry: noop, onSaveDraft: noop }), /فشل الحفظ/)
    assert.match(show({ status: 'saved', isTemporary: false, onSaveDraft: noop }, 'en'), /Save draft/)
  })

  test('without the button (no onSaveDraft) nothing about drafts is rendered; a locked-out user cannot click it', () => {
    assert.doesNotMatch(show({ status: 'saved', isTemporary: false }), /save-status__draft/)
    assert.match(show({ status: 'saved', isTemporary: false, canSave: false, onSaveDraft: noop }), /save-status__draft"[^>]*disabled/)
  })

  test('the confirmation text exists in Arabic and in English', () => {
    const translations = read('../src/i18n/translations.js')
    assert.match(translations, /draftSaved: 'تم حفظ المسودة\.'/)
    assert.match(translations, /draftSaved: 'Draft saved\.'/)
  })
})

describe('the favicon (O-3)', () => {
  const html = read('../index.html')
  const svg = read('../public/favicon.svg')
  const ico = readFileSync(new URL('../public/favicon.ico', import.meta.url))

  test('index.html links the icon, so the browser does not ask for /favicon.ico and get a 404', () => {
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"\s*\/>/)
    assert.match(html, /<link rel="alternate icon" type="image\/x-icon" href="\/favicon\.ico"\s*\/>/)
  })

  test('the SVG is the brand mark: well formed, the brand teal of the stylesheet, a document, nothing external or executable', () => {
    assert.match(svg, /^<svg [^>]*viewBox="0 0 64 64"/)
    assert.match(svg, /<\/svg>\s*$/)
    const opening = (svg.match(/<(rect|path)\b/g) ?? []).length
    assert.equal((svg.match(/\/>/g) ?? []).length, opening) // every shape is closed
    const teal = /--color-teal:\s*(#[0-9a-f]{6})/i.exec(read('../src/styles/global.css'))[1]
    assert.ok(svg.toLowerCase().includes(`fill="${teal.toLowerCase()}"`), `the icon does not use the brand teal ${teal}`)
    assert.doesNotMatch(svg, /<script|href=|url\(|https?:\/\/(?!www\.w3\.org)/i)
    assert.ok(svg.length < 2000)
  })

  test('favicon.ico is a valid icon file of 16, 32 and 48 px images (PNG payloads) that match their directory entries', () => {
    assert.equal(ico.readUInt16LE(0), 0) // reserved
    assert.equal(ico.readUInt16LE(2), 1) // type: icon
    const count = ico.readUInt16LE(4)
    assert.deepEqual(
      Array.from({ length: count }, (_, index) => ico[6 + index * 16]),
      [16, 32, 48],
    )
    for (let index = 0; index < count; index += 1) {
      const at = 6 + index * 16
      const size = ico[at]
      const length = ico.readUInt32LE(at + 8)
      const offset = ico.readUInt32LE(at + 12)
      assert.ok(offset + length <= ico.length, `image ${size} runs past the end of the file`)
      const image = ico.subarray(offset, offset + length)
      assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]) // PNG signature
      assert.equal(image.readUInt32BE(16), size) // IHDR width
      assert.equal(image.readUInt32BE(20), size) // IHDR height
      assert.ok(image.includes(Buffer.from('IEND')))
    }
    assert.ok(ico.length < 5000)
  })
})
