// Batch E / Wave 1: the API client foundation (request construction, token provider, per-request timeouts, binary and
// FormData bodies, the one-time silent refresh, 401 handling) and the unified mapping from HTTP failures to the domain
// errors. The older API-client tests are in auth.test.js and keep passing unchanged.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, test } from 'node:test'
import {
  API_ERROR,
  ApiError,
  buildQueryString,
  clearAccessToken,
  createApiClient,
  getApiClient,
  hasAccessToken,
  parseContentDispositionFileName,
  resetApiClientForTests,
  setAccessToken,
  setRefreshHandler,
  setUnauthorizedHandler,
  UPLOAD_TIMEOUT_MS,
} from '../src/services/apiClient.js'
import { domainCodeOf, isRevisionConflict, isSessionError, readErrorEnvelope, SERVER_ERROR_CODES, toAuthError, toEmployeeError, toSystemError } from '../src/services/apiErrors.js'
import { AUTH_ERROR, AuthError } from '../src/services/authErrors.js'
import { EMPLOYEE_ERROR, EmployeeError } from '../src/services/employeeErrors.js'
import { SYSTEM_ERROR, SystemError } from '../src/services/systemErrors.js'

const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const envelope = (code, extra = {}) => ({ error: { code, message: `${code} happened`, ...extra } })

function clientWith(handler, options = {}) {
  const requests = []
  const client = createApiClient({
    baseUrl: 'https://api.test/api/v1',
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      return handler(url, init, requests.length)
    },
    ...options,
  })
  return { client, requests }
}

afterEach(() => resetApiClientForTests())

describe('request construction', () => {
  test('builds the query string: skips empty values, repeats arrays, encodes Arabic', () => {
    assert.equal(buildQueryString(undefined), '')
    assert.equal(buildQueryString({ a: undefined, b: null, c: '' }), '')
    assert.equal(buildQueryString({ page: 2, q: 'عقد', state: ['a', 'b'] }), `?page=2&q=${encodeURIComponent('عقد')}&state=a&state=b`)
  })

  test('the query is appended to the joined URL', async () => {
    const { client, requests } = clientWith(() => json(200, {}))
    await client.get('/documents', { query: { view: 'archive', q: '', page: 1 } })
    assert.equal(requests[0].url, 'https://api.test/api/v1/documents?view=archive&page=1')
  })

  test('JSON requests ask for JSON; binary requests accept anything; credentials are forwarded when configured', async () => {
    const { client, requests } = clientWith(() => json(200, {}), { credentials: 'include' })
    await client.get('x')
    await client.get('x', { responseType: 'blob' })
    assert.equal(requests[0].init.headers.Accept, 'application/json')
    assert.equal(requests[1].init.headers.Accept, '*/*')
    assert.equal(requests[0].init.credentials, 'include')
    const plain = clientWith(() => json(200, {}))
    await plain.client.get('x')
    assert.equal(plain.requests[0].init.credentials, undefined)
  })

  test('custom headers are kept and the caller cannot lose the bearer token by passing others', async () => {
    const { client, requests } = clientWith(() => json(200, {}), { getAccessToken: () => 'tok' })
    await client.get('x', { headers: { 'X-Trace': '1' } })
    assert.equal(requests[0].init.headers['X-Trace'], '1')
    assert.equal(requests[0].init.headers.Authorization, 'Bearer tok')
  })

  test('skipAuth sends no token (the login and refresh requests)', async () => {
    const { client, requests } = clientWith(() => json(200, {}), { getAccessToken: () => 'tok' })
    await client.post('/auth/login', { identifier: 'a', password: 'b' }, { skipAuth: true })
    assert.equal(requests[0].init.headers.Authorization, undefined)
  })
})

describe('responses', () => {
  test('binary responses give the blob, its type and the file name (also Arabic, RFC 5987)', async () => {
    const name = 'تقرير.docx'
    const { client } = clientWith(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="report.docx"; filename*=UTF-8''${encodeURIComponent(name)}`, 'x-aidp-page-count': '2' } }))
    const result = await client.get('/documents/d/exports', { responseType: 'blob' })
    assert.equal(result.blob.size, 3)
    assert.equal(result.contentType, 'application/octet-stream')
    assert.equal(result.fileName, name)
    assert.equal(result.headers.get('x-aidp-page-count'), '2')
  })

  test('Content-Disposition parsing: extended form first, then quoted, then bare, else null', () => {
    assert.equal(parseContentDispositionFileName(`attachment; filename*=UTF-8''%D8%B9%D9%82%D8%AF.pdf`), 'عقد.pdf')
    assert.equal(parseContentDispositionFileName('attachment; filename="a b.pdf"'), 'a b.pdf')
    assert.equal(parseContentDispositionFileName('attachment; filename=plain.pdf'), 'plain.pdf')
    assert.equal(parseContentDispositionFileName('inline'), null)
    assert.equal(parseContentDispositionFileName(null), null)
    assert.equal(parseContentDispositionFileName("attachment; filename*=UTF-8''%E0%A4%A; filename=\"fallback.pdf\""), 'fallback.pdf')
  })

  test('responseType text returns the text of a JSON body untouched; json forces parsing', async () => {
    const { client } = clientWith(() => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'text/plain' } }))
    assert.equal(await client.get('x', { responseType: 'text' }), '{"a":1}')
    assert.deepEqual(await client.get('x', { responseType: 'json' }), { a: 1 })
  })

  test('an error answer keeps the parsed envelope in `details`, also for a binary request', async () => {
    const { client } = clientWith(() => json(409, envelope('invalidState')))
    await assert.rejects(client.get('x', { responseType: 'blob' }), (error) => error instanceof ApiError && error.status === 409 && error.details.error.code === 'invalidState')
  })
})

describe('timeouts and cancellation', () => {
  // Like fetch: pending until aborted; rejects at once when the signal is already aborted.
  const hang = (url, init) =>
    new Promise((resolve, reject) => {
      if (init.signal.aborted) reject(init.signal.reason)
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    })

  test('a per-request timeout overrides the client default (an upload may take much longer than a read)', async () => {
    const { client } = clientWith(hang, { timeoutMs: 5000 })
    await assert.rejects(client.get('x', { timeoutMs: 15 }), (error) => error.code === API_ERROR.timeout)
    assert.ok(UPLOAD_TIMEOUT_MS > 30000)
  })

  test('a caller that aborts is not reported as a network failure, also when the signal was already aborted', async () => {
    const { client, requests } = clientWith(hang)
    const controller = new AbortController()
    const pending = client.get('x', { signal: controller.signal })
    controller.abort(new DOMException('left the screen', 'AbortError'))
    await assert.rejects(pending, (error) => error.name === 'AbortError')
    const done = new AbortController()
    done.abort(new DOMException('already', 'AbortError'))
    await assert.rejects(client.get('y', { signal: done.signal }), (error) => error.name === 'AbortError')
    assert.equal(requests.length, 2)
  })

  test('network failures and timeouts both end up as the single domain code "network"', async () => {
    const down = createApiClient({ fetchImpl: async () => Promise.reject(new TypeError('failed')) })
    const slow = clientWith(hang, { timeoutMs: 10 })
    const failures = []
    await down.get('x').catch((error) => failures.push(error))
    await slow.client.get('x').catch((error) => failures.push(error))
    assert.deepEqual(failures.map((error) => error.code), [API_ERROR.network, API_ERROR.timeout])
    assert.deepEqual(failures.map(domainCodeOf), [SYSTEM_ERROR.network, SYSTEM_ERROR.network])
  })
})

describe('the access token and unauthorized handling', () => {
  test('the in-memory token feeds the shared client and clears; nothing is written to web storage', async () => {
    const touched = []
    const guard = (name) => ({ getItem: () => touched.push(`${name}.get`), setItem: () => touched.push(`${name}.set`), removeItem: () => touched.push(`${name}.remove`) })
    const original = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage }
    Object.defineProperty(globalThis, 'localStorage', { value: guard('local'), configurable: true })
    Object.defineProperty(globalThis, 'sessionStorage', { value: guard('session'), configurable: true })
    const seen = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      seen.push(init.headers.Authorization ?? null)
      return json(200, {})
    }
    try {
      const client = getApiClient()
      await client.get('x')
      setAccessToken('secret-access')
      assert.equal(hasAccessToken(), true)
      await client.get('x')
      clearAccessToken()
      assert.equal(hasAccessToken(), false)
      await client.get('x')
    } finally {
      globalThis.fetch = realFetch
      for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { value, configurable: true })
    }
    assert.deepEqual(seen, [null, 'Bearer secret-access', null])
    assert.deepEqual(touched, [])
    // And the source of the client never mentions web storage at all.
    assert.doesNotMatch(readFileSync(new URL('../src/services/apiClient.js', import.meta.url), 'utf8'), /localStorage\.|sessionStorage\.|document\.cookie/)
  })

  test('a 401 with no refresh ends the session once; a failed login (handleUnauthorized: false) does not', async () => {
    let ended = 0
    const { client } = clientWith(() => json(401, envelope('invalidCredentials')), { onUnauthorized: () => (ended += 1) })
    await assert.rejects(client.post('/auth/login', {}, { skipAuth: true, handleUnauthorized: false }), (error) => error.code === API_ERROR.unauthorized)
    assert.equal(ended, 0)
    await assert.rejects(client.get('/documents'), (error) => error.code === API_ERROR.unauthorized)
    assert.equal(ended, 1)
  })

  test('a 401 triggers ONE silent refresh and the same request is repeated with the new token', async () => {
    let token = 'old'
    let ended = 0
    let refreshes = 0
    const { client, requests } = clientWith((url, init) => (init.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, envelope('unauthenticated'))), {
      getAccessToken: () => token,
      onUnauthorized: () => (ended += 1),
      refreshSession: async () => {
        refreshes += 1
        token = 'new'
        return true
      },
    })
    assert.deepEqual(await client.get('/documents'), { ok: true })
    assert.equal(refreshes, 1)
    assert.equal(ended, 0)
    assert.deepEqual(requests.map((request) => request.init.headers.Authorization), ['Bearer old', 'Bearer new'])
  })

  test('requests that fail together share one refresh; a refresh that fails (or throws) ends the session', async () => {
    let refreshes = 0
    let ended = 0
    const { client } = clientWith(() => json(401, envelope('unauthenticated')), {
      onUnauthorized: () => (ended += 1),
      refreshSession: async () => {
        refreshes += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        throw new Error('refresh endpoint down')
      },
    })
    const results = await Promise.allSettled([client.get('a'), client.get('b'), client.get('c')])
    assert.ok(results.every((result) => result.status === 'rejected' && result.reason.code === API_ERROR.unauthorized))
    assert.equal(refreshes, 1)
    assert.equal(ended, 3)
  })

  test('a request is repeated only once: a 401 after a successful refresh ends the session', async () => {
    let ended = 0
    let refreshes = 0
    const { client, requests } = clientWith(() => json(401, envelope('unauthenticated')), { onUnauthorized: () => (ended += 1), refreshSession: async () => (refreshes += 1) > 0 })
    await assert.rejects(client.get('x'))
    assert.equal(requests.length, 2)
    assert.equal(refreshes, 1)
    assert.equal(ended, 1)
  })

  test('the shared client wires the registered unauthorized and refresh hooks, and they can be removed', async () => {
    const realFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => json(++calls === 1 ? 401 : 200, calls === 1 ? envelope('unauthenticated') : { ok: true })
    try {
      let ended = 0
      const remove = setUnauthorizedHandler(() => (ended += 1))
      setRefreshHandler(async () => true)
      assert.deepEqual(await getApiClient().get('x'), { ok: true })
      assert.equal(ended, 0)
      setRefreshHandler(null)
      globalThis.fetch = async () => json(401, envelope('unauthenticated'))
      await assert.rejects(getApiClient().get('x'))
      assert.equal(ended, 1)
      remove()
      await assert.rejects(getApiClient().get('x'))
      assert.equal(ended, 1)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('uploads', () => {
  test('FormData is sent untouched with a long timeout available per request', async () => {
    const { client, requests } = clientWith(() => json(202, { documentId: 'd1' }))
    const form = new FormData()
    form.append('file', new Blob(['%PDF']), 'a.pdf')
    form.append('selectedPages', '[1]')
    assert.deepEqual(await client.post('/documents', form, { timeoutMs: UPLOAD_TIMEOUT_MS }), { documentId: 'd1' })
    assert.equal(requests[0].init.body, form)
    assert.equal(requests[0].init.headers['Content-Type'], undefined)
  })
})

describe('error mapping (HTTP failure -> domain error)', () => {
  const apiError = (status, body) => new ApiError(status === 401 ? API_ERROR.unauthorized : status === 403 ? API_ERROR.forbidden : status === 404 ? API_ERROR.notFound : status >= 500 ? API_ERROR.server : API_ERROR.http, 'x', { status, details: body })

  test('the envelope is read; unknown codes become "unknown"; a body that is not an envelope is ignored', () => {
    assert.deepEqual(readErrorEnvelope(envelope('revisionConflict', { details: { currentRevision: 7 } })).details, { currentRevision: 7 })
    assert.equal(readErrorEnvelope(envelope('somethingNew')).code, 'unknown')
    assert.equal(readErrorEnvelope({ detail: 'FastAPI default' }), null)
    assert.equal(readErrorEnvelope('oops'), null)
    assert.equal(readErrorEnvelope(null), null)
  })

  test('the server code wins; without an envelope the status decides', () => {
    assert.equal(domainCodeOf(apiError(409, envelope('lockHeld'))), 'lockHeld')
    assert.equal(domainCodeOf(apiError(403, envelope('accountDisabled'))), 'accountDisabled')
    assert.equal(domainCodeOf(apiError(401, null)), 'unauthenticated')
    assert.equal(domainCodeOf(apiError(403, 'text')), SYSTEM_ERROR.forbidden)
    assert.equal(domainCodeOf(apiError(404, { detail: 'Not Found' })), SYSTEM_ERROR.notFound)
    assert.equal(domainCodeOf(apiError(502, null)), SYSTEM_ERROR.unknown)
    assert.equal(domainCodeOf(apiError(422, null)), SYSTEM_ERROR.unknown)
    assert.equal(domainCodeOf(new Error('boom')), SYSTEM_ERROR.unknown)
    assert.equal(domainCodeOf(new SystemError('blocked')), 'blocked')
  })

  test('toSystemError keeps the fields, the details (current revision, lock) and the cause; domain errors pass through', () => {
    const mapped = toSystemError(apiError(409, envelope('revisionConflict', { fields: { pages: 'mismatch' }, details: { currentRevision: 9 } })))
    assert.ok(mapped instanceof SystemError)
    assert.equal(mapped.code, 'revisionConflict')
    assert.deepEqual(mapped.fields, { pages: 'mismatch' })
    assert.equal(mapped.details.currentRevision, 9)
    assert.equal(mapped.status, 409)
    assert.ok(mapped.cause instanceof ApiError)
    const own = new SystemError('forbidden')
    assert.equal(toSystemError(own), own)
    assert.equal(toSystemError(new ApiError(API_ERROR.network, 'down')).code, SYSTEM_ERROR.network)
    assert.equal(toSystemError(new ApiError(API_ERROR.timeout, 'slow')).code, SYSTEM_ERROR.network)
  })

  test('sign-in failures map to the AuthError codes the login page already shows', () => {
    const cases = [[401, 'invalidCredentials', AUTH_ERROR.invalidCredentials], [403, 'accountDisabled', AUTH_ERROR.accountDisabled], [400, 'missingFields', AUTH_ERROR.missingFields], [500, 'unknown', AUTH_ERROR.unknown]]
    for (const [status, code, expected] of cases) {
      const mapped = toAuthError(apiError(status, envelope(code)))
      assert.ok(mapped instanceof AuthError)
      assert.equal(mapped.code, expected, code)
    }
    assert.equal(toAuthError(new ApiError(API_ERROR.network, 'down')).code, AUTH_ERROR.network)
    const own = new AuthError(AUTH_ERROR.notConnected)
    assert.equal(toAuthError(own), own)
  })

  test('employee failures map to the EmployeeError codes and fields', () => {
    const mapped = toEmployeeError(apiError(409, envelope('duplicateIdentifier', { fields: { identifier: 'taken' } })))
    assert.ok(mapped instanceof EmployeeError)
    assert.equal(mapped.code, EMPLOYEE_ERROR.duplicateIdentifier)
    assert.deepEqual(mapped.fields, { identifier: 'taken' })
    assert.equal(toEmployeeError(apiError(400, envelope('invalidInput', { fields: { password: 'tooShort' } }))).fields.password, 'tooShort')
    assert.equal(toEmployeeError(apiError(409, envelope('lockHeld'))).code, EMPLOYEE_ERROR.unknown)
  })

  test('session and revision helpers', () => {
    assert.equal(isSessionError(apiError(401, null)), true)
    assert.equal(isSessionError(apiError(403, null)), false)
    assert.equal(isRevisionConflict(apiError(409, envelope('revisionConflict'))), true)
    assert.equal(isRevisionConflict(apiError(409, envelope('lockHeld'))), false)
  })

  test('the closed list of server codes is the one documented in the contract and in error-codes.md', () => {
    const yaml = readFileSync(new URL('../docs/api/openapi.draft.yaml', import.meta.url), 'utf8').replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10))
    const block = /ErrorCode:\n[\s\S]*?enum:\n((?:\s+- \w+\n)+)/.exec(yaml)
    const documented = block[1].split('\n').map((line) => line.replace(/^\s+- /, '')).filter(Boolean)
    assert.deepEqual([...SERVER_ERROR_CODES].sort(), documented.sort())
    const markdown = readFileSync(new URL('../docs/api/error-codes.md', import.meta.url), 'utf8')
    for (const code of SERVER_ERROR_CODES) assert.ok(markdown.includes(`\`${code}\``), `error-codes.md lacks ${code}`)
  })
})
