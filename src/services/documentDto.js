// Translation between the PROPOSED document DTOs (docs/api/openapi.draft.yaml) and the shapes the screens and the review
// session already use (the store summary and the store record, see documentStore.js). It is the only place that knows
// both, so a change in the real contract is a change here and not in the screens.
//
// The server is authoritative: it derives the document STATE, owns attempts, accepted results, versions, ownership and
// permissions. Nothing here derives or invents those; missing optional fields only get the neutral defaults the
// screens expect.

import { DEFAULT_WORKFLOW } from '../domain/document/lifecycle.js'

const orNull = (value) => (value === undefined ? null : value)
const orZero = (value) => (Number.isFinite(value) ? value : 0)

// DocumentSummary DTO -> the summary the lists, the dashboard and the review header use.
export function toSummary(dto) {
  if (!dto || typeof dto !== 'object') return null
  return {
    id: dto.id,
    name: dto.name ?? '',
    kind: 'upload',
    ownerId: orNull(dto.ownerId),
    state: dto.state,
    workflowPhase: dto.workflowPhase ?? DEFAULT_WORKFLOW.phase,
    failureCode: orNull(dto.failureCode),
    queuedAt: orNull(dto.queuedAt),
    startedAt: orNull(dto.startedAt),
    finishedAt: orNull(dto.finishedAt),
    queuePosition: orNull(dto.queuePosition),
    documentType: orNull(dto.documentType),
    template: dto.template ? { ...dto.template } : null,
    fileKind: dto.fileKind ?? 'pdf',
    versionCount: orZero(dto.versionCount),
    latestVersion: orNull(dto.latestVersion),
    approvedAt: orNull(dto.approvedAt),
    approvedByName: orNull(dto.approvedByName),
    approvalStatus: dto.approvalStatus ?? (dto.state === 'approved' ? 'approved' : 'none'),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt ?? dto.createdAt,
    revision: orZero(dto.revision),
    totalPages: orZero(dto.totalPages),
    selectedCount: orZero(dto.selectedCount),
    processingCount: orZero(dto.processingCount),
    processedCount: orZero(dto.processedCount),
    failedPageCount: orZero(dto.failedPageCount),
    reviewedCount: orZero(dto.reviewedCount),
    lastVisitedPage: orNull(dto.lastVisitedPage),
    firstSelectedPage: orNull(dto.firstSelectedPage),
    deletedAt: null,
    deletedBy: null,
    // Never simulated by a real server.
    usesMockProcessing: false,
    autoProcessOnOpen: false,
  }
}

// DocumentMeta DTO -> what useDocumentMeta returns.
export function toMeta(dto) {
  if (!dto || typeof dto !== 'object') return null
  return {
    revision: orZero(dto.revision),
    attempts: Array.isArray(dto.attempts) ? dto.attempts.map((entry) => ({ ...entry })) : [],
    versions: Array.isArray(dto.versions) ? dto.versions.map((entry) => ({ ...entry })) : [],
    acceptedResultCounts: dto.acceptedResultCounts && typeof dto.acceptedResultCounts === 'object' ? { ...dto.acceptedResultCounts } : {},
    workflow: { ...DEFAULT_WORKFLOW },
    documentType: orNull(dto.documentType),
    template: dto.template ? { ...dto.template } : null,
  }
}

// DocumentRecord DTO -> the record createReviewSession expects (`file` is null: the original is fetched separately).
export function toRecord(dto) {
  if (!dto || typeof dto !== 'object' || !dto.summary || !dto.snapshot) return null
  const summary = toSummary(dto.summary)
  return {
    id: summary.id,
    name: summary.name,
    file: null,
    kind: 'upload',
    ownerId: summary.ownerId,
    usesMockProcessing: false,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    approval: { status: summary.approvalStatus },
    lastVisitedPage: summary.lastVisitedPage,
    workflow: { phase: summary.workflowPhase, queuedAt: summary.queuedAt, startedAt: summary.startedAt, finishedAt: summary.finishedAt, errorCode: summary.failureCode },
    // Attempts, accepted results and versions are SERVER-owned: the review session reads them through the metadata, it
    // does not keep them here.
    attempts: [],
    resultHistory: {},
    candidates: dto.candidates && typeof dto.candidates === 'object' ? JSON.parse(JSON.stringify(dto.candidates)) : {},
    versions: [],
    documentType: summary.documentType,
    template: summary.template,
    autoProcessOnOpen: false,
    snapshot: JSON.parse(JSON.stringify(dto.snapshot)),
    revision: orZero(dto.revision ?? summary.revision),
  }
}

// Version DTO -> the stored-version shape the read-only viewer uses.
export function toVersion(dto) {
  if (!dto || typeof dto !== 'object' || !dto.snapshot) return null
  return {
    number: dto.number,
    approvedAt: dto.approvedAt,
    approvedBy: orNull(dto.approvedBy),
    approvedByName: orNull(dto.approvedByName),
    snapshot: JSON.parse(JSON.stringify(dto.snapshot)),
  }
}

// Archive/queue query as the UI states it -> the query string parameters of GET /documents.
export function toListQuery({ view, query, type, state, from, to, sort, page, pageSize } = {}) {
  return {
    view: view && view !== 'all' ? view : undefined,
    q: query ? String(query).trim() : undefined,
    type: type && type !== 'all' ? type : undefined,
    state: state && state !== 'all' ? state : undefined,
    uploadedFrom: from || undefined,
    uploadedTo: to || undefined,
    sort,
    page,
    pageSize,
  }
}
