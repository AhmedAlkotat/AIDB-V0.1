// Browser check for L4: a rotated IMAGE must keep a layout box that matches what is
// drawn, so nothing is clipped or unreachable by scrolling, at 0/90/180/270 degrees
// and at different zoom levels, in RTL and LTR. (PDF rotation is drawn by PDF.js and
// is covered by the PDF checks.)

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE_URL, openUploadedReview, runChecks, setLanguage, startProcessing } from './harness.mjs'
import { sleep } from './cdp.mjs'
import { writeTestPng } from './png.mjs'

const dir = join(tmpdir(), 'aidp-browser-checks')
mkdirSync(dir, { recursive: true })
const wide = join(dir, 'wide-300x100.png')
const tall = join(dir, 'tall-100x300.png')
writeTestPng(wide, 300, 100)
writeTestPng(tall, 100, 300)

async function openImageReview(page, file, language) {
  await page.goto(`${BASE_URL}/upload`)
  await setLanguage(page, language)
  await page.setFiles('input[type=file]', [file])
  await startProcessing(page)
  await openUploadedReview(page, file.split(/[\\/]/).pop())
  await page.waitFor(`document.querySelector('.original-viewer img') && document.querySelector('.original-viewer img').complete && document.querySelector('.original-viewer img').naturalWidth > 0`)
  await sleep(400)
}

const measure = (page) =>
  page.eval(`(() => {
    const img = document.querySelector('.original-viewer img')
    const holder = document.querySelector('.original-viewer__page')
    const frame = document.querySelector('.original-viewer__frame')
    const i = img.getBoundingClientRect()
    const p = holder.getBoundingClientRect()
    const f = frame.getBoundingClientRect()
    return {
      imgW: i.width, imgH: i.height,
      clipTop: Math.max(0, p.top - i.top), clipBottom: Math.max(0, i.bottom - p.bottom),
      clipLeft: Math.max(0, p.left - i.left), clipRight: Math.max(0, i.right - p.right),
      pageW: p.width, pageH: p.height,
      canReachRight: frame.scrollWidth >= Math.floor(i.width), canReachBottom: frame.scrollHeight >= Math.floor(i.height),
      frameW: f.width,
    }
  })()`)

await runChecks('Image rotation (L4)', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 900 })
  for (const language of ['ar', 'en']) {
    for (const [name, file] of [['wide 3:1', wide], ['tall 1:3', tall]]) {
      await openImageReview(page, file, language)
      for (const [steps, degrees] of [[0, 0], [1, 90], [2, 180], [3, 270]]) {
        for (const zoomClicks of [0, 2]) {
          // Reset = zoom 100% and rotation 0; then rotate / zoom with the real buttons.
          await page.eval(`document.querySelector('.viewer-toolbar .button--secondary').click()`)
          for (let i = 0; i < steps; i += 1) await page.eval(`document.querySelectorAll('.viewer-toolbar .icon-button')[2].click()`)
          for (let i = 0; i < zoomClicks; i += 1) await page.eval(`document.querySelectorAll('.viewer-toolbar .icon-button')[1].click()`)
          await sleep(250)
          const m = await measure(page)
          const label = `L4 ${language} ${name} rotated ${degrees}deg zoom +${zoomClicks}`
          const clipped = m.clipTop + m.clipBottom + m.clipLeft + m.clipRight
          check(`${label}: nothing is clipped outside the scrollable page box`, clipped < 1, `clip t${m.clipTop.toFixed(0)} b${m.clipBottom.toFixed(0)} l${m.clipLeft.toFixed(0)} r${m.clipRight.toFixed(0)}`)
          check(`${label}: the whole image can be scrolled into view`, m.canReachRight && m.canReachBottom)
          if (zoomClicks === 0) {
            check(`${label}: it fits the frame width when not zoomed`, m.imgW <= m.frameW + 1, `image ${m.imgW.toFixed(0)} frame ${m.frameW.toFixed(0)}`)
            await page.screenshot(join(dir, `rotation-${language}-${name.slice(0, 4)}-${degrees}.png`))
          }
        }
      }
    }
  }
  check('no console errors', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
