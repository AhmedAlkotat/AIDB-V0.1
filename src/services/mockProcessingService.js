// MOCK AI processing for the review UI demonstration.
//
// NOT real AI and NOT OCR: it makes up placeholder Arabic content, marks every
// element `source.details.mock = true` and prefixes the text with a visible
// "[تجريبي]" tag, so it can never be mistaken for a real extraction. No network
// request is made. A later phase replaces this module with the real processing
// service behind the same `extractPage` call.
//
// Behaviour (deterministic, so it can be demonstrated and tested):
// - by default, pages whose number is a multiple of 4 FAIL on the first attempt
//   and succeed on the retry;
// - the result differs on every attempt, so a re-extraction can be compared with
//   the existing content.

import { createElement } from '../domain/document/elements.js'
import { generateId as defaultGenerateId } from '../domain/document/ids.js'

export const MOCK_TAG = '[تجريبي]'
export const MOCK_ERROR_CODE = 'MOCK_OCR_FAILED'

export class MockProcessingError extends Error {
  constructor(pageNumber, attempt) {
    super(`Mock extraction failed for page ${pageNumber} (attempt ${attempt}).`)
    this.name = 'MockProcessingError'
    this.code = MOCK_ERROR_CODE
  }
}

const defaultShouldFail = ({ pageNumber, attempt }) => pageNumber % 4 === 0 && attempt === 1

function wait(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'))
      return
    }
    if (delayMs <= 0) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// The placeholder content of one extraction (also used to seed demo documents).
export function buildMockElements(pageNumber, attempt, generateId = defaultGenerateId) {
  const source = { kind: 'ai', details: { mock: true, provider: 'mock', attempt } }
  // SIMULATED coordinates (decision 50: they are optional): only some elements carry them, so both the
  // highlight and the review without it can be tried. A real model reports them, or not.
  const make = (type, content, location) => createElement(type, { content, source, ...(location ? { location } : {}) }, { generateId })
  const variant = attempt > 1 ? ` (نتيجة إعادة المعالجة التجريبية رقم ${attempt})` : ''
  return [
    make('heading', { text: `${MOCK_TAG} عنوان الصفحة ${pageNumber}${variant}`, level: 1 }, { x: 0.1, y: 0.05, width: 0.8, height: 0.07 }),
    make('paragraph', {
      text:
        `${MOCK_TAG} هذا نص عربي تجريبي طويل يمثل الفقرة المستخرجة من الصفحة ${pageNumber}. ` +
        'يحتوي على عدة جمل لاختبار التحرير والبحث والتمرير داخل المحرر، ويشمل أرقامًا مثل ٢٠٢٦ وكلمات مشكّلة مثل الْعَرَبِيَّةُ. ' +
        (attempt > 1 ? 'تم تغيير هذه الجملة في نتيجة إعادة المعالجة لإظهار الفروق عند المقارنة. ' : 'هذه جملة أصلية من الاستخراج الأول. ') +
        'نهاية الفقرة التجريبية.',
    }),
    make('field', { key: 'رقم المعاملة', value: `TX-${pageNumber}${attempt}` }, { x: 0.1, y: 0.45, width: 0.5, height: 0.05 }),
    make('table', {
      rows: [
        ['البند', 'الكمية', 'السعر'],
        ['صنف أ', String(10 * attempt), '٥٠٠'],
        ['صنف ب', '٣', String(250 + attempt)],
      ],
    }, { x: 0.1, y: 0.6, width: 0.8, height: 0.2 }),
    make('unclassified', { text: `${MOCK_TAG} ختم / توقيع`, raw: { mock: true, label: 'stamp-or-signature' } }),
  ]
}

export function createMockProcessingService({ delayMs = 700, shouldFail = defaultShouldFail, generateId = defaultGenerateId } = {}) {
  const forcedFailures = new Map() // pageNumber -> remaining forced failures

  return {
    isMock: true,

    // Resolves { elements, attempt, mock: true } or rejects with MockProcessingError.
    async extractPage({ pageNumber, attempt = 1, signal }) {
      await wait(delayMs, signal)
      const forced = forcedFailures.get(pageNumber) ?? 0
      if (forced > 0) {
        forcedFailures.set(pageNumber, forced - 1)
        throw new MockProcessingError(pageNumber, attempt)
      }
      if (shouldFail({ pageNumber, attempt })) throw new MockProcessingError(pageNumber, attempt)
      return { elements: buildMockElements(pageNumber, attempt, generateId), attempt, mock: true }
    },

    // Demo tools: make the next `times` extractions of a page fail.
    forceFailure(pageNumber, times = 1) {
      forcedFailures.set(pageNumber, times)
    },
  }
}

export const mockProcessingService = createMockProcessingService()
