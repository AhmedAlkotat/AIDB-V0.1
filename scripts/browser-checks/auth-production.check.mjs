// Browser check: the development mock authentication is NOT available in a production
// build. Run it against `vite preview`, not the dev server (so it is not part of run-all):
//
//   npm run build
//   npx vite preview --port 5198 --strictPort     (terminal 1)
//   BASE_URL=http://localhost:5198 node scripts/browser-checks/auth-production.check.mjs

import { sleep } from './cdp.mjs'
import { BASE_URL, runChecks } from './harness.mjs'

const MOCK_KEY = 'aidp.dev.mockSession'
const text = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`)
const exists = (page, selector) => page.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)

async function submit(page, identifier, password) {
  await page.eval(`(() => { const el = document.querySelector('#login-identifier'); el.focus(); el.select() })()`)
  await page.type(identifier)
  await page.eval(`(() => { const el = document.querySelector('#login-password'); el.focus(); el.select() })()`)
  await page.type(password)
  await page.click('.auth-form__submit')
}

await runChecks('Production build has no mock authentication', async ({ browser, check }) => {
  // A forged development session marker must not sign anybody in.
  const page = await browser.newPage({ width: 1280, height: 900, session: null })
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { sessionStorage.setItem(${JSON.stringify(MOCK_KEY)}, JSON.stringify({ identifier: 'admin' })) } catch {}`,
  })

  await page.goto(`${BASE_URL}/admin/employees`)
  await page.waitFor(`location.pathname === '/login'`)
  check('a protected URL goes to the login page, even with a forged development session marker', true)
  check('the application shell is not rendered', !(await exists(page, '.sidebar')) && !(await exists(page, '.user-badge')))
  check('no development account helper is shown', !(await exists(page, '.auth-dev')))
  check('no mock credentials appear on the page', !(await page.eval(`/admin-dev|employee-dev|disabled-dev/.test(document.body.innerHTML)`)))

  for (const [identifier, password] of [['admin', 'admin-dev'], ['employee', 'employee-dev']]) {
    await submit(page, identifier, password)
    await page.waitFor(`document.querySelector('.alert--error')`)
    await sleep(200)
    check(`the former mock account "${identifier}" cannot sign in`, (await text(page, '.alert--error')).includes('الخادم غير متصل') && !(await exists(page, '.user-badge')))
  }

  const bundle = await page.eval(`fetch(document.querySelector('script[type=module]').src).then((r) => r.text())`)
  check('the entry bundle contains no mock accounts or passwords', !/employee-dev|admin-dev|disabled-dev|aidp\.dev\.mockSession/.test(bundle))
  check('no console errors', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
