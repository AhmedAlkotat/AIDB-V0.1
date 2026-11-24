// Regression tests for the Task 2 / Phase 2 stabilization work (findings L1-L7
// and the investigated risks P1-P8). The browser-only parts (sticky offsets,
// responsive layout, focus, the real clipboard, StrictMode, navigation blocking)
// are covered by scripts/browser-checks/*.check.mjs; here is everything that can
// be tested without a browser. The M1-M5 regressions stay in reviewFixes.test.js.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getHistoryShortcut, isModalDialogOpen, isTypingTarget } from '../src/components/review/historyShortcuts.js'
import { getImageLayout } from '../src/components/review/imageLayout.js'
import { createElement } from '../src/domain/document/elements.js'
import { serializeDocument, serializeDocumentPage } from '../src/domain/document/serialization.js'
import { findTextMatches, normalizeForSearch, searchPageElements, splitByRanges } from '../src/domain/document/search.js'
import { resolveBlockedNavigation } from '../src/hooks/useNavigationGuard.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { createReviewSession, SESSION_ERROR } from '../src/state/documentSession/reviewSession.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'
import { paragraph } from './helpers.js'
import { createManualScheduler, deferred, makeSession, makeSnapshot, pageOf, settle } from './sessionHelpers.js'

const add = (session, pageNumber, element) => session.dispatch({ type: ACTION.elementAdded, pageNumber, element })
const edit = (session, pageNumber, elementId, patch) => session.dispatch({ type: ACTION.elementEdited, pageNumber, elementId, patch })
const view = (session) => session.getView()
const textOf = (session, pageNumber = 1, index = 0) => pageOf(session, pageNumber).elements[index].content.text

// A session on an existing store, as a reload would create it (nothing is shared with
// the session that wrote the record).
function reopen(store, id, options = {}) {
  const ids = createSequentialIdGenerator(5000)
  const session = createReviewSession({
    record: store.get(id),
    store,
    processing: options.processing ?? { extractPage: async () => ({ elements: [] }) },
    role: 'employee',
    generateId: ids,
    now: () => new Date('2026-11-23T10:00:00.000Z'),
    autosaveOptions: options.scheduler ? { scheduler: options.scheduler } : { delayMs: 0, maxWaitMs: 0, retryDelaysMs: [] },
    autoProcess: false,
  })
  return { session, ids }
}

// What an input of the editor does (useDraftText): typed text waits for a commit
// that the session can trigger (commitPendingEdits).
function typeInto(session, key, commit) {
  let pending = true
  const flush = () => {
    if (!pending) return
    pending = false
    session.setUncommitted(key, false)
    commit()
  }
  session.setUncommitted(key, true, flush)
  return { isPending: () => pending }
}

// ======================================================================= L7
describe('L7: flexible Arabic search (only while searching)', () => {
  const approvedPairs = [
    ['مدرسة', 'مدرسه'],
    ['مسؤول', 'مسوول'],
    ['أحمد', 'احمد'],
    ['مصطفى', 'مصطفي'],
    ['مُحَمَّد', 'محمد'],
    ['الكــتاب', 'الكتاب'],
  ]

  for (const [first, second] of approvedPairs) {
    test(`"${first}" and "${second}" find each other (both directions)`, () => {
      assert.equal(findTextMatches(`هذه ${first} جيدة`, second).length, 1, 'query variant 2 finds text variant 1')
      assert.equal(findTextMatches(`هذه ${second} جيدة`, first).length, 1, 'query variant 1 finds text variant 2')
      assert.equal(normalizeForSearch(first), normalizeForSearch(second))
    })
  }

  test('the highlighted ranges point into the ORIGINAL text, whatever was normalized', () => {
    for (const [first, second] of approvedPairs) {
      const text = `قبل ${first} بعد`
      const [match] = findTextMatches(text, second)
      // Diacritics/tatweel inside the word are part of the highlighted original text.
      assert.equal(text.slice(match.start, match.end).replace(/[ـً-ٟ]/g, ''), first.replace(/[ـً-ٟ]/g, ''))
      assert.deepEqual(
        splitByRanges(text, [match]).map((segment) => segment.match),
        [false, true, false],
      )
    }
  })

  test('other Hamza and Yaa/Alef Maqsura variants are searchable too', () => {
    assert.equal(findTextMatches('مسئول', 'مسيول').length, 1) // hamza on yaa
    assert.equal(findTextMatches('إسلام', 'اسلام').length, 1)
    assert.equal(findTextMatches('آمن', 'امن').length, 1)
    assert.equal(findTextMatches('على', 'علي').length, 1)
  })

  test('letters that are really different still do not match', () => {
    assert.equal(findTextMatches('مدرسة', 'مدرس').length, 1) // prefix is a match (substring search)
    assert.equal(findTextMatches('مدرسة', 'مدرسم').length, 0)
    assert.equal(findTextMatches('كتاب', 'كتب').length, 0)
    assert.equal(findTextMatches('سعيد', 'سعد').length, 0)
  })

  test('searching never changes the stored content, the original extraction or the JSON', () => {
    const ids = createSequentialIdGenerator(100)
    const { session } = makeSession()
    const p = paragraph(ids, 'ذهب المسؤول إلى المدرسة مع أحمد')
    add(session, 1, p)
    const document = view(session).editor.document
    const before = JSON.stringify(document)
    const jsonBefore = JSON.stringify(serializeDocumentPage(document, 1))

    const result = searchPageElements(pageOf(session, 1).elements, 'مدرسه')
    assert.equal(result.total, 1)
    assert.equal(searchPageElements(pageOf(session, 1).elements, 'مسوول').total, 1)
    assert.equal(searchPageElements(pageOf(session, 1).elements, 'احمد').total, 1)

    assert.equal(JSON.stringify(view(session).editor.document), before)
    assert.equal(JSON.stringify(serializeDocumentPage(view(session).editor.document, 1)), jsonBefore)
    assert.equal(textOf(session), 'ذهب المسؤول إلى المدرسة مع أحمد')
    assert.ok(!JSON.stringify(serializeDocument(view(session).editor.document, { includeOriginalExtraction: true })).includes('مدرسه'))
  })

  test('search stays inside the elements it is given (the current page only)', () => {
    const ids = createSequentialIdGenerator(200)
    const { session } = makeSession()
    add(session, 1, paragraph(ids, 'مدرسة'))
    add(session, 2, paragraph(ids, 'مدرسة'))
    assert.equal(searchPageElements(pageOf(session, 1).elements, 'مدرسه').total, 1)
    assert.equal(searchPageElements(pageOf(session, 3).elements, 'مدرسه').total, 0)
  })

  test('fields, keys and table cells use the same normalization', () => {
    const ids = createSequentialIdGenerator(300)
    const elements = [
      createElement('field', { content: { key: 'المسؤول', value: 'أحمد' } }, { generateId: ids }),
      createElement('table', { content: { rows: [['مدرسة', 'x']] } }, { generateId: ids }),
    ]
    assert.equal(searchPageElements(elements, 'مسوول').total, 1)
    assert.equal(searchPageElements(elements, 'احمد').total, 1)
    assert.equal(searchPageElements(elements, 'مدرسه').total, 1)
  })
})

// ======================================================================= L5
describe('L5: Undo/Redo shortcuts and modal dialogs', () => {
  const key = (k, extra = {}) => ({ key: k, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: { tagName: 'DIV' }, ...extra })

  test('Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z are recognised outside inputs', () => {
    assert.equal(getHistoryShortcut(key('z')), 'undo')
    assert.equal(getHistoryShortcut(key('Z')), 'undo')
    assert.equal(getHistoryShortcut(key('y')), 'redo')
    assert.equal(getHistoryShortcut(key('z', { shiftKey: true })), 'redo')
    assert.equal(getHistoryShortcut(key('z', { ctrlKey: false, metaKey: true })), 'undo')
    assert.equal(getHistoryShortcut(key('a')), null)
    assert.equal(getHistoryShortcut(key('z', { ctrlKey: false })), null)
    assert.equal(getHistoryShortcut(key('z', { altKey: true })), null)
  })

  test('nothing is handled while a modal dialog is open', () => {
    for (const k of ['z', 'y']) assert.equal(getHistoryShortcut(key(k), { modalOpen: true }), null)
    assert.equal(getHistoryShortcut(key('z', { shiftKey: true }), { modalOpen: true }), null)
    assert.equal(getHistoryShortcut(key('z', { target: { tagName: 'BUTTON' } }), { modalOpen: true }), null)
  })

  test('normal text editing keeps the browser undo (inputs are never handled)', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(getHistoryShortcut(key('z', { target: { tagName } })), null)
    assert.equal(getHistoryShortcut(key('z', { target: { tagName: 'DIV', isContentEditable: true } })), null)
    assert.equal(isTypingTarget(null), false)
    assert.equal(isTypingTarget({ tagName: 'P' }), false)
  })

  test('a modal is detected through the open <dialog> element', () => {
    assert.equal(isModalDialogOpen({ querySelector: (selector) => (selector === 'dialog[open]' ? {} : null) }), true)
    assert.equal(isModalDialogOpen({ querySelector: () => null }), false)
    assert.equal(isModalDialogOpen(null), false)
  })
})

// ======================================================================= L4
describe('L4: a rotated image reserves the layout box of the ROTATED picture', () => {
  const wide = { naturalWidth: 300, naturalHeight: 100, fitWidth: 600, zoom: 1 }

  test('0 and 180 degrees: the box equals the image', () => {
    for (const rotation of [0, 180]) {
      assert.deepEqual(getImageLayout({ ...wide, rotation }), { imageWidth: 600, imageHeight: 200, boxWidth: 600, boxHeight: 200 })
    }
  })

  test('90 and 270 degrees: the box swaps width and height, still fitting the width', () => {
    for (const rotation of [90, 270]) {
      const layout = getImageLayout({ ...wide, rotation })
      assert.equal(layout.boxWidth, 600) // fits the same width as a PDF page would
      assert.equal(layout.boxHeight, 1800) // 600 / (100/300)
      assert.equal(layout.imageWidth, 1800) // the unrotated image is the box turned back
      assert.equal(layout.imageHeight, 600)
    }
  })

  test('zoom scales the box and a negative or full turn is handled', () => {
    assert.equal(getImageLayout({ ...wide, zoom: 2, rotation: 0 }).boxWidth, 1200)
    assert.equal(getImageLayout({ ...wide, rotation: -90 }).boxHeight, 1800)
    assert.equal(getImageLayout({ ...wide, rotation: 360 }).boxHeight, 200)
    assert.equal(getImageLayout({ ...wide, fitWidth: 0, rotation: 90 }).boxWidth, 0)
  })

  test('a tall image turned sideways gets a short wide box', () => {
    const layout = getImageLayout({ naturalWidth: 100, naturalHeight: 300, fitWidth: 600, zoom: 1, rotation: 90 })
    assert.equal(layout.boxHeight, 200)
    assert.equal(layout.boxWidth, 600)
  })
})

// ======================================================================= P1
describe('P1: an interrupted reprocess never leaves a successful page stored as failed', () => {
  // A page that was extracted, corrected by hand and confirmed, then reprocessed with a
  // run that never finishes (the tab dies).
  async function interruptedReprocess() {
    const context = makeSession()
    const { session } = context
    await session.processPage(1) // extraction applied (succeeded)
    const element = pageOf(session, 1).elements[0]
    edit(session, 1, element.id, { text: 'تصحيح يدوي' })
    assert.equal(session.confirmPageReview(1).ok, true)
    await session.flushSave()

    const pending = deferred()
    context.service.extractPage = () => pending.promise
    session.processPage(1) // not awaited: the run is "in flight"
    assert.equal(pageOf(session, 1).processing.status, 'processing')
    await session.flushSave() // autosave runs WHILE the run is active
    return { ...context, pending, element }
  }

  test('the transient "processing" status is never written to the store', async () => {
    const { store, id } = await interruptedReprocess()
    const stored = store.get(id).snapshot.pages[0]
    assert.equal(stored.processing.status, 'succeeded')
    assert.equal(stored.processing.errorCode, null)
  })

  test('reopening after the interruption restores extraction result, manual correction and review', async () => {
    const { store, id } = await interruptedReprocess()
    // No close(): the tab died. A new session reads whatever the store holds.
    const { session: restored } = reopen(store, id)
    const page = pageOf(restored, 1)
    assert.deepEqual(page.processing, { status: 'succeeded', errorCode: null })
    assert.equal(page.elements[0].content.text, 'تصحيح يدوي')
    assert.equal(page.review.status, 'reviewed')
    assert.ok(page.originalExtraction)
    assert.notEqual(page.originalExtraction.elements[0].content.text, 'تصحيح يدوي')
  })

  test('typed-in content that was saved while a run was active is kept (the save status stays truthful)', async () => {
    const context = makeSession()
    const { session, store, id, ids } = context
    add(session, 1, paragraph(ids, 'يدوي قبل المعالجة'))
    await session.flushSave()
    const pending = deferred()
    context.service.extractPage = () => pending.promise
    session.processPage(1)
    await session.flushSave()
    const stored = store.get(id).snapshot.pages[0]
    assert.equal(stored.elements[0].content.text, 'يدوي قبل المعالجة')
    assert.equal(stored.processing.status, 'notProcessed')
    assert.equal(session.getEffectiveSaveStatus(), 'saved')
  })

  test('a failed attempt stays failed with its error code after an interrupted retry', async () => {
    const context = makeSession({ shouldFail: () => true })
    const { session, store, id } = context
    await session.processPage(1)
    assert.equal(pageOf(session, 1).processing.status, 'failed')
    const code = pageOf(session, 1).processing.errorCode
    assert.ok(code)
    const pending = deferred()
    context.service.extractPage = () => pending.promise
    session.processPage(1)
    await session.flushSave()
    assert.deepEqual({ ...store.get(id).snapshot.pages[0].processing }, { status: 'failed', errorCode: code })
    // And a clean close restores exactly the same state in memory.
    await session.close()
    assert.deepEqual(pageOf(session, 1).processing, { status: 'failed', errorCode: code })
  })

  test('an older snapshot that does hold "processing" is restored from what the page contains', () => {
    const snapshot = makeSnapshot()
    snapshot.pages[0].processing = { status: 'processing', errorCode: null }
    snapshot.pages[0].originalExtraction = { elements: [] }
    snapshot.pages[1].processing = { status: 'processing', errorCode: null }
    const { session } = makeSession({ snapshot })
    // Already extracted once: back to succeeded, nothing else touched.
    assert.deepEqual(pageOf(session, 1).processing, { status: 'succeeded', errorCode: null })
    // Never extracted: failed and retryable (unchanged earlier behaviour).
    assert.deepEqual(pageOf(session, 2).processing, { status: 'failed', errorCode: 'PROCESSING_INTERRUPTED' })
  })

  test('limit: persistence is simulated by a memory store; a durable backend needs the same check later', () => {
    // Documented in docs/task-2-phase-2-review.md (P1): the rule "never store the transient
    // status" is enforced in the session, so any store gets it; a real backend must still be
    // tested for crash/reload behaviour once it exists.
    assert.equal(createMemoryDocumentStore().isDurable, false)
  })
})

// ======================================================================= P2
describe('P2: creating a session has no side effects (React StrictMode creates two)', () => {
  function recoveredSnapshot() {
    const snapshot = makeSnapshot()
    snapshot.pages[1].processing = { status: 'processing', errorCode: null }
    return snapshot
  }

  test('a recovered document schedules no write until the session is opened', () => {
    const scheduler = createManualScheduler()
    const store = createMemoryDocumentStore()
    const id = store.create({ name: 'x', snapshot: recoveredSnapshot(), kind: 'upload' })
    const { session } = reopen(store, id, { scheduler })
    assert.equal(scheduler.pendingCount(), 0, 'a discarded duplicate session leaves no timer behind')
    session.open()
    assert.equal(scheduler.pendingCount(), 1)
  })

  test('opening again after close() does not schedule the recovery write twice', async () => {
    const scheduler = createManualScheduler()
    const store = createMemoryDocumentStore()
    const id = store.create({ name: 'x', snapshot: recoveredSnapshot(), kind: 'upload' })
    const { session } = reopen(store, id, { scheduler })
    session.open()
    await session.close()
    session.open()
    scheduler.advance(10_000)
    await settle()
    assert.equal(store.get(id).snapshot.pages[1].processing.status, 'failed')
    assert.equal(scheduler.pendingCount(), 0)
  })

  test('two sessions created for one record (the discarded one is never opened) write nothing', async () => {
    const scheduler = createManualScheduler()
    const store = createMemoryDocumentStore()
    const id = store.create({ name: 'x', snapshot: recoveredSnapshot(), kind: 'upload' })
    let writes = 0
    const original = store.savePages
    store.savePages = (...args) => {
      writes += 1
      return original.apply(store, args)
    }
    reopen(store, id, { scheduler }) // the duplicate: never opened, never closed
    const { session } = reopen(store, id, { scheduler })
    session.open()
    scheduler.advance(10_000)
    await settle()
    assert.equal(writes, 1)
  })
})

// ======================================================================= P3
describe('P3: a blocked navigation proceeds at most once', () => {
  const fakeSession = (guards) => {
    const queue = [...guards]
    return {
      flushed: 0,
      async flushSave() {
        this.flushed += 1
      },
      getNavigationGuard: () => queue.shift() ?? { shouldBlock: false, reasons: [] },
    }
  }

  test('saving succeeded: it continues exactly once and the user is not asked', async () => {
    const session = fakeSession([{ shouldBlock: false, reasons: [] }])
    let proceeded = 0
    let asked = null
    const outcome = await resolveBlockedNavigation(session, { isCurrent: () => true, proceed: () => (proceeded += 1), showReasons: (r) => (asked = r) })
    assert.equal(outcome, 'proceeded')
    assert.equal(proceeded, 1)
    assert.equal(asked, null)
  })

  test('work could be lost: the reasons are shown and nothing proceeds on its own', async () => {
    const session = fakeSession([{ shouldBlock: true, reasons: ['unsavedChanges'] }])
    let proceeded = 0
    let asked = null
    const outcome = await resolveBlockedNavigation(session, { isCurrent: () => true, proceed: () => (proceeded += 1), showReasons: (r) => (asked = r) })
    assert.equal(outcome, 'asked')
    assert.deepEqual(asked, ['unsavedChanges'])
    assert.equal(proceeded, 0)
  })

  test('an attempt that was replaced (the effect re-ran) does nothing', async () => {
    const session = fakeSession([])
    let proceeded = 0
    const outcome = await resolveBlockedNavigation(session, { isCurrent: () => false, proceed: () => (proceeded += 1), showReasons: () => {} })
    assert.equal(outcome, 'superseded')
    assert.equal(proceeded, 0)
  })

  test('re-rendering while saving: of two overlapping attempts only the current one proceeds', async () => {
    const gate = deferred()
    let current = 1
    const session = {
      flushSave: () => gate.promise,
      getNavigationGuard: () => ({ shouldBlock: false, reasons: [] }),
    }
    let proceeded = 0
    const attempt = (id) => resolveBlockedNavigation(session, { isCurrent: () => current === id, proceed: () => (proceeded += 1), showReasons: () => {} })
    const first = attempt(1)
    current = 2 // the effect was cleaned up and restarted
    const second = attempt(2)
    gate.resolve()
    assert.deepEqual(await Promise.all([first, second]), ['superseded', 'proceeded'])
    assert.equal(proceeded, 1)
  })
})

// ======================================================================= P4
describe('P4: review confirmation commits pending text first', () => {
  test('the confirmation covers the text on screen, not the older committed text', () => {
    const { session, ids } = makeSession()
    const p = paragraph(ids, 'قديم')
    add(session, 1, p)
    const input = typeInto(session, 'p1', () => edit(session, 1, p.id, { text: 'جديد كما كُتب' }))
    assert.equal(view(session).uncommittedCount, 1)

    const result = session.confirmPageReview(1)
    assert.equal(result.ok, true)
    assert.equal(input.isPending(), false)
    assert.equal(textOf(session), 'جديد كما كُتب')
    assert.equal(pageOf(session, 1).review.status, 'reviewed')
    assert.equal(view(session).uncommittedCount, 0)
  })

  test('text typed into a still-empty page is committed, then validated (one click is enough)', () => {
    const { session, ids } = makeSession()
    const empty = paragraph(ids, '')
    add(session, 1, empty)
    assert.notEqual(session.confirmPageReview(1).ok, true, 'without typed text there is nothing to confirm')
    typeInto(session, 'p1', () => edit(session, 1, empty.id, { text: 'أول نص' }))
    assert.equal(session.confirmPageReview(1).ok, true)
    assert.equal(textOf(session), 'أول نص')
  })

  test('if the typed text does not make the page valid, the confirmation is refused (not silently granted)', () => {
    const { session, ids } = makeSession()
    const empty = paragraph(ids, '')
    add(session, 1, empty)
    typeInto(session, 'p1', () => edit(session, 1, empty.id, { text: '   ' }))
    const result = session.confirmPageReview(1)
    assert.equal(result.ok, false)
    assert.equal(pageOf(session, 1).review.status, 'notReviewed')
  })

  test('a page that was reviewed and then edited needs a NEW confirmation covering the new text', () => {
    const { session, ids } = makeSession()
    const p = paragraph(ids, 'أصل')
    add(session, 1, p)
    session.confirmPageReview(1)
    typeInto(session, 'p1', () => edit(session, 1, p.id, { text: 'تعديل أخير' }))
    // Confirming again commits the edit (which invalidates) and confirms the new text.
    assert.equal(session.confirmPageReview(1).ok, true)
    assert.equal(textOf(session), 'تعديل أخير')
    assert.equal(pageOf(session, 1).review.status, 'reviewed')
  })

  test('closing the session commits pending text and stores it', async () => {
    const { session, store, id, ids } = makeSession()
    const p = paragraph(ids, 'قديم')
    add(session, 1, p)
    typeInto(session, 'p1', () => edit(session, 1, p.id, { text: 'كُتب قبل الإغلاق' }))
    await session.close()
    assert.equal(store.get(id).snapshot.pages[0].elements[0].content.text, 'كُتب قبل الإغلاق')
  })
})

// ======================================================================= P5
describe('P5: a candidate cannot be accepted while its page is being processed', () => {
  // A page with manual content whose first run produced a candidate; a second run is
  // then in flight (the UI offers "reprocess" on such a page).
  async function candidateWithRunInFlight() {
    const context = makeSession()
    const { session, ids } = context
    add(session, 1, paragraph(ids, 'يدوي'))
    await session.processPage(1)
    assert.ok(view(session).candidates[1])
    const pending = deferred()
    context.service.extractPage = () => pending.promise
    const run = session.processPage(1)
    assert.equal(pageOf(session, 1).processing.status, 'processing')
    return { ...context, pending, run }
  }

  test('acceptance is refused with PAGE_PROCESSING and nothing changes', async () => {
    const { session } = await candidateWithRunInFlight()
    const before = pageOf(session, 1)
    const result = session.acceptCandidate(1)
    assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: SESSION_ERROR.pageProcessing })
    assert.equal(pageOf(session, 1), before)
    assert.ok(view(session).candidates[1], 'the candidate is kept')
    assert.equal(textOf(session), 'يدوي')
  })

  test('the finishing run cannot overwrite a result with a stale status, and acceptance works afterwards', async () => {
    const { session, pending, run, ids } = await candidateWithRunInFlight()
    session.acceptCandidate(1) // refused
    pending.resolve({ elements: [paragraph(ids, 'نتيجة ثانية')] })
    await run
    // The run restored the status it started from and offers a new candidate.
    assert.equal(pageOf(session, 1).processing.status, 'notProcessed')
    assert.equal(view(session).candidates[1].elements[0].content.text, 'نتيجة ثانية')
    assert.equal(textOf(session), 'يدوي')
    const accepted = session.acceptCandidate(1)
    assert.equal(accepted.ok, true)
    assert.equal(textOf(session), 'نتيجة ثانية')
    assert.equal(pageOf(session, 1).processing.status, 'succeeded')
  })

  test('discarding while processing is harmless; approved and pending-approval refusals still apply', async () => {
    const { session } = await candidateWithRunInFlight()
    assert.equal(session.discardCandidate(1).ok, true)
    assert.equal(session.acceptCandidate(1).ok, false)
  })
})

// ======================================================================= P8
describe('P8: pending typed text is never lost when a candidate is accepted', () => {
  async function pageWithCandidate() {
    const context = makeSession()
    const { session, ids } = context
    const p = paragraph(ids, 'مكتوب يدويًا')
    add(session, 1, p)
    await session.processPage(1)
    assert.ok(view(session).candidates[1])
    return { ...context, p }
  }

  test('typed text is committed first; nothing is replaced and the user must look again', async () => {
    const { session, p } = await pageWithCandidate()
    typeInto(session, 'p1', () => edit(session, 1, p.id, { text: 'نص قيد الكتابة' }))
    const result = session.acceptCandidate(1)
    assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: SESSION_ERROR.pendingEditsCommitted })
    assert.equal(textOf(session), 'نص قيد الكتابة', 'the typed text is kept in the page')
    assert.ok(view(session).candidates[1], 'the candidate is still waiting for an explicit decision')
    assert.equal(view(session).uncommittedCount, 0)
    // Undo history of that edit is kept (the approved behaviour of ordinary edits).
    assert.equal(session.dispatch({ type: ACTION.undone, pageNumber: 1 }).ok, true)
    assert.equal(textOf(session), 'مكتوب يدويًا')
  })

  test('after the user decides again, acceptance replaces the content (explicit consent preserved)', async () => {
    const { session, p } = await pageWithCandidate()
    typeInto(session, 'p1', () => edit(session, 1, p.id, { text: 'نص قيد الكتابة' }))
    session.acceptCandidate(1)
    const second = session.acceptCandidate(1)
    assert.equal(second.ok, true)
    assert.notEqual(textOf(session), 'نص قيد الكتابة')
    assert.equal(view(session).candidates[1], undefined)
  })

  test('without pending text, accepting works exactly as before', async () => {
    const { session } = await pageWithCandidate()
    assert.equal(session.acceptCandidate(1).ok, true)
  })

  test('a draft whose element is gone does not turn into a silent loss: the refusal is reported', async () => {
    const { session, p } = await pageWithCandidate()
    session.dispatch({ type: ACTION.elementRemoved, pageNumber: 1, elementId: p.id })
    let outcome = null
    typeInto(session, 'p1', () => {
      outcome = edit(session, 1, p.id, { text: 'كُتب فوق عنصر محذوف' })
    })
    const result = session.acceptCandidate(1)
    // The commit was attempted BEFORE any replacement and its refusal is visible to the caller.
    assert.equal(outcome.ok, false)
    assert.equal(outcome.code, 'ELEMENT_NOT_FOUND')
    assert.equal(result.ok, true) // the page content was not changed by the (refused) commit
  })

  test('re-extraction starts from what is typed: pending text is committed before the content is judged', async () => {
    const context = makeSession()
    const { session, ids } = context
    const empty = paragraph(ids, '')
    add(session, 1, empty)
    typeInto(session, 'p1', () => edit(session, 1, empty.id, { text: 'كتبته قبل المعالجة' }))
    await session.processPage(1)
    // The page has content, so the result is a candidate to compare: it is NOT applied over the text.
    assert.equal(textOf(session), 'كتبته قبل المعالجة')
    assert.ok(view(session).candidates[1])
  })
})
