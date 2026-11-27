// Shared HTTP client for the backend API (Batch E, Wave 1 foundation).
//
// It is the ONLY place that knows about `fetch`, headers, timeouts and HTTP status codes; screens never see them
// (they talk to the services in src/services/, which use this client). It provides:
//   - one base URL (build configuration, see serviceMode.js) and `path` + `query` building;
//   - the bearer token from a provider (the auth layer keeps the token in MEMORY ONLY: it is never written to
//     localStorage/sessionStorage, decision D7);
//   - JSON, FormData (uploads) and binary (`responseType: 'blob'`) bodies;
//   - a per-request timeout (default for the client, overridable per request, e.g. for uploads);
//   - one error type (ApiError) with one code per failure kind; mapping to the domain errors is in apiErrors.js;
//   - a single "session is no longer valid" hook (HTTP 401) with an OPTIONAL one-time silent refresh first.
//
// No endpoint name, request body or response schema is defined here: those belong to the services
// (docs/api/openapi.draft.yaml is the PROPOSED contract, not an agreement).

import { getApiBaseUrl } from './serviceMode.js'

export const API_ERROR = Object.freeze({
  network: 'NETWORK_ERROR',
  timeout: 'TIMEOUT',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  server: 'SERVER_ERROR',
  http: 'HTTP_ERROR',
  invalidResponse: 'INVALID_RESPONSE',
})

export const DEFAULT_TIMEOUT_MS = 30000
// A document upload may take much longer than an ordinary request (large scans over a local network).
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000

export class ApiError extends Error {
  // `status` is the HTTP status (0 when no response arrived); `details` is the parsed error body when the server sent one.
  constructor(code, message, { status = 0, details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

function codeForStatus(status) {
  if (status === 401) return API_ERROR.unauthorized
  if (status === 403) return API_ERROR.forbidden
  if (status === 404) return API_ERROR.notFound
  if (status >= 500) return API_ERROR.server
  return API_ERROR.http
}

function joinUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/${path.replace(/^\/+/, '')}`
}

// `query` values that are undefined, null or '' are left out; arrays repeat the key.
export function buildQueryString(query) {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null && item !== '') params.append(key, String(item))
    }
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

// The file name of a Content-Disposition header (RFC 5987 `filename*` first, so Arabic names survive), or null.
export function parseContentDispositionFileName(header) {
  if (!header) return null
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (extended) {
    try {
      return decodeURIComponent(extended[2].trim())
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header)
  return plain ? (plain[1] ?? plain[2]).trim() : null
}

async function readBody(response, responseType) {
  if (response.status === 204) return null
  if (responseType === 'blob') {
    const blob = await response.blob()
    return {
      blob,
      contentType: response.headers.get('content-type') ?? blob.type ?? '',
      fileName: parseContentDispositionFileName(response.headers.get('content-disposition')),
      headers: response.headers,
    }
  }
  const text = await response.text()
  if (text === '') return null
  const type = response.headers.get('content-type') ?? ''
  if (responseType === 'text' || (responseType !== 'json' && !type.includes('json'))) return text
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(API_ERROR.invalidResponse, 'The server sent invalid JSON.', { status: response.status })
  }
}

// `fetchImpl` and `timeoutMs` exist for tests and tuning; the defaults suit the app.
//   getAccessToken()   -> string | null      the bearer token, when there is one
//   onUnauthorized()                         called when the session is over (HTTP 401 that a refresh did not fix)
//   refreshSession()   -> Promise<boolean>   OPTIONAL: tries to obtain a new access token silently (one attempt shared
//                                            by every request that failed at the same time); true = retry the request
//   credentials                              fetch `credentials` (e.g. 'include' for the HttpOnly refresh cookie)
export function createApiClient({
  baseUrl = '',
  getAccessToken = () => null,
  onUnauthorized = () => {},
  refreshSession = null,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  credentials,
} = {}) {
  let refreshing = null

  function refreshOnce() {
    refreshing ??= Promise.resolve()
      .then(() => refreshSession())
      .then(
        (ok) => ok === true,
        () => false,
      )
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  // Per request: method, body, headers, signal, query, timeoutMs, responseType ('auto' | 'json' | 'text' | 'blob'),
  // skipAuth (no bearer token), handleUnauthorized (false: a 401 is just an error, e.g. on the login request).
  async function request(path, { method = 'GET', body, headers = {}, signal, query, timeoutMs: requestTimeout, responseType = 'auto', skipAuth = false, handleUnauthorized = true } = {}, attempt = 0) {
    const finalHeaders = { Accept: responseType === 'blob' ? '*/*' : 'application/json', ...headers }
    const token = skipAuth ? null : getAccessToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`

    let payload
    if (body !== undefined && body !== null) {
      // FormData (uploads) is sent as is: the browser sets the multipart boundary.
      if (typeof FormData !== 'undefined' && body instanceof FormData) payload = body
      else {
        payload = JSON.stringify(body)
        finalHeaders['Content-Type'] = 'application/json'
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new ApiError(API_ERROR.timeout, 'The request timed out.')), requestTimeout ?? timeoutMs)
    const abortFromCaller = () => controller.abort(signal.reason)
    if (signal?.aborted) abortFromCaller()
    signal?.addEventListener('abort', abortFromCaller, { once: true })

    const init = { method, headers: finalHeaders, body: payload, signal: controller.signal }
    if (credentials) init.credentials = credentials

    let response
    try {
      response = await fetchImpl(joinUrl(baseUrl, path) + buildQueryString(query), init)
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (controller.signal.aborted && controller.signal.reason instanceof ApiError) throw controller.signal.reason
      if (signal?.aborted) throw error // cancelled by the caller: not a network failure
      throw new ApiError(API_ERROR.network, 'The server could not be reached.')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
    }

    if (!response.ok) {
      let details = null
      try {
        details = await readBody(response, 'auto')
      } catch {
        // An unreadable error body does not change the error itself.
      }
      const code = codeForStatus(response.status)
      if (code === API_ERROR.unauthorized && handleUnauthorized && !skipAuth) {
        // One silent refresh, then the same request once more; otherwise the session is over.
        if (refreshSession && attempt === 0 && (await refreshOnce())) {
          return request(path, { method, body, headers, signal, query, timeoutMs: requestTimeout, responseType, skipAuth, handleUnauthorized }, 1)
        }
        onUnauthorized()
      }
      throw new ApiError(code, `The server answered with status ${response.status}.`, { status: response.status, details })
    }
    return readBody(response, responseType)
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  }
}

// ----- The application's client ---------------------------------------------------------

let unauthorizedHandler = null
let refreshHandler = null

// The access token lives HERE, in memory, and nowhere else: it is never written to localStorage, sessionStorage or a
// cookie by the frontend (decision D7; the refresh token is the server's HttpOnly cookie). A reload therefore starts
// without a token and the auth service restores the session through the refresh cookie.
let accessToken = null
export const setAccessToken = (token) => {
  accessToken = typeof token === 'string' && token !== '' ? token : null
}
export const clearAccessToken = () => {
  accessToken = null
}
export const hasAccessToken = () => accessToken !== null
let accessTokenProvider = () => accessToken

// The auth layer registers what happens on HTTP 401 (it ends the session). Returns a
// function that removes the handler again.
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

// The auth service registers how the current access token is read (see authService.js).
export function setAccessTokenProvider(provider) {
  accessTokenProvider = provider ?? (() => accessToken)
}

// The auth service registers how a silent refresh is attempted (`() => Promise<boolean>`), or null for none.
export function setRefreshHandler(handler) {
  refreshHandler = handler ?? null
}

let appClient = null

// The client of this build, created on first use (so an invalid build configuration is reported by the start-up
// check in main.jsx instead of failing while modules load). The base URL comes from serviceMode.js.
export function getApiClient() {
  if (!appClient) {
    appClient = createApiClient({
      baseUrl: getApiBaseUrl(),
      getAccessToken: () => accessTokenProvider(),
      onUnauthorized: () => unauthorizedHandler?.(),
      refreshSession: () => (refreshHandler ? refreshHandler() : Promise.resolve(false)),
      credentials: 'include',
    })
  }
  return appClient
}

// The shared client as an object that creates the real one on first use.
export const apiClient = Object.freeze({
  request: (...args) => getApiClient().request(...args),
  get: (...args) => getApiClient().get(...args),
  post: (...args) => getApiClient().post(...args),
  put: (...args) => getApiClient().put(...args),
  patch: (...args) => getApiClient().patch(...args),
  delete: (...args) => getApiClient().delete(...args),
})

// For tests: forget the shared client and the registered hooks.
export function resetApiClientForTests() {
  appClient = null
  unauthorizedHandler = null
  accessToken = null
  accessTokenProvider = () => accessToken
  refreshHandler = null
}
