// Minimal Chrome DevTools Protocol driver for the browser checks (no dependency:
// it uses Node's built-in fetch/WebSocket and an installed Chrome or Edge).
//
//   const browser = await launchBrowser()
//   const page = await browser.newPage({ width: 1280, height: 800 })   // signed in as the mock employee
//   const page = await browser.newPage({ session: 'admin' })              // signed in as the mock Admin
//   const page = await browser.newPage({ session: null })                 // signed out
//   await page.goto('http://localhost:5199/')
//   await page.eval('document.title')
//   await browser.close()

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function launchBrowser({ headless = true } = {}) {
  const executable = CANDIDATES.find((path) => existsSync(path))
  if (!executable) throw new Error('No Chrome/Edge found. Set CHROME_PATH.')
  const profile = mkdtempSync(join(tmpdir(), 'aidp-cdp-'))
  const args = [
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--window-size=1400,900',
    ...(headless ? ['--headless=new'] : []),
    'about:blank',
  ]
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] })

  const endpoint = await new Promise((resolve, reject) => {
    let log = ''
    const timer = setTimeout(() => reject(new Error(`Browser did not start:\n${log}`)), 20000)
    child.stderr.on('data', (chunk) => {
      log += chunk
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(log)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.on('exit', () => reject(new Error(`Browser exited early:\n${log}`)))
  })

  const port = new URL(endpoint).port
  const connect = async (url) => {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return socket
  }

  // `session` pre-signs-in a development mock account before the app starts (the mock keeps
  // its session marker in sessionStorage; see src/dev/mockAuthService.js), so checks that
  // test other features need no login step. Pass null to start signed out.
  async function newPage({ width = 1280, height = 800, session = 'employee' } = {}) {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
    const socket = await connect(target.webSocketDebuggerUrl)
    let nextId = 1
    const pending = new Map()
    const listeners = new Map()
    const consoleErrors = []
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) reject(new Error(`${message.error.message}`))
        else resolve(message.result)
      } else if (message.method) {
        if (message.method === 'Runtime.exceptionThrown') {
          const details = message.params.exceptionDetails
          consoleErrors.push(`${details.text} ${details.exception?.description ?? ''}`)
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
          consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
        }
        for (const listener of listeners.get(message.method) ?? []) listener(message.params)
      }
    })
    // A call that never answers (e.g. the page navigated away) fails instead of hanging.
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`CDP call timed out: ${method}`))
        }, 20000)
        pending.set(id, {
          resolve: (value) => (clearTimeout(timer), resolve(value)),
          reject: (error) => (clearTimeout(timer), reject(error)),
        })
        socket.send(JSON.stringify({ id, method, params }))
      })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('DOM.enable')
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    if (session) {
      const marker = JSON.stringify(JSON.stringify({ identifier: session }))
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { if (!sessionStorage.getItem('aidp.dev.mockSession')) sessionStorage.setItem('aidp.dev.mockSession', ${marker}) } catch {}`,
      })
    }

    // Browser dialogs (e.g. the "leave site?" prompt) are accepted and recorded.
    const dialogs = []
    const api = {
      send,
      consoleErrors,
      dialogs,
      on(method, listener) {
        listeners.set(method, [...(listeners.get(method) ?? []), listener])
      },
      async setViewport(w, h = height) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
        await sleep(250)
      },
      async goto(url) {
        const loaded = new Promise((resolve) => api.on('Page.loadEventFired', resolve))
        await send('Page.navigate', { url })
        await Promise.race([loaded, sleep(15000)])
        await sleep(300)
        // The app first checks for an existing session ("loading" screen).
        await api.waitFor(`!document.querySelector('.auth-loading')`).catch(() => {})
      },
      // Evaluates an expression in the page (promises are awaited) and returns its value.
      async eval(expression) {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
        if (result.exceptionDetails) {
          throw new Error(`${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description ?? ''}`)
        }
        return result.result.value
      },
      async waitFor(expression, { timeout = 8000, interval = 100 } = {}) {
        const start = Date.now()
        for (;;) {
          if (await api.eval(`Boolean(${expression})`)) return true
          if (Date.now() - start > timeout) throw new Error(`Timed out waiting for: ${expression}`)
          await sleep(interval)
        }
      },
      // A real key press (keydown + keyup) with optional Ctrl/Shift.
      async key(key, { ctrl = false, shift = false, code, vk } = {}) {
        const modifiers = (ctrl ? 2 : 0) | (shift ? 8 : 0)
        const base = { key, code: code ?? key, modifiers, windowsVirtualKeyCode: vk ?? key.toUpperCase().charCodeAt(0) }
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
      },
      // Presses Enter (so a focused button is activated like from the keyboard).
      async pressEnter() {
        const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }
        await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
      },
      // Inserts text at the caret like typing/paste (fires input events).
      async type(text) {
        await send('Input.insertText', { text })
      },
      // A real mouse click at the centre of the first element matching the selector.
      async click(selector) {
        const point = await api.eval(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`,
        )
        if (!point) throw new Error(`No element for ${selector}`)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        await sleep(60)
      },
      async screenshot(path) {
        const { data } = await send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(path, Buffer.from(data, 'base64'))
      },
      async setFiles(selector, files) {
        const { root } = await send('DOM.getDocument')
        const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector })
        await send('DOM.setFileInputFiles', { files, nodeId })
      },
    }
    api.on('Page.javascriptDialogOpening', (params) => {
      dialogs.push({ type: params.type, message: params.message })
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
    })
    return api
  }

  return {
    newPage,
    async close() {
      child.kill()
      await sleep(300)
      try {
        rmSync(profile, { recursive: true, force: true })
      } catch {
        // The profile folder is in the temp directory; a leftover is harmless.
      }
    },
  }
}
