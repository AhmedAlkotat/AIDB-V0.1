// Central service-mode configuration (Batch E, decision D1).
//
//   VITE_API_MODE      'mock' | 'http'
//   VITE_API_BASE_URL  where the HTTP API lives: '' / unset = '/api/v1' on the same origin, a path such as '/api/v1',
//                      or an absolute http(s) URL
//
// Rules (they exist so that production can never run on simulated data by accident):
//   - the mode is chosen EXPLICITLY by VITE_API_MODE; an unknown value is a configuration error, not a guess;
//   - when it is not set: development builds (`npm run dev`) use 'mock', production builds use 'http';
//   - 'mock' is refused in a production build (the simulations are not part of it: they are removed by the bundler);
//   - 'http' NEVER falls back to a simulation: a service that has no HTTP implementation yet reports "not connected".
//
// The service factories (src/services/*Service.js) read the mode here and keep their `import.meta.env.DEV` branch so
// that the bundler can still drop every development-only module from a production bundle.
//
// `env` is a parameter so the rules are testable; the default reads the build configuration (undefined outside Vite).

export const SERVICE_MODE = Object.freeze({ mock: 'mock', http: 'http' })
export const SERVICE_MODE_LIST = Object.freeze(Object.values(SERVICE_MODE))

export const DEFAULT_API_BASE_URL = '/api/v1'

export const SERVICE_CONFIG_ERROR = Object.freeze({
  invalidMode: 'SERVICE_CONFIG_INVALID_MODE',
  mockInProduction: 'SERVICE_CONFIG_MOCK_IN_PRODUCTION',
  invalidBaseUrl: 'SERVICE_CONFIG_INVALID_BASE_URL',
})

export class ServiceConfigError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ServiceConfigError'
    this.code = code
  }
}

function readMode(env) {
  const raw = typeof env.VITE_API_MODE === 'string' ? env.VITE_API_MODE.trim().toLowerCase() : ''
  if (raw === '') return env.DEV ? SERVICE_MODE.mock : SERVICE_MODE.http
  if (!SERVICE_MODE_LIST.includes(raw)) {
    throw new ServiceConfigError(SERVICE_CONFIG_ERROR.invalidMode, `VITE_API_MODE must be one of ${SERVICE_MODE_LIST.join(', ')} (got "${env.VITE_API_MODE}").`)
  }
  if (raw === SERVICE_MODE.mock && !env.DEV) {
    throw new ServiceConfigError(SERVICE_CONFIG_ERROR.mockInProduction, 'VITE_API_MODE=mock is not available in a production build: the simulations are not part of it.')
  }
  return raw
}

function readBaseUrl(env) {
  const raw = typeof env.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL.trim() : ''
  if (raw === '') return DEFAULT_API_BASE_URL
  const valid = /^\/[^\s]*$/.test(raw) || /^https?:\/\/[^\s/]+[^\s]*$/i.test(raw)
  if (!valid) {
    throw new ServiceConfigError(SERVICE_CONFIG_ERROR.invalidBaseUrl, `VITE_API_BASE_URL must be a path ("/api/v1") or an http(s) URL (got "${raw}").`)
  }
  return raw.replace(/\/+$/, '') || '/'
}

// { mode, apiBaseUrl }. Throws ServiceConfigError.
export function resolveServiceConfig(env = import.meta.env ?? {}) {
  return Object.freeze({ mode: readMode(env), apiBaseUrl: readBaseUrl(env) })
}

// Like resolveServiceConfig, but returns { ok, config | error } so a start-up screen can explain the problem.
export function checkServiceConfig(env) {
  try {
    return { ok: true, config: resolveServiceConfig(env) }
  } catch (error) {
    if (error instanceof ServiceConfigError) return { ok: false, error }
    throw error
  }
}

let cached = null

// The configuration of this build, resolved once. Throws ServiceConfigError when it is invalid.
export function getServiceConfig() {
  cached ??= resolveServiceConfig()
  return cached
}

export const getServiceMode = () => getServiceConfig().mode
export const getApiBaseUrl = () => getServiceConfig().apiBaseUrl

// For tests: forget the resolved configuration.
export function resetServiceConfigForTests() {
  cached = null
}
