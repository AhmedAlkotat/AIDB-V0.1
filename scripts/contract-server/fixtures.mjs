// Deterministic FIXTURES of the contract server. DEVELOPMENT AND TESTING ONLY.
//
// Everything here is fake and fixed: the same ids, names and timestamps on every start, so tests can assert exact values.
// The "passwords" are fixture values of this dev tool (they open nothing but this fake server). The canonical content is
// built with the SAME pure domain functions the frontend uses (src/domain/document/*), so the fixtures cannot drift from
// the canonical document model.

import { createDocument } from '../../src/domain/document/document.js'
import { createElement } from '../../src/domain/document/elements.js'
import { createSequentialIdGenerator } from '../../src/domain/document/ids.js'
import { serializeDocument } from '../../src/domain/document/serialization.js'

export const FIXTURE_NOW = '2026-01-15T09:00:00.000Z'

export const ACCOUNTS = [
  { id: 'usr-employee-1', identifier: 'employee', password: 'fixture-employee', displayName: 'موظف تجريبي (عقد)', role: 'employee', status: 'active' },
  { id: 'usr-employee-2', identifier: 'employee2', password: 'fixture-employee2', displayName: 'موظف آخر (عقد)', role: 'employee', status: 'active' },
  { id: 'usr-admin', identifier: 'admin', password: 'fixture-admin', displayName: 'المدير (عقد)', role: 'admin', status: 'active' },
  { id: 'usr-disabled', identifier: 'disabled', password: 'fixture-disabled', displayName: 'حساب معطل (عقد)', role: 'employee', status: 'deactivated' },
]

export const DEFAULT_SETTINGS = {
  uploads: { maxFileSizeMb: 10, maxSelectedPages: 100 },
  recycleBin: { autoDelete: true, retentionDays: 30 },
  audit: { categories: { approval: true, approvedEdits: true, employeeAccounts: true, restore: true, backups: true, authentication: true, uploads: true, processing: true }, retentionDays: 90 },
  backups: { scheduleEnabled: true, frequency: 'daily', time: '02:00', weekday: 5, retentionMode: 'count', retentionCount: 7, retentionDays: 30, localPath: '', externalPath: '' },
  storage: { warningPercent: 80, criticalPercent: 90 },
}

export const TEMPLATES = [
  { id: 'tpl-invoice', name: 'فاتورة (عقد)', documentType: 'invoice' },
  { id: 'tpl-letter', name: 'خطاب إداري (عقد)', documentType: 'administrativeRequest' },
]

// Deterministic extraction result of one page (what the AI would return; ids are unique inside the document).
export function fixtureElements(pageNumber, generateId) {
  return [
    createElement('heading', { content: { text: `عنوان الصفحة ${pageNumber}`, level: 1 }, source: { kind: 'ai' }, location: { x: 0.1, y: 0.05, width: 0.8, height: 0.06 } }, { generateId }),
    createElement('paragraph', { content: { text: `نص تجريبي للصفحة ${pageNumber}.` }, source: { kind: 'ai' } }, { generateId }),
    createElement('field', { content: { key: 'رقم', value: String(1000 + pageNumber) }, source: { kind: 'ai' } }, { generateId }),
    createElement('table', { content: { rows: [['البند', 'القيمة'], ['أ', String(pageNumber)]] }, source: { kind: 'ai' } }, { generateId }),
  ].map((element, order) => ({ ...element, order }))
}

// A canonical snapshot with every selected page processed (and optionally reviewed).
export function buildSnapshot({ id, name, totalPages, selectedPages, reviewed = false, processed = true }) {
  const generateId = createSequentialIdGenerator()
  const document = createDocument({ id, file: { name, size: 1024 * totalPages, mimeType: 'application/pdf', lastModified: 1_700_000_000_000 }, totalPages, selectedPages }, { generateId })
  const snapshot = serializeDocument(document, { includeOriginalExtraction: true })
  if (processed) {
    for (const page of snapshot.pages) {
      const elements = fixtureElements(page.pageNumber, generateId)
      page.processing = { status: 'succeeded', errorCode: null }
      page.originalExtraction = { elements: JSON.parse(JSON.stringify(elements)) }
      page.elements = elements
      if (reviewed) page.review = { status: 'reviewed', confirmedAt: FIXTURE_NOW }
    }
  }
  return snapshot
}

// A tiny, valid-looking PDF body so that the "original" download has bytes with the right type (it is NOT a real scan).
export const FIXTURE_PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

// The seed documents (see server.mjs): ready for review, approved, someone else's, and pending.
export function seedDocuments() {
  return [
    { id: 'fx-ready', name: 'تقرير قيد المراجعة.pdf', ownerId: 'usr-employee-1', createdAt: '2026-01-10T08:00:00.000Z', totalPages: 4, selectedPages: [1, 2, 3], snapshotOptions: {}, workflow: { phase: 'completed', queuedAt: '2026-01-10T08:00:00.000Z', startedAt: '2026-01-10T08:00:05.000Z', finishedAt: '2026-01-10T08:01:00.000Z', errorCode: null }, documentType: 'invoice', approved: false },
    { id: 'fx-approved', name: 'عقد معتمد.pdf', ownerId: 'usr-employee-1', createdAt: '2026-01-05T08:00:00.000Z', totalPages: 2, selectedPages: [1, 2], snapshotOptions: { reviewed: true }, workflow: { phase: 'completed', queuedAt: '2026-01-05T08:00:00.000Z', startedAt: '2026-01-05T08:00:05.000Z', finishedAt: '2026-01-05T08:01:00.000Z', errorCode: null }, documentType: 'contract', approved: true },
    { id: 'fx-other', name: 'مستند موظف آخر.pdf', ownerId: 'usr-employee-2', createdAt: '2026-01-12T08:00:00.000Z', totalPages: 1, selectedPages: [1], snapshotOptions: {}, workflow: { phase: 'completed', queuedAt: '2026-01-12T08:00:00.000Z', startedAt: '2026-01-12T08:00:05.000Z', finishedAt: '2026-01-12T08:01:00.000Z', errorCode: null }, documentType: null, approved: false },
    { id: 'fx-pending', name: 'مستند في الانتظار.pdf', ownerId: 'usr-employee-1', createdAt: '2026-01-14T08:00:00.000Z', totalPages: 2, selectedPages: [1, 2], snapshotOptions: { processed: false }, workflow: { phase: 'pending', queuedAt: '2026-01-14T08:00:00.000Z', startedAt: null, finishedAt: null, errorCode: null }, documentType: null, approved: false },
  ]
}
