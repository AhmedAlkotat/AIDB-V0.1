// Task 2 / Phase 3: frontend integration of upload, correction queue, review and archive.
//
// Visibility (employee: own documents, administrator: all) is a SIMULATION in the
// interface; these tests describe that simulation and the queue/archive separation.
// They do not, and cannot, show any server-side enforcement (Task 3).

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { canViewDocument, selectArchive, selectCorrectionQueue, selectVisibleDocuments } from '../src/domain/document/access.js'
import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../src/data/mock/reviewDemo.mock.js'
import { DEMO_USER } from '../src/data/mock/demoUser.mock.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { backFromReviewPath, ROUTES } from '../src/routes/paths.js'
import { createReviewDocumentFromRequest } from '../src/services/reviewDocuments.js'
import { createProcessingRequest } from '../src/services/documentProcessingService.js'
import { makeSnapshot } from './sessionHelpers.js'

const employee = (id) => ({ id, role: 'employee' })
const admin = { id: 'boss', role: 'orgAdmin' }

const summary = (id, ownerId, approvalStatus = 'none', state) => ({ id, ownerId, approvalStatus, ...(state ? { state } : {}) })
const ids = (items) => items.map((item) => item.id)

describe('who may see a document (simulated)', () => {
  test('an employee sees their own documents only', () => {
    assert.equal(canViewDocument({ role: 'employee', userId: 'a', ownerId: 'a' }), true)
    assert.equal(canViewDocument({ role: 'employee', userId: 'a', ownerId: 'b' }), false)
  })

  test('an administrator sees every document, including ones without an owner', () => {
    assert.equal(canViewDocument({ role: 'orgAdmin', userId: 'boss', ownerId: 'a' }), true)
    assert.equal(canViewDocument({ role: 'orgAdmin', userId: 'boss', ownerId: null }), true)
  })

  test('an ownerless document is hidden from employees, and an unknown role sees nothing', () => {
    assert.equal(canViewDocument({ role: 'employee', userId: 'a', ownerId: null }), false)
    assert.equal(canViewDocument({ role: 'employee', userId: 'a', ownerId: undefined }), false)
    assert.equal(canViewDocument({ role: 'guest', userId: 'a', ownerId: 'a' }), false)
    assert.equal(canViewDocument({ role: undefined, userId: undefined, ownerId: undefined }), false)
  })
})

describe('correction queue and archive (decision 12: the archive lists every state except Pending)', () => {
  const items = [
    summary('mine-review', 'a', 'none', 'readyForReview'),
    summary('mine-approved', 'a', 'approved', 'approved'),
    summary('mine-pending', 'a', 'none', 'pending'),
    summary('theirs-failed', 'b', 'none', 'failed'),
    summary('theirs-approved', 'b', 'approved', 'approved'),
    summary('orphan-processing', null, 'none', 'processing'),
  ]

  test('an employee sees only their own documents: not-approved ones in the queue, all but Pending in the archive', () => {
    assert.deepEqual(ids(selectVisibleDocuments(items, employee('a'))), ['mine-review', 'mine-approved', 'mine-pending'])
    assert.deepEqual(ids(selectCorrectionQueue(items, employee('a'))), ['mine-review', 'mine-pending'])
    assert.deepEqual(ids(selectArchive(items, employee('a'))), ['mine-review', 'mine-approved'])
  })

  test('an administrator sees all documents in both lists', () => {
    assert.deepEqual(ids(selectCorrectionQueue(items, admin)), ['mine-review', 'mine-pending', 'theirs-failed', 'orphan-processing'])
    assert.deepEqual(ids(selectArchive(items, admin)), ['mine-review', 'mine-approved', 'theirs-failed', 'theirs-approved', 'orphan-processing'])
  })

  test('a Pending document NEVER appears in the archive, every other state does, and an approved one is never in the queue', () => {
    for (const user of [employee('a'), employee('b'), admin]) {
      assert.ok(selectArchive(items, user).every((item) => item.state !== 'pending'))
      assert.ok(selectCorrectionQueue(items, user).every((item) => item.approvalStatus !== 'approved'))
    }
    // every approved lifecycle state except Pending is listed for the Admin
    const states = ['processing', 'readyForReview', 'failed', 'manualEditing', 'approved'].map((state) => summary(state, 'a', state === 'approved' ? 'approved' : 'none', state))
    assert.deepEqual(ids(selectArchive(states, admin)), ['processing', 'readyForReview', 'failed', 'manualEditing', 'approved'])
  })

  test('summaries without a state (older callers) count as waiting for review, or approved', () => {
    const legacy = [summary('old-none', 'a'), summary('old-approved', 'a', 'approved')]
    assert.deepEqual(ids(selectArchive(legacy, employee('a'))), ['old-none', 'old-approved'])
    assert.deepEqual(ids(selectCorrectionQueue(legacy, employee('a'))), ['old-none'])
  })

  test('a user with no documents gets empty lists', () => {
    assert.deepEqual(selectCorrectionQueue(items, employee('nobody')), [])
    assert.deepEqual(selectArchive(items, employee('nobody')), [])
  })

  test('when a store acknowledges an approval the document moves from the queue to the archive', async () => {
    const store = createMemoryDocumentStore()
    const id = store.create({ name: 'x', snapshot: makeSnapshot(), ownerId: 'a' })
    const user = employee('a')
    assert.deepEqual(ids(selectCorrectionQueue(store.list(), user)), [id])
    assert.deepEqual(ids(selectArchive(store.list(), user)), [id]) // Ready for Review is archived too (decision 12)
    await store.setApprovalStatus(id, 'approved')
    assert.deepEqual(selectCorrectionQueue(store.list(), user), [])
    assert.deepEqual(ids(selectArchive(store.list(), user)), [id])
    assert.equal(store.list()[0].state, 'approved')
  })
})

describe('owners are recorded where documents are created', () => {
  test('the store keeps the owner and exposes it in the list summary (null when unknown)', () => {
    const store = createMemoryDocumentStore()
    const owned = store.create({ name: 'a', snapshot: makeSnapshot(), ownerId: 'a' })
    const unowned = store.create({ name: 'b', snapshot: makeSnapshot() })
    assert.equal(store.get(owned).ownerId, 'a')
    assert.equal(store.get(unowned).ownerId, null)
    const byId = Object.fromEntries(store.list().map((item) => [item.id, item.ownerId]))
    assert.deepEqual(byId, { [owned]: 'a', [unowned]: null })
  })

  test('a document registered from the upload page belongs to its uploader and starts Pending (not in the archive yet)', () => {
    const store = createMemoryDocumentStore()
    const file = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' })
    const request = createProcessingRequest({ file, documentKind: 'pdf', totalPages: 2, mode: 'all', pages: [1, 2] })
    const id = createReviewDocumentFromRequest(store, request, { ownerId: DEMO_USER.id, workflow: { phase: 'pending' } })
    const me = { id: DEMO_USER.id, role: 'employee' }
    assert.equal(store.list()[0].state, 'pending')
    assert.deepEqual(ids(selectCorrectionQueue(store.list(), me)), [id])
    assert.deepEqual(selectArchive(store.list(), me), [])
    assert.deepEqual(selectCorrectionQueue(store.list(), employee('someone-else')), [])
    assert.deepEqual(ids(selectCorrectionQueue(store.list(), admin)), [id])
  })

  test('the demonstration documents belong to the demo user: one to review, one approved (both archived, decision 12)', () => {
    const store = createMemoryDocumentStore()
    seedDemoReviewDocuments(store)
    const me = { id: DEMO_USER.id, role: DEMO_USER.role }
    assert.deepEqual(ids(selectCorrectionQueue(store.list(), me)), [DEMO_REVIEW_IDS.toReview])
    assert.deepEqual(ids(selectArchive(store.list(), me)).sort(), [DEMO_REVIEW_IDS.approved, DEMO_REVIEW_IDS.toReview].sort())
  })
})

// ---------------------------------------------------------------------- rendered pages
const root = process.cwd()
const require = createRequire(`${root}/package.json`)
const React = require('react')
const { renderToString } = require('react-dom/server')
const h = React.createElement

let server
let LanguageProvider
let AuthContext
let router
let documentStore
const loaded = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/contexts/authContext.js'))
  router = await server.ssrLoadModule('react-router')
  ;({ documentStore } = await server.ssrLoadModule('/src/services/documentStore.js'))
})

after(async () => {
  await server?.close()
})

// The pages read the signed-in user from the authentication context (Batch A); these tests
// sign in the demo employee, as the pages assumed before.
const signedInEmployee = { status: 'authenticated', user: { id: DEMO_USER.id, displayName: 'موظف تجريبي', role: DEMO_USER.role } }

async function renderRoute(file, path, route = path, auth = signedInEmployee) {
  if (!loaded.has(file)) loaded.set(file, await server.ssrLoadModule(file))
  const Page = loaded.get(file).default
  return renderToString(
    h(LanguageProvider, null, h(AuthContext.Provider, { value: auth }, h(router.MemoryRouter, { initialEntries: [path] }, h(router.Routes, null, h(router.Route, { element: h('div', null, h(Page)), path: route }))))),
  )
}

describe('the pages show the right documents', () => {
  const PENDING_DEMO = 'مستند تجريبي للمراجعة'
  const APPROVED_DEMO = 'مستند تجريبي معتمد'

  test('the correction queue lists the pending demo document and not the approved one', async () => {
    const html = await renderRoute('/src/pages/CorrectionQueuePage.jsx', '/corrections')
    assert.match(html, new RegExp(PENDING_DEMO))
    assert.doesNotMatch(html, new RegExp(APPROVED_DEMO))
    assert.match(html, /محاكاة في الواجهة فقط/)
  })

  test('the archive lists the approved demo document (read-only) AND the one waiting for review (decision 12: every state but Pending)', async () => {
    const html = await renderRoute('/src/pages/DocumentArchivePage.jsx', '/archive')
    assert.match(html, new RegExp(APPROVED_DEMO))
    assert.match(html, /عرض المستند \(للقراءة فقط\)/)
    assert.match(html, new RegExp(PENDING_DEMO)) // Ready for Review is archived too
    assert.match(html, /محاكاة في الواجهة فقط/)
    assert.doesNotMatch(html, /تحت التطوير|under development/i)
  })

  test('a Pending document is not in the archive page but is in the queue page', async () => {
    documentStore.create({ id: 'pending-doc', name: 'مستند قيد الانتظار', snapshot: makeSnapshot(), ownerId: DEMO_USER.id, workflow: { phase: 'pending' } })
    const archive = await renderRoute('/src/pages/DocumentArchivePage.jsx', '/archive')
    assert.doesNotMatch(archive, /مستند قيد الانتظار/)
    const queue = await renderRoute('/src/pages/CorrectionQueuePage.jsx', '/corrections')
    assert.match(queue, /مستند قيد الانتظار/)
  })

  test('a document uploaded by someone else is in neither list for an employee', async () => {
    documentStore.create({ id: 'foreign-doc', name: 'مستند موظف آخر', snapshot: makeSnapshot(), ownerId: 'another-employee' })
    const queue = await renderRoute('/src/pages/CorrectionQueuePage.jsx', '/corrections')
    assert.doesNotMatch(queue, /مستند موظف آخر/)
  })

  test('opening someone else\'s document by its address is refused (simulated), without loading it', async () => {
    documentStore.create({ id: 'foreign-doc-2', name: 'مستند موظف آخر', snapshot: makeSnapshot(), ownerId: 'another-employee' })
    const html = await renderRoute('/src/pages/DocumentReviewPage.jsx', '/corrections/review/foreign-doc-2', '/corrections/review/:documentId')
    assert.match(html, /لا تملك صلاحية عرض هذا المستند/)
    assert.match(html, /محاكاة في الواجهة فقط/)
    assert.doesNotMatch(html, /class="card editor-panel"/)
  })

  test('the "back" link of the review page goes to the queue for a pending document and to the archive for an approved one', () => {
    assert.equal(backFromReviewPath(false), ROUTES.corrections)
    assert.equal(backFromReviewPath(true), ROUTES.archive)
  })
})
