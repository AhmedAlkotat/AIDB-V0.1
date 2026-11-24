// Shared test helpers. Not a test file (the npm script only runs *.test.js).

import assert from 'node:assert/strict'
import { createDocument } from '../src/domain/document/document.js'
import { createElement } from '../src/domain/document/elements.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'
import { createEditorReducer, createInitialEditorState } from '../src/state/documentSession/documentReducer.js'

export const FILE = Object.freeze({ name: 'تقرير.pdf', size: 53349, mimeType: 'application/pdf', lastModified: 1_700_000_000_000 })

export function makeIds() {
  return createSequentialIdGenerator()
}

// A document with pages 1..5 where `selectedPages` are selected.
export function makeDocument({ selectedPages = [1, 3, 5], totalPages = 5, generateId = makeIds() } = {}) {
  return createDocument({ file: FILE, totalPages, selectedPages }, { generateId })
}

// Reducer + initial state + helpers for dispatching.
export function makeEditor(options = {}) {
  const generateId = options.generateId ?? makeIds()
  const document = makeDocument({ ...options, generateId })
  const reducer = createEditorReducer({ generateId })
  let state = createInitialEditorState(document)
  return {
    generateId,
    reducer,
    get state() {
      return state
    },
    dispatch(action) {
      state = reducer(state, action)
      return state
    },
    page(pageNumber = state.lastVisitedPage) {
      return state.document.pages.find((page) => page.pageNumber === pageNumber)
    },
  }
}

export const paragraph = (generateId, text = 'نص', init = {}) =>
  createElement('paragraph', { ...init, content: { text } }, { generateId })

export const heading = (generateId, text = 'عنوان', level = 1, init = {}) =>
  createElement('heading', { ...init, content: { text, level } }, { generateId })

export const field = (generateId, key = 'الاسم', value = 'أحمد', init = {}) =>
  createElement('field', { ...init, content: { key, value } }, { generateId })

export const table = (generateId, grid = [['أ', 'ب'], ['ج', 'د']], init = {}) =>
  createElement('table', { ...init, content: { rows: grid } }, { generateId })

export const unclassified = (generateId, text = 'غير مصنف', raw = null, init = {}) =>
  createElement('unclassified', { ...init, content: { text, raw } }, { generateId })

// Asserts that `fn` throws a DocumentOperationError with the given code.
export function assertOperationError(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.name, 'DocumentOperationError')
    assert.equal(error.code, code)
    return true
  })
}

export const NOW = '2026-11-23T10:00:00.000Z'
