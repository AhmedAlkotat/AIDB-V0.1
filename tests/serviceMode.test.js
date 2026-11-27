// Batch E / Wave 1: the central service-mode configuration (decision D1). Production must never fall back to the
// simulations, an invalid configuration must be reported clearly, and the service factories must obey the mode.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createApprovalService, NOT_CONNECTED_APPROVAL } from '../src/services/approvalService.js'
import { createAuthService, httpAuthService } from '../src/services/authService.js'
import { createDocumentService } from '../src/services/documentService.js'
import {
  checkServiceConfig,
  DEFAULT_API_BASE_URL,
  resolveServiceConfig,
  SERVICE_CONFIG_ERROR,
  SERVICE_MODE,
  ServiceConfigError,
} from '../src/services/serviceMode.js'
import { showConfigurationError } from '../src/startupError.js'

const codeOf = (env) => {
  try {
    resolveServiceConfig(env)
    return null
  } catch (error) {
    assert.ok(error instanceof ServiceConfigError)
    return error.code
  }
}

describe('service mode configuration', () => {
  test('development defaults to mock, production defaults to http (never to mock)', () => {
    assert.equal(resolveServiceConfig({ DEV: true }).mode, SERVICE_MODE.mock)
    assert.equal(resolveServiceConfig({ DEV: false }).mode, SERVICE_MODE.http)
    assert.equal(resolveServiceConfig({}).mode, SERVICE_MODE.http) // outside Vite (Node) behaves like production
  })

  test('the mode can be chosen explicitly; spelling and case do not matter, blanks mean "not set"', () => {
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_MODE: 'http' }).mode, SERVICE_MODE.http)
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_MODE: ' HTTP ' }).mode, SERVICE_MODE.http)
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_MODE: 'Mock' }).mode, SERVICE_MODE.mock)
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_MODE: '  ' }).mode, SERVICE_MODE.mock)
    assert.equal(resolveServiceConfig({ DEV: false, VITE_API_MODE: 'http' }).mode, SERVICE_MODE.http)
  })

  test('an unknown mode is a configuration error, not a guess', () => {
    for (const value of ['mocks', 'real', 'true', '1', 'prod']) assert.equal(codeOf({ DEV: true, VITE_API_MODE: value }), SERVICE_CONFIG_ERROR.invalidMode, value)
    assert.equal(codeOf({ DEV: false, VITE_API_MODE: 'nope' }), SERVICE_CONFIG_ERROR.invalidMode)
  })

  test('mock is refused in a production build (no silent simulation in production)', () => {
    assert.equal(codeOf({ DEV: false, VITE_API_MODE: 'mock' }), SERVICE_CONFIG_ERROR.mockInProduction)
    assert.equal(codeOf({ VITE_API_MODE: 'mock' }), SERVICE_CONFIG_ERROR.mockInProduction)
  })

  test('the API base URL: default, a path, an absolute URL; trailing slashes are dropped; anything else is an error', () => {
    assert.equal(resolveServiceConfig({ DEV: true }).apiBaseUrl, DEFAULT_API_BASE_URL)
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_BASE_URL: '' }).apiBaseUrl, DEFAULT_API_BASE_URL)
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_BASE_URL: '/aidp/api/' }).apiBaseUrl, '/aidp/api')
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_BASE_URL: 'http://192.168.1.10:8000/api/v1/' }).apiBaseUrl, 'http://192.168.1.10:8000/api/v1')
    assert.equal(resolveServiceConfig({ DEV: true, VITE_API_BASE_URL: 'https://aidp.local/api' }).apiBaseUrl, 'https://aidp.local/api')
    for (const bad of ['api/v1', 'ftp://host/api', 'localhost:8000', 'http://', '/has space']) assert.equal(codeOf({ DEV: true, VITE_API_BASE_URL: bad }), SERVICE_CONFIG_ERROR.invalidBaseUrl, bad)
  })

  test('checkServiceConfig reports a problem instead of throwing, so the start-up screen can explain it', () => {
    const good = checkServiceConfig({ DEV: true })
    assert.equal(good.ok, true)
    assert.equal(good.config.mode, SERVICE_MODE.mock)
    const bad = checkServiceConfig({ DEV: true, VITE_API_MODE: 'x' })
    assert.equal(bad.ok, false)
    assert.equal(bad.error.code, SERVICE_CONFIG_ERROR.invalidMode)
    assert.match(bad.error.message, /VITE_API_MODE/)
  })

  test('the resolved configuration is immutable', () => {
    const config = resolveServiceConfig({ DEV: true })
    assert.throws(() => {
      config.mode = 'http'
    }, TypeError)
  })

  test('without Vite (Node, like a production build) the factories never return a simulation', () => {
    assert.equal(createAuthService(), httpAuthService)
    assert.equal(createApprovalService(), NOT_CONNECTED_APPROVAL)
    const documents = createDocumentService()
    assert.equal(documents.isMock, false)
    assert.equal(documents.peekSummaries, undefined) // an HTTP adapter cannot answer synchronously
  })

  test('the start-up screen names the problem in Arabic and English and never throws', () => {
    const appended = []
    const fakeDocument = { createElement: () => ({ setAttribute() {}, style: {}, appendChild: (child) => appended.push(child), dir: '', textContent: '' }) }
    const root = { replaceChildren: (box) => appended.push(box) }
    const previous = globalThis.document
    globalThis.document = fakeDocument
    try {
      showConfigurationError(new ServiceConfigError(SERVICE_CONFIG_ERROR.invalidMode, 'VITE_API_MODE is wrong'), root)
      showConfigurationError(new ServiceConfigError('x', 'y'), null) // no root: nothing to do
    } finally {
      globalThis.document = previous
    }
    assert.equal(appended.length, 4) // three paragraphs and the box
    assert.ok(appended.some((node) => node.dir === 'rtl'))
    assert.ok(appended.some((node) => /VITE_API_MODE is wrong/.test(node.textContent)))
  })
})
