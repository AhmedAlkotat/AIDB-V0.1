// Browser checks of the review page behaviour (real Chrome, real clicks and keys):
// L3 insert-point focus/ARIA, L5 undo behind modals, L6 clipboard failure, L7 Arabic
// search, P4 review confirmation with pending text, P5 accept
// while processing, StrictMode (the dev server renders inside <StrictMode>).

import { openReview, runChecks, BASE_URL } from './harness.mjs'
import { sleep } from './cdp.mjs'

const active = (page) => page.eval(`(() => { const a = document.activeElement; return a ? { tag: a.tagName, cls: a.className, label: a.getAttribute('aria-label') ?? '', inCard: Boolean(a.closest('.element-card')) } : null })()`)
const cards = (page) => page.eval(`document.querySelectorAll('.element-card').length`)
const inputValue = (page, index = 0) => page.eval(`document.querySelectorAll('.element-card .editor-input')[${index}].value`)

// Types into an input like a user: focus it, replace its text, WITHOUT leaving the field.
async function typeIn(page, index, text) {
  await page.eval(`(() => { const el = document.querySelectorAll('.element-card .editor-input')[${index}]; el.focus(); el.select() })()`)
  await page.type(text)
}

await runChecks('Review page behaviour', async ({ browser, check }) => {
  const page = await browser.newPage({ width: 1280, height: 900 })
  await openReview(page, { width: 1280, height: 900 })
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 3`, { timeout: 15000 })
  check('the mock extraction filled page 1 under StrictMode (one result, no duplicate run)', (await cards(page)) === 5, `cards: ${await cards(page)}`)

  // ---------------------------------------------------------------- L3
  const triggers = await page.eval(`[...document.querySelectorAll('.insert-point__button')].map((b) => b.getAttribute('aria-label'))`)
  check('L3 every insert point has its own accessible name', new Set(triggers).size === triggers.length && triggers.length >= 2, JSON.stringify(triggers))
  await page.eval(`document.querySelectorAll('.insert-point__button')[1].focus()`)
  await page.pressEnter()
  await page.waitFor(`document.querySelector('.insert-point__menu')`)
  let state = await page.eval(`(() => { const t = document.querySelector('.insert-point.is-open .insert-point__button'); return { expanded: t.getAttribute('aria-expanded'), controls: t.getAttribute('aria-controls'), menuId: document.querySelector('.insert-point__menu').id } })()`)
  check('L3 opening with the keyboard sets aria-expanded="true" and aria-controls to the menu', state.expanded === 'true' && state.controls === state.menuId && state.menuId !== '', JSON.stringify(state))
  let focus = await active(page)
  check('L3 focus moves to the first type in the menu (not lost to the page)', focus.tag === 'BUTTON' && focus.cls.includes('button--secondary'), JSON.stringify(focus))
  await page.key('Escape', { code: 'Escape', vk: 27 })
  await sleep(100)
  focus = await active(page)
  state = await page.eval(`({ menu: Boolean(document.querySelector('.insert-point__menu')), expanded: document.querySelectorAll('.insert-point__button')[1].getAttribute('aria-expanded') })`)
  check('L3 Escape closes the menu and focus returns to the trigger', !state.menu && state.expanded === 'false' && focus.cls.includes('insert-point__button'), JSON.stringify({ state, focus }))

  await page.click('.insert-point__button')
  await page.waitFor(`document.querySelector('.insert-point__menu')`)
  await page.eval(`document.querySelector('.insert-point__cancel').click()`)
  await sleep(100)
  focus = await active(page)
  check('L3 "cancel" closes the menu and focus returns to the trigger', focus.cls.includes('insert-point__button'), JSON.stringify(focus))

  const before = await cards(page)
  await page.click('.insert-point__button')
  await page.waitFor(`document.querySelector('.insert-point__menu')`)
  await page.eval(`document.querySelector('.insert-point__menu .button--secondary').click()`) // the first type: heading
  await page.waitFor(`document.querySelectorAll('.element-card').length === ${before + 1}`)
  await sleep(150)
  focus = await active(page)
  check('L3 choosing a type adds the element and moves focus into it', focus.inCard, JSON.stringify(focus))

  // ---------------------------------------------------------------- L7 (search)
  await typeIn(page, 1, 'ذهب المسؤول إلى المدرسة مع أحمد وعلي')
  await page.eval(`document.activeElement.blur()`)
  await sleep(200)
  const searchSelector = '.editor-toolbar__search input'
  for (const [query, label] of [['مدرسه', 'مدرسة/مدرسه'], ['مسوول', 'مسؤول/مسوول'], ['احمد', 'أحمد/احمد'], ['علي', 'على/علي']]) {
    await page.eval(`(() => { const el = document.querySelector('${searchSelector}'); el.focus(); el.select() })()`)
    await page.type(query)
    await sleep(150)
    const found = await page.eval(`({ summary: document.querySelector('.search-summary')?.textContent ?? '', marks: [...document.querySelectorAll('.match-preview mark')].map((m) => m.textContent) })`)
    check(`L7 searching "${query}" finds the text written differently (${label})`, found.marks.length >= 1, JSON.stringify(found))
  }
  // "علي" is highlighted in BOTH spellings found on the page (علي and على).
  await page.eval(`(() => { const el = document.querySelector('${searchSelector}'); el.focus(); el.select() })()`)
  await page.type('علي')
  await sleep(150)
  const both = await page.eval(`[...document.querySelectorAll('.match-preview mark')].map((m) => m.textContent)`)
  check('L7 both spellings (علي and على) are highlighted with their ORIGINAL letters', both.includes('علي') && both.includes('على'), JSON.stringify(both))
  check('L7 the stored text is not changed by searching', (await inputValue(page, 1)) === 'ذهب المسؤول إلى المدرسة مع أحمد وعلي')
  await page.eval(`(() => { const el = document.querySelector('${searchSelector}'); el.focus(); el.select() })()`)
  await page.type('')
  await page.key('Backspace', { code: 'Backspace', vk: 8 })
  await page.eval(`(() => { const el = document.querySelector('${searchSelector}'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)

  // ---------------------------------------------------------------- L6 (clipboard)
  await page.click('.json-preview__toggle')
  await page.waitFor(`document.querySelector('.json-preview__code')`)
  const jsonText = await page.eval(`document.querySelector('.json-preview__code').textContent`)
  check('L6 the JSON shows the stored text (not the normalized search form)', jsonText.includes('المدرسة') && !jsonText.includes('المدرسه'))
  check('L6 the JSON preview is read-only (no editable control)', await page.eval(`!document.querySelector('.json-preview__panel textarea, .json-preview__panel input, .json-preview__panel [contenteditable="true"]')`))
  const clip = (impl) => page.eval(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: ${impl} })`)
  const copyButton = '.json-preview__actions button'
  await clip(`{ writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }`)
  await page.click(copyButton)
  await sleep(300)
  let ui = await page.eval(`({ alert: document.querySelector('.json-preview__error')?.textContent ?? '', role: document.querySelector('.json-preview__error')?.getAttribute('role'), label: document.querySelector('${copyButton}').textContent.trim() })`)
  check('L6 a refused clipboard shows a visible Arabic error with role="alert"', ui.alert.includes('تعذّر النسخ') && ui.role === 'alert', JSON.stringify(ui))
  check('L6 a refused clipboard never says "copied"', !ui.label.includes('تم النسخ'), ui.label)
  await clip(`undefined`)
  await page.click(copyButton)
  await sleep(300)
  ui = await page.eval(`({ alert: Boolean(document.querySelector('.json-preview__error')), label: document.querySelector('${copyButton}').textContent.trim() })`)
  check('L6 no clipboard API at all is also reported as an error', ui.alert && !ui.label.includes('تم النسخ'), JSON.stringify(ui))
  await page.eval(`window.__copied = null`)
  await clip(`{ writeText: (text) => { window.__copied = text; return Promise.resolve() } }`)
  await page.click(copyButton)
  await sleep(300)
  ui = await page.eval(`({ alert: Boolean(document.querySelector('.json-preview__error')), label: document.querySelector('${copyButton}').textContent.trim(), copied: window.__copied })`)
  check('L6 success is shown only after the clipboard accepted the text, and the error disappears', !ui.alert && ui.label.includes('تم النسخ') && ui.copied === jsonText, JSON.stringify({ ...ui, copied: ui.copied?.length }))
  await page.click('.json-preview__toggle')

  // ---------------------------------------------------------------- L5 (undo behind modals)
  await typeIn(page, 0, 'عنوان بعد التعديل')
  await page.eval(`document.activeElement.blur()`)
  await sleep(150)
  const cardsBefore = await cards(page)
  await page.click('.element-card:has(table) .icon-button--danger')
  await page.waitFor(`document.querySelector('dialog[open]')`)
  await page.key('z', { ctrl: true, vk: 90 })
  await page.key('z', { ctrl: true, vk: 90 })
  await sleep(200)
  check('L5 Ctrl+Z while a modal dialog is open does not change the document', (await inputValue(page, 0)) === 'عنوان بعد التعديل' && (await cards(page)) === cardsBefore)
  await page.key('y', { ctrl: true, vk: 89 })
  await sleep(100)
  check('L5 Ctrl+Y while a modal dialog is open does nothing either', (await inputValue(page, 0)) === 'عنوان بعد التعديل')
  await page.eval(`document.querySelector('dialog[open] .button--secondary').click()`) // cancel
  await sleep(200)
  await page.eval(`document.activeElement?.blur?.(); document.body.focus()`)
  await page.key('z', { ctrl: true, vk: 90 })
  await sleep(200)
  check('L5 with no dialog open, Ctrl+Z still undoes (normal behaviour preserved)', (await inputValue(page, 0)) !== 'عنوان بعد التعديل', await inputValue(page, 0))
  await page.key('y', { ctrl: true, vk: 89 })
  await sleep(200)
  check('L5 and Ctrl+Y redoes it', (await inputValue(page, 0)) === 'عنوان بعد التعديل', await inputValue(page, 0))

  // ---------------------------------------------------------------- P4
  const reviewButton = '.review-bar .button--primary'
  const reviewedText = `.review-bar__done`
  // (a) the button is clicked WITHOUT blurring the field (as assistive technology can do).
  await typeIn(page, 0, 'نص كتبته للتو')
  await page.eval(`document.querySelector('${reviewButton}').click()`)
  await sleep(1200) // longer than the 400 ms debounce: the late commit must not undo the confirmation
  let p4 = await page.eval(`({ done: Boolean(document.querySelector('${reviewedText}')), invalidated: Boolean(document.querySelector('.review-bar__invalidated')), text: document.querySelectorAll('.element-card .editor-input')[0].value })`)
  const stored = await page.eval(`(() => { const b = [...document.querySelectorAll('.json-preview__toggle')][0]; b.click(); return null })()`)
  await page.waitFor(`document.querySelector('.json-preview__code')`)
  const json = await page.eval(`JSON.parse(document.querySelector('.json-preview__code').textContent)`)
  const reviewedElement = JSON.stringify(json)
  check('P4 confirming right after typing (no blur) confirms the NEW text and stays confirmed', p4.done && !p4.invalidated && reviewedElement.includes('نص كتبته للتو'), JSON.stringify({ p4, stored }))
  await page.click('.json-preview__toggle')
  // (b) the normal mouse path
  await typeIn(page, 0, 'تعديل ثانٍ')
  await page.click(reviewButton)
  await sleep(1000)
  p4 = await page.eval(`({ done: Boolean(document.querySelector('${reviewedText}')), text: document.querySelectorAll('.element-card .editor-input')[0].value })`)
  check('P4 a real mouse click right after typing also confirms the new text', p4.done && p4.text === 'تعديل ثانٍ', JSON.stringify(p4))

  // ---------------------------------------------------------------- P5 (accept while processing)
  await page.goto(`${BASE_URL}/corrections/review/demo-review-8-pages`)
  await page.waitFor(`document.querySelectorAll('.element-card').length >= 1`, { timeout: 15000 })
  for (let i = 0; i < 5; i += 1) {
    await page.eval(`[...document.querySelectorAll('.page-navigator__main .button')].find((b) => !b.disabled && b.closest('.page-navigator__main') && b.textContent.length > 0 && b.querySelector('svg') && b === document.querySelectorAll('.page-navigator__main .button')[1]).click()`)
    await sleep(900)
  }
  await page.waitFor(`document.querySelector('.processing__running, .processing .alert, .processing')`)
  await sleep(1200)
  const onPage8 = await page.eval(`document.querySelector('.page-navigator__current')?.textContent ?? ''`)
  check('P5 setup: page 8 (which fails its first mock attempt) is open', /8|٨/.test(onPage8), onPage8)
  // type manual content, then retry (creates a candidate because content exists), then retry again
  await page.eval(`document.querySelector('.insert-point__button')?.click()`)
  await page.waitFor(`document.querySelector('.insert-point__menu')`)
  await page.eval(`document.querySelectorAll('.insert-point__menu .button--secondary')[1].click()`) // paragraph
  await sleep(250)
  await page.type('نص يدوي في صفحة فاشلة')
  await page.eval(`document.activeElement.blur()`)
  await sleep(300)
  await page.eval(`document.querySelector('.processing .button--secondary').click()`) // retry/reprocess (attempt 2 succeeds)
  await page.waitFor(`document.querySelector('.comparison')`, { timeout: 8000 })
  await page.eval(`[...document.querySelectorAll('.processing .button--secondary')].find((b) => !b.closest('.comparison')).click()`) // reprocess again
  await sleep(150)
  const acceptState = await page.eval(`(() => { const b = document.querySelector('.comparison__actions .button--primary'); return { disabled: b.disabled, running: Boolean(document.querySelector('.processing__running')) } })()`)
  check('P5 while the page is being processed the accept button is disabled', acceptState.running && acceptState.disabled, JSON.stringify(acceptState))
  await sleep(1200)
  const after = await page.eval(`({ disabled: document.querySelector('.comparison__actions .button--primary')?.disabled, running: Boolean(document.querySelector('.processing__running')) })`)
  check('P5 when the run ends the comparison can be decided again', after.running === false && after.disabled === false, JSON.stringify(after))

  check('no console errors during the whole run', page.consoleErrors.length === 0, page.consoleErrors.join(' | '))
})
