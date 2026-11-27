// Batch E / Wave 1: the hooks and screens built on the asynchronous document service, rendered to HTML through Vite's SSR
// loader (as in documentUi.test.js). Effects do not run in a server render, so what is asserted here is the FIRST render:
// "loading" when the adapter cannot answer at once (an HTTP adapter), real data when it already holds it (the development
// simulation), and the same loading/missing/forbidden decisions the review screen relies on. The asynchronous behaviour
// (stale answers, cancellation, failures) is tested without React in liveResource.test.js.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { createMemoryDocumentStore } from '../src/services/documentStore.js'
import { makeSnapshot } from './sessionHelpers.js'

const root = process.cwd()
const require = createRequire(`${root}/package.json`)
const React = require('react')
const { renderToString } = require('react-dom/server')
const h = React.createElement

let server
let LanguageProvider
let LanguageContext
let AuthContext
let router
const modules = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
  ;({ LanguageContext } = await server.ssrLoadModule('/src/contexts/languageContext.js'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/contexts/authContext.js'))
  router = await server.ssrLoadModule('react-router')
})

after(async () => {
  await server?.close()
})

const EMPLOYEE = { id: 'demo-employee', displayName: 'علي حسن', role: 'employee' }
const noop = () => {}
const auth = (extra = {}) => ({ status: 'authenticated', user: EMPLOYEE, error: null, isSubmitting: false, sessionExpiring: false, login: noop, logout: noop, reauthenticate: noop, clearError: noop, retryInitialize: noop, devAccounts: null, devReset: null, ...extra })

async function load(file) {
  if (!modules.has(file)) modules.set(file, await server.ssrLoadModule(file))
  return modules.get(file)
}

async function render(element, { language = 'ar', authValue = auth() } = {}) {
  const tree = h(AuthContext.Provider, { value: authValue }, h(router.MemoryRouter, { initialEntries: ['/'] }, element))
  if (language === 'ar') return renderToString(h(LanguageProvider, null, tree))
  return renderToString(h(LanguageContext.Provider, { value: { language, direction: 'ltr', setLanguage: noop } }, tree))
}

// A service that cannot answer synchronously, like the HTTP adapter.
const slowService = (overrides = {}) => ({ isMock: false, list: () => new Promise(() => {}), getSummary: () => new Promise(() => {}), getMeta: () => new Promise(() => {}), getDocument: () => new Promise(() => {}), subscribe: () => noop, getSessionStore: () => ({ isDurable: true }), ...overrides })

describe('the hooks\' first render', () => {
  test('the document list is "loading" for an adapter that cannot answer at once, and ready with data for one that can', async () => {
    const { useDocumentListState } = await load('/src/hooks/useDocumentListState.js')
    const Probe = ({ service }) => {
      const state = useDocumentListState({ service })
      return h('p', null, `${state.status}:${state.items.length}`)
    }
    assert.match(await render(h(Probe, { service: slowService() })), /loading:0/)
    const items = [{ id: 'a' }, { id: 'b' }]
    assert.match(await render(h(Probe, { service: slowService({ peekSummaries: () => items }) })), /ready:2/)
    assert.match(await render(h(Probe, { service: slowService({ peekSummaries: () => [] }) })), /ready:0/) // empty is "ready", not "loading"
  })

  test('the summary of one document: loading, unknown (ready with null), or known', async () => {
    const { useDocumentSummary } = await load('/src/hooks/useDocumentSummary.js')
    const Probe = ({ service }) => {
      const { status, summary } = useDocumentSummary('d1', { service })
      return h('p', null, `${status}:${summary?.id ?? 'none'}`)
    }
    assert.match(await render(h(Probe, { service: slowService() })), /loading:none/)
    assert.match(await render(h(Probe, { service: slowService({ peekSummary: () => null }) })), /ready:none/)
    assert.match(await render(h(Probe, { service: slowService({ peekSummary: () => ({ id: 'd1' }) }) })), /ready:d1/)
  })

  test('the metadata is null until it is known', async () => {
    const { useDocumentMeta } = await load('/src/hooks/useDocumentSummary.js')
    const Probe = ({ service }) => h('p', null, String(useDocumentMeta('d1', { service })?.attempts?.length ?? 'null'))
    assert.match(await render(h(Probe, { service: slowService() })), />null</)
    assert.match(await render(h(Probe, { service: slowService({ peekMeta: () => ({ attempts: [{}, {}] }) }) })), />2</)
  })
})

describe('the review session hook decides what the review address shows', () => {
  function recordService() {
    const store = createMemoryDocumentStore()
    const mine = store.create({ name: 'a.pdf', snapshot: makeSnapshot({ selectedPages: [1, 2], totalPages: 2 }), ownerId: EMPLOYEE.id })
    const theirs = store.create({ name: 'b.pdf', snapshot: makeSnapshot({ selectedPages: [1], totalPages: 1 }), ownerId: 'someone-else' })
    const broken = store.create({ name: 'c.pdf', snapshot: { schemaVersion: '0.1' }, ownerId: EMPLOYEE.id })
    return { ids: { mine, theirs, broken }, service: slowService({ peekDocument: (id) => store.get(id), getSessionStore: () => store }) }
  }
  async function statusOf(service, id, language = 'ar') {
    const { useReviewSession } = await load('/src/hooks/useReviewSession.js')
    const Probe = () => h('p', null, useReviewSession(id, { service }).status)
    return render(h(Probe), { language })
  }

  test('an adapter that must wait gives "loading" first (no session is created from nothing)', async () => {
    assert.match(await statusOf(slowService(), 'd1'), />loading</)
  })

  test('a known document of the signed-in employee opens; an unknown one is "missing"; someone else\'s is "forbidden"; invalid content is an "error"', async () => {
    const { service, ids } = recordService()
    assert.match(await statusOf(service, ids.mine), />ready</)
    assert.match(await statusOf(service, 'nope'), />missing</)
    assert.match(await statusOf(service, ids.theirs), />forbidden</)
    assert.match(await statusOf(service, ids.broken), />error</)
  })
})

describe('the session-expired banner (a 401 never discards unsaved work)', () => {
  test('it is not shown while the session is fine', async () => {
    const { SessionExpiredBanner } = await load('/src/components/auth/SessionExpiredBanner.jsx')
    assert.equal(await render(h(SessionExpiredBanner)), '')
  })

  test('while the session is expiring it explains that nothing was lost and offers an in-place sign-in or an explicit sign-out, in both languages', async () => {
    const { SessionExpiredBanner } = await load('/src/components/auth/SessionExpiredBanner.jsx')
    const expiring = auth({ sessionExpiring: true, error: 'sessionExpired' })
    const ar = await render(h(SessionExpiredBanner), { authValue: expiring })
    assert.match(ar, /عملك غير المحفوظ ما زال أمامك/)
    assert.match(ar, /تسجيل الدخول والمتابعة/)
    assert.match(ar, /الخروج دون حفظ/)
    assert.match(ar, /type="password"/)
    const en = await render(h(SessionExpiredBanner), { language: 'en', authValue: expiring })
    assert.match(en, /your unsaved work is still here/)
    assert.match(en, /Sign in and continue/)
    assert.match(en, /Sign out without saving/)
    const mismatch = await render(h(SessionExpiredBanner), { language: 'en', authValue: auth({ sessionExpiring: true, error: 'sessionUserMismatch' }) })
    assert.match(mismatch, /not the credentials of the user who started this work/)
  })
})

describe('the screens that list documents', () => {
  test('the dashboard and the correction queue still render the simulated documents at once (the development adapter peeks)', async () => {
    const dashboard = await render(h((await load('/src/pages/DashboardPage.jsx')).default))
    assert.match(dashboard, /state-counts/)
    assert.doesNotMatch(dashboard, /spinner/)
    const queue = await render(h((await load('/src/pages/CorrectionQueuePage.jsx')).default))
    assert.match(queue, /queue-list|queue-empty/)
    assert.doesNotMatch(queue, /auth-loading/)
  })
})
