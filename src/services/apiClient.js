// Shared, lightweight HTTP client for the (future) backend API.
//
// NOT USED BY ANY SCREEN YET: the backend contract is still being agreed, so no endpoint
// name, request body or response schema is defined here. This module only provides the
// plumbing every service will share: a base URL, an optional bearer token, JSON in/out,
// one error type, and a single hook for "the session is no longer valid" (HTTP 401).
//
// How the access token is obtained and stored (memory, cookie, ...) is deliberately NOT
// decided here: the caller supplies `getAccessToken`.

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

export class ApiError extends Error {
  // `status` is the HTTP status (0 when no response arrived); `details` is the parsed
  // error body when the server sent one.
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
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

async function readBody(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (text === '') return null
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) return text
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(API_ERROR.invalidResponse, 'The server sent invalid JSON.', { status: response.status })
  }
}

// `fetchImpl` and `timeoutMs` exist for tests and tuning; the defaults suit the app.
export function createApiClient({
  baseUrl = '',
  getAccessToken = () => null,
  onUnauthorized = () => {},
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 30000,
} = {}) {
  async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
    const finalHeaders = { Accept: 'application/json', ...headers }
    const token = getAccessToken()
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
    const timer = setTimeout(() => controller.abort(new ApiError(API_ERROR.timeout, 'The request timed out.')), timeoutMs)
    const abortFromCaller = () => controller.abort(signal.reason)
    signal?.addEventListener('abort', abortFromCaller, { once: true })

    let response
    try {
      response = await fetchImpl(joinUrl(baseUrl, path), { method, headers: finalHeaders, body: payload, signal: controller.signal })
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
        details = await readBody(response)
      } catch {
        // An unreadable error body does not change the error itself.
      }
      const code = codeForStatus(response.status)
      if (code === API_ERROR.unauthorized) onUnauthorized()
      throw new ApiError(code, `The server answered with status ${response.status}.`, { status: response.status, details })
    }
    return readBody(response)
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
let accessTokenProvider = () => null

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
  accessTokenProvider = provider
}

// Base URL from the build configuration; empty means "same origin".
export const apiClient = createApiClient({
  baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '',
  getAccessToken: () => accessTokenProvider(),
  onUnauthorized: () => unauthorizedHandler?.(),
})
