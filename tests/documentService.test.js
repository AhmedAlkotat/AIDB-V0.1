// Batch E / Wave 1: the asynchronous document service (decision D2). Both adapters are tested against the same port:
//   - the development simulation around the in-memory store (what the screens use in 'mock' mode), and
//   - the HTTP adapter (what they use in 'http' mode), here with a scripted API client.
// The end-to-end behaviour of the HTTP adapter against the contract server is in contractServer.test.js.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMockAccountStore, MOCK_SESSION_KEY } from '../src/dev/mockAccountStore.js'
import { createMockContext } from '../src/dev/mockContext.js'
import { createMockDocumentService } from '../src/dev/mockDocumentService.js'
import { createMockSystemState } from '../src/dev/mockSystemState.js'
import { toListQuery, toMeta, toRecord, toSummary, toVersion } from '../src/services/documentDto.js'
import { API_ERROR, ApiError } from '../src/services/apiClient.js'
import { createPollingChangeFeed } from '../src/services/changeFeed.js'
import { createHttpDocumentService } from '../src/services/httpDocumentService.js'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { SystemError } from '../src/services/systemErrors.js'
import { makeSnapshot } from './sessionHelpers.js'

const NOW = '2026-06-01T12:00:00.000Z'
const memoryStorage = () => {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

// ---------------------------------------------------------------------------------------------------------------------
describe('mock adapter (development simulation behind the document service)', () => {
  function world(actor = 'employee') {
    const storage = memoryStorage()
    const documents = createMemoryDocumentStore({ now: () => NOW })
    const context = createMockContext({ storage, latencyMs: 0, accountStore: createMockAccountStore({ storage }), system: createMockSystemState({ storage }), documents })
    const signInAs = (identifier) => storage.setItem(MOCK_SESSION_KEY, JSON.stringify({ identifier }))
    signInAs(actor)
    const make = (name, init = {}) => documents.create({ name, snapshot: makeSnapshot({ selectedPages: [1, 2], totalPages: 2 }), ownerId: 'demo-employee', ...init })
    const service = createMockDocumentService({ context, store: documents, seed: () => {} })
    return { documents, service, signInAs, make }
  }

  test('reads are asynchronous and equal the synchronous peeks (which exist only for the first render)', async () => {
    const { service, make } = world()
    const id = make('تقرير.pdf')
    assert.equal(service.isMock, true)
    assert.deepEqual(await service.list(), service.peekSummaries())
    assert.deepEqual(await service.getSummary(id), service.peekSummary(id))
    assert.deepEqual(await service.getMeta(id), service.peekMeta(id))
    const record = await service.getDocument(id)
    assert.equal(record.id, id)
    assert.deepEqual(record.snapshot, service.peekDocument(id).snapshot)
    assert.ok(service.list() instanceof Promise)
  })

  test('an unknown or deleted document is null, never an exception; the deleted one disappears from the list', async () => {
    const { service, make, documents } = world()
    const id = make('a.pdf')
    assert.equal(await service.getSummary('nope'), null)
    assert.equal(await service.getDocument('nope'), null)
    assert.equal(await service.getMeta('nope'), null)
    assert.equal(service.peekDocument('nope'), null)
    documents.moveToTrash(id)
    assert.equal(await service.getSummary(id), null)
    assert.equal((await service.list()).length, 0)
  })

  test('what is returned is a copy: changing it never changes the stored document', async () => {
    const { service, make, documents } = world()
    const id = make('a.pdf')
    const record = await service.getDocument(id)
    record.snapshot.pages[0].elements.push({ id: 'x' })
    record.name = 'changed'
    assert.equal(documents.get(id).snapshot.pages[0].elements.length, 0)
    assert.equal(documents.get(id).name, 'a.pdf')
  })

  test('the original is the stored file; without one the read fails with notFound', async () => {
    const { service, make } = world()
    const file = new File([new Uint8Array(10)], 'scan.pdf', { type: 'application/pdf' })
    const withFile = make('with.pdf', { file })
    const without = make('without.pdf')
    assert.equal(await service.getOriginalFile(withFile), file)
    await assert.rejects(service.getOriginalFile(without), (error) => error.code === 'notFound')
  })

  test('versions are read by number; a number that does not exist is null', async () => {
    const { service, make } = world()
    const id = make('v.pdf', { approval: { status: 'approved' }, versions: [{ number: 1, approvedAt: NOW, approvedBy: 'demo-admin', approvedByName: 'مدير', snapshot: makeSnapshot({ selectedPages: [1], totalPages: 2 }) }] })
    assert.equal((await service.getVersion(id, 1)).number, 1)
    assert.equal(await service.getVersion(id, 2), null)
  })

  test('listPage applies ownership, view, filters, sort and paging on the "server" side', async () => {
    const { service, make, signInAs } = world('employee')
    make('أ.pdf', { workflow: { phase: 'pending', queuedAt: NOW } })
    make('ب.pdf', { documentType: 'invoice' })
    make('ج.pdf', { approval: { status: 'approved' } })
    make('د.pdf', { ownerId: 'someone-else' })
    const all = await service.listPage({})
    assert.equal(all.total, 3) // the other employee's document is never returned
    assert.equal((await service.listPage({ view: 'archive' })).total, 2) // every state but Pending (decision 12)
    assert.equal((await service.listPage({ view: 'queue' })).total, 2) // every state but Approved
    assert.deepEqual((await service.listPage({ query: 'ب' })).items.map((item) => item.name), ['ب.pdf'])
    assert.equal((await service.listPage({ type: 'invoice' })).total, 1)
    assert.equal((await service.listPage({ state: 'approved' })).total, 1)
    const paged = await service.listPage({ page: 2, pageSize: 2 })
    assert.equal(paged.items.length, 1)
    assert.equal(paged.total, 3)
    signInAs('admin')
    assert.equal((await service.listPage({})).total, 4) // the Admin sees every document
    signInAs('disabled')
    assert.equal((await service.listPage({})).total, 0) // no signed-in active user: nothing
  })

  test('subscribe tells about every change of the store until unsubscribed; reset forgets everything', async () => {
    const { service, make } = world()
    let calls = 0
    const stop = service.subscribe(() => (calls += 1))
    const id = make('a.pdf')
    assert.equal(calls, 1)
    stop()
    make('b.pdf')
    assert.equal(calls, 1)
    await service.reset()
    assert.equal(service.peekSummaries().length, 0)
    assert.equal(await service.getSummary(id), null)
  })

  test('the review session writes through the simulated server store (durable: false, so the UI says it is temporary)', async () => {
    const { service, make, documents } = world()
    const id = make('a.pdf')
    const store = service.getSessionStore(id)
    assert.equal(store, documents)
    assert.equal(store.isDurable, false)
    const page = { ...documents.get(id).snapshot.pages[0], review: { status: 'reviewed', confirmedAt: NOW } }
    await store.savePages(id, [page])
    assert.equal((await service.getSummary(id)).reviewedCount, 1)
  })

  test('the demonstration documents are created once, only through the service (idempotent)', async () => {
    const storage = memoryStorage()
    const documents = createMemoryDocumentStore({ now: () => NOW })
    const context = createMockContext({ storage, latencyMs: 0, accountStore: createMockAccountStore({ storage }), system: createMockSystemState({ storage }), documents })
    const service = createMockDocumentService({ context, store: documents })
    const first = await service.list()
    const second = await service.list()
    assert.equal(first.length, 2)
    assert.equal(second.length, 2)
    assert.ok(await service.getDocument('demo-review-8-pages'))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('document DTOs (the only place that knows both the contract and the screens\' shapes)', () => {
  const dto = {
    id: 'd1', name: 'عقد.pdf', ownerId: 'u1', state: 'readyForReview', createdAt: '2026-01-01T00:00:00.000Z', revision: 4, totalPages: 5, selectedCount: 2, reviewedCount: 1, firstSelectedPage: 2,
  }

  test('a summary gets the neutral defaults the screens expect; the server\'s state is kept, never derived here', () => {
    const summary = toSummary(dto)
    assert.equal(summary.state, 'readyForReview')
    assert.equal(summary.revision, 4)
    assert.equal(summary.approvalStatus, 'none')
    assert.equal(summary.documentType, null)
    assert.equal(summary.workflowPhase, 'completed')
    assert.equal(summary.updatedAt, dto.createdAt)
    assert.equal(summary.firstSelectedPage, 2)
    assert.equal(summary.usesMockProcessing, false)
    assert.equal(summary.deletedAt, null)
    assert.equal(toSummary({ ...dto, state: 'approved' }).approvalStatus, 'approved')
    assert.equal(toSummary(null), null)
  })

  test('a record has no file (fetched separately), server-owned bookkeeping is not invented, and the content is a copy', () => {
    const snapshot = makeSnapshot({ selectedPages: [1], totalPages: 1 })
    const record = toRecord({ summary: dto, snapshot, revision: 4, candidates: { 1: { attempt: 2, elements: [], receivedAt: dto.createdAt } } })
    assert.equal(record.file, null)
    assert.equal(record.revision, 4)
    assert.deepEqual(record.attempts, [])
    assert.deepEqual(record.versions, [])
    assert.equal(record.approval.status, 'none')
    assert.equal(record.candidates[1].attempt, 2)
    record.snapshot.pages[0].elements.push({})
    assert.equal(snapshot.pages[0].elements.length, 0)
    assert.equal(toRecord({ summary: dto }), null)
    assert.equal(toRecord(null), null)
  })

  test('meta and version DTOs', () => {
    assert.deepEqual(toMeta({ revision: 3, attempts: [{ id: 'a' }], versions: [{ number: 1 }], acceptedResultCounts: { 1: 2 } }).acceptedResultCounts, { 1: 2 })
    assert.equal(toMeta(undefined), null)
    assert.equal(toVersion({ number: 1, approvedAt: NOW, snapshot: makeSnapshot({ selectedPages: [1], totalPages: 1 }) }).approvedByName, null)
    assert.equal(toVersion({ number: 1 }), null)
  })

  test('the UI\'s archive filters become query parameters; "all" and blanks are left out', () => {
    assert.deepEqual(toListQuery({ view: 'archive', query: ' عقد ', type: 'all', state: 'approved', from: '2026-01-01', to: '', page: 2, pageSize: 25 }), {
      view: 'archive', q: 'عقد', type: undefined, state: 'approved', uploadedFrom: '2026-01-01', uploadedTo: undefined, sort: undefined, page: 2, pageSize: 25,
    })
    assert.equal(toListQuery({ view: 'all' }).view, undefined)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('HTTP adapter', () => {
  const summaryDto = (id, revision = 1, extra = {}) => ({ id, name: `${id}.pdf`, ownerId: 'u1', state: 'readyForReview', createdAt: '2026-01-01T00:00:00.000Z', revision, totalPages: 2, selectedCount: 2, reviewedCount: 0, ...extra })
  const envelope = (code, status, extra = {}) => new ApiError(status === 404 ? API_ERROR.notFound : API_ERROR.http, 'x', { status, details: { error: { code, message: code, ...extra } } })

  // A scripted client: `routes` maps "METHOD path" to a function(args) -> response or throws.
  function fakeClient(routes) {
    const calls = []
    const call = (method) => async (path, ...args) => {
      const options = method === 'get' || method === 'delete' ? args[0] : args[1]
      const body = method === 'get' || method === 'delete' ? undefined : args[0]
      calls.push({ method, path, body, options })
      const route = routes[`${method.toUpperCase()} ${path}`]
      if (!route) throw new Error(`unscripted ${method.toUpperCase()} ${path}`)
      return typeof route === 'function' ? route({ body, options }) : route
    }
    return { calls, client: { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete') } }
  }
  const manualFeed = () => {
    const listeners = new Set()
    return { feed: { subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)), notify: () => listeners.forEach((listener) => listener()) }, size: () => listeners.size }
  }

  test('is a real (not mock) durable adapter with no synchronous peeks', () => {
    const service = createHttpDocumentService({ client: fakeClient({}).client })
    assert.equal(service.isMock, false)
    assert.equal(service.isDurable, true)
    for (const name of ['peekSummaries', 'peekSummary', 'peekMeta', 'peekDocument']) assert.equal(service[name], undefined)
  })

  test('listPage sends the query as parameters and maps every summary; list() gathers every page', async () => {
    const pages = { 1: [summaryDto('a'), summaryDto('b')], 2: [summaryDto('c')] }
    const { client, calls } = fakeClient({ 'GET /documents': ({ options }) => ({ items: pages[options.query.page] ?? [], total: 3, page: options.query.page, pageSize: options.query.pageSize }) })
    const service = createHttpDocumentService({ client })
    const page = await service.listPage({ view: 'archive', query: 'عقد', page: 1, pageSize: 2 })
    assert.deepEqual(calls[0].options.query, { view: 'archive', q: 'عقد', type: undefined, state: undefined, uploadedFrom: undefined, uploadedTo: undefined, sort: undefined, page: 1, pageSize: 2 })
    assert.equal(page.total, 3)
    assert.equal(page.items[0].state, 'readyForReview')
    const all = await service.list()
    assert.deepEqual(all.map((item) => item.id), ['a', 'b', 'c'])
  })

  test('list() stops when the server returns nothing more (no endless loop on a wrong total)', async () => {
    let requests = 0
    const { client } = fakeClient({ 'GET /documents': () => ({ items: ++requests === 1 ? [summaryDto('a')] : [], total: 999, page: requests, pageSize: 200 }) })
    assert.equal((await createHttpDocumentService({ client }).list()).length, 1)
    assert.equal(requests, 2)
  })

  test('getSummary: unknown or hidden is null; any other failure is a domain error; it never becomes the base of a write', async () => {
    const outcomes = { d1: summaryDto('d1', 7), gone: envelope('notFound', 404), down: new ApiError(API_ERROR.server, 'x', { status: 503 }) }
    const { client } = fakeClient(Object.fromEntries(Object.entries(outcomes).map(([id, value]) => [`GET /documents/${id}/status`, () => { if (value instanceof Error) throw value; return value }])))
    const service = createHttpDocumentService({ client })
    assert.equal((await service.getSummary('d1')).revision, 7)
    assert.equal(service.knownRevision('d1'), undefined) // a summary read is not the revision of any loaded content
    assert.equal(await service.getSummary('gone'), null)
    await assert.rejects(service.getSummary('down'), (error) => error instanceof SystemError && error.code === 'unknown')
  })

  test('getDocument: a record without a file; null when missing; "forbidden" and "network" are reported, not hidden', async () => {
    const snapshot = makeSnapshot({ selectedPages: [1, 2], totalPages: 2 })
    const { client } = fakeClient({
      'GET /documents/d1': { summary: summaryDto('d1', 3), snapshot, revision: 3, candidates: {} },
      'GET /documents/gone': () => { throw envelope('notFound', 404) },
      'GET /documents/secret': () => { throw envelope('forbidden', 403) },
      'GET /documents/offline': () => { throw new ApiError(API_ERROR.network, 'down') },
    })
    const service = createHttpDocumentService({ client })
    const record = await service.getDocument('d1')
    assert.equal(record.file, null)
    assert.equal(record.revision, 3)
    assert.equal(service.knownRevision('d1'), 3)
    assert.equal(await service.getDocument('gone'), null)
    await assert.rejects(service.getDocument('secret'), (error) => error.code === 'forbidden')
    await assert.rejects(service.getDocument('offline'), (error) => error.code === 'network')
  })

  test('getVersion: "no such version" is null; the content is returned for a version that exists', async () => {
    const { client } = fakeClient({
      'GET /documents/d1/versions/1': { number: 1, approvedAt: NOW, approvedBy: 'u', approvedByName: 'مدير', snapshot: makeSnapshot({ selectedPages: [1], totalPages: 1 }) },
      'GET /documents/d1/versions/9': () => { throw envelope('noSuchVersion', 404) },
    })
    const service = createHttpDocumentService({ client })
    assert.equal((await service.getVersion('d1', 1)).approvedByName, 'مدير')
    assert.equal(await service.getVersion('d1', 9), null)
  })

  test('the original is downloaded as a binary (with the bearer token, never a bare URL) and handed over as a File', async () => {
    const { client, calls } = fakeClient({ 'GET /documents/d1/original': { blob: new Blob(['%PDF']), contentType: 'application/pdf', fileName: 'تقرير.pdf' } })
    const file = await createHttpDocumentService({ client }).getOriginalFile('d1')
    assert.equal(calls[0].options.responseType, 'blob')
    assert.equal(file.name, 'تقرير.pdf')
    assert.equal(file.type, 'application/pdf')
    assert.equal(file.size, 4)
  })

  test('document ids are encoded in the path', async () => {
    const { client, calls } = fakeClient({ 'GET /documents/a%2Fb%20c/meta': { revision: 1, attempts: [], versions: [], acceptedResultCounts: {} } })
    await createHttpDocumentService({ client }).getMeta('a/b c')
    assert.equal(calls[0].path, '/documents/a%2Fb%20c/meta')
  })

  test('a cancelled read (the screen was left) is not turned into a service error', async () => {
    const { client } = fakeClient({ 'GET /documents/d1/meta': () => { throw Object.assign(new Error('left'), { name: 'AbortError' }) } })
    await assert.rejects(createHttpDocumentService({ client }).getMeta('d1'), (error) => error.name === 'AbortError')
  })

  describe('the session store: writes with lost-update protection', () => {
    const pageOf = (n) => ({ id: `p${n}`, pageNumber: n, elements: [] })
    const snapshot = makeSnapshot({ selectedPages: [1, 2], totalPages: 2 })
    const documentRoute = (revision) => ({ summary: summaryDto('d1', revision), snapshot, revision, candidates: {} })

    test('a save is based on the revision of the content that was LOADED, adopts the revision the server answers, and tells the screens', async () => {
      const { client, calls } = fakeClient({ 'GET /documents/d1': documentRoute(5), 'PATCH /documents/d1/pages': ({ body }) => ({ revision: body.baseRevision + 1 }) })
      const { feed } = manualFeed()
      let signals = 0
      feed.subscribe(() => (signals += 1))
      const service = createHttpDocumentService({ client, feed })
      const record = await service.getDocument('d1')
      const store = service.getSessionStore('d1', { revision: record.revision })
      await store.savePages('d1', [pageOf(2)])
      assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ['get /documents/d1', 'patch /documents/d1/pages']) // no status read is needed or made
      assert.equal(calls[1].body.baseRevision, 5)
      assert.deepEqual(calls[1].body.pages, [pageOf(2)])
      assert.equal(store.baseRevision(), 6)
      assert.equal(service.knownRevision('d1'), 6)
      await store.saveDraft('d1', { pages: [pageOf(1), pageOf(2)] })
      assert.equal(calls.at(-1).body.baseRevision, 6) // based on what the previous save produced
      assert.equal(calls.at(-1).body.pages.length, 2)
      assert.equal(signals, 2)
    })

    test('REGRESSION (H1): polling, getSummary, list, listPage and getMeta never move the base of a save', async () => {
      let serverRevision = 5
      const { client, calls } = fakeClient({
        'GET /documents/d1': () => documentRoute(5),
        'GET /documents/d1/status': () => summaryDto('d1', serverRevision),
        'GET /documents/d1/meta': () => ({ revision: serverRevision, attempts: [], versions: [], acceptedResultCounts: {} }),
        'GET /documents': () => ({ items: [summaryDto('d1', serverRevision)], total: 1, page: 1, pageSize: 200 }),
        'PATCH /documents/d1/pages': () => ({ revision: serverRevision + 1 }),
      })
      const service = createHttpDocumentService({ client })
      const record = await service.getDocument('d1')
      const store = service.getSessionStore('d1', { revision: record.revision })
      serverRevision = 6 // another writer got in after the session loaded revision 5
      await service.getSummary('d1')
      await service.getMeta('d1')
      await service.list()
      await service.listPage({ view: 'archive' })
      assert.equal(store.baseRevision(), 5)
      assert.equal(service.knownRevision('d1'), 5)
      await store.savePages('d1', [pageOf(1)])
      // The stale content is saved as based on 5, so the server can refuse it.
      assert.equal(calls.filter((call) => call.path === '/documents/d1/pages')[0].body.baseRevision, 5)
    })

    test('REGRESSION (H1): a LATE answer cannot take a revision back (no conflict with the session\'s own save)', async () => {
      let releaseSummary
      let revisionAtServer = 5
      const { client } = fakeClient({
        'GET /documents/d1': documentRoute(5),
        'GET /documents/d1/status': () => new Promise((resolve) => (releaseSummary = () => resolve(summaryDto('d1', 5)))), // a slow poll that started before the save
        'PATCH /documents/d1/pages': () => ({ revision: (revisionAtServer += 1) }),
      })
      const service = createHttpDocumentService({ client })
      const record = await service.getDocument('d1')
      const store = service.getSessionStore('d1', { revision: record.revision })
      const slowPoll = service.getSummary('d1') // asks while the revision is 5 ...
      await store.savePages('d1', [pageOf(1)]) // ... the save makes it 6 ...
      releaseSummary() // ... and the old answer (5) arrives afterwards
      await slowPoll
      assert.equal(store.baseRevision(), 6)
      assert.equal(service.knownRevision('d1'), 6)
      await store.savePages('d1', [pageOf(1)])
      assert.equal(store.baseRevision(), 7)
    })

    test('REGRESSION (H1): a late getDocument answer with an older revision cannot move the known revision back, and another load does not move an open session', async () => {
      let revision = 5
      const { client } = fakeClient({ 'GET /documents/d1': () => documentRoute(revision) })
      const service = createHttpDocumentService({ client })
      const first = await service.getDocument('d1')
      const store = service.getSessionStore('d1', { revision: first.revision })
      revision = 9
      await service.getDocument('d1') // another load of the same document
      assert.equal(service.knownRevision('d1'), 9)
      assert.equal(store.baseRevision(), 5) // the open session still saves on the content IT loaded
      revision = 7
      await service.getDocument('d1') // a late, older answer
      assert.equal(service.knownRevision('d1'), 9)
    })

    test('a save is refused, and nothing is sent, when no loaded revision exists (a revision is never guessed from a read)', async () => {
      const { client, calls } = fakeClient({ 'GET /documents/d1/status': summaryDto('d1', 5) })
      const service = createHttpDocumentService({ client })
      await service.getSummary('d1')
      const store = service.getSessionStore('d1')
      await assert.rejects(store.savePages('d1', [pageOf(1)]), (error) => error.code === 'invalidState')
      assert.deepEqual(calls.map((call) => call.method), ['get']) // only the status read, no PATCH
      // Without an explicit revision the store takes the one of the last getDocument.
      const loaded = fakeClient({ 'GET /documents/d1': documentRoute(3), 'PATCH /documents/d1/pages': { revision: 4 } })
      const other = createHttpDocumentService({ client: loaded.client })
      await other.getDocument('d1')
      await other.getSessionStore('d1').savePages('d1', [pageOf(1)])
      assert.equal(loaded.calls.at(-1).body.baseRevision, 3)
    })

    test('a STALE save is refused with revisionConflict: nothing is overwritten, the base stays, the edits are untouched, and a retry is refused again (no silent rebase)', async () => {
      let attempts = 0
      const { client, calls } = fakeClient({ 'PATCH /documents/d1/pages': () => { attempts += 1; throw envelope('revisionConflict', 409, { details: { currentRevision: 9 } }) } })
      const service = createHttpDocumentService({ client })
      const store = service.getSessionStore('d1', { revision: 5 })
      const unsaved = [pageOf(1)]
      await assert.rejects(store.savePages('d1', unsaved), (error) => error.code === 'revisionConflict' && error.details.currentRevision === 9)
      assert.equal(store.baseRevision(), 5)
      assert.deepEqual(unsaved, [pageOf(1)])
      await assert.rejects(store.savePages('d1', unsaved), (error) => error.code === 'revisionConflict')
      assert.equal(attempts, 2)
      assert.deepEqual(calls.map((call) => call.body.baseRevision), [5, 5]) // the retry is still based on revision 5
    })

    test('a network failure or an expired session rejects the save and keeps everything (the session shows "failed", the edits stay)', async () => {
      let failure = new ApiError(API_ERROR.network, 'down')
      const { client } = fakeClient({ 'PATCH /documents/d1/pages': () => { throw failure } })
      const service = createHttpDocumentService({ client })
      const store = service.getSessionStore('d1', { revision: 5 })
      await assert.rejects(store.savePages('d1', [pageOf(1)]), (error) => error.code === 'network')
      failure = new ApiError(API_ERROR.unauthorized, 'x', { status: 401 })
      await assert.rejects(store.savePages('d1', [pageOf(1)]), (error) => error.code === 'unauthenticated')
      assert.equal(store.baseRevision(), 5)
    })

    test('a lock error from the server is reported as it is (the server decides who may write)', async () => {
      const { client } = fakeClient({ 'PATCH /documents/d1/pages': () => { throw envelope('lockHeld', 409) } })
      await assert.rejects(createHttpDocumentService({ client }).getSessionStore('d1', { revision: 5 }).savePages('d1', [pageOf(1)]), (error) => error.code === 'lockHeld')
    })

    test('the server owns attempts, accepted results, candidates and versions: the store has no peek / updateMeta for the session to write', () => {
      const store = createHttpDocumentService({ client: fakeClient({}).client }).getSessionStore('d1', { revision: 1 })
      assert.equal(store.isDurable, true)
      assert.equal(store.peek, undefined)
      assert.equal(store.updateMeta, undefined)
    })

    test('after an acknowledged approval / new version the session moves FORWARD to the revision the server produced, never back; remembering the page never fails the user', async () => {
      let revision = 6
      const { client, calls } = fakeClient({ 'GET /documents/d1/status': () => summaryDto('d1', revision), 'PUT /documents/d1/last-visited-page': () => { throw new ApiError(API_ERROR.network, 'down') } })
      const service = createHttpDocumentService({ client })
      const store = service.getSessionStore('d1', { revision: 5 })
      await store.setApprovalStatus('d1', 'approved')
      assert.equal(store.baseRevision(), 6)
      revision = 4 // an older answer (impossible on a real server, possible for a late response)
      await store.setApprovalStatus('d1', 'none')
      assert.equal(store.baseRevision(), 6)
      assert.doesNotThrow(() => store.setLastVisitedPage('d1', 2))
      await tick()
      assert.equal(calls.at(-1).body.pageNumber, 2)
    })
  })

  test('subscribers get the feed\'s signals (polling now, a server-sent event stream later); reset forgets revisions', async () => {
    const { client } = fakeClient({ 'GET /documents/d1/status': summaryDto('d1', 2) })
    const { feed, size } = manualFeed()
    const service = createHttpDocumentService({ client, feed })
    let signals = 0
    const stop = service.subscribe(() => (signals += 1))
    feed.notify()
    assert.equal(signals, 1)
    await service.getSummary('d1')
    assert.equal(service.knownRevision('d1'), undefined) // a summary read does not make a revision "known"
    await service.getDocument('d1').catch(() => {})
    service.reset()
    assert.equal(service.knownRevision('d1'), undefined)
    assert.equal(signals, 2) // reset tells the screens to re-read
    stop()
    assert.equal(size(), 0)
  })

  test('the default feed is a polling feed', () => {
    const service = createHttpDocumentService({ client: fakeClient({}).client })
    assert.equal(typeof service.subscribe, 'function')
    assert.equal(createPollingChangeFeed().intervalMs, 5000)
  })
})
