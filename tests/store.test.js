import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMemoryDocumentStore, documentStore, StorageError } from '../src/services/documentStore.js'
import { DEMO_REVIEW_IDS, seedDemoReviewDocuments } from '../src/data/mock/reviewDemo.mock.js'
import { createDemoPdfBytes } from '../src/data/mock/demoPdf.js'
import { parseDocumentJson } from '../src/domain/document/serialization.js'
import { makeSnapshot } from './sessionHelpers.js'

describe('temporary document store', () => {
  test('is explicitly not durable', () => {
    assert.equal(createMemoryDocumentStore().isDurable, false)
    assert.equal(documentStore.isDurable, false)
  })

  test('creates, reads and lists documents with their review progress', () => {
    const store = createMemoryDocumentStore()
    const snapshot = makeSnapshot({ selectedPages: [1, 3], totalPages: 5 })
    snapshot.pages[0].review = { status: 'reviewed', confirmedAt: '2026-11-23T10:00:00.000Z' }
    const id = store.create({ name: 'ملف', snapshot, kind: 'upload' })
    const record = store.get(id)
    assert.equal(record.name, 'ملف')
    assert.equal(record.approval.status, 'none')
    assert.deepEqual(store.list().map(({ id: listed, selectedCount, reviewedCount, totalPages }) => ({ listed, selectedCount, reviewedCount, totalPages })), [
      { listed: id, selectedCount: 2, reviewedCount: 1, totalPages: 5 },
    ])
    assert.equal(store.get('missing'), null)
  })

  test('does not share mutable data with callers', () => {
    const store = createMemoryDocumentStore()
    const snapshot = makeSnapshot()
    const id = store.create({ name: 'ملف', snapshot })
    snapshot.pages[0].id = 'changed'
    const first = store.get(id)
    first.snapshot.pages[0].id = 'changed too'
    assert.notEqual(store.get(id).snapshot.pages[0].id, 'changed')
    assert.notEqual(store.get(id).snapshot.pages[0].id, 'changed too')
  })

  test('saveDraft resolves only after the data is stored', async () => {
    const store = createMemoryDocumentStore()
    const id = store.create({ name: 'ملف', snapshot: makeSnapshot() })
    const next = makeSnapshot()
    next.pages[0].elements = []
    next.pages[0].id = 'stored-page'
    await store.saveDraft(id, next)
    assert.equal(store.get(id).snapshot.pages[0].id, 'stored-page')
  })

  test('a failing storage rejects and keeps the previous data', async () => {
    const store = createMemoryDocumentStore()
    const snapshot = makeSnapshot()
    const id = store.create({ name: 'ملف', snapshot })
    store.setSimulatedFailure(true)
    const changed = makeSnapshot()
    changed.pages[0].id = 'never-stored'
    await assert.rejects(store.saveDraft(id, changed), (error) => error instanceof StorageError && error.code === 'STORAGE_UNAVAILABLE')
    assert.equal(store.get(id).snapshot.pages[0].id, snapshot.pages[0].id)
    store.setSimulatedFailure(false)
    await store.saveDraft(id, changed)
    assert.equal(store.get(id).snapshot.pages[0].id, 'never-stored')
  })

  test('saving an unknown document is rejected', async () => {
    const store = createMemoryDocumentStore()
    await assert.rejects(store.saveDraft('nope', makeSnapshot()), (error) => error.code === 'DOCUMENT_NOT_FOUND')
  })

  test('remembers the last visited page and notifies subscribers', async () => {
    const store = createMemoryDocumentStore()
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })
    const id = store.create({ name: 'ملف', snapshot: makeSnapshot() })
    store.setLastVisitedPage(id, 3)
    assert.equal(store.get(id).lastVisitedPage, 3)
    await store.saveDraft(id, makeSnapshot())
    assert.equal(notifications, 2)
    unsubscribe()
    store.create({ name: 'آخر', snapshot: makeSnapshot() })
    assert.equal(notifications, 2)
  })
})

describe('demo review documents (mock data)', () => {
  test('seeding is idempotent and creates a reviewable and an approved mock document', () => {
    const store = createMemoryDocumentStore()
    seedDemoReviewDocuments(store)
    seedDemoReviewDocuments(store)
    assert.equal(store.list().length, 2)

    const toReview = store.get(DEMO_REVIEW_IDS.toReview)
    assert.equal(toReview.kind, 'demo')
    assert.deepEqual(toReview.snapshot.selectedPages, [1, 2, 3, 5, 6, 8])
    assert.equal(toReview.snapshot.file.totalPages, 8)
    assert.ok(toReview.snapshot.pages.every((page) => page.review.status === 'notReviewed' && page.elements.length === 0))
    assert.ok(toReview.file instanceof File)

    const approved = store.get(DEMO_REVIEW_IDS.approved)
    assert.equal(approved.approval.status, 'approved')
    assert.ok(approved.snapshot.pages.every((page) => page.review.status === 'reviewed' && page.elements.length > 0))
  })

  test('the seeded snapshots are valid canonical documents', () => {
    const store = createMemoryDocumentStore()
    seedDemoReviewDocuments(store)
    for (const id of Object.values(DEMO_REVIEW_IDS)) {
      const result = parseDocumentJson(JSON.stringify(store.get(id).snapshot))
      assert.equal(result.ok, true, JSON.stringify(result.errors))
    }
  })

  test('the generated demo PDF is a real multi-page PDF', () => {
    const bytes = createDemoPdfBytes(4)
    const text = Buffer.from(bytes).toString('latin1')
    assert.ok(text.startsWith('%PDF-1.4'))
    assert.ok(text.trimEnd().endsWith('%%EOF'))
    assert.match(text, /\/Count 4/)
    // The cross-reference table points at real objects.
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1])
    assert.ok(text.slice(xrefAt).startsWith('xref'))
  })
})
