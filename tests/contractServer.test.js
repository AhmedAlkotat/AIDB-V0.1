// Batch E / Wave 1: (1) the proposed API contract (docs/api/openapi.draft.yaml) is consistent with the contract server,
// the frontend services, the domain model and the approved decisions; (2) representative requests against the
// development contract server, through the real API client and the real HTTP document service.
//
// IMPORTANT: this proves the frontend matches the PROPOSED contract, nothing about the real backend (not agreed).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import { AUDIT_CATEGORIES } from '../src/domain/settings/settings.js'
import { ATTEMPT_STATUS, ATTEMPT_TRIGGER } from '../src/domain/document/attempts.js'
import { DOCUMENT_STATE_LIST } from '../src/domain/document/lifecycle.js'
import { parseDocumentJson } from '../src/domain/document/serialization.js'
import { ELEMENT_TYPE_LIST, PROCESSING_STATUS_LIST, REVIEW_STATUS_LIST } from '../src/domain/document/schema.js'
import { NOTIFICATION_TYPE } from '../src/domain/notification/notification.js'
import { SETTINGS_SECTIONS } from '../src/domain/settings/settings.js'
import { API_ERROR, ApiError, createApiClient, UPLOAD_TIMEOUT_MS } from '../src/services/apiClient.js'
import { SERVER_ERROR_CODES } from '../src/services/apiErrors.js'
import { createHttpDocumentService } from '../src/services/httpDocumentService.js'
import { NOT_CONNECTED_PAGE_PROCESSING } from '../src/services/documentWorkflowService.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { createReviewSession } from '../src/state/documentSession/reviewSession.js'
import { createContractServer, parseMultipart, ROUTES } from '../scripts/contract-server/server.mjs'
import { buildSnapshot } from '../scripts/contract-server/fixtures.mjs'

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10))
const yaml = read('../docs/api/openapi.draft.yaml')

// ---- a small reader of the draft (no YAML library is installed; the file's layout is fixed and simple) ------------------
function readOperations(text) {
  const operations = []
  let path = null
  let method = null
  let current = null
  for (const line of text.split('\n')) {
    const pathMatch = /^ {2}(\/\S*):\s*$/.exec(line)
    if (pathMatch) {
      path = pathMatch[1]
      continue
    }
    const methodMatch = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line)
    if (path && methodMatch) {
      method = methodMatch[1].toUpperCase()
      current = { path, method, decisions: null, permission: null, status: null, service: null, responses: [], refs: [] }
      operations.push(current)
      continue
    }
    if (!current) continue
    if (/^[a-z]/.test(line)) current = null // left the paths section
    const field = /^ {6}(operationId|x-service|x-status|x-permission|x-decisions):\s*(.*)$/.exec(line)
    if (field) {
      const value = field[2].trim()
      if (field[1] === 'operationId') current.operationId = value
      if (field[1] === 'x-service') current.service = value
      if (field[1] === 'x-status') current.status = value
      if (field[1] === 'x-permission') current.permission = value
      if (field[1] === 'x-decisions') current.decisions = value
    }
    const response = /^ {8}'(\d{3})':/.exec(line)
    if (response) current.responses.push(response[1])
    for (const ref of line.matchAll(/\$ref:\s*'#\/components\/(\w+)\/(\w+)'/g)) current.refs.push(`${ref[1]}/${ref[2]}`)
  }
  return operations
}
const operations = readOperations(yaml)

function definedComponents(text) {
  const defined = new Set()
  let section = null
  for (const line of text.split('\n')) {
    const top = /^ {2}(securitySchemes|parameters|responses|schemas):\s*$/.exec(line)
    if (top) section = top[1]
    else if (/^\S/.test(line)) section = null
    const name = /^ {4}(\w+):/.exec(line)
    if (section && name) defined.add(`${section}/${name[1]}`)
  }
  return defined
}

// The text of one schema, and the enum of one of its properties.
const schemaText = (name) => new RegExp(`^ {4}${name}:\\n((?: {5,}.*\\n|\\n)+)`, 'm').exec(yaml)?.[1] ?? ''
function enumOf(schema, property) {
  const body = schemaText(schema)
  const inline = new RegExp(`${property}:[^\\n]*enum: \\[([^\\]]*)\\]`).exec(body)
  if (inline) return inline[1].split(',').map((item) => item.trim())
  const block = new RegExp(`${property}:\\n(?:[^\\n]*\\n)*?\\s+enum:\\n((?:\\s+- [^\\n]+\\n)+)`).exec(body)
  return block ? block[1].split('\n').map((line) => line.replace(/^\s+- /, '').trim()).filter(Boolean) : null
}
const sameSet = (actual, expected, label) => assert.deepEqual([...actual].sort(), [...expected].sort(), label)

describe('the draft contract is consistent', () => {
  test('it covers about fifty operations, each exactly once, with a unique operationId', () => {
    assert.ok(operations.length >= 50, `only ${operations.length} operations`)
    const ids = operations.map((operation) => operation.operationId)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.every(Boolean))
    assert.equal(new Set(operations.map((operation) => `${operation.method} ${operation.path}`)).size, operations.length)
  })

  test('the contract server\'s route table covers EXACTLY the operations of the draft (same id, method and path)', () => {
    const fromDraft = operations.map((operation) => `${operation.operationId} ${operation.method} ${operation.path}`)
    const fromServer = ROUTES.map((route) => `${route.operationId} ${route.method} ${route.template}`)
    sameSet(fromServer, fromDraft, 'ROUTES and openapi.draft.yaml differ')
  })

  test('every operation says how firm it is, which decisions it serves, who may call it and which frontend service it implements', () => {
    for (const operation of operations) {
      assert.ok(['confirmed-requirement', 'proposed', 'open-question'].includes(operation.status), `${operation.operationId}: x-status`)
      assert.match(operation.decisions ?? '', /^\[[\d, ]*\]$/, `${operation.operationId}: x-decisions`)
      assert.ok(operation.permission, `${operation.operationId}: x-permission`)
      assert.match(operation.service ?? '', /^\w+\.[\w.]+$/, `${operation.operationId}: x-service`)
      assert.ok(operation.responses.length > 0, `${operation.operationId}: no responses`)
    }
    // Unapproved designs are never presented as agreed: every operation that is not a plain approved behaviour is marked.
    assert.ok(operations.some((operation) => operation.status === 'open-question'))
    assert.ok(operations.some((operation) => operation.status === 'proposed'))
  })

  test('every x-service names a method that exists in the frontend service it points to', () => {
    const files = { documentService: ['documentService.js', 'httpDocumentService.js'], documentWorkflowService: ['documentWorkflowService.js'] }
    for (const operation of operations) {
      const [service, ...rest] = operation.service.split('.')
      const method = rest.at(-1)
      const sources = (files[service] ?? [`${service}.js`]).map((file) => read(`../src/services/${file}`)).join('\n')
      assert.match(sources, new RegExp(`\\b${method}\\b`), `${operation.operationId}: ${operation.service} not found in the frontend`)
    }
  })

  test('every $ref resolves, and every error status of an operation points at a defined error response', () => {
    const defined = definedComponents(yaml)
    const used = new Set([...yaml.matchAll(/\$ref:\s*'#\/components\/(\w+)\/(\w+)'/g)].map((match) => `${match[1]}/${match[2]}`))
    for (const reference of used) assert.ok(defined.has(reference), `dangling $ref ${reference}`)
    for (const operation of operations) assert.ok(operation.responses.some((status) => status.startsWith('2')), `${operation.operationId}: no success response`)
  })

  test('the error codes the server throws are all in the closed list of the contract', () => {
    const source = read('../scripts/contract-server/server.mjs')
    const used = new Set([...source.matchAll(/\bfail\(\d{3}, '(\w+)'/g)].map((match) => match[1]))
    assert.ok(used.size > 10)
    for (const code of used) assert.ok(SERVER_ERROR_CODES.includes(code), `the server throws ${code}, which is not in the contract`)
  })

  test('the contract\'s enums follow the domain model (it cannot drift from the canonical document)', () => {
    sameSet(enumOf('Element', 'type'), ELEMENT_TYPE_LIST, 'element types')
    sameSet(schemaText('Page').match(/status: \{ type: string, enum: \[notProcessed[^\]]*\]/)[0].match(/\[([^\]]*)\]/)[1].split(',').map((s) => s.trim()), PROCESSING_STATUS_LIST, 'processing status')
    sameSet(schemaText('Page').match(/status: \{ type: string, enum: \[notReviewed[^\]]*\]/)[0].match(/\[([^\]]*)\]/)[1].split(',').map((s) => s.trim()), REVIEW_STATUS_LIST, 'review status')
    sameSet(enumOf('DocumentState', 'enum') ?? /enum: \[([^\]]*)\]/.exec(schemaText('DocumentState'))[1].split(',').map((s) => s.trim()), DOCUMENT_STATE_LIST, 'document states (decision 12)')
    sameSet(/enum: \[([^\]]*)\]/.exec(schemaText('AuditCategory'))[1].split(',').map((s) => s.trim()), AUDIT_CATEGORIES, 'the eight audit categories (decision 31)')
    sameSet(enumOf('Attempt', 'status'), Object.values(ATTEMPT_STATUS), 'attempt status')
    sameSet(enumOf('Attempt', 'trigger'), Object.values(ATTEMPT_TRIGGER), 'attempt trigger')
    sameSet(enumOf('Notification', 'type'), Object.values(NOTIFICATION_TYPE), 'notification types')
    const sections = /name: section\n\s+in: path\n\s+required: true\n\s+schema: \{ type: string, enum: \[([^\]]*)\] \}/.exec(yaml)[1].split(',').map((s) => s.trim())
    sameSet(sections, SETTINGS_SECTIONS, 'settings sections')
    assert.match(schemaText('SchemaVersionHolder') + schemaText('CanonicalDocument'), /schemaVersion: \{ type: string, enum: \['0\.1'\] \}/)
  })

  test('the contract keeps what the decisions require: page isolation, original extraction, optional coordinates, revisions, no audit export', () => {
    assert.match(schemaText('Page'), /originalExtraction:/) // decision 49
    assert.match(schemaText('Element'), /location:/) // decision 50
    assert.doesNotMatch(schemaText('Element'), /required: \[[^\]]*location/) // optional
    assert.match(schemaText('Location'), /minimum: 0, maximum: 1/)
    assert.match(schemaText('SavePagesRequest'), /baseRevision/)
    assert.match(schemaText('SavePagesRequest'), /Only the pages that changed/)
    assert.match(schemaText('RegisterDocumentRequest'), /selectedPages/)
    assert.match(schemaText('RegisterDocumentRequest'), /WHOLE original/)
    for (const operationId of ['approveDocument', 'reprocessPage', 'acceptCandidate']) {
      const operation = operations.find((candidate) => candidate.operationId === operationId)
      assert.ok(operation, operationId)
    }
    assert.match(yaml, /operationId: approveDocument[\s\S]*?required: \[baseRevision\]/)
    assert.equal(operations.filter((operation) => operation.path.startsWith('/audit-log')).length, 1) // decision 32: view only
    assert.ok(!operations.some((operation) => /audit/i.test(operation.operationId) && /export/i.test(operation.operationId)))
    // PNG/JPG are never export formats (decision 8).
    assert.match(yaml, /format: \{ type: string, enum: \[docx, xlsx, pdf, json\] \}/)
    // Roles: exactly two (decision 39).
    assert.match(yaml, /Role:\n\s+type: string\n\s+enum: \[employee, admin\]/)
  })

  test('the documentation files exist and the open questions are separated from the confirmed requirements', () => {
    const questions = read('../docs/api/questions.md')
    assert.match(questions, /Blocking/)
    assert.match(questions, /Frontend assumption/)
    assert.match(questions, /What is already confirmed/)
    assert.match(read('../docs/api/error-codes.md'), /proposal/i)
    assert.match(yaml, /STATUS: PROPOSAL/)
  })

  test('the contract server fixtures are valid canonical documents', () => {
    const snapshot = buildSnapshot({ id: 'x', name: 'x.pdf', totalPages: 4, selectedPages: [1, 3, 4], reviewed: true })
    assert.equal(parseDocumentJson(JSON.stringify(snapshot)).ok, true)
    assert.deepEqual(snapshot.pages.map((page) => page.pageNumber), [1, 3, 4])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('representative requests against the contract server', () => {
  let contract
  let running
  let reset
  before(async () => {
    contract = createContractServer({ leaseMs: 60_000 })
    running = await contract.listen(0)
    reset = () => post('/reset', {})
  })
  after(() => running.close())
  beforeEach(() => reset())

  const post = (name, body) => fetch(`${running.control}${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  // A signed-in caller: the real API client with the token in memory, and the real HTTP document service.
  async function signIn(identifier, { refresh = null } = {}) {
    const password = { employee: 'fixture-employee', employee2: 'fixture-employee2', admin: 'fixture-admin' }[identifier]
    const response = await fetch(`${running.url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) })
    const session = await response.json()
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    const state = { token: session.accessToken, ended: 0, refreshes: 0 }
    const client = createApiClient({
      baseUrl: running.url,
      getAccessToken: () => state.token,
      onUnauthorized: () => (state.ended += 1),
      refreshSession:
        refresh === null
          ? null
          : async () => {
              state.refreshes += 1
              const answer = await fetch(`${running.url}/auth/refresh`, { method: 'POST', headers: { Cookie: refresh === 'revoked' ? 'aidp_refresh=none' : cookie } })
              if (!answer.ok) return false
              state.token = (await answer.json()).accessToken
              return true
            },
    })
    return { client, state, cookie, user: session.user, documents: createHttpDocumentService({ client }) }
  }
  const failure = (promise) => promise.then(() => assert.fail('expected a failure'), (error) => error)

  describe('authentication', () => {
    test('login gives an access token in the body and the refresh token ONLY as an HttpOnly cookie', async () => {
      const response = await fetch(`${running.url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'employee', password: 'fixture-employee' }) })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.deepEqual(Object.keys(body).sort(), ['accessToken', 'expiresIn', 'user'])
      assert.deepEqual(body.user, { id: 'usr-employee-1', displayName: 'موظف تجريبي (عقد)', role: 'employee' })
      assert.equal(JSON.stringify(body).includes('rt-'), false)
      assert.match(response.headers.get('set-cookie'), /^aidp_refresh=.+; HttpOnly; SameSite=Strict; Path=\/api\/v1\/auth$/)
    })

    test('wrong credentials, missing fields and a deactivated account use the documented codes', async () => {
      const login = (identifier, password) => fetch(`${running.url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) }).then(async (r) => [r.status, (await r.json()).error])
      const [wrongStatus, wrong] = await login('employee', 'nope')
      assert.deepEqual([wrongStatus, wrong.code], [401, 'invalidCredentials'])
      const [missingStatus, missing] = await login('', '')
      assert.deepEqual([missingStatus, missing.code], [400, 'missingFields'])
      assert.equal(missing.fields.identifier, 'required')
      const [disabledStatus, disabled] = await login('disabled', 'fixture-disabled')
      assert.deepEqual([disabledStatus, disabled.code], [403, 'accountDisabled'])
      assert.ok(wrong.requestId)
    })

    test('a protected call without a token is 401 "unauthenticated" in the standard envelope', async () => {
      const answer = await fetch(`${running.url}/documents`)
      assert.equal(answer.status, 401)
      assert.equal((await answer.json()).error.code, 'unauthenticated')
    })

    test('an expired access token is repaired by ONE silent refresh through the cookie; the same request then succeeds', async () => {
      const { documents, state } = await signIn('employee', { refresh: 'cookie' })
      await post('/expire-access-tokens', {})
      const list = await documents.list()
      assert.equal(list.length, 3)
      assert.equal(state.refreshes, 1)
      assert.equal(state.ended, 0)
    })

    test('when the refresh is refused the session ends exactly once and the failure is a domain error', async () => {
      const { documents, state } = await signIn('employee', { refresh: 'revoked' })
      await post('/expire-access-tokens', {})
      const error = await failure(documents.list())
      assert.equal(error.code, 'unauthenticated')
      assert.equal(state.ended, 1)
    })

    test('deactivating an account revokes its sessions at once (decision 16)', async () => {
      const employee = await signIn('employee', { refresh: 'cookie' })
      const admin = await signIn('admin')
      await admin.client.post('/employees/usr-employee-1/deactivate')
      const error = await failure(employee.documents.list())
      assert.equal(error.code, 'unauthenticated')
      assert.equal(employee.state.ended, 1)
    })

    test('the Admin-only operations refuse an employee (403 forbidden), whatever the frontend shows', async () => {
      const { client } = await signIn('employee')
      const error = await failure(client.get('/employees'))
      assert.equal(error.status, 403)
      assert.equal(error.details.error.code, 'forbidden')
    })

    test('operations the contract server does not implement answer 501 in the same envelope (they are still in the table)', async () => {
      const { client } = await signIn('admin')
      const error = await failure(client.get('/backups'))
      assert.equal(error.status, 501)
      assert.equal(error.details.error.code, 'unknown')
      assert.equal(ROUTES.filter((route) => !route.implemented).length, 5)
    })
  })

  describe('reading documents (asynchronous document service over HTTP)', () => {
    test('an employee sees their own documents, the Admin all of them; another employee\'s document is "not found"', async () => {
      const employee = await signIn('employee')
      const admin = await signIn('admin')
      assert.deepEqual((await employee.documents.list()).map((item) => item.id).sort(), ['fx-approved', 'fx-pending', 'fx-ready'])
      assert.equal((await admin.documents.list()).length, 4)
      assert.equal(await employee.documents.getSummary('fx-other'), null)
      assert.equal(await employee.documents.getDocument('fx-other'), null)
      assert.equal((await admin.documents.getSummary('fx-other')).ownerId, 'usr-employee-2')
    })

    test('the archive and queue views, filters, sorting and paging are applied by the server (decisions 9 and 12)', async () => {
      const { documents } = await signIn('employee')
      const archive = await documents.listPage({ view: 'archive' })
      assert.deepEqual(archive.items.map((item) => item.state).sort(), ['approved', 'readyForReview']) // every state but Pending
      const queue = await documents.listPage({ view: 'queue' })
      assert.deepEqual(queue.items.map((item) => item.state).sort(), ['pending', 'readyForReview']) // every state but Approved
      assert.deepEqual((await documents.listPage({ query: 'عقد' })).items.map((item) => item.id), ['fx-approved'])
      assert.deepEqual((await documents.listPage({ type: 'invoice' })).items.map((item) => item.id), ['fx-ready'])
      assert.deepEqual((await documents.listPage({ type: 'unclassified' })).items.map((item) => item.id), ['fx-pending'])
      assert.deepEqual((await documents.listPage({ state: 'approved' })).items.map((item) => item.id), ['fx-approved'])
      assert.deepEqual((await documents.listPage({ from: '2026-01-10', to: '2026-01-14' })).items.map((item) => item.id).sort(), ['fx-pending', 'fx-ready'])
      assert.deepEqual((await documents.listPage({ sort: 'uploadedAt_asc' })).items.map((item) => item.id), ['fx-approved', 'fx-ready', 'fx-pending'])
      const second = await documents.listPage({ page: 2, pageSize: 2 })
      assert.equal(second.items.length, 1)
      assert.equal(second.total, 3)
    })

    test('a document opens with valid canonical content for every SELECTED page only, the preserved original extraction and optional coordinates', async () => {
      const { documents } = await signIn('employee')
      const record = await documents.getDocument('fx-ready')
      assert.equal(parseDocumentJson(JSON.stringify(record.snapshot)).ok, true)
      assert.deepEqual(record.snapshot.selectedPages, [1, 2, 3])
      assert.equal(record.snapshot.file.totalPages, 4) // page 4 was not selected: no record for it
      const page = record.snapshot.pages[0]
      assert.ok(page.originalExtraction.elements.length > 0)
      assert.deepEqual(page.originalExtraction.elements.map((element) => element.id), page.elements.map((element) => element.id))
      assert.ok(page.elements[0].location.width > 0)
      assert.equal(page.elements[1].location, null) // coordinates are optional
      assert.equal(record.file, null)
      assert.equal(record.revision, 1)
    })

    test('the status, the metadata and an approved version\'s content are readable', async () => {
      const { documents } = await signIn('employee')
      const status = await documents.getSummary('fx-pending')
      assert.equal(status.state, 'pending')
      assert.equal(status.queuePosition, 1)
      const meta = await documents.getMeta('fx-approved')
      assert.equal(meta.versions[0].number, 1)
      assert.equal(meta.versions[0].isLatest, true)
      const version = await documents.getVersion('fx-approved', 1)
      assert.equal(version.approvedByName, 'المدير (عقد)')
      assert.equal(parseDocumentJson(JSON.stringify(version.snapshot)).ok, true)
      assert.equal(await documents.getVersion('fx-approved', 5), null)
    })

    test('the complete original comes as a binary with an Arabic file name (RFC 5987), through the bearer-token client', async () => {
      const { documents } = await signIn('employee')
      const file = await documents.getOriginalFile('fx-ready')
      assert.equal(file.name, 'تقرير قيد المراجعة.pdf')
      assert.equal(file.type, 'application/pdf')
      assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
      const other = await failure(documents.getOriginalFile('fx-other'))
      assert.equal(other.code, 'notFound')
    })
  })

  describe('registering a document (decisions 1, 35, 36, 37, 41, 48)', () => {
    const upload = (client, { name = 'جديد.pdf', size = 2048, type = 'application/pdf', pages = [1, 3], totalPages = 4, extra = {} } = {}) => {
      const form = new FormData()
      form.append('file', new File([new Uint8Array(size)], name, { type }))
      form.append('selectedPages', typeof pages === 'string' ? pages : JSON.stringify(pages))
      form.append('totalPages', String(totalPages))
      for (const [key, value] of Object.entries(extra)) form.append(key, value)
      return client.post('/documents', form, { timeoutMs: UPLOAD_TIMEOUT_MS })
    }

    test('the whole original is stored, the selected pages recorded, the document is Pending and queued in FIFO order', async () => {
      const { client, documents } = await signIn('employee')
      const registered = await upload(client)
      assert.equal(registered.queuePosition, 2) // after the fixture's pending document
      const record = await documents.getDocument(registered.documentId)
      assert.equal(record.name, 'جديد.pdf')
      assert.equal(record.snapshot.file.totalPages, 4)
      assert.deepEqual(record.snapshot.selectedPages, [1, 3]) // pages 2 and 4 are not failures: they simply have no record
      assert.equal(record.snapshot.pages.every((page) => page.processing.status === 'notProcessed'), true)
      assert.equal((await documents.getSummary(registered.documentId)).state, 'pending')
      assert.equal((await documents.getOriginalFile(registered.documentId)).size, 2048)
      const queue = await client.get('/queue')
      assert.deepEqual(queue.jobs.map((job) => job.documentId), ['fx-pending', registered.documentId])
    })

    test('the server checks again: size (413), selected pages (422), type (415), malformed selection (400), a missing file (400)', async () => {
      const admin = await signIn('admin')
      await admin.client.put('/settings/uploads', { maxFileSizeMb: 1, maxSelectedPages: 2 })
      const { client } = await signIn('employee')
      const tooLarge = await failure(upload(client, { size: 1024 * 1024 + 1 }))
      assert.deepEqual([tooLarge.status, tooLarge.details.error.code, tooLarge.details.error.details.maxFileSizeMb], [413, 'fileTooLarge', 1])
      const tooMany = await failure(upload(client, { pages: [1, 2, 3] }))
      assert.deepEqual([tooMany.status, tooMany.details.error.code, tooMany.details.error.details.maxSelectedPages], [422, 'tooManyPages', 2])
      const type = await failure(upload(client, { name: 'x.gif', type: 'image/gif' }))
      assert.deepEqual([type.status, type.details.error.code], [415, 'unsupportedFileType'])
      for (const pages of ['not json', '[]', '[2,1]', '[0]']) {
        const bad = await failure(upload(client, { pages }))
        assert.deepEqual([bad.status, bad.details.error.code, bad.details.error.fields.selectedPages], [400, 'invalidInput', 'invalid'], pages)
      }
      const noFile = await failure(client.post('/documents', Object.assign(new FormData(), {})))
      assert.equal(noFile.details.error.fields.file, 'required')
    })

    test('an image is exactly one page', async () => {
      const { client, documents } = await signIn('employee')
      const bad = await failure(upload(client, { name: 'scan.png', type: 'image/png', pages: [1, 2] }))
      assert.equal(bad.details.error.code, 'invalidInput')
      const ok = await upload(client, { name: 'scan.png', type: 'image/png', pages: [1] })
      assert.equal((await documents.getDocument(ok.documentId)).snapshot.file.totalPages, 1)
    })

    test('a full disk refuses the upload and the retry (decision 35); the availability answer says why', async () => {
      const { client } = await signIn('employee')
      assert.deepEqual(await client.get('/uploads/availability'), { available: true, reason: null })
      await post('/set-storage-full', { full: true })
      assert.deepEqual(await client.get('/uploads/availability'), { available: false, reason: 'storageFull' })
      const refused = await failure(upload(client))
      assert.deepEqual([refused.status, refused.details.error.code], [507, 'storageFull'])
      assert.equal((await client.get('/queue')).blocked, 'storageFull')
      await post('/set-storage-full', { full: false })
      assert.equal((await upload(client)).queuePosition, 2) // work resumes when space is available
    })

    test('when the AI queue finishes, the document becomes Ready for Review and the owner (only) is notified, with no redirect', async () => {
      const { client, documents } = await signIn('employee')
      const other = await signIn('employee2')
      const { documentId } = await upload(client)
      await post('/process', { documentId })
      const summary = await documents.getSummary(documentId)
      assert.equal(summary.state, 'readyForReview')
      assert.equal(summary.processedCount, 2)
      const notifications = await client.get('/notifications')
      assert.equal(notifications.length, 1)
      assert.equal(notifications[0].type, 'processingCompleted')
      assert.equal(notifications[0].documentId, documentId)
      assert.equal(notifications[0].read, false)
      assert.deepEqual(await other.client.get('/notifications'), [])
      await client.post(`/notifications/${notifications[0].id}/read`)
      assert.equal((await client.get('/notifications'))[0].read, true)
    })

    test('multipart parsing is binary-safe', () => {
      const boundary = 'xBOUNDARYx'
      const bytes = Buffer.from([0, 255, 13, 10, 45, 45, 1])
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="a"\r\n\r\nقيمة\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.bin"\r\nContent-Type: application/pdf\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ])
      const parsed = parseMultipart(body, `multipart/form-data; boundary=${boundary}`)
      assert.equal(parsed.fields.a, 'قيمة')
      assert.deepEqual([...parsed.files.file.bytes], [...bytes])
      assert.equal(parsed.files.file.contentType, 'application/pdf')
      assert.equal(parseMultipart(Buffer.from('x'), 'text/plain'), null)
    })
  })

  describe('saving drafts: lock, revision and page isolation (decisions 13, 38, 47)', () => {
    const editPage = (page, text) => ({ ...page, elements: page.elements.map((element) => (element.type === 'paragraph' ? { ...element, content: { text }, source: { kind: 'manual', details: {} } } : element)) })

    test('the server checks the lock on every save: none held = lockLost, someone else\'s = lockHeld with who', async () => {
      const { documents, client } = await signIn('employee')
      const record = await documents.getDocument('fx-ready')
      const store = documents.getSessionStore('fx-ready')
      const none = await failure(store.savePages('fx-ready', [record.snapshot.pages[0]]))
      assert.equal(none.code, 'lockLost')
      await post('/take-lock', { documentId: 'fx-ready', userId: 'usr-employee-2' })
      const held = await failure(store.savePages('fx-ready', [record.snapshot.pages[0]]))
      assert.equal(held.code, 'lockHeld')
      assert.equal(held.details.lock.holderName, 'موظف آخر (عقد)')
      const outcome = await client.post('/documents/fx-ready/lock')
      assert.equal(outcome.granted, false) // not an error: the UI shows who is editing
      assert.equal(outcome.lock.holderId, 'usr-employee-2')
    })

    test('with the lock a save writes ONLY the named pages and returns the new revision; other pages and the original extraction are untouched', async () => {
      const { documents, client } = await signIn('employee')
      assert.equal((await client.post('/documents/fx-ready/lock')).granted, true)
      const before = await documents.getDocument('fx-ready')
      const store = documents.getSessionStore('fx-ready')
      await store.savePages('fx-ready', [editPage(before.snapshot.pages[1], 'نص مصحح')])
      const after = await documents.getDocument('fx-ready')
      assert.equal(after.revision, before.revision + 1)
      assert.equal(after.snapshot.pages[1].elements.find((element) => element.type === 'paragraph').content.text, 'نص مصحح')
      assert.deepEqual(after.snapshot.pages[0], before.snapshot.pages[0]) // page isolation
      assert.deepEqual(after.snapshot.pages[2], before.snapshot.pages[2])
      assert.deepEqual(after.snapshot.pages[1].originalExtraction, before.snapshot.pages[1].originalExtraction) // the AI result is preserved apart from the correction
    })

    test('a stale save is refused with revisionConflict and the CURRENT revision; nothing is overwritten (lost-update protection)', async () => {
      const { documents, client } = await signIn('employee')
      await client.post('/documents/fx-ready/lock')
      const record = await documents.getDocument('fx-ready')
      const store = documents.getSessionStore('fx-ready')
      await post('/bump-revision', { documentId: 'fx-ready' }) // another writer got in between
      const error = await failure(store.savePages('fx-ready', [editPage(record.snapshot.pages[0], 'قديم')]))
      assert.equal(error.code, 'revisionConflict')
      assert.equal(error.details.currentRevision, 2)
      assert.equal(documents.knownRevision('fx-ready'), 1) // the client keeps what it knew and reloads before retrying
      const stored = await documents.getDocument('fx-ready')
      assert.notEqual(stored.snapshot.pages[0].elements.find((element) => element.type === 'paragraph').content.text, 'قديم')
    })

    test('a page that does not match the stored document rejects the whole save (all-or-nothing)', async () => {
      const { documents, client } = await signIn('employee')
      await client.post('/documents/fx-ready/lock')
      const record = await documents.getDocument('fx-ready')
      const store = documents.getSessionStore('fx-ready')
      const error = await failure(store.savePages('fx-ready', [editPage(record.snapshot.pages[0], 'جيد'), { ...record.snapshot.pages[1], id: 'wrong-id' }]))
      assert.equal(error.code, 'invalidInput')
      const stored = await documents.getDocument('fx-ready')
      assert.equal(stored.revision, 1)
      assert.deepEqual(stored.snapshot.pages[0], record.snapshot.pages[0])
    })

    test('the lease expires by itself (lockLost), can be renewed by its holder only, and can be released', async () => {
      const { client, documents } = await signIn('employee')
      const other = await signIn('employee2')
      await client.post('/documents/fx-ready/lock')
      assert.ok((await client.put('/documents/fx-ready/lock')).lock.expiresAt)
      const record = await documents.getDocument('fx-ready')
      await post('/advance-clock', { ms: 61_000 })
      assert.equal((await failure(client.put('/documents/fx-ready/lock'))).details.error.code, 'lockLost')
      assert.equal((await failure(documents.getSessionStore('fx-ready').savePages('fx-ready', [record.snapshot.pages[0]]))).code, 'lockLost')
      assert.equal(await client.get('/documents/fx-ready/lock'), null)
      await client.post('/documents/fx-ready/lock')
      await client.delete('/documents/fx-ready/lock')
      assert.equal(await client.get('/documents/fx-ready/lock'), null)
      await client.post('/documents/fx-ready/lock')
      assert.equal((await failure(other.client.get('/documents/fx-ready/lock'))).status, 404) // someone else's document is invisible
    })

    test('remembering the last visited page is validated and does not change the revision', async () => {
      const { documents, client } = await signIn('employee')
      await client.put('/documents/fx-ready/last-visited-page', { pageNumber: 2 })
      assert.equal((await documents.getSummary('fx-ready')).lastVisitedPage, 2)
      assert.equal((await documents.getSummary('fx-ready')).revision, 1)
      const bad = await failure(client.put('/documents/fx-ready/last-visited-page', { pageNumber: 4 })) // not a selected page
      assert.equal(bad.status, 400)
    })
  })

  describe('REGRESSION (H1): the polling cannot defeat the revision protection', () => {
    const paragraphOf = (page) => page.elements.find((element) => element.type === 'paragraph')
    const textOnServer = async (documentId, pageNumber) => {
      const admin = await signIn('admin')
      const record = await admin.documents.getDocument(documentId)
      return paragraphOf(record.snapshot.pages.find((page) => page.pageNumber === pageNumber)).content.text
    }

    test('a stale save is refused with revisionConflict even after the screens polled the summary, the list, a list page and the metadata', async () => {
      const { documents, client } = await signIn('employee')
      await client.post('/documents/fx-ready/lock')
      const record = await documents.getDocument('fx-ready') // the session's content is revision 1
      const store = documents.getSessionStore('fx-ready', { revision: record.revision })
      const before = await textOnServer('fx-ready', 1)
      await post('/bump-revision', { documentId: 'fx-ready' }) // another writer got in: revision 2

      // What the polling does on every change signal (this used to move the base of the next save to revision 2).
      assert.equal((await documents.getSummary('fx-ready')).revision, 2)
      assert.equal((await documents.getMeta('fx-ready')).revision, 2)
      assert.ok((await documents.list()).some((item) => item.revision === 2))
      assert.ok((await documents.listPage({ view: 'queue' })).items.some((item) => item.revision === 2))
      assert.equal(documents.knownRevision('fx-ready'), 1)
      assert.equal(store.baseRevision(), 1)

      const stale = { ...record.snapshot.pages[0], elements: record.snapshot.pages[0].elements.map((element) => (element.type === 'paragraph' ? { ...element, content: { text: 'تعديل قديم' } } : element)) }
      const error = await failure(store.savePages('fx-ready', [stale]))
      assert.equal(error.code, 'revisionConflict')
      assert.equal(error.details.currentRevision, 2)
      assert.equal(await textOnServer('fx-ready', 1), before) // nothing was overwritten
    })

    test('the user\'s UNSAVED edits survive the conflict in the review session, the retry is refused again, and nothing reaches the server', async () => {
      const { documents, client } = await signIn('employee')
      await client.post('/documents/fx-ready/lock')
      const record = await documents.getDocument('fx-ready')
      const serverText = await textOnServer('fx-ready', 1)
      const session = createReviewSession({
        record,
        store: documents.getSessionStore('fx-ready', { revision: record.revision }),
        processing: NOT_CONNECTED_PAGE_PROCESSING,
        role: 'employee',
        userId: 'usr-employee-1',
        autosaveOptions: { delayMs: 1_000_000, maxWaitMs: 1_000_000, retryDelaysMs: [] }, // nothing fires by itself in this test
        autoProcess: false,
      })
      try {
        const element = paragraphOf(session.getView().editor.document.pages[0])
        session.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: element.id, patch: { text: 'تعديل المستخدم غير المحفوظ' } })
        await post('/bump-revision', { documentId: 'fx-ready' })
        await documents.getSummary('fx-ready') // the polling
        await documents.list()

        const saved = await session.flushSave()
        assert.equal(saved.status, 'failed') // refused with 409, not silently written
        assert.notEqual(session.getEffectiveSaveStatus(), 'saved')
        assert.equal(paragraphOf(session.getView().editor.document.pages[0]).content.text, 'تعديل المستخدم غير المحفوظ') // the user's edit is still there
        assert.equal(session.getNavigationGuard().shouldBlock, true) // and leaving the page is still guarded

        await session.retrySave() // a retry is not a silent rebase onto revision 2
        assert.equal(session.getView().save.status, 'failed')
        assert.equal(await textOnServer('fx-ready', 1), serverText)
        assert.equal(documents.knownRevision('fx-ready'), 1)
      } finally {
        await session.close()
      }
    })

    test('without a conflict the same session saves, and a later poll does not cause a conflict with its own save', async () => {
      const { documents, client } = await signIn('employee')
      await client.post('/documents/fx-ready/lock')
      const record = await documents.getDocument('fx-ready')
      const store = documents.getSessionStore('fx-ready', { revision: record.revision })
      const page = record.snapshot.pages[0]
      await store.savePages('fx-ready', [page])
      assert.equal(store.baseRevision(), 2)
      await documents.getSummary('fx-ready') // the poll answers with the revision the save produced
      await documents.list()
      await store.savePages('fx-ready', [page]) // the next autosave
      assert.equal(store.baseRevision(), 3)
      assert.equal((await documents.getSummary('fx-ready')).revision, 3)
    })
  })

  describe('reprocessing a page (decisions 38 and 40)', () => {
    test('a result arrives as a CANDIDATE, nothing is replaced until it is accepted; every accepted result is logged; rejecting discards the content', async () => {
      const { documents, client } = await signIn('employee')
      await client.post('/documents/fx-ready/lock')
      const before = await documents.getDocument('fx-ready')
      const job = await client.post('/documents/fx-ready/pages/2/reprocess', { baseRevision: before.revision })
      assert.deepEqual([job.kind, job.pageNumber, job.state], ['page', 2, 'queued'])
      assert.equal((await client.get('/documents/fx-ready/jobs')).length, 1)
      await post('/complete-job', { jobId: job.id })
      const waiting = await documents.getDocument('fx-ready')
      assert.equal(waiting.candidates[2].attempt, job.attempt)
      assert.deepEqual(waiting.snapshot.pages[1].elements, before.snapshot.pages[1].elements) // the current content is untouched
      const accepted = await client.post('/documents/fx-ready/pages/2/candidate/accept', { attempt: job.attempt, baseRevision: waiting.revision })
      assert.equal(accepted.page.pageNumber, 2)
      assert.notDeepEqual(accepted.page.elements, before.snapshot.pages[1].elements)
      assert.equal((await documents.getMeta('fx-ready')).acceptedResultCounts[2], 1)
      const second = await client.post('/documents/fx-ready/pages/3/reprocess', { baseRevision: accepted.revision })
      await post('/complete-job', { jobId: second.id })
      await client.post('/documents/fx-ready/pages/3/candidate/reject', { attempt: second.attempt })
      const finalRecord = await documents.getDocument('fx-ready')
      assert.deepEqual(finalRecord.candidates, {}) // rejected content is not kept
      const statuses = (await documents.getMeta('fx-ready')).attempts.filter((attempt) => attempt.trigger === 'reprocess').map((attempt) => attempt.status)
      assert.deepEqual(statuses, ['accepted', 'rejected']) // metadata only
      assert.deepEqual(finalRecord.snapshot.pages[2].elements.length, before.snapshot.pages[2].elements.length)
    })

    test('reprocessing needs the lock and a current revision', async () => {
      const { client } = await signIn('employee')
      assert.equal((await failure(client.post('/documents/fx-ready/pages/2/reprocess', { baseRevision: 1 }))).details.error.code, 'lockLost')
      await client.post('/documents/fx-ready/lock')
      assert.equal((await failure(client.post('/documents/fx-ready/pages/2/reprocess', { baseRevision: 0 }))).details.error.code, 'revisionConflict')
      assert.equal((await failure(client.post('/documents/fx-ready/pages/9/reprocess', { baseRevision: 1 }))).status, 404)
    })

    test('a failed document can be retried WITHOUT a new upload (decision 11); a healthy one cannot', async () => {
      const { client } = await signIn('employee')
      assert.equal((await failure(client.post('/documents/fx-ready/retry'))).details.error.code, 'invalidState')
      assert.equal((await failure(client.post('/documents/fx-pending/retry'))).details.error.code, 'invalidState')
    })
  })

  describe('approval and versions (decisions 6, 14, 39)', () => {
    async function reviewAllPages(user, documentId) {
      await user.client.post(`/documents/${documentId}/lock`)
      const record = await user.documents.getDocument(documentId)
      const pages = record.snapshot.pages.map((page) => ({ ...page, review: { status: 'reviewed', confirmedAt: '2026-01-15T09:00:00.000Z' } }))
      await user.documents.getSessionStore(documentId).savePages(documentId, pages)
      return user.documents.getDocument(documentId)
    }

    test('approval is refused until every selected page is reviewed (notEligible lists why); then it creates an immutable version and releases the lock', async () => {
      const user = await signIn('employee')
      await user.client.post('/documents/fx-ready/lock')
      const early = await failure(user.client.post('/documents/fx-ready/approval', { baseRevision: 1 }))
      assert.deepEqual([early.status, early.details.error.code, early.details.error.details.reasons], [409, 'notEligible', ['pagesNotReviewed']])
      const record = await reviewAllPages(user, 'fx-ready')
      const approved = await user.client.post('/documents/fx-ready/approval', { baseRevision: record.revision })
      assert.equal(approved.version.number, 1)
      assert.equal(approved.revision, record.revision + 1)
      assert.equal((await user.documents.getSummary('fx-ready')).state, 'approved')
      assert.equal(await user.client.get('/documents/fx-ready/lock'), null)
      assert.equal((await user.documents.getVersion('fx-ready', 1)).approvedByName, 'موظف تجريبي (عقد)')
    })

    test('a STALE approval is refused: the approver must approve what they last saw', async () => {
      const user = await signIn('employee')
      const record = await reviewAllPages(user, 'fx-ready')
      await post('/bump-revision', { documentId: 'fx-ready' })
      const stale = await failure(user.client.post('/documents/fx-ready/approval', { baseRevision: record.revision }))
      assert.deepEqual([stale.status, stale.details.error.code, stale.details.error.details.currentRevision], [409, 'revisionConflict', record.revision + 1])
      assert.equal((await failure(user.client.post('/documents/fx-ready/approval', {}))).details.error.fields.baseRevision, 'required')
      assert.equal((await user.documents.getSummary('fx-ready')).state, 'readyForReview')
    })

    test('an employee approves only their own documents; the Admin any (the other employee\'s document is invisible to them)', async () => {
      const other = await signIn('employee2')
      const admin = await signIn('admin')
      assert.equal((await failure(other.client.post('/documents/fx-ready/approval', { baseRevision: 1 }))).status, 404)
      await reviewAllPages(admin, 'fx-ready')
      const record = await admin.documents.getDocument('fx-ready')
      assert.equal((await admin.client.post('/documents/fx-ready/approval', { baseRevision: record.revision })).version.number, 1)
    })

    test('an approved document is read-only for everyone, including its owner (decision 14)', async () => {
      const user = await signIn('employee')
      await user.client.post('/documents/fx-approved/lock')
      const record = await user.documents.getDocument('fx-approved')
      const error = await failure(user.documents.getSessionStore('fx-approved').savePages('fx-approved', [record.snapshot.pages[0]]))
      assert.equal(error.code, 'invalidState')
      assert.equal((await failure(user.client.post('/documents/fx-approved/approval', { baseRevision: record.revision }))).details.error.code, 'invalidState')
    })

    test('only the Admin creates a new version; the previous approved version and its date are preserved; it needs its own approval', async () => {
      const user = await signIn('employee')
      const admin = await signIn('admin')
      assert.equal((await failure(user.client.post('/documents/fx-approved/versions'))).status, 403) // not even for their own document
      const before = await admin.documents.getMeta('fx-approved')
      const created = await admin.client.post('/documents/fx-approved/versions')
      assert.equal(created.revision, before.revision + 1)
      assert.equal((await admin.documents.getSummary('fx-approved')).state, 'readyForReview')
      const after = await admin.documents.getMeta('fx-approved')
      assert.deepEqual(after.versions, before.versions) // version 1 stays, with its date
      assert.equal((await failure(admin.client.post('/documents/fx-ready/versions'))).details.error.code, 'invalidState')
      const reapproved = await reviewAllPages(admin, 'fx-approved')
      const second = await admin.client.post('/documents/fx-approved/approval', { baseRevision: reapproved.revision })
      assert.equal(second.version.number, 2)
      assert.equal((await admin.documents.getMeta('fx-approved')).versions.length, 2)
      assert.equal((await admin.documents.getVersion('fx-approved', 1)).number, 1)
    })
  })

  describe('export is generated by the BACKEND (D3): the frontend only requests and downloads', () => {
    const exportOf = (client, documentId, format) => client.post(`/documents/${documentId}/exports`, { format }, { responseType: 'blob' })

    test('JSON contains only the selected and approved pages, in original order, with source page numbers and no internal source (decisions 46, 49)', async () => {
      const { client } = await signIn('employee')
      const result = await exportOf(client, 'fx-approved', 'json')
      assert.equal(result.contentType, 'application/json')
      assert.equal(result.fileName, 'عقد معتمد.json')
      assert.equal(result.headers.get('x-aidp-page-count'), '2')
      assert.equal(result.headers.get('x-aidp-source-pages'), '1,2')
      assert.equal(result.headers.get('x-aidp-version'), '1')
      const data = JSON.parse(await result.blob.text())
      assert.deepEqual(data.pages.map((page) => page.sourcePage), [1, 2])
      assert.equal(JSON.stringify(data).includes('"source"'), false)
      assert.deepEqual(Object.keys(data.pages[0].elements[0]).sort(), ['content', 'location', 'order', 'type'])
    })

    test('the other formats are produced by the server too: the contract server only serves a labelled stand-in with the right type and name', async () => {
      const { client } = await signIn('employee')
      const types = { docx: 'wordprocessingml.document', xlsx: 'spreadsheetml.sheet', pdf: 'application/pdf' }
      for (const [format, type] of Object.entries(types)) {
        const result = await exportOf(client, 'fx-approved', format)
        assert.match(result.contentType, new RegExp(type))
        assert.equal(result.fileName, `عقد معتمد.${format}`)
        assert.equal(result.headers.get('x-aidp-fixture'), 'true') // NOT a real document
      }
      assert.equal((await failure(exportOf(client, 'fx-approved', 'png'))).details.error.fields.format, 'unknownFormat') // no PNG/JPG
    })

    test('a document that was never approved cannot be exported; another employee\'s document cannot either', async () => {
      const user = await signIn('employee')
      assert.equal((await failure(exportOf(user.client, 'fx-ready', 'json'))).details.error.code, 'invalidState')
      const other = await signIn('employee2')
      assert.equal((await failure(exportOf(other.client, 'fx-approved', 'json'))).status, 404)
    })

    test('after an Admin starts a new version the LAST APPROVED version is still what is exported', async () => {
      const admin = await signIn('admin')
      await admin.client.post('/documents/fx-approved/versions')
      const result = await exportOf(admin.client, 'fx-approved', 'json')
      assert.equal(result.headers.get('x-aidp-version'), '1')
    })
  })

  describe('administration, the recycle bin and settings (representative)', () => {
    test('an employee account: validation, duplicates (409), password, deactivate, reactivate; the password is never returned', async () => {
      const { client } = await signIn('admin')
      const bad = await failure(client.post('/employees', { displayName: '', identifier: 'a', password: '123' }))
      assert.deepEqual(bad.details.error.fields, { displayName: 'required', identifier: 'tooShort', password: 'tooShort' })
      const created = await client.post('/employees', { displayName: 'موظف جديد', identifier: 'newbie', password: 'long-enough-1' })
      assert.equal('password' in created, false)
      assert.equal((await failure(client.post('/employees', { displayName: 'x', identifier: 'NEWBIE', password: 'long-enough-1' }))).details.error.code, 'duplicateIdentifier')
      await client.put(`/employees/${created.id}/password`, { password: 'another-long-1' })
      assert.equal((await client.post(`/employees/${created.id}/deactivate`)).status, 'deactivated')
      assert.equal((await client.post(`/employees/${created.id}/reactivate`)).status, 'active')
      const listed = await client.get('/employees')
      assert.equal(listed.some((employee) => 'password' in employee), false)
    })

    test('settings: any user reads the limits, only the Admin changes them, the server validates ranges', async () => {
      const user = await signIn('employee')
      const admin = await signIn('admin')
      assert.deepEqual(await user.client.get('/settings/limits'), { maxFileSizeMb: 10, maxSelectedPages: 100 })
      assert.equal((await failure(user.client.put('/settings/uploads', { maxFileSizeMb: 5, maxSelectedPages: 5 }))).status, 403)
      assert.equal((await failure(admin.client.put('/settings/uploads', { maxFileSizeMb: 0, maxSelectedPages: 5 }))).details.error.fields.maxFileSizeMb, 'outOfRange')
      await admin.client.put('/settings/uploads', { maxFileSizeMb: 20, maxSelectedPages: 50 })
      assert.deepEqual(await user.client.get('/settings/limits'), { maxFileSizeMb: 20, maxSelectedPages: 50 })
    })

    test('the recycle bin: only the Admin deletes (soft), the document leaves the lists, can be restored; the audit log has no export', async () => {
      const user = await signIn('employee')
      const admin = await signIn('admin')
      assert.equal((await failure(user.client.post('/documents/fx-ready/trash'))).status, 403) // decision 42
      assert.deepEqual(await admin.client.post('/documents/fx-pending/trash'), { cancelledProcessing: true }) // decision 45
      assert.equal(await user.documents.getSummary('fx-pending'), null)
      assert.equal((await admin.client.get('/recycle-bin')).length, 1)
      await admin.client.post('/recycle-bin/fx-pending/restore')
      assert.equal((await user.documents.getSummary('fx-pending')).state, 'pending')
      assert.equal((await failure(admin.client.get('/audit-log/export'))).status, 404)
    })

    test('templates are read-only and any signed-in user may list them', async () => {
      const { client } = await signIn('employee')
      assert.equal((await client.get('/templates')).length, 2)
      assert.equal((await failure(client.post('/templates', {}))).status, 405)
    })
  })

  test('a caller that cannot reach the server gets the "network" failure, not a hang', async () => {
    const client = createApiClient({ baseUrl: 'http://127.0.0.1:9/api/v1', timeoutMs: 2000 })
    const error = await failure(client.get('/documents'))
    assert.ok(error instanceof ApiError)
    assert.ok([API_ERROR.network, API_ERROR.timeout].includes(error.code))
  })

  test('a simulated server failure (fail-next) reaches the frontend as a domain error and the next call works', async () => {
    const { documents } = await signIn('employee')
    await post('/fail-next', { status: 503, code: 'unknown' })
    assert.equal((await failure(documents.list())).code, 'unknown')
    assert.equal((await documents.list()).length, 3)
  })
})
