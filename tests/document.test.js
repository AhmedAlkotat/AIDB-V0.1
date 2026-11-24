import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDocument, createDocumentFromRequest, requirePage } from '../src/domain/document/document.js'
import { createElement } from '../src/domain/document/elements.js'
import { ELEMENT_TYPE_LIST, SCHEMA_VERSION } from '../src/domain/document/schema.js'
import { assertOperationError, FILE, makeDocument, makeIds } from './helpers.js'

describe('document creation', () => {
  test('creates a versioned document with file metadata and selected pages', () => {
    const document = makeDocument({ selectedPages: [2, 4], totalPages: 6 })
    assert.equal(document.schemaVersion, SCHEMA_VERSION)
    assert.equal(typeof document.id, 'string')
    assert.deepEqual(document.file, { ...FILE, totalPages: 6 })
    assert.deepEqual(document.selectedPages, [2, 4])
  })

  test('creates one independent page record per selected page, keeping original PDF numbers', () => {
    const document = makeDocument({ selectedPages: [2, 4], totalPages: 6 })
    assert.deepEqual(document.pages.map((page) => page.pageNumber), [2, 4])
    const [first, second] = document.pages
    assert.notEqual(first.id, second.id)
    assert.notEqual(first.elements, second.elements)
    assert.deepEqual(first.processing, { status: 'notProcessed', errorCode: null })
    assert.deepEqual(first.review, { status: 'notReviewed', confirmedAt: null })
    assert.equal(first.originalExtraction, null)
    assert.deepEqual(first.elements, [])
  })

  test('selects every page when no selection is given', () => {
    const document = createDocument({ file: FILE, totalPages: 3 }, { generateId: makeIds() })
    assert.deepEqual(document.selectedPages, [1, 2, 3])
    assert.equal(document.pages.length, 3)
  })

  test('treats an image as a single-page document', () => {
    const document = createDocument(
      { file: { name: 'scan.png', size: 10, mimeType: 'image/png' }, totalPages: 1, selectedPages: [1] },
      { generateId: makeIds() },
    )
    assert.equal(document.pages.length, 1)
    assert.equal(document.file.lastModified, null)
  })

  test('uses stable generated IDs that differ between documents', () => {
    const a = createDocument({ file: FILE, totalPages: 1 })
    const b = createDocument({ file: FILE, totalPages: 1 })
    assert.notEqual(a.id, b.id)
  })

  test('builds a document from the Task 1 processing request without keeping the File', () => {
    const file = new File(['%PDF'], 'ملف.pdf', { type: 'application/pdf', lastModified: 123 })
    const request = {
      file,
      fileName: 'ملف.pdf',
      mimeType: 'application/pdf',
      fileSize: 999,
      totalPages: 7,
      pageSelection: { mode: 'selected', pages: [2, 5] },
    }
    const document = createDocumentFromRequest(request, { generateId: makeIds() })
    assert.deepEqual(document.file, { name: 'ملف.pdf', size: 999, mimeType: 'application/pdf', lastModified: 123, totalPages: 7 })
    assert.deepEqual(document.selectedPages, [2, 5])

    // The document holds only plain data: no File/Blob anywhere inside it.
    const holdsBlob = (value) =>
      value instanceof Blob || (value !== null && typeof value === 'object' && Object.values(value).some(holdsBlob))
    assert.equal(holdsBlob(request), true)
    assert.equal(holdsBlob(document), false)
    assert.deepEqual(JSON.parse(JSON.stringify(document)), document)
  })

  const invalidInputs = [
    ['no selected pages', { totalPages: 3, selectedPages: [] }],
    ['page 0', { totalPages: 3, selectedPages: [0] }],
    ['page beyond the document', { totalPages: 3, selectedPages: [4] }],
    ['duplicate pages', { totalPages: 3, selectedPages: [1, 1] }],
    ['unsorted pages', { totalPages: 3, selectedPages: [3, 1] }],
    ['non-integer page', { totalPages: 3, selectedPages: [1.5] }],
    ['zero total pages', { totalPages: 0 }],
    ['missing total pages', {}],
  ]
  for (const [label, input] of invalidInputs) {
    test(`rejects ${label}`, () => {
      assertOperationError(() => createDocument({ file: FILE, ...input }), 'INVALID_DOCUMENT')
    })
  }

  test('rejects an invalid file and reports structured errors', () => {
    try {
      createDocument({ file: { name: '', size: -1, mimeType: 'application/pdf' }, totalPages: 1 })
      assert.fail('expected an error')
    } catch (error) {
      assert.equal(error.code, 'INVALID_DOCUMENT')
      const paths = error.details.errors.map((entry) => entry.path)
      assert.ok(paths.includes('file.name'))
      assert.ok(paths.includes('file.size'))
    }
  })

  test('requirePage tells unselected pages apart from missing pages', () => {
    const document = makeDocument({ selectedPages: [1, 3], totalPages: 5 })
    assert.equal(requirePage(document, 3).pageNumber, 3)
    assertOperationError(() => requirePage(document, 2), 'PAGE_NOT_SELECTED')
    assertOperationError(() => requirePage(document, 9), 'PAGE_NOT_FOUND')
    assertOperationError(() => requirePage(document, 'x'), 'PAGE_NOT_FOUND')
  })
})

describe('element creation', () => {
  test('supports all five element types with defaults, IDs and metadata', () => {
    const generateId = makeIds()
    assert.deepEqual(ELEMENT_TYPE_LIST, ['heading', 'paragraph', 'table', 'field', 'unclassified'])
    const elements = ELEMENT_TYPE_LIST.map((type) => createElement(type, {}, { generateId }))
    const [headingContent, paragraphContent, tableContent, fieldContent, unclassifiedContent] = elements.map(
      (element) => element.content,
    )
    assert.deepEqual(headingContent, { text: '', level: 1 })
    assert.deepEqual(paragraphContent, { text: '' })
    assert.deepEqual(fieldContent, { key: '', value: '' })
    assert.deepEqual(unclassifiedContent, { text: '', raw: null })
    // A default table is one empty row with one empty cell, each with its own ID.
    assert.equal(tableContent.rows.length, 1)
    assert.equal(typeof tableContent.rows[0].id, 'string')
    assert.equal(tableContent.rows[0].cells.length, 1)
    assert.equal(typeof tableContent.rows[0].cells[0].id, 'string')
    assert.equal(tableContent.rows[0].cells[0].text, '')
    for (const element of elements) {
      assert.equal(element.source.kind, 'manual')
      assert.equal(element.location, null)
      assert.deepEqual(element.metadata, {})
    }
    assert.equal(new Set(elements.map((element) => element.id)).size, 5)
  })

  test('keeps provider-independent source, location and metadata', () => {
    const element = createElement(
      'paragraph',
      {
        content: { text: 'x' },
        source: { kind: 'ai', details: { model: 'any-model', attempt: 2 } },
        location: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 },
        metadata: { custom: { nested: [1, 2] } },
      },
      { generateId: makeIds() },
    )
    assert.deepEqual(element.source, { kind: 'ai', details: { model: 'any-model', attempt: 2 } })
    assert.deepEqual(element.location, { x: 0.1, y: 0.2, width: 0.5, height: 0.1 })
    assert.deepEqual(element.metadata, { custom: { nested: [1, 2] } })
  })

  test('builds a table from a grid with stable row and cell IDs', () => {
    const element = createElement('table', { content: { rows: [['أ', 'ب'], ['ج', 'د']] } }, { generateId: makeIds() })
    assert.equal(element.content.rows.length, 2)
    const ids = element.content.rows.flatMap((row) => [row.id, ...row.cells.map((cell) => cell.id)])
    assert.equal(new Set(ids).size, 6)
    assert.equal(element.content.rows[1].cells[0].text, 'ج')
  })

  test('does not alias the input data', () => {
    const raw = { rows: [['a']] }
    const element = createElement('unclassified', { content: { text: 't', raw } }, { generateId: makeIds() })
    raw.rows[0][0] = 'changed'
    assert.equal(element.content.raw.rows[0][0], 'a')
  })

  const invalid = [
    ['an unknown type', 'chart', {}],
    ['heading level 7', 'heading', { content: { text: 'x', level: 7 } }],
    ['non-string paragraph text', 'paragraph', { content: { text: 5 } }],
    ['an unknown content key', 'paragraph', { content: { text: 'x', color: 'red' } }],
    ['a ragged table', 'table', { content: { rows: [['a', 'b'], ['c']] } }],
    ['a table without rows', 'table', { content: { rows: [] } }],
    ['a table with an empty row', 'table', { content: { rows: [[]] } }],
    ['non-JSON raw data', 'unclassified', { content: { text: 'x', raw: () => 1 } }],
    ['an invalid source kind', 'paragraph', { source: { kind: 'robot' } }],
    ['an out-of-range location', 'paragraph', { location: { x: 2, y: 0, width: 1, height: 1 } }],
  ]
  test('a table without rows or cells reports a structured table error', () => {
    for (const rows of [[], [[]], [{ cells: 'x' }]]) {
      assert.throws(
        () => createElement('table', { content: { rows } }, { generateId: makeIds() }),
        (error) => {
          assert.equal(error.code, 'INVALID_ELEMENT')
          assert.ok(error.details.errors.every((entry) => entry.code === 'INVALID_TABLE'))
          return true
        },
      )
    }
  })

  for (const [label, type, init] of invalid) {
    test(`rejects ${label}`, () => {
      assert.throws(() => createElement(type, init, { generateId: makeIds() }), (error) => error.code === 'INVALID_ELEMENT')
    })
  }
})
