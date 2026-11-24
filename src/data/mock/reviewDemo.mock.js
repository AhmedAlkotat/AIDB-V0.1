// DEMO DATA ONLY: two clearly labelled demonstration documents for the review
// page, created in the TEMPORARY in-memory store (never saved anywhere else):
//
//   1. a document to review: 8-page demo PDF, pages 1, 2, 3, 5, 6 and 8 selected
//      (4 and 7 are not part of the review), nothing extracted yet. Page 8
//      fails its first mock extraction so the failure/retry flow can be tried.
//   2. an APPROVED document (as a mock record) to show that approved documents
//      are read-only. Nothing is approved for real: there is no backend.

import { APPROVAL_STATUS } from '../../domain/document/approval.js'
import { createDocument } from '../../domain/document/document.js'
import { serializeDocument } from '../../domain/document/serialization.js'
import { ACTION, createEditorReducer, createInitialEditorState } from '../../state/documentSession/documentReducer.js'
import { buildMockElements } from '../../services/mockProcessingService.js'
import { createDemoPdfFile } from './demoPdf.js'

export const DEMO_REVIEW_IDS = Object.freeze({
  toReview: 'demo-review-8-pages',
  approved: 'demo-approved-3-pages',
})

function snapshotOf(document) {
  return serializeDocument(document, { includeOriginalExtraction: true })
}

function buildToReview() {
  const file = createDemoPdfFile(8, 'demo-review.pdf', 'AIDP DEMO - TO REVIEW')
  const document = createDocument({
    file: { name: file.name, size: file.size, mimeType: file.type, lastModified: file.lastModified },
    totalPages: 8,
    selectedPages: [1, 2, 3, 5, 6, 8],
  })
  return { file, snapshot: snapshotOf(document) }
}

function buildApproved() {
  const file = createDemoPdfFile(3, 'demo-approved.pdf', 'AIDP DEMO - APPROVED')
  const reducer = createEditorReducer()
  let state = createInitialEditorState(
    createDocument({
      file: { name: file.name, size: file.size, mimeType: file.type, lastModified: file.lastModified },
      totalPages: 3,
    }),
  )
  const at = new Date().toISOString()
  for (const page of state.document.pages) {
    state = reducer(state, { type: ACTION.extractionApplied, pageNumber: page.pageNumber, elements: buildMockElements(page.pageNumber, 1) })
    state = reducer(state, { type: ACTION.pageReviewConfirmed, pageNumber: page.pageNumber, at })
  }
  return { file, snapshot: snapshotOf(state.document) }
}

// Idempotent: creates the demo documents only once per store.
export function seedDemoReviewDocuments(store) {
  if (!store.has(DEMO_REVIEW_IDS.toReview)) {
    const { file, snapshot } = buildToReview()
    store.create({
      id: DEMO_REVIEW_IDS.toReview,
      name: 'مستند تجريبي للمراجعة (٨ صفحات، ٦ منها مختارة)',
      file,
      snapshot,
      kind: 'demo',
    })
  }
  if (!store.has(DEMO_REVIEW_IDS.approved)) {
    const { file, snapshot } = buildApproved()
    store.create({
      id: DEMO_REVIEW_IDS.approved,
      name: 'مستند تجريبي معتمد (٣ صفحات)',
      file,
      snapshot,
      kind: 'demo',
      approval: { status: APPROVAL_STATUS.approved },
    })
  }
}
