// Browser checks for the five user-acceptance issues (UAT-01 … UAT-05), in a real
// Chrome with real Arabic PDFs and real JPG/JPEG/PNG images.
//
//   UAT-01  image upload and review (JPG, JPEG, PNG)
//   UAT-02  Arabic PDF rendering faithful in the review viewer
//   UAT-03  stable rotation (0/90/180/270), including while dragging the divider
//   UAT-04  the two panels use the whole workspace, at both drag extremes
//   UAT-05  a new table is compact and only scrolls sideways when it has to

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE_URL, openReview, openUploadedReview, runChecks, setLanguage, setSidebarOpen, startProcessing } from './harness.mjs'
import { sleep } from './cdp.mjs'
import { makeArabicPdf, makeArabicPdfs } from './make-arabic-pdfs.mjs'

const dir = join(tmpdir(), 'aidp-browser-checks', 'uat')
mkdirSync(dir, { recursive: true })

const names = (page) => page.eval(`[...document.querySelectorAll('.queue-item__name')].map((n) => n.textContent)`)
const goTo = async (page, href) => {
  await page.click(`a.sidebar__link[href="${href}"]`)
  await page.waitFor(`location.pathname === '${href}'`, { timeout: 10000 })
  await sleep(300)
}

async function uploadAndReview(page, file, language = 'ar', { waitFor = `document.querySelector('.original-viewer canvas, .original-viewer img')` } = {}) {
  await page.goto(`${BASE_URL}/upload`)
  await setLanguage(page, language)
  await page.setFiles('input[type=file]', [file])
  await startProcessing(page)
  await openUploadedReview(page, file.split(/[\\/]/).pop())
  await page.waitFor(waitFor, { timeout: 20000 })
  await sleep(1500)
}

// ONLY=UAT-04,UAT-05 runs just those sections.
const only = process.env.ONLY ? process.env.ONLY.split(',') : null
const want = (id) => !only || only.includes(id)

await runChecks('UAT fixes (UAT-01 … UAT-05)', async ({ browser, check }) => {
  const pdfs = [...(await makeArabicPdfs()), makeArabicPdf({ pageSize: 'A4 landscape', label: '-landscape' })]
  const portrait = pdfs[0].path
  const page = await browser.newPage({ width: 1400, height: 900 })

  // ============================================================ UAT-01: images
  if (want('UAT-01')) {
  // A real document image (Arabic text) made with the browser itself, saved as PNG, JPG and JPEG.
  const maker = await browser.newPage({ width: 700, height: 500 })
  await maker.goto(`${BASE_URL}/upload`)
  await maker.eval(`document.body.innerHTML = '<div dir="rtl" style="font:28px Arial;background:#fff;color:#000;padding:30px;width:640px;height:440px"><h1>وثيقة صورة</h1><p>الكتاب مفتوح على المكتب ومسؤول القسم غائب.</p><p>١٢٣٤٥٦ — مدرسة</p></div>'`)
  const shot = async (format, path) => {
    const { data } = await maker.send('Page.captureScreenshot', { format, quality: 92 })
    writeFileSync(path, Buffer.from(data, 'base64'))
  }
  await shot('png', join(dir, 'scan.png'))
  await shot('jpeg', join(dir, 'scan.jpg'))
  copyFileSync(join(dir, 'scan.jpg'), join(dir, 'scan2.jpeg'))
  copyFileSync(join(dir, 'scan.jpg'), join(dir, 'UPPER.JPG'))
  await maker.send('Page.close').catch(() => {}) // a background tab would be throttled
  await page.send('Page.bringToFront')

  for (const file of ['scan.png', 'scan.jpg', 'scan2.jpeg', 'UPPER.JPG']) {
    await uploadAndReview(page, join(dir, file), 'ar', { waitFor: `document.querySelector('.original-viewer img')?.complete && document.querySelector('.original-viewer img').naturalWidth > 0` })
    const state = await page.eval(`(() => {
      const img = document.querySelector('.original-viewer img'); const frame = document.querySelector('.original-viewer__frame')
      const i = img.getBoundingClientRect(), f = frame.getBoundingClientRect()
      return { natural: img.naturalWidth + 'x' + img.naturalHeight, w: Math.round(i.width), insideX: i.left >= f.left - 1 && i.right <= f.right + 1, hasAlt: Boolean(img.alt), name: document.querySelector('.review-header h2, .review-header h1, .review-header')?.textContent ?? '', pagesInfo: document.querySelector('.page-navigator__current')?.textContent ?? '' }
    })()`)
    check(`UAT-01 ${file}: uploaded, opened for review and drawn (${state.natural})`, state.w > 100 && state.insideX && state.hasAlt, JSON.stringify(state))
    check(`UAT-01 ${file}: it is a one-page document`, /1/.test(state.pagesInfo.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660)), state.pagesInfo)
    // zoom, rotate, reset, navigation
    const widthAt = () => page.eval(`Math.round(document.querySelector('.original-viewer img').getBoundingClientRect().width)`)
    const base = await widthAt()
    await page.eval(`document.querySelectorAll('.viewer-toolbar .icon-button')[1].click()`) // zoom in
    await sleep(250)
    const zoomed = await widthAt()
    check(`UAT-01 ${file}: zoom in enlarges the image (${base} -> ${zoomed})`, zoomed > base * 1.2)
    await page.eval(`document.querySelectorAll('.viewer-toolbar .icon-button')[2].click()`) // rotate 90
    await sleep(250)
    const rotated = await page.eval(`(() => { const i = document.querySelector('.original-viewer img').getBoundingClientRect(); return [Math.round(i.width), Math.round(i.height)] })()`)
    check(`UAT-01 ${file}: rotating 90° swaps the picture's orientation`, rotated[1] > rotated[0] * 0.9 || rotated[0] !== zoomed, JSON.stringify(rotated))
    await page.eval(`document.querySelector('.viewer-toolbar .button--secondary').click()`) // reset
    await sleep(250)
    check(`UAT-01 ${file}: reset returns to the fitted, unrotated view`, (await widthAt()) === base)
    check(`UAT-01 ${file}: page navigation has nowhere to go (one page)`, await page.eval(`[...document.querySelectorAll('.page-navigator__main .button')].every((b) => b.disabled)`))

    // In-app navigation keeps the temporary store: the image is in the queue, and opening it from there shows it again.
    await goTo(page, '/corrections')
    const queued = await names(page)
    check(`UAT-01 ${file}: listed in the correction queue`, queued.some((q) => q.includes(file)), JSON.stringify(queued))
    await page.eval(`[...document.querySelectorAll('.queue-item')].find((li) => li.textContent.includes(${JSON.stringify(file)})).querySelector('a.button--primary').click()`)
    await page.waitFor(`document.querySelector('.original-viewer img')?.complete && document.querySelector('.original-viewer img').naturalWidth > 0`, { timeout: 15000 })
    check(`UAT-01 ${file}: opening it from the queue shows the image again`, true)
    await goTo(page, '/archive')
    // Decision 12: the archive lists every state except Pending; the image finished processing, so it is listed (not approved).
    check(`UAT-01 ${file}: a processed, not yet approved image is in the archive as Ready for Review (decision 12)`, await page.eval(`[...document.querySelectorAll('.queue-item')].some((li) => li.textContent.includes(${JSON.stringify(file)}) && li.dataset.state === 'readyForReview')`))
  }
  }

  // ============================================================ UAT-02: Arabic PDFs
  if (want('UAT-02')) {
  for (const pdf of pdfs) {
    for (const language of ['ar', 'en']) {
      await uploadAndReview(page, pdf.path, language, { waitFor: `document.querySelector('.original-viewer canvas')?.dataset.renderScale` })
      const result = await page.eval(`(async () => {
        const canvas = document.querySelector('.original-viewer canvas')
        const reviewUrl = canvas.toDataURL('image/png')
        const scale = Number(canvas.dataset.renderScale)
        // The same page drawn on a DETACHED canvas (no page CSS can reach it), at the same scale.
        const bytes = await fetch(${JSON.stringify('/__none__')}).then(() => null).catch(() => null)
        return { reviewUrl, scale, direction: getComputedStyle(canvas).direction, pageDir: document.documentElement.dir }
      })()`)
      const file = readFileSync(pdf.path).toString('base64')
      const reference = await page.eval(`(async () => {
        const m = await import('/src/services/pdfDocumentService.js')
        const bin = atob('${file}'); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
        const doc = await m.openPdfDocument(new File([data], 'a.pdf', { type: 'application/pdf' }))
        const canvas = document.createElement('canvas')
        canvas.dir = 'ltr'
        await doc.renderPage({ pageNumber: 1, canvas, scale: ${result.scale}, rotation: 0, devicePixelRatio: window.devicePixelRatio || 1 })
        return canvas.toDataURL('image/png')
      })()`)
      check(`UAT-02 ${pdf.name} (${language.toUpperCase()}, page dir ${result.pageDir}): the canvas is LTR and identical to a clean LTR render`, result.direction === 'ltr' && result.reviewUrl === reference, `direction ${result.direction}, same pixels: ${result.reviewUrl === reference}`)
    }
  }
  // Negative control: the SAME page with an inherited RTL direction really does differ (so the check can fail).
  {
    const file = readFileSync(pdfs[0].path).toString('base64')
    const differs = await page.eval(`(async () => {
      const m = await import('/src/services/pdfDocumentService.js')
      const bin = atob('${file}'); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
      const doc = await m.openPdfDocument(new File([data], 'a.pdf', { type: 'application/pdf' }))
      const render = async (direction) => { const c = document.createElement('canvas'); await doc.renderPage({ pageNumber: 1, canvas: c, scale: 0.8, rotation: 0, devicePixelRatio: 1 }); c.style.direction = direction; return c }
      const a = await render('ltr')
      // Draw again with direction forced to rtl AFTER the service set ltr: emulate the old behaviour.
      const raw = document.createElement('canvas'); document.body.appendChild(raw); raw.style.direction = 'rtl'
      const pdfjs = await (await import('/src/services/pdfMetadataService.js')).loadPdfjs()
      const task = pdfjs.getDocument({ data, useWasm: false, enableXfa: false }); const pdf = await task.promise; const pg = await pdf.getPage(1)
      const viewport = pg.getViewport({ scale: 0.8 }); raw.width = viewport.width; raw.height = viewport.height
      await pg.render({ canvas: raw, viewport }).promise
      const rtl = raw.toDataURL('image/png'); raw.remove()
      return rtl !== a.toDataURL('image/png')
    })()`)
    check('UAT-02 control: a canvas that inherits RTL renders this Arabic PDF differently (the check can fail)', differs)
  }
  }

  // ============================================================ UAT-03: rotation stability
  if (want('UAT-03')) {
  const sample = (pg, ms) => pg.eval(`(async () => {
    const out = []; const f = document.querySelector('.original-viewer__frame'); const start = performance.now()
    while (performance.now() - start < ${ms}) { const c = document.querySelector('.original-viewer canvas'); out.push([c.width, c.height, f.scrollHeight > f.clientHeight ? 1 : 0].join(',')); await new Promise((r) => setTimeout(r, 40)) }
    return [...new Set(out)]
  })()`)
  for (const [w, h] of [[1366, 768], [1920, 1080], [1280, 720]]) {
    await page.setViewport(w, h)
    await uploadAndReview(page, portrait, 'ar', { waitFor: `document.querySelector('.original-viewer canvas')?.dataset.renderScale` })
    for (const turns of [0, 1, 2, 3]) {
      await page.eval(`document.querySelector('.viewer-toolbar .button--secondary').click()`)
      for (let i = 0; i < turns; i += 1) await page.eval(`document.querySelectorAll('.viewer-toolbar .icon-button')[2].click()`)
      await sleep(900)
      const states = await sample(page, 4000)
      check(`UAT-03 ${w}x${h} rotation ${turns * 90}°: one stable canvas size for 4 seconds`, states.length === 1, JSON.stringify(states))
    }
  }
  // The exact failure: dragging the divider so the rotated page's height is close to the panel's height.
  {
    await page.setViewport(1366, 768)
    await uploadAndReview(page, portrait, 'en', { waitFor: `document.querySelector('.original-viewer canvas')?.dataset.renderScale` })
    await setSidebarOpen(page, false)
    for (const turns of [1, 3]) {
      await page.eval(`document.querySelector('.viewer-toolbar .button--secondary').click()`)
      for (let i = 0; i < turns; i += 1) await page.eval(`document.querySelectorAll('.viewer-toolbar .icon-button')[2].click()`)
      await sleep(800)
      const geo = await page.eval(`(() => { const s = document.querySelector('.split-pane').getBoundingClientRect(); const d = document.querySelector('.split-pane__divider').getBoundingClientRect(); return { left: s.left, divX: d.left + d.width / 2, y: d.top + 60 } })()`)
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geo.divX, y: geo.y, button: 'left', clickCount: 1 })
      let unstable = 0
      for (let frameWidth = 676; frameWidth <= 716; frameWidth += 5) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.left + frameWidth + 41, y: geo.y, button: 'left' })
        await sleep(600)
        if ((await sample(page, 900)).length > 1) unstable += 1
      }
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: geo.y, button: 'left', clickCount: 1 })
      check(`UAT-03 dragging the divider through the critical width at rotation ${turns * 90}°: no flicker (${unstable} unstable positions)`, unstable === 0)
      await page.eval(`document.querySelector('.split-pane__divider').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    }
    // zoom, pan, reset still work
    await page.eval(`document.querySelector('.viewer-toolbar .button--secondary').click()`)
    await sleep(500)
    const before = await page.eval(`document.querySelector('.original-viewer canvas').width`)
    await page.eval(`document.querySelectorAll('.viewer-toolbar .icon-button')[1].click()`)
    await sleep(700)
    const zoomedWidth = await page.eval(`document.querySelector('.original-viewer canvas').width`)
    await page.eval(`(() => { const f = document.querySelector('.original-viewer__frame'); f.scrollLeft = 40; f.scrollTop = 60 })()`)
    const panned = await page.eval(`(() => { const f = document.querySelector('.original-viewer__frame'); return [f.scrollTop > 0] })()`)
    await page.eval(`document.querySelector('.viewer-toolbar .button--secondary').click()`)
    await sleep(700)
    const resetState = await page.eval(`(() => { const f = document.querySelector('.original-viewer__frame'); return { width: document.querySelector('.original-viewer canvas').width, top: f.scrollTop, left: f.scrollLeft } })()`)
    check('UAT-03 zoom still enlarges the page', zoomedWidth > before * 1.2, `${before} -> ${zoomedWidth}`)
    check('UAT-03 the zoomed page can be panned by scrolling', panned[0])
    check('UAT-03 reset restores the fitted size and the scroll position', resetState.width === before && resetState.top === 0 && resetState.left === 0, JSON.stringify(resetState))
  }
  }

  // ============================================================ UAT-04: split pane uses the workspace
  if (want('UAT-04')) {
  for (const [w, h] of [[1920, 1080], [1366, 768], [1100, 800]]) {
    for (const language of ['ar', 'en']) {
      await openReview(page, { width: w, height: h, language })
      for (const sidebar of [true, false]) {
        await setSidebarOpen(page, sidebar)
        await sleep(500)
        const read = () => page.eval(`(() => {
          const split = document.querySelector('.split-pane'); const sb = split.getBoundingClientRect()
          const panels = [...split.querySelectorAll(':scope > .split-pane__panel')].map((p) => p.getBoundingClientRect().width)
          const stacked = split.classList.contains('is-stacked')
          const main = document.querySelector('.app-main').getBoundingClientRect().width
          return { stacked, split: sb.width, panels, unused: sb.width - panels.reduce((a, b) => a + b, 0) - (stacked ? 0 : 14), main, left: sb.left, right: sb.right }
        })()`)
        const label = `UAT-04 ${w}x${h} ${language.toUpperCase()} sidebar ${sidebar ? 'open' : 'closed'}`
        const start = await read()
        if (start.stacked) {
          check(`${label}: stacked layout, no sideways overflow`, await page.eval(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`))
          continue
        }
        check(`${label}: the workspace is not capped narrower than the page (${Math.round(start.split)}px of main ${Math.round(start.main)}px)`, start.split >= start.main - 64 - 1, JSON.stringify(start))
        check(`${label}: default split leaves no unused space`, Math.abs(start.unused) <= 1, `unused ${start.unused}`)
        const box = await page.eval(`(() => { const r = document.querySelector('.split-pane__divider').getBoundingClientRect(); const s = document.querySelector('.split-pane').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60, left: s.left, right: s.right } })()`)
        for (const extreme of ['start', 'end']) {
          const rtl = language === 'ar'
          const toX = (extreme === 'start') === rtl ? box.right - 2 : box.left + 2
          await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (box.x + toX) / 2, y: box.y, button: 'left' })
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: toX, y: box.y, button: 'left' })
          await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: box.y, button: 'left', clickCount: 1 })
          await sleep(350)
          const after = await read()
          const [startPanel, endPanel] = after.panels
          check(`${label}: dragged to the ${extreme} extreme: no unused space (${Math.round(after.unused)}px), minimums kept (${Math.round(startPanel)} / ${Math.round(endPanel)})`, Math.abs(after.unused) <= 1 && startPanel >= 319 && endPanel >= 359, JSON.stringify(after))
          const small = extreme === 'start' ? startPanel : endPanel
          check(`${label}: the dragged-to extreme is really reached (smaller panel = its minimum)`, Math.abs(small - (extreme === 'start' ? 320 : 360)) <= 2, `${small}`)
          await page.eval(`document.querySelector('.split-pane__divider').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
          await sleep(200)
        }
      }
    }
  }
  // Other pages keep their readable maximum width.
  await page.setViewport(1920, 1080)
  await page.goto(`${BASE_URL}/archive`)
  await sleep(400)
  check('UAT-04 other pages keep the maximum content width (the review page alone is wide)', (await page.eval(`document.querySelector('.app-content').getBoundingClientRect().width`)) <= 1321)
  }

  // ============================================================ UAT-05: tables
  if (want('UAT-05')) {
  for (const [w, h] of [[1366, 768], [1920, 1080]]) {
    for (const language of ['ar', 'en']) {
      await openReview(page, { width: w, height: h, language })
      await setSidebarOpen(page, true)
      await page.waitFor(`document.querySelectorAll('.element-card').length >= 3`, { timeout: 15000 })
      await page.eval(`document.querySelector('[data-tab="tables"]').click()`) // tables have their own tab (decision 4)
      await page.waitFor(`document.querySelector('.insert-point__button')`)
      await page.click('.insert-point__button')
      await page.waitFor(`document.querySelector('.insert-point__menu')`)
      await page.eval(`document.querySelector('.insert-point__menu .button--secondary').click()`) // table (the only type of this tab)
      await page.waitFor(`document.querySelector('.element-card .table-editor')`)
      await sleep(300)
      const geometry = () => page.eval(`(() => {
        const card = document.querySelector('.element-card:has(.table-editor)'); const scroll = card.querySelector('.table-editor__scroll'); const table = card.querySelector('table')
        const cells = [...card.querySelectorAll('tbody tr:first-child td:not(.table-editor__row-tools)')].map((td) => td.getBoundingClientRect().width)
        return { client: scroll.clientWidth, scrollW: scroll.scrollWidth, cols: cells.length, rows: card.querySelectorAll('tbody tr').length, cells, tableW: table.getBoundingClientRect().width, dir: getComputedStyle(table).direction }
      })()`)
      const label = `UAT-05 ${w}x${h} ${language.toUpperCase()}`
      let g = await geometry()
      check(`${label}: a new empty ${g.rows}x${g.cols} table fits the editor without sideways scrolling (${Math.round(g.scrollW)} <= ${Math.round(g.client)})`, g.scrollW <= g.client + 1, JSON.stringify(g))
      check(`${label}: its columns share the width equally`, Math.max(...g.cells) - Math.min(...g.cells) <= 2, JSON.stringify(g.cells))
      check(`${label}: cells are no wider than needed (each <= ${Math.round(g.client / g.cols)}px)`, g.cells.every((c) => c <= g.client / g.cols), JSON.stringify(g.cells))
      const clickIn = (js) => page.eval(`(() => { const card = document.querySelector('.element-card:has(.table-editor)'); ${js} })()`)
      // grow to 4 columns (still compact), then to 12 (must scroll, with readable cells)
      for (let i = 0; i < 2; i += 1) await clickIn(`card.querySelectorAll('.table-editor__column-tools')[0].querySelectorAll('button')[0].click()`)
      await sleep(300)
      g = await geometry()
      check(`${label}: ${g.cols} columns still fit when there is room`, g.cols === 4 && (g.scrollW <= g.client + 1 || g.cells.every((c) => c >= 80)), JSON.stringify(g))
      for (let i = 0; i < 8; i += 1) await clickIn(`card.querySelectorAll('.table-editor__column-tools')[0].querySelectorAll('button')[0].click()`)
      await sleep(300)
      g = await geometry()
      check(`${label}: ${g.cols} columns scroll sideways (genuinely needed) with readable cells (min ${Math.round(Math.min(...g.cells))}px)`, g.cols === 12 && g.scrollW > g.client && Math.min(...g.cells) >= 80, JSON.stringify(g))
      // editing, rows, undo/redo, JSON
      await clickIn(`card.querySelector('tbody tr:first-child td input').focus()`)
      await page.type('خلية ١')
      await clickIn(`card.querySelector('tbody tr:first-child td input').blur()`)
      await clickIn(`card.querySelector('.table-editor__row-tools button').click()`) // add a row after row 1
      await sleep(300)
      g = await geometry()
      check(`${label}: adding a row works (${g.rows} rows)`, g.rows === 3)
      await page.eval(`document.querySelector('[data-tab="json"]').click()`) // the JSON tab
      await page.waitFor(`document.querySelector('.json-preview__code')`)
      const json = await page.eval(`(() => { const find = (o) => { if (o && typeof o === 'object') { if (o.type === 'table') return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r } } return null }; const t = find(JSON.parse(document.querySelector('.json-preview__code').textContent)); return { rows: t.content.rows.length, cols: t.content.rows[0].cells.length, first: t.content.rows[0].cells[0].text } })()`)
      check(`${label}: the JSON matches the table on screen (${json.rows}x${json.cols}, first cell "${json.first}")`, json.rows === g.rows && json.cols === g.cols && json.first === 'خلية ١', JSON.stringify(json))
      await page.eval(`document.querySelector('[data-tab="tables"]').click()`)
      await page.eval(`document.querySelector('.editor-toolbar__history button').click()`) // undo (the row)
      await sleep(300)
      g = await geometry()
      check(`${label}: undo removes the added row`, g.rows === 2, JSON.stringify(g))
      await page.eval(`document.querySelectorAll('.editor-toolbar__history button')[1].click()`) // redo
      await sleep(300)
      g = await geometry()
      check(`${label}: redo brings it back`, g.rows === 3)
      await clickIn(`const buttons = card.querySelectorAll('.table-editor__row-tools button'); buttons[buttons.length - 1].click()`) // delete the last row
      await sleep(300)
      check(`${label}: deleting a row works`, (await geometry()).rows === 2)
      for (let i = 0; i < 10; i += 1) await clickIn(`const tools = card.querySelectorAll('.table-editor__column-tools'); const b = tools[tools.length - 1].querySelectorAll('button')[1]; if (b && !b.disabled) b.click()`)
      await sleep(400)
      g = await geometry()
      check(`${label}: after deleting columns the table is compact again (${g.cols} columns, no scroll)`, g.cols === 2 && g.scrollW <= g.client + 1, JSON.stringify(g))
    }
  }
  }

  check('no console errors during the whole run', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '))
})
