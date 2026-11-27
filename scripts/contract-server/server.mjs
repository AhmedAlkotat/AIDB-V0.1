// AIDP contract server — a DEVELOPMENT AND TESTING tool. It is NOT the backend and NOT part of the application.
//
// It speaks the PROPOSED contract of docs/api/openapi.draft.yaml with deterministic fixtures (fixtures.mjs), so the
// frontend's HTTP adapters (asynchronous document service, API client, error mapping, token handling) can be exercised
// before the real FastAPI backend exists. Passing against it proves only that the frontend matches the DRAFT; it says
// nothing about the real backend, whose contract is not agreed (docs/api/questions.md).
//
//   node scripts/contract-server/server.mjs [--port 5301]
//   point the frontend at it:  VITE_API_MODE=http VITE_API_BASE_URL=http://127.0.0.1:5301/api/v1
//
// Built on Node's own `http` module: no dependency. Listens on 127.0.0.1 only. State is in memory and starts identical
// every time. Operations the server does not implement answer 501 with the standard error envelope (they are listed in
// ROUTES with `implemented: false`, so the table always covers the whole contract).
//
// Simulation controls (NOT part of the contract) live under /__contract/ : reset, expire-access-tokens, revoke-refresh,
// fail-next, advance-clock, bump-revision, process, set-storage-full, take-lock.

import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { createDocument } from '../../src/domain/document/document.js'
import { getDocumentState } from '../../src/domain/document/lifecycle.js'
import { buildExportDataset, buildExportFileName, buildJsonExport, EXPORT_FORMAT_INFO } from '../../src/domain/document/exportScope.js'
import { createSequentialIdGenerator } from '../../src/domain/document/ids.js'
import { serializeDocument } from '../../src/domain/document/serialization.js'
import { appendApprovedVersion, getVersion, latestVersion, summarizeVersions } from '../../src/domain/document/versions.js'
import { ACCOUNTS, buildSnapshot, DEFAULT_SETTINGS, FIXTURE_PDF, fixtureElements, seedDocuments, TEMPLATES } from './fixtures.mjs'

export const API_PREFIX = '/api/v1'
const ACCESS_TOKEN_SECONDS = 900
const MB = 1024 * 1024
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png']

class HttpError extends Error {
  constructor(status, code, message = code, { fields, details } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }
}
const fail = (status, code, message, extra) => {
  throw new HttpError(status, code, message, extra)
}

// ---- the route table: EVERY operation of the draft contract appears here --------------------------------------------
// [operationId, method, path template, implemented, role: 'public' | 'user' | 'admin']
export const ROUTES = [
  ['login', 'POST', '/auth/login', true, 'public'],
  ['refreshSession', 'POST', '/auth/refresh', true, 'public'],
  ['logout', 'POST', '/auth/logout', true, 'user'],
  ['getSession', 'GET', '/auth/session', true, 'user'],
  ['listEmployees', 'GET', '/employees', true, 'admin'],
  ['createEmployee', 'POST', '/employees', true, 'admin'],
  ['updateEmployee', 'PATCH', '/employees/{employeeId}', true, 'admin'],
  ['setEmployeePassword', 'PUT', '/employees/{employeeId}/password', true, 'admin'],
  ['deactivateEmployee', 'POST', '/employees/{employeeId}/deactivate', true, 'admin'],
  ['reactivateEmployee', 'POST', '/employees/{employeeId}/reactivate', true, 'admin'],
  ['getSettings', 'GET', '/settings', true, 'admin'],
  ['getLimits', 'GET', '/settings/limits', true, 'user'],
  ['previewSettingsImpact', 'POST', '/settings/{section}/preview', true, 'admin'],
  ['updateSettingsSection', 'PUT', '/settings/{section}', true, 'admin'],
  ['getStorageStatus', 'GET', '/storage/status', true, 'admin'],
  ['listNotifications', 'GET', '/notifications', true, 'user'],
  ['markNotificationRead', 'POST', '/notifications/{notificationId}/read', true, 'user'],
  ['markAllNotificationsRead', 'POST', '/notifications/read-all', true, 'user'],
  ['listDeletedDocuments', 'GET', '/recycle-bin', true, 'admin'],
  ['moveDocumentToBin', 'POST', '/documents/{documentId}/trash', true, 'admin'],
  ['restoreDocument', 'POST', '/recycle-bin/{documentId}/restore', true, 'admin'],
  ['purgeDocument', 'DELETE', '/recycle-bin/{documentId}', true, 'admin'],
  ['listBackups', 'GET', '/backups', false, 'admin'],
  ['createBackup', 'POST', '/backups', false, 'admin'],
  ['setBackupProtected', 'PUT', '/backups/{backupId}/protection', false, 'admin'],
  ['verifyBackup', 'POST', '/backups/{backupId}/verify', false, 'admin'],
  ['restoreBackup', 'POST', '/backups/{backupId}/restore', false, 'admin'],
  ['listAuditEntries', 'GET', '/audit-log', true, 'admin'],
  ['listTemplates', 'GET', '/templates', true, 'user'],
  ['registerDocument', 'POST', '/documents', true, 'user'],
  ['listDocuments', 'GET', '/documents', true, 'user'],
  ['getDocument', 'GET', '/documents/{documentId}', true, 'user'],
  ['getDocumentStatus', 'GET', '/documents/{documentId}/status', true, 'user'],
  ['getDocumentMeta', 'GET', '/documents/{documentId}/meta', true, 'user'],
  ['getDocumentOriginal', 'GET', '/documents/{documentId}/original', true, 'user'],
  ['setLastVisitedPage', 'PUT', '/documents/{documentId}/last-visited-page', true, 'user'],
  ['saveDocumentPages', 'PATCH', '/documents/{documentId}/pages', true, 'user'],
  ['getUploadAvailability', 'GET', '/uploads/availability', true, 'user'],
  ['getQueue', 'GET', '/queue', true, 'user'],
  ['retryDocument', 'POST', '/documents/{documentId}/retry', true, 'user'],
  ['reprocessPage', 'POST', '/documents/{documentId}/pages/{pageNumber}/reprocess', true, 'user'],
  ['listPageJobs', 'GET', '/documents/{documentId}/jobs', true, 'user'],
  ['acceptCandidate', 'POST', '/documents/{documentId}/pages/{pageNumber}/candidate/accept', true, 'user'],
  ['rejectCandidate', 'POST', '/documents/{documentId}/pages/{pageNumber}/candidate/reject', true, 'user'],
  ['getLock', 'GET', '/documents/{documentId}/lock', true, 'user'],
  ['acquireLock', 'POST', '/documents/{documentId}/lock', true, 'user'],
  ['renewLock', 'PUT', '/documents/{documentId}/lock', true, 'user'],
  ['releaseLock', 'DELETE', '/documents/{documentId}/lock', true, 'user'],
  ['approveDocument', 'POST', '/documents/{documentId}/approval', true, 'user'],
  ['listVersions', 'GET', '/documents/{documentId}/versions', true, 'user'],
  ['createNewVersion', 'POST', '/documents/{documentId}/versions', true, 'admin'],
  ['getVersion', 'GET', '/documents/{documentId}/versions/{versionNumber}', true, 'user'],
  ['exportDocument', 'POST', '/documents/{documentId}/exports', true, 'user'],
].map(([operationId, method, template, implemented, role]) => ({
  operationId,
  method,
  template,
  implemented,
  role,
  names: [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
  pattern: new RegExp(`^${template.replace(/\{\w+\}/g, '([^/]+)')}$`),
}))

// ---- multipart bodies (registerDocument) ------------------------------------------------------------------------------
export function parseMultipart(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '')
  if (!boundary) return null
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`)
  const fields = {}
  const files = {}
  let position = buffer.indexOf(delimiter)
  while (position !== -1) {
    const start = position + delimiter.length
    if (buffer.subarray(start, start + 2).toString() === '--') break
    const next = buffer.indexOf(delimiter, start)
    if (next === -1) break
    const part = buffer.subarray(start + 2, next - 2) // drop the CRLF after the delimiter and before the next
    const split = part.indexOf('\r\n\r\n')
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8')
      const body = part.subarray(split + 4)
      const name = /name="([^"]*)"/i.exec(head)?.[1]
      const fileName = /filename="([^"]*)"/i.exec(head)?.[1]
      const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim()
      if (name !== undefined) {
        if (fileName !== undefined) files[name] = { fileName, contentType: type ?? 'application/octet-stream', bytes: Buffer.from(body) }
        else fields[name] = body.toString('utf8')
      }
    }
    position = next
  }
  return { fields, files }
}

const rfc5987 = (name) => `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`

// ---- the server -------------------------------------------------------------------------------------------------------
export function createContractServer({ leaseMs = 60_000 } = {}) {
  let state
  let clockOffsetMs = 0
  const now = () => new Date(Date.now() + clockOffsetMs)
  const iso = () => now().toISOString()

  function reset() {
    clockOffsetMs = 0
    state = {
      seq: 0,
      accounts: ACCOUNTS.map((account) => ({ ...account })),
      accessTokens: new Map(), // token -> { userId, expiresAt }
      refreshTokens: new Map(), // token -> userId
      documents: new Map(),
      locks: new Map(),
      jobs: [],
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      notifications: [],
      readBy: new Map(), // notificationId -> Set(userId)
      storageFull: false,
      failNext: null,
    }
    for (const seed of seedDocuments()) addSeedDocument(seed)
  }

  const nextId = (prefix) => `${prefix}-${++state.seq}`

  function addSeedDocument(seed) {
    const snapshot = buildSnapshot({ id: seed.id, name: seed.name, totalPages: seed.totalPages, selectedPages: seed.selectedPages, ...seed.snapshotOptions })
    const record = {
      id: seed.id, name: seed.name, ownerId: seed.ownerId, createdAt: seed.createdAt, updatedAt: seed.createdAt, revision: 1, approvalStatus: 'none',
      lastVisitedPage: null, workflow: seed.workflow, documentType: seed.documentType, template: null, snapshot, versions: [], attempts: [], candidates: {},
      file: { bytes: FIXTURE_PDF, mimeType: 'application/pdf' }, deletedAt: null, deletedBy: null,
    }
    if (seed.approved) {
      record.versions = appendApprovedVersion([], { snapshot, approvedAt: '2026-01-06T08:00:00.000Z', approvedBy: 'usr-admin', approvedByName: 'المدير (عقد)' })
      record.approvalStatus = 'approved'
    }
    if (seed.workflow.phase !== 'pending') record.attempts = [{ id: `att-${seed.id}-1`, scope: 'document', pageNumber: null, attempt: 1, trigger: 'upload', status: 'succeeded', startedAt: seed.workflow.startedAt, finishedAt: seed.workflow.finishedAt, errorCode: null, actorId: null }]
    state.documents.set(record.id, record)
  }

  // ---- views of a record ----
  const stateOf = (record) => getDocumentState({ approvalStatus: record.approvalStatus, workflow: record.workflow, pages: record.snapshot.pages })
  function queuePosition(record) {
    if (record.workflow.phase !== 'pending') return null
    const waiting = [...state.documents.values()].filter((doc) => !doc.deletedAt && doc.workflow.phase === 'pending').sort((a, b) => a.workflow.queuedAt.localeCompare(b.workflow.queuedAt))
    return waiting.findIndex((doc) => doc.id === record.id) + 1
  }
  function summaryOf(record) {
    const pages = record.snapshot.pages
    const approved = latestVersion(record.versions)
    return {
      id: record.id, name: record.name, ownerId: record.ownerId, state: stateOf(record), workflowPhase: record.workflow.phase, failureCode: record.workflow.errorCode,
      queuedAt: record.workflow.queuedAt, startedAt: record.workflow.startedAt, finishedAt: record.workflow.finishedAt, queuePosition: queuePosition(record),
      documentType: record.documentType, template: record.template, fileKind: record.file.mimeType === 'application/pdf' ? 'pdf' : 'image',
      approvalStatus: record.approvalStatus, versionCount: record.versions.length, latestVersion: approved?.number ?? null, approvedAt: approved?.approvedAt ?? null, approvedByName: approved?.approvedByName ?? null,
      createdAt: record.createdAt, updatedAt: record.updatedAt, revision: record.revision, totalPages: record.snapshot.file.totalPages, selectedCount: pages.length,
      processingCount: pages.filter((page) => page.processing.status === 'processing').length, processedCount: pages.filter((page) => page.processing.status === 'succeeded').length,
      failedPageCount: pages.filter((page) => page.processing.status === 'failed').length, reviewedCount: pages.filter((page) => page.review.status === 'reviewed').length,
      lastVisitedPage: record.lastVisitedPage, firstSelectedPage: record.snapshot.selectedPages[0] ?? null,
    }
  }
  const touch = (record) => {
    record.revision += 1
    record.updatedAt = iso()
  }

  // ---- authentication ----
  function issueSession(account) {
    const accessToken = `at-${account.id}-${++state.seq}`
    state.accessTokens.set(accessToken, { userId: account.id, expiresAt: now().getTime() + ACCESS_TOKEN_SECONDS * 1000 })
    return { accessToken, expiresIn: ACCESS_TOKEN_SECONDS, user: publicUser(account) }
  }
  const publicUser = (account) => ({ id: account.id, displayName: account.displayName, role: account.role })
  function actorOf(request) {
    const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
    const entry = token ? state.accessTokens.get(token) : null
    if (!entry || entry.expiresAt <= now().getTime()) fail(401, 'unauthenticated', 'No valid access token.')
    const account = state.accounts.find((candidate) => candidate.id === entry.userId)
    if (!account || account.status !== 'active') fail(401, 'sessionExpired', 'The account is no longer active.')
    return account
  }
  const cookieOf = (request, name) => new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.cookie ?? '')?.[1] ?? null

  // ---- documents: visibility and rules ----
  const isAdmin = (actor) => actor.role === 'admin'
  function visibleRecord(actor, documentId, { includeDeleted = false } = {}) {
    const record = state.documents.get(documentId)
    if (!record || (record.deletedAt && !includeDeleted) || (!isAdmin(actor) && record.ownerId !== actor.id)) fail(404, 'notFound', 'No such document.')
    return record
  }
  function activeLock(documentId) {
    const lock = state.locks.get(documentId)
    return lock && new Date(lock.expiresAt).getTime() > now().getTime() ? lock : null
  }
  function assertLockHeld(actor, documentId) {
    const lock = activeLock(documentId)
    if (lock && lock.holderId !== actor.id) fail(409, 'lockHeld', 'Someone else is editing.', { details: { lock } })
    if (!lock) fail(409, 'lockLost', 'The edit lock is not held.')
  }
  function assertRevision(record, baseRevision) {
    if (!Number.isInteger(baseRevision)) fail(400, 'invalidInput', 'baseRevision is required.', { fields: { baseRevision: 'required' } })
    if (baseRevision !== record.revision) fail(409, 'revisionConflict', 'The document changed since it was loaded.', { details: { currentRevision: record.revision } })
  }
  function assertEditable(record) {
    if (record.approvalStatus === 'approved') fail(409, 'invalidState', 'An approved document is read-only.', { details: { state: 'approved' } })
    if (['pending', 'processing'].includes(stateOf(record))) fail(409, 'invalidState', 'The document is still being processed.', { details: { state: stateOf(record) } })
  }
  const requireJson = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : fail(400, 'invalidInput', 'A JSON object is required.'))
  const pageOf = (record, pageNumber) => record.snapshot.pages.find((page) => page.pageNumber === Number(pageNumber)) ?? fail(404, 'notFound', 'No such page.')

  // ---- handlers (operationId -> function(context)) ----
  const handlers = {
    login({ body, response }) {
      const { identifier, password } = requireJson(body)
      if (!String(identifier ?? '').trim() || !String(password ?? '')) fail(400, 'missingFields', 'Identifier and password are required.', { fields: { identifier: 'required', password: 'required' } })
      const account = state.accounts.find((candidate) => candidate.identifier === String(identifier).trim())
      if (!account || account.password !== password) fail(401, 'invalidCredentials', 'Wrong identifier or password.')
      if (account.status !== 'active') fail(403, 'accountDisabled', 'The account is deactivated.')
      const refresh = `rt-${account.id}-${++state.seq}`
      state.refreshTokens.set(refresh, account.id)
      response.setHeader('Set-Cookie', `aidp_refresh=${refresh}; HttpOnly; SameSite=Strict; Path=${API_PREFIX}/auth`)
      return { status: 200, body: issueSession(account) }
    },
    refreshSession({ request, response }) {
      const refresh = cookieOf(request, 'aidp_refresh')
      const account = refresh ? state.accounts.find((candidate) => candidate.id === state.refreshTokens.get(refresh)) : null
      if (!account) fail(401, 'unauthenticated', 'No valid refresh token.')
      if (account.status !== 'active') fail(401, 'sessionExpired', 'The account is no longer active.')
      response.setHeader('Set-Cookie', `aidp_refresh=${refresh}; HttpOnly; SameSite=Strict; Path=${API_PREFIX}/auth`)
      return { status: 200, body: issueSession(account) }
    },
    logout({ request, response }) {
      state.refreshTokens.delete(cookieOf(request, 'aidp_refresh'))
      response.setHeader('Set-Cookie', `aidp_refresh=; HttpOnly; SameSite=Strict; Path=${API_PREFIX}/auth; Max-Age=0`)
      return { status: 204 }
    },
    getSession: ({ actor }) => ({ status: 200, body: publicUser(actor) }),

    // employees (Admin)
    listEmployees: () => ({ status: 200, body: state.accounts.filter((account) => account.role === 'employee').map(employeeOf) }),
    createEmployee({ body }) {
      const { displayName, identifier, password } = requireJson(body)
      const fields = {}
      if (!String(displayName ?? '').trim()) fields.displayName = 'required'
      if (!/^[A-Za-z0-9._@-]{3,64}$/.test(String(identifier ?? ''))) fields.identifier = String(identifier ?? '').length < 3 ? 'tooShort' : 'invalidChars'
      if (String(password ?? '').length < 8) fields.password = 'tooShort'
      if (Object.keys(fields).length > 0) fail(400, 'invalidInput', 'Invalid employee.', { fields })
      if (state.accounts.some((account) => account.identifier.toLowerCase() === identifier.toLowerCase())) fail(409, 'duplicateIdentifier', 'The identifier is taken.')
      const account = { id: nextId('usr'), identifier, password, displayName: displayName.trim(), role: 'employee', status: 'active', createdAt: iso(), updatedAt: iso() }
      state.accounts.push(account)
      return { status: 201, body: employeeOf(account) }
    },
    updateEmployee({ params, body }) {
      const account = employeeById(params.employeeId)
      const { displayName, identifier } = requireJson(body)
      if (identifier !== undefined && state.accounts.some((other) => other.id !== account.id && other.identifier.toLowerCase() === String(identifier).toLowerCase())) fail(409, 'duplicateIdentifier', 'The identifier is taken.')
      if (displayName !== undefined) account.displayName = String(displayName).trim()
      if (identifier !== undefined) account.identifier = String(identifier)
      account.updatedAt = iso()
      return { status: 200, body: employeeOf(account) }
    },
    setEmployeePassword({ params, body }) {
      const account = employeeById(params.employeeId)
      const { password } = requireJson(body)
      if (String(password ?? '').length < 8) fail(400, 'invalidInput', 'Password too short.', { fields: { password: 'tooShort' } })
      account.password = password
      return { status: 204 }
    },
    deactivateEmployee({ params }) {
      const account = employeeById(params.employeeId)
      account.status = 'deactivated'
      // Decision 16: every session of the account ends at once.
      for (const [token, entry] of state.accessTokens) if (entry.userId === account.id) state.accessTokens.delete(token)
      for (const [token, userId] of state.refreshTokens) if (userId === account.id) state.refreshTokens.delete(token)
      return { status: 200, body: employeeOf(account) }
    },
    reactivateEmployee({ params }) {
      const account = employeeById(params.employeeId)
      account.status = 'active'
      return { status: 200, body: employeeOf(account) }
    },

    // settings
    getSettings: () => ({ status: 200, body: state.settings }),
    getLimits: () => ({ status: 200, body: state.settings.uploads }),
    previewSettingsImpact: () => ({ status: 200, body: { recycleBinExpiring: 0, auditEntriesExpiring: 0 } }),
    updateSettingsSection({ params, body }) {
      if (!(params.section in state.settings)) fail(400, 'invalidInput', 'Unknown section.', { fields: { section: 'unknown' } })
      const values = requireJson(body)
      if (params.section === 'uploads') {
        const fields = {}
        if (!Number.isInteger(values.maxFileSizeMb) || values.maxFileSizeMb < 1 || values.maxFileSizeMb > 1024) fields.maxFileSizeMb = 'outOfRange'
        if (!Number.isInteger(values.maxSelectedPages) || values.maxSelectedPages < 1 || values.maxSelectedPages > 10000) fields.maxSelectedPages = 'outOfRange'
        if (Object.keys(fields).length > 0) fail(400, 'invalidInput', 'Invalid limits.', { fields })
      }
      state.settings[params.section] = { ...state.settings[params.section], ...values }
      return { status: 200, body: state.settings }
    },
    getStorageStatus: () => ({ status: 200, body: { totalBytes: 100 * MB, usedBytes: state.storageFull ? 100 * MB : 12 * MB, breakdown: { originals: 8 * MB, results: 4 * MB }, thresholds: state.settings.storage } }),

    // notifications
    listNotifications: ({ actor }) => ({
      status: 200,
      body: state.notifications.filter((item) => isAdmin(actor) || item.ownerId === actor.id).map(({ ownerId: _ownerId, ...item }) => ({ ...item, read: state.readBy.get(item.id)?.has(actor.id) === true })),
    }),
    markNotificationRead({ actor, params }) {
      if (!state.notifications.some((item) => item.id === params.notificationId)) fail(404, 'notFound', 'No such notification.')
      readSet(params.notificationId).add(actor.id)
      return { status: 204 }
    },
    markAllNotificationsRead({ actor }) {
      for (const item of state.notifications) if (isAdmin(actor) || item.ownerId === actor.id) readSet(item.id).add(actor.id)
      return { status: 204 }
    },

    // recycle bin
    listDeletedDocuments: () => ({ status: 200, body: [...state.documents.values()].filter((record) => record.deletedAt).map((record) => ({ ...summaryOf(record), deletedAt: record.deletedAt, deletedBy: record.deletedBy, purgeAt: null })) }),
    moveDocumentToBin({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      const cancelledProcessing = ['pending', 'processing'].includes(stateOf(record))
      record.deletedAt = iso()
      record.deletedBy = actor.id
      state.jobs = state.jobs.filter((job) => job.documentId !== record.id)
      return { status: 200, body: { cancelledProcessing } }
    },
    restoreDocument({ actor, params }) {
      const record = visibleRecord(actor, params.documentId, { includeDeleted: true })
      if (!record.deletedAt) fail(404, 'notFound', 'Not in the recycle bin.')
      record.deletedAt = null
      record.deletedBy = null
      return { status: 204 }
    },
    purgeDocument({ actor, params }) {
      const record = visibleRecord(actor, params.documentId, { includeDeleted: true })
      if (!record.deletedAt) fail(404, 'notFound', 'Not in the recycle bin.')
      state.documents.delete(record.id)
      return { status: 204 }
    },

    listAuditEntries: ({ query }) => ({ status: 200, body: { items: [], total: 0, page: Number(query.get('page') ?? 1), pageSize: Number(query.get('pageSize') ?? 50) } }),
    listTemplates: () => ({ status: 200, body: TEMPLATES }),

    // documents
    registerDocument({ actor, rawBody, request }) {
      const parsed = parseMultipart(rawBody, request.headers['content-type'])
      const file = parsed?.files.file
      if (!file) fail(400, 'invalidInput', 'The "file" part is required.', { fields: { file: 'required' } })
      if (!ALLOWED_MIME.includes(file.contentType)) fail(415, 'unsupportedFileType', 'Only PDF, JPG, JPEG and PNG are accepted.')
      const limits = state.settings.uploads
      if (file.bytes.length > limits.maxFileSizeMb * MB) fail(413, 'fileTooLarge', 'The file is too large.', { details: { maxFileSizeMb: limits.maxFileSizeMb } })
      let selectedPages
      try {
        selectedPages = JSON.parse(parsed.fields.selectedPages ?? 'null')
      } catch {
        selectedPages = null
      }
      const valid = Array.isArray(selectedPages) && selectedPages.length > 0 && selectedPages.every((page, index) => Number.isInteger(page) && page >= 1 && (index === 0 || page > selectedPages[index - 1]))
      if (!valid) fail(400, 'invalidInput', 'selectedPages must be a sorted list of page numbers.', { fields: { selectedPages: 'invalid' } })
      if (selectedPages.length > limits.maxSelectedPages) fail(422, 'tooManyPages', 'Too many selected pages.', { details: { maxSelectedPages: limits.maxSelectedPages } })
      if (state.storageFull) fail(507, 'storageFull', 'Storage is full.')
      const isImage = file.contentType !== 'application/pdf'
      const totalPages = isImage ? 1 : Math.max(Number(parsed.fields.totalPages) || 0, selectedPages.at(-1))
      if (isImage && (selectedPages.length !== 1 || selectedPages[0] !== 1)) fail(400, 'invalidInput', 'An image has exactly one page.', { fields: { selectedPages: 'invalid' } })
      const id = nextId('doc')
      const generateId = createSequentialIdGenerator()
      const document = createDocument({ id, file: { name: file.fileName, size: file.bytes.length, mimeType: file.contentType, lastModified: now().getTime() }, totalPages, selectedPages }, { generateId })
      const at = iso()
      const record = {
        id, name: file.fileName, ownerId: actor.id, createdAt: at, updatedAt: at, revision: 1, approvalStatus: 'none', lastVisitedPage: null,
        workflow: { phase: 'pending', queuedAt: at, startedAt: null, finishedAt: null, errorCode: null }, documentType: null, template: null,
        snapshot: serializeDocument(document, { includeOriginalExtraction: true }), versions: [], attempts: [], candidates: {}, file: { bytes: file.bytes, mimeType: file.contentType }, deletedAt: null, deletedBy: null,
      }
      state.documents.set(id, record)
      return { status: 202, body: { documentId: id, queuePosition: queuePosition(record), revision: record.revision } }
    },
    listDocuments({ actor, query }) {
      const view = query.get('view') ?? 'all'
      const q = (query.get('q') ?? '').trim().toLowerCase()
      const type = query.get('type')
      const wanted = query.get('state')
      const from = query.get('uploadedFrom')
      const to = query.get('uploadedTo')
      const pageSize = Math.min(200, Math.max(1, Number(query.get('pageSize') ?? 50)))
      const page = Math.max(1, Number(query.get('page') ?? 1))
      if (!['all', 'archive', 'queue'].includes(view)) fail(400, 'invalidInput', 'Unknown view.', { fields: { view: 'invalid' } })
      let items = [...state.documents.values()].filter((record) => !record.deletedAt && (isAdmin(actor) || record.ownerId === actor.id)).map(summaryOf)
      items = items.filter((item) => {
        if (view === 'archive' && item.state === 'pending') return false
        if (view === 'queue' && item.state === 'approved') return false
        if (q && !item.name.toLowerCase().includes(q)) return false
        if (type && (item.documentType ?? 'unclassified') !== type) return false
        if (wanted && item.state !== wanted) return false
        if (from && item.createdAt.slice(0, 10) < from) return false
        if (to && item.createdAt.slice(0, 10) > to) return false
        return true
      })
      const sort = query.get('sort') ?? 'uploadedAt_desc'
      items.sort((a, b) => (sort === 'name_asc' ? a.name.localeCompare(b.name) : sort === 'uploadedAt_asc' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
      return { status: 200, body: { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize } }
    },
    getDocument({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      return { status: 200, body: { summary: summaryOf(record), revision: record.revision, snapshot: record.snapshot, candidates: record.candidates } }
    },
    getDocumentStatus: ({ actor, params }) => ({ status: 200, body: summaryOf(visibleRecord(actor, params.documentId)) }),
    getDocumentMeta({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      const counts = {}
      for (const attempt of record.attempts) if (attempt.status === 'accepted') counts[attempt.pageNumber] = (counts[attempt.pageNumber] ?? 0) + 1
      return { status: 200, body: { revision: record.revision, attempts: record.attempts, versions: summarizeVersions(record.versions), acceptedResultCounts: counts, documentType: record.documentType, template: record.template } }
    },
    getDocumentOriginal({ actor, params, response }) {
      const record = visibleRecord(actor, params.documentId)
      response.setHeader('Content-Disposition', rfc5987(record.name))
      return { status: 200, raw: record.file.bytes, contentType: record.file.mimeType }
    },
    setLastVisitedPage({ actor, params, body }) {
      const record = visibleRecord(actor, params.documentId)
      const { pageNumber } = requireJson(body)
      if (!record.snapshot.selectedPages.includes(pageNumber)) fail(400, 'invalidInput', 'Not a selected page.', { fields: { pageNumber: 'invalid' } })
      record.lastVisitedPage = pageNumber
      return { status: 204 }
    },
    saveDocumentPages({ actor, params, body }) {
      const record = visibleRecord(actor, params.documentId)
      const { baseRevision, pages } = requireJson(body)
      assertEditable(record)
      assertLockHeld(actor, record.id) // decision 47: the server checks the lock on every save
      assertRevision(record, baseRevision)
      if (!Array.isArray(pages) || pages.length === 0) fail(400, 'invalidInput', 'pages must be a non-empty list.', { fields: { pages: 'required' } })
      // All-or-nothing, and only the named pages: page isolation (decision 38).
      const stored = new Map(record.snapshot.pages.map((page) => [page.pageNumber, page]))
      for (const page of pages) if (!stored.has(page?.pageNumber) || stored.get(page.pageNumber).id !== page.id) fail(400, 'invalidInput', `Page ${page?.pageNumber} does not match the stored document.`, { fields: { pages: 'mismatch' } })
      record.snapshot.pages = record.snapshot.pages.map((page) => pages.find((candidate) => candidate.pageNumber === page.pageNumber) ?? page)
      touch(record)
      return { status: 200, body: { revision: record.revision, updatedAt: record.updatedAt } }
    },

    getUploadAvailability: () => ({ status: 200, body: state.storageFull ? { available: false, reason: 'storageFull' } : { available: true, reason: null } }),
    getQueue({ actor }) {
      const jobs = [...state.documents.values()]
        .filter((record) => !record.deletedAt && record.workflow.phase === 'pending' && (isAdmin(actor) || record.ownerId === actor.id))
        .map((record) => ({ id: `job-${record.id}`, kind: 'document', documentId: record.id, pageNumber: null, attempt: 1, state: 'queued', position: queuePosition(record) }))
      return { status: 200, body: { blocked: state.storageFull ? 'storageFull' : null, jobs: [...jobs, ...state.jobs.filter((job) => isAdmin(actor) || state.documents.get(job.documentId)?.ownerId === actor.id)] } }
    },
    retryDocument({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      if (!['failed', 'manualEditing'].includes(stateOf(record))) fail(409, 'invalidState', 'Only a failed document can be retried.', { details: { state: stateOf(record) } })
      if (state.storageFull) fail(507, 'storageFull', 'Storage is full.')
      record.workflow = { phase: 'pending', queuedAt: iso(), startedAt: null, finishedAt: null, errorCode: null }
      touch(record)
      return { status: 202, body: { id: `job-${record.id}`, kind: 'document', documentId: record.id, pageNumber: null, attempt: record.attempts.length + 1, state: 'queued', position: queuePosition(record) } }
    },
    reprocessPage({ actor, params, body }) {
      const record = visibleRecord(actor, params.documentId)
      const { baseRevision } = requireJson(body)
      assertEditable(record)
      assertLockHeld(actor, record.id)
      assertRevision(record, baseRevision)
      pageOf(record, params.pageNumber)
      const attempt = record.attempts.filter((entry) => entry.pageNumber === Number(params.pageNumber) || entry.scope === 'document').length + 1
      const job = { id: nextId('job'), kind: 'page', documentId: record.id, pageNumber: Number(params.pageNumber), attempt, state: 'queued', position: state.jobs.length + 1 }
      state.jobs.push(job)
      return { status: 202, body: job }
    },
    listPageJobs: ({ actor, params }) => ({ status: 200, body: state.jobs.filter((job) => job.documentId === visibleRecord(actor, params.documentId).id) }),
    acceptCandidate({ actor, params, body }) {
      const record = visibleRecord(actor, params.documentId)
      const { attempt, baseRevision } = requireJson(body)
      assertEditable(record)
      assertLockHeld(actor, record.id)
      assertRevision(record, baseRevision)
      const page = pageOf(record, params.pageNumber)
      const candidate = record.candidates[page.pageNumber]
      if (!candidate || candidate.attempt !== attempt) fail(404, 'notFound', 'No such candidate.')
      page.elements = candidate.elements
      page.originalExtraction = { elements: JSON.parse(JSON.stringify(candidate.elements)) }
      page.review = { status: 'notReviewed', confirmedAt: null }
      delete record.candidates[page.pageNumber]
      record.attempts.push({ id: nextId('att'), scope: 'page', pageNumber: page.pageNumber, attempt, trigger: 'reprocess', status: 'accepted', startedAt: candidate.receivedAt, finishedAt: iso(), errorCode: null, actorId: actor.id })
      touch(record)
      return { status: 200, body: { revision: record.revision, page } }
    },
    rejectCandidate({ actor, params, body }) {
      const record = visibleRecord(actor, params.documentId)
      const { attempt } = requireJson(body)
      assertLockHeld(actor, record.id)
      const page = pageOf(record, params.pageNumber)
      const candidate = record.candidates[page.pageNumber]
      if (!candidate || candidate.attempt !== attempt) fail(404, 'notFound', 'No such candidate.')
      delete record.candidates[page.pageNumber] // the CONTENT is discarded (decision 40); only metadata stays
      record.attempts.push({ id: nextId('att'), scope: 'page', pageNumber: page.pageNumber, attempt, trigger: 'reprocess', status: 'rejected', startedAt: candidate.receivedAt, finishedAt: iso(), errorCode: null, actorId: actor.id })
      return { status: 204 }
    },

    getLock: ({ actor, params }) => ({ status: 200, body: activeLock(visibleRecord(actor, params.documentId).id) }),
    acquireLock({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      const current = activeLock(record.id)
      if (current && current.holderId !== actor.id) return { status: 200, body: { granted: false, lock: current } }
      const lock = { holderId: actor.id, holderName: actor.displayName, acquiredAt: current?.acquiredAt ?? iso(), expiresAt: new Date(now().getTime() + leaseMs).toISOString() }
      state.locks.set(record.id, lock)
      return { status: 200, body: { granted: true, lock } }
    },
    renewLock({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      assertLockHeld(actor, record.id)
      const lock = { ...activeLock(record.id), expiresAt: new Date(now().getTime() + leaseMs).toISOString() }
      state.locks.set(record.id, lock)
      return { status: 200, body: { lock } }
    },
    releaseLock({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      const current = activeLock(record.id)
      if (current && current.holderId === actor.id) state.locks.delete(record.id)
      return { status: 204 }
    },

    approveDocument({ actor, params, body }) {
      const record = visibleRecord(actor, params.documentId)
      const { baseRevision } = requireJson(body)
      if (!isAdmin(actor) && record.ownerId !== actor.id) fail(403, 'forbidden', 'Only the owner or the Admin may approve.') // decision 39
      if (record.approvalStatus === 'approved') fail(409, 'invalidState', 'Already approved.', { details: { state: 'approved' } })
      assertLockHeld(actor, record.id)
      assertRevision(record, baseRevision) // a stale approval is refused
      const pages = record.snapshot.pages
      const reasons = []
      if (pages.some((page) => page.review.status !== 'reviewed')) reasons.push('pagesNotReviewed')
      if (pages.some((page) => page.processing.status === 'processing') || ['pending', 'processing'].includes(stateOf(record))) reasons.push('processing')
      if (reasons.length > 0) fail(409, 'notEligible', 'Approval prerequisites are not met.', { details: { reasons } })
      record.versions = appendApprovedVersion(record.versions, { snapshot: record.snapshot, approvedAt: iso(), approvedBy: actor.id, approvedByName: actor.displayName })
      record.approvalStatus = 'approved'
      record.candidates = {}
      state.locks.delete(record.id)
      touch(record)
      return { status: 200, body: { revision: record.revision, version: summarizeVersions(record.versions)[0] } }
    },
    listVersions: ({ actor, params }) => ({ status: 200, body: summarizeVersions(visibleRecord(actor, params.documentId).versions) }),
    createNewVersion({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      if (record.approvalStatus !== 'approved') fail(409, 'invalidState', 'Only an approved document gets a new version.', { details: { state: stateOf(record) } })
      record.approvalStatus = 'none' // the previous approved version stays in record.versions (decision 14)
      touch(record)
      return { status: 200, body: { revision: record.revision, updatedAt: record.updatedAt } }
    },
    getVersion({ actor, params }) {
      const record = visibleRecord(actor, params.documentId)
      const version = getVersion(record.versions, Number(params.versionNumber)) ?? fail(404, 'noSuchVersion', 'No such version.')
      const summary = summarizeVersions(record.versions).find((entry) => entry.number === version.number)
      return { status: 200, body: { ...summary, snapshot: version.snapshot } }
    },
    exportDocument({ actor, params, body, response }) {
      const record = visibleRecord(actor, params.documentId)
      const { format } = requireJson(body)
      if (!EXPORT_FORMAT_INFO[format]) fail(400, 'invalidInput', 'Unknown format.', { fields: { format: 'unknownFormat' } })
      const version = latestVersion(record.versions) ?? fail(409, 'invalidState', 'Nothing approved to export.', { details: { state: stateOf(record) } })
      const dataset = buildExportDataset(version.snapshot) // selected AND approved pages only, original order, source pages kept
      if (dataset.pageCount === 0) fail(409, 'invalidState', 'No approved page to export.')
      response.setHeader('Content-Disposition', rfc5987(buildExportFileName(record.name, format)))
      response.setHeader('X-AIDP-Page-Count', String(dataset.pageCount))
      response.setHeader('X-AIDP-Source-Pages', dataset.selectedPages.join(','))
      response.setHeader('X-AIDP-Version', String(version.number))
      if (format === 'json') return { status: 200, raw: Buffer.from(buildJsonExport(dataset, { version: version.number })), contentType: EXPORT_FORMAT_INFO.json.mimeType }
      // The contract server does NOT generate DOCX/XLSX/PDF (the real backend does, decision D3): a fixed stand-in so a
      // download can be tested. It is NOT a valid document.
      response.setHeader('X-AIDP-Fixture', 'true')
      return { status: 200, raw: Buffer.from(`FIXTURE-${format.toUpperCase()}-NOT-A-REAL-FILE`), contentType: EXPORT_FORMAT_INFO[format].mimeType }
    },
  }

  const employeeOf = (account) => ({ id: account.id, displayName: account.displayName, identifier: account.identifier, status: account.status, createdAt: account.createdAt ?? '2026-01-01T00:00:00.000Z', updatedAt: account.updatedAt ?? '2026-01-01T00:00:00.000Z' })
  const employeeById = (id) => state.accounts.find((account) => account.id === id && account.role === 'employee') ?? fail(404, 'notFound', 'No such employee.')
  const readSet = (id) => state.readBy.get(id) ?? state.readBy.set(id, new Set()).get(id)

  // ---- simulation controls (NOT part of the contract) ----
  const controls = {
    reset: () => reset(),
    'expire-access-tokens': () => state.accessTokens.clear(),
    'revoke-refresh': () => state.refreshTokens.clear(),
    'fail-next': ({ body }) => void (state.failNext = { status: body.status ?? 500, code: body.code ?? 'unknown', times: body.times ?? 1 }),
    'advance-clock': ({ body }) => void (clockOffsetMs += Number(body.ms) || 0),
    'set-storage-full': ({ body }) => void (state.storageFull = body.full !== false),
    'bump-revision': ({ body }) => touch(state.documents.get(body.documentId) ?? fail(404, 'notFound', 'No such document.')),
    'take-lock': ({ body }) => {
      const account = state.accounts.find((candidate) => candidate.id === body.userId) ?? fail(404, 'notFound', 'No such user.')
      state.locks.set(body.documentId, { holderId: account.id, holderName: account.displayName, acquiredAt: iso(), expiresAt: new Date(now().getTime() + leaseMs).toISOString() })
    },
    // Finishes the processing of a pending document (what the AI queue would do): every selected page gets its extraction.
    process({ body }) {
      const record = state.documents.get(body.documentId) ?? fail(404, 'notFound', 'No such document.')
      const generateId = createSequentialIdGenerator(1000)
      for (const page of record.snapshot.pages) {
        const elements = fixtureElements(page.pageNumber, generateId)
        page.processing = { status: 'succeeded', errorCode: null }
        page.originalExtraction = { elements: JSON.parse(JSON.stringify(elements)) }
        page.elements = elements
      }
      record.workflow = { ...record.workflow, phase: 'completed', startedAt: record.workflow.startedAt ?? iso(), finishedAt: iso() }
      record.attempts.push({ id: nextId('att'), scope: 'document', pageNumber: null, attempt: record.attempts.length + 1, trigger: 'upload', status: 'succeeded', startedAt: record.workflow.startedAt, finishedAt: record.workflow.finishedAt, errorCode: null, actorId: null })
      state.notifications.push({ id: nextId('ntf'), type: 'processingCompleted', createdAt: iso(), ownerId: record.ownerId, documentId: record.id, documentName: record.name, params: {} })
      touch(record)
    },
    // A reprocessing result arrives for a queued page job: it becomes a CANDIDATE (decision 40), never a silent replacement.
    'complete-job'({ body }) {
      const job = state.jobs.find((candidate) => candidate.id === body.jobId) ?? fail(404, 'notFound', 'No such job.')
      const record = state.documents.get(job.documentId)
      record.candidates[job.pageNumber] = { attempt: job.attempt, receivedAt: iso(), elements: fixtureElements(job.pageNumber, createSequentialIdGenerator(5000 + job.attempt * 100)) }
      state.jobs = state.jobs.filter((candidate) => candidate.id !== job.id)
      touch(record)
    },
  }

  // ---- HTTP plumbing ----
  function cors(request, response) {
    const origin = request.headers.origin
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Access-Control-Allow-Credentials', 'true')
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-AIDP-Page-Count, X-AIDP-Source-Pages, X-AIDP-Version')
    }
  }

  function send(response, status, body, extraHeaders = {}) {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    response.writeHead(status, { ...(payload ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': payload.length } : {}), ...extraHeaders })
    response.end(payload)
  }

  const errorBody = (error) => ({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}), ...(error.details ? { details: error.details } : {}), requestId: `req-${state.seq}` } })

  async function handle(request, response) {
    cors(request, response)
    const url = new URL(request.url, 'http://contract.local')
    if (request.method === 'OPTIONS') return void (response.writeHead(204), response.end())
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const rawBody = Buffer.concat(chunks)
    const isJson = (request.headers['content-type'] ?? '').includes('json')
    let body = null
    if (isJson && rawBody.length > 0) {
      try {
        body = JSON.parse(rawBody.toString('utf8'))
      } catch {
        return send(response, 400, errorBody(new HttpError(400, 'invalidInput', 'The body is not valid JSON.')))
      }
    }

    try {
      if (url.pathname.startsWith('/__contract/')) {
        const name = url.pathname.slice('/__contract/'.length)
        if (!Object.hasOwn(controls, name)) fail(404, 'notFound', 'No such control.')
        await controls[name]({ body: body ?? {} })
        return send(response, 200, { ok: true })
      }
      if (!url.pathname.startsWith(`${API_PREFIX}/`)) fail(404, 'notFound', 'Not an API path.')
      const path = url.pathname.slice(API_PREFIX.length)
      const route = ROUTES.find((candidate) => candidate.method === request.method && candidate.pattern.test(path))
      if (!route) {
        const other = ROUTES.some((candidate) => candidate.pattern.test(path))
        fail(other ? 405 : 404, other ? 'invalidInput' : 'notFound', other ? 'Method not allowed.' : 'No such operation.')
      }
      if (state.failNext && route.role !== 'public') {
        const { status, code } = state.failNext
        if (--state.failNext.times <= 0) state.failNext = null
        fail(status, code, 'A simulated failure.')
      }
      const actor = route.role === 'public' ? null : actorOf(request)
      if (route.role === 'admin' && !isAdmin(actor)) fail(403, 'forbidden', 'Admin only.')
      if (!route.implemented) fail(501, 'unknown', `${route.operationId} is not implemented by the contract server.`)
      const match = route.pattern.exec(path)
      const params = Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]))
      const result = await handlers[route.operationId]({ request, response, actor, params, query: url.searchParams, body, rawBody })
      if (result.raw) {
        response.writeHead(result.status, { 'Content-Type': result.contentType, 'Content-Length': result.raw.length })
        return void response.end(result.raw)
      }
      return send(response, result.status, result.body)
    } catch (error) {
      if (error instanceof HttpError) return send(response, error.status, errorBody(error))
      console.error(error)
      return send(response, 500, errorBody(new HttpError(500, 'unknown', 'The contract server failed.')))
    }
  }

  reset()
  const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error(error)
      if (!response.headersSent) send(response, 500, errorBody(new HttpError(500, 'unknown', 'The contract server failed.')))
    })
  })

  return {
    server,
    reset,
    handlers,
    // Starts listening on 127.0.0.1 (port 0 = any free port). Resolves { port, url, close }.
    listen: (port = 0) =>
      new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
          const address = server.address()
          resolve({ port: address.port, url: `http://127.0.0.1:${address.port}${API_PREFIX}`, control: `http://127.0.0.1:${address.port}/__contract`, close: () => new Promise((done) => server.close(done)) })
        })
      }),
  }
}

// ---- command line ------------------------------------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const flag = process.argv.indexOf('--port')
  const port = flag === -1 ? 5301 : Number(process.argv[flag + 1])
  const contract = createContractServer()
  contract.listen(port).then(({ url }) => {
    console.log(`AIDP contract server (development/testing only, NOT the backend) listening on ${url}`)
    console.log('Fixture accounts: employee / employee2 / admin (see scripts/contract-server/fixtures.mjs). Controls: /__contract/*')
  })
}
