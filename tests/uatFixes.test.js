// Regression tests for the five user-acceptance issues (UAT-01 … UAT-05). What needs a real
// browser (the actual rendering, the flicker over time, dragging) is covered by
// scripts/browser-checks/uat.check.mjs; here is everything that can be tested without one:
// the layout maths, the root-cause models, and what the components render.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { getFitContainerWidth, getPageBoxHeight } from '../src/components/review/fitWidth.js'
import { clampSplitRatio, DIVIDER_PX, getPanelWidths, ratioFromDistance } from '../src/components/review/splitMath.js'
import { createElement } from '../src/domain/document/elements.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'

const root = process.cwd()
const require = createRequire(`${root}/package.json`)
const React = require('react')
const { renderToString } = require('react-dom/server')
const h = React.createElement

let server
let LanguageProvider
const loaded = new Map()

before(async () => {
  const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`).href)
  server = await createServer({ root, appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  ;({ LanguageProvider } = await server.ssrLoadModule('/src/contexts/LanguageProvider.jsx'))
})

after(async () => {
  await server?.close()
})

async function load(file) {
  if (!loaded.has(file)) loaded.set(file, await server.ssrLoadModule(file))
  return loaded.get(file)
}

async function render(file, exportName, props) {
  const module = await load(file)
  return renderToString(h(LanguageProvider, null, h(module[exportName], props)))
}

const css = readFileSync('src/styles/review.css', 'utf-8')
const layoutCss = readFileSync('src/styles/layout.css', 'utf-8')
const ruleOf = (source, selector) => {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `rule ${selector} not found`)
  return source.slice(start, source.indexOf('}', start))
}

// ======================================================================= UAT-01
describe('UAT-01: image uploads (JPG, JPEG, PNG)', () => {
  test('the upload rules accept all three formats, in any letter case, and reject others', async () => {
    const { validateDocumentFile } = await load('/src/utils/documentFile.js')
    const make = (name, type) => ({ name, type, size: 1000 })
    for (const [name, type] of [['a.jpg', 'image/jpeg'], ['a.jpeg', 'image/jpeg'], ['a.png', 'image/png'], ['SCAN.JPG', 'image/jpeg'], ['SCAN.PNG', 'image/png'], ['a.jpg', ''], ['a.png', '']]) {
      const result = validateDocumentFile(make(name, type))
      assert.equal(result.ok ?? result.valid ?? !result.error, true, `${name} (${type || 'no type'}) should be accepted: ${JSON.stringify(result)}`)
    }
    for (const [name, type] of [['a.gif', 'image/gif'], ['a.webp', 'image/webp'], ['a.txt', 'text/plain']]) {
      const result = validateDocumentFile(make(name, type))
      assert.equal(Boolean(result.ok ?? result.valid ?? !result.error), false, `${name} should be refused`)
    }
  })

  test('the file picker offers the three image formats', async () => {
    const { FILE_INPUT_ACCEPT } = await load('/src/constants/upload.js')
    for (const wanted of ['.jpg', '.jpeg', '.png', 'image/jpeg', 'image/png']) assert.ok(FILE_INPUT_ACCEPT.split(',').includes(wanted), wanted)
  })

  test('the review viewer shows an uploaded image as an image with its toolbar (no PDF canvas)', async () => {
    const file = { name: 'scan.jpg', type: 'image/jpeg', size: 10 }
    const html = await render('/src/components/review/OriginalViewer.jsx', 'OriginalViewer', { file, pageNumber: 1 })
    assert.match(html, /<img/)
    assert.doesNotMatch(html, /<canvas/)
    for (const label of ['تصغير', 'تكبير', 'تدوير', 'إعادة ضبط العرض']) assert.match(html, new RegExp(label), label)
  })
})

// ======================================================================= UAT-02
describe('UAT-02: Arabic PDF pages are drawn left-to-right geometry (never inherit RTL)', () => {
  test('the review canvas declares dir="ltr" even though the Arabic interface is RTL', async () => {
    const file = { name: 'وثيقة.pdf', type: 'application/pdf', size: 10 }
    const html = await render('/src/components/review/OriginalViewer.jsx', 'OriginalViewer', { file, pageNumber: 1 })
    assert.match(html, /<canvas[^>]*dir="ltr"/)
  })

  test('the stylesheet forces direction: ltr on the canvas', () => {
    assert.match(ruleOf(css, '.original-viewer__page canvas'), /direction:\s*ltr/)
  })

  test('the render service forces LTR itself, so no caller can bring the bug back', () => {
    const source = readFileSync('src/services/pdfDocumentService.js', 'utf-8')
    assert.match(source, /canvas\.dir = 'ltr'/)
    assert.match(source, /canvas\.style\.direction = 'ltr'/)
    // ... and it does so before PDF.js draws anything.
    assert.ok(source.indexOf("canvas.dir = 'ltr'") < source.indexOf('page.render('))
  })
})

// ======================================================================= UAT-03
describe('UAT-03: the fit width cannot chase the scrollbar', () => {
  const FRAME_HEIGHT = 494 // the frame of a 1366x768 window
  const SCROLLBAR = 15
  const A4_TURNED = 595 / 842 // height / width of an A4 page turned 90 degrees

  // The OLD rule: fit to the content width, which loses the scrollbar's width when it shows.
  function oldWidth(borderBox, scrollbarShowing) {
    return borderBox - 2 - (scrollbarShowing ? SCROLLBAR : 0)
  }
  // Iterates "measure, draw, see whether a scrollbar is needed" and returns the widths it visits.
  function settle(widthRule, borderBox, steps = 8) {
    let showing = false
    const visited = []
    for (let i = 0; i < steps; i += 1) {
      const fit = widthRule(borderBox, showing)
      visited.push(fit)
      showing = getPageBoxHeight({ fitWidth: fit, pageRatio: A4_TURNED }) > FRAME_HEIGHT
    }
    return visited
  }
  const newWidth = (borderBox) => getFitContainerWidth({ borderBoxWidth: borderBox, borderWidth: 2, scrollbarWidth: SCROLLBAR })

  test('the old rule oscillates for frame widths in a critical band (the reproduced flicker)', () => {
    const oscillating = []
    for (let borderBox = 400; borderBox <= 1000; borderBox += 1) {
      const tail = settle(oldWidth, borderBox).slice(-4)
      if (new Set(tail).size > 1) oscillating.push(borderBox)
    }
    assert.ok(oscillating.length > 0, 'the old rule should flicker somewhere')
    // A band of about 15px (the scrollbar's width): exactly where the browser run flickered.
    assert.ok(oscillating.length <= 20, `band too wide: ${oscillating.length}`)
    assert.ok(oscillating[0] >= 680 && oscillating.at(-1) <= 710, `band ${oscillating[0]}..${oscillating.at(-1)}`)
  })

  test('the new rule gives ONE width for every frame width, scrollbar or not', () => {
    for (let borderBox = 400; borderBox <= 1000; borderBox += 1) {
      const visited = settle((box) => newWidth(box), borderBox)
      assert.equal(new Set(visited).size, 1, `frame ${borderBox}: ${visited}`)
    }
  })

  test('the width is the border box minus borders and one scrollbar (never negative)', () => {
    assert.equal(getFitContainerWidth({ borderBoxWidth: 600, borderWidth: 2, scrollbarWidth: 15 }), 583)
    assert.equal(getFitContainerWidth({ borderBoxWidth: 600.9, borderWidth: 2, scrollbarWidth: 0 }), 598)
    assert.equal(getFitContainerWidth({ borderBoxWidth: 10, borderWidth: 2, scrollbarWidth: 15 }), 0)
  })

  test('the viewer observes the border box and fits to it', () => {
    const source = readFileSync('src/components/review/OriginalViewer.jsx', 'utf-8')
    assert.match(source, /observe\(container, \{ box: 'border-box' \}\)/)
    assert.match(source, /getFitContainerWidth/)
    assert.match(source, /measureFitWidth/)
    assert.doesNotMatch(source, /entry\.contentRect\.width/)
  })
})

// ======================================================================= UAT-04
describe('UAT-04: the two panels always fill the workspace', () => {
  const options = { minStartPx: 320, minEndPx: 360 }
  const widths = [694 + 14, 900, 1015, 1079, 1256, 1500, 2400]

  test('for every ratio and width the panels add up to the usable width (nothing unused)', () => {
    for (const width of widths) {
      for (const raw of [-1, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1, 2]) {
        const ratio = clampSplitRatio(raw, width, options)
        const { start, end } = getPanelWidths(ratio, width)
        assert.ok(Math.abs(start + end + DIVIDER_PX - width) < 1e-6, `${width}/${raw}`)
      }
    }
  })

  test('both minimum widths are kept at both extremes (and reached exactly when dragged there)', () => {
    for (const width of widths) {
      const low = getPanelWidths(clampSplitRatio(-5, width, options), width)
      const high = getPanelWidths(clampSplitRatio(5, width, options), width)
      assert.ok(Math.abs(low.start - 320) < 1e-6 && low.end >= 360 - 1e-6, `${width} low ${JSON.stringify(low)}`)
      assert.ok(Math.abs(high.end - 360) < 1e-6 && high.start >= 320 - 1e-6, `${width} high ${JSON.stringify(high)}`)
    }
  })

  test('the reproduced bug: pixel minimums inside fr tracks left ~235px empty at the extreme', () => {
    // Old layout: minmax(320px, 0.255fr) 14px minmax(360px, 0.745fr) in 1256px.
    const container = 1256
    const flex = (minStart, fr1, minEnd, fr2) => {
      // CSS Grid: the first track is held at its minimum; the flex sum of the rest (0.745) is below 1,
      // so the second track only gets that fraction of the leftover space.
      const leftover = container - DIVIDER_PX - minStart
      const sumBelowOne = fr2 < 1
      return { first: minStart, second: sumBelowOne ? leftover * fr2 : leftover }
    }
    const old = flex(320, 320 / container, 360, 1 - 320 / container)
    assert.ok(container - DIVIDER_PX - old.first - old.second > 200, 'the old layout wasted more than 200px')
    // The new rule fills it.
    const fresh = getPanelWidths(clampSplitRatio(0, container, options), container)
    assert.ok(Math.abs(fresh.start + fresh.end + DIVIDER_PX - container) < 1e-6)
  })

  test('the grid uses fr tracks that add up to 1 with no pixel minimums', async () => {
    const source = readFileSync('src/components/review/SplitPane.jsx', 'utf-8')
    assert.match(source, /minmax\(0, \$\{shownRatio\}fr\)/)
    assert.match(source, /minmax\(0, \$\{1 - shownRatio\}fr\)/)
    assert.doesNotMatch(source, /minmax\(\$\{minStartPx\}px/)
  })

  test('dragging maps the pointer to the divider centre in both directions', () => {
    // 1000px container: pointer 507px from the start -> divider centre -> (507 - 7) / 986.
    assert.ok(Math.abs(ratioFromDistance(507, 1000) - 500 / 986) < 1e-12)
    const ratio = ratioFromDistance(507, 1000)
    assert.ok(Math.abs(getPanelWidths(ratio, 1000).start - 500) < 1e-9) // the first panel ends where the divider begins
  })

  test('the review page is not held to the readable width of other pages', () => {
    assert.match(ruleOf(layoutCss, '.app-content--wide'), /max-inline-size:\s*none/)
    assert.match(readFileSync('src/components/layout/AppLayout.jsx', 'utf-8'), /app-content--wide/)
    assert.match(ruleOf(layoutCss, '.app-content'), /max-inline-size:\s*var\(--content-max-width\)/)
  })
})

// ======================================================================= UAT-05
describe('UAT-05: tables are compact and scroll only when they must', () => {
  const ids = createSequentialIdGenerator(900)
  const table = (rows) => createElement('table', { content: { rows }, source: { kind: 'manual' } }, { generateId: ids })
  const renderTable = (element) =>
    render('/src/components/review/editor/TableEditor.jsx', 'TableEditor', {
      element,
      matches: {},
      ctx: { dispatch: () => ({ ok: true }), pageNumber: 1, disabled: false, setPending: () => {}, confirm: () => {} },
    })

  test('the table declares its column count for the minimum width, for any size', async () => {
    for (const [rows, columns] of [[2, 2], [1, 5], [3, 12]]) {
      const grid = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''))
      assert.match(await renderTable(table(grid)), new RegExp(`--table-columns:${columns}`))
    }
  })

  test('fixed layout: the inputs\' own width (about 20 characters) no longer sets the column width', () => {
    const rule = ruleOf(css, '.table-editor table')
    assert.match(rule, /table-layout:\s*fixed/)
    assert.doesNotMatch(rule, /max-content/)
    assert.match(rule, /min-inline-size:\s*calc\(var\(--table-columns, 1\) \* var\(--table-cell-min\) \+ var\(--table-tools-width\)\)/)
    assert.doesNotMatch(ruleOf(css, '.table-editor td'), /min-inline-size/)
  })

  test('a column never gets narrower than a readable minimum, and the sideways scroll only starts after that', () => {
    const cellMin = 5.5 * 16
    const tools = 4.75 * 16
    const needed = (columns) => columns * cellMin + tools
    assert.ok(needed(2) < 300, 'a new 2-column table needs under 300px, so it fits any editor panel')
    assert.ok(needed(4) <= 500 - 40, 'four columns fit a 500px panel')
    assert.ok(needed(12) > 500, 'twelve columns scroll (genuinely needed)')
    assert.match(css, /--table-cell-min:\s*5\.5rem/)
  })

  test('editing structure is untouched: the same controls still render for rows and columns', async () => {
    const html = await renderTable(table([['', ''], ['', '']]))
    assert.equal((html.match(/table-editor__column-tools/g) ?? []).length >= 2, true)
    assert.equal((html.match(/<input/g) ?? []).length, 4)
    assert.match(html, /<th aria-hidden="true" class="table-editor__corner"/)
  })
})
