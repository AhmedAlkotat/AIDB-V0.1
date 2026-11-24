import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseDocumentJson, serializeDocument, stringifyDocument } from '../src/domain/document/serialization.js'
import { SCHEMA_VERSION } from '../src/domain/document/schema.js'
import { validateDocument } from '../src/domain/document/validation.js'
import { ACTION } from '../src/state/documentSession/documentReducer.js'
import { assertOperationError, field, heading, makeEditor, NOW, paragraph, table, unclassified } from './helpers.js'

const LONG = 'فقرة عربية طويلة جدًا. '.repeat(500)

function richEditor() {
  const editor = makeEditor()
  const ai = { source: { kind: 'ai', details: { model: 'any' } }, location: { x: 0.1, y: 0.1, width: 0.8, height: 0.05 } }
  const elements = [
    heading(editor.generateId, 'عنوان المستند', 1, ai),
    paragraph(editor.generateId, LONG, ai),
    table(editor.generateId, [['الاسم', 'العمر'], ['سارة', '٣٠']], ai),
    field(editor.generateId, 'رقم الهوية', '١٢٣٤', ai),
    unclassified(editor.generateId, 'ختم', { kind: 'stamp', pts: [1, 2] }, { metadata: { note: 'x' } }),
  ]
  editor.dispatch({ type: ACTION.extractionApplied, pageNumber: 1, elements })
  editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: elements[3].id, patch: { value: '٩٩٩٩' } })
  return editor
}

describe('serialization', () => {
  test('serializes the current corrected model with IDs, versions, page numbers and order', () => {
    const editor = richEditor()
    const json = serializeDocument(editor.state.document)
    assert.equal(json.schemaVersion, SCHEMA_VERSION)
    assert.equal(json.id, editor.state.document.id)
    assert.deepEqual(json.file, editor.state.document.file)
    assert.deepEqual(json.selectedPages, [1, 3, 5])
    assert.deepEqual(json.pages.map((page) => page.pageNumber), [1, 3, 5])
    assert.deepEqual(json.pages.map((page) => page.id), editor.state.document.pages.map((page) => page.id))
    const page = json.pages[0]
    assert.deepEqual(page.elements.map((element) => element.type), ['heading', 'paragraph', 'table', 'field', 'unclassified'])
    assert.deepEqual(page.elements.map((element) => element.order), [0, 1, 2, 3, 4])
    assert.deepEqual(page.elements.map((element) => element.id), editor.page(1).elements.map((element) => element.id))
  })

  test('uses the corrected content, not the original extraction', () => {
    const editor = richEditor()
    const json = serializeDocument(editor.state.document)
    assert.equal(json.pages[0].elements[3].content.value, '٩٩٩٩')
    assert.equal(editor.page(1).originalExtraction.elements[3].content.value, '١٢٣٤')
    assert.equal('originalExtraction' in json.pages[0], false)
  })

  test('preserves Arabic text, long text, tables, fields and unclassified data exactly', () => {
    const json = serializeDocument(richEditor().state.document)
    const [head, longText, tbl, fld, other] = json.pages[0].elements
    assert.equal(head.content.text, 'عنوان المستند')
    assert.equal(longText.content.text, LONG)
    assert.deepEqual(tbl.content.rows.map((row) => row.cells.map((cell) => cell.text)), [['الاسم', 'العمر'], ['سارة', '٣٠']])
    assert.ok(tbl.content.rows.every((row) => typeof row.id === 'string' && row.cells.every((cell) => typeof cell.id === 'string')))
    assert.deepEqual(fld.content, { key: 'رقم الهوية', value: '٩٩٩٩' })
    assert.deepEqual(other.content, { text: 'ختم', raw: { kind: 'stamp', pts: [1, 2] } })
    assert.deepEqual(other.metadata, { note: 'x' })
    assert.deepEqual(head.location, { x: 0.1, y: 0.1, width: 0.8, height: 0.05 })
    assert.deepEqual(head.source, { kind: 'ai', details: { model: 'any' } })
  })

  test('includes only selected pages, with their review and processing state', () => {
    const editor = richEditor()
    editor.dispatch({ type: ACTION.elementAdded, pageNumber: 3, element: paragraph(editor.generateId, 'صفحة ثالثة') })
    editor.dispatch({ type: ACTION.pageReviewConfirmed, pageNumber: 3, at: NOW })
    const json = serializeDocument(editor.state.document)
    assert.equal(json.pages.length, 3)
    assert.deepEqual(json.pages[1].review, { status: 'reviewed', confirmedAt: NOW })
    assert.deepEqual(json.pages[0].processing, { status: 'succeeded', errorCode: null })
  })

  test('is deterministic and regenerated from the current state after every edit', () => {
    const editor = richEditor()
    const first = stringifyDocument(editor.state.document)
    assert.equal(stringifyDocument(editor.state.document), first)
    editor.dispatch({ type: ACTION.elementEdited, pageNumber: 1, elementId: editor.page(1).elements[1].id, patch: { text: 'نص مختلف' } })
    const second = stringifyDocument(editor.state.document)
    assert.notEqual(second, first)
    assert.equal(JSON.parse(second).pages[0].elements[1].content.text, 'نص مختلف')
    editor.dispatch({ type: ACTION.undone })
    // Undo returns the corrected model to its earlier state, so the JSON matches again.
    assert.equal(stringifyDocument(editor.state.document), first)
  })

  test('returns a deep copy that cannot change the editor state', () => {
    const editor = richEditor()
    const json = serializeDocument(editor.state.document)
    json.pages[0].elements[1].content.text = 'تلاعب'
    json.pages[0].elements[2].content.rows[0].cells[0].text = 'تلاعب'
    json.selectedPages.push(99)
    assert.equal(editor.page(1).elements[1].content.text, LONG)
    assert.equal(editor.page(1).elements[2].content.rows[0].cells[0].text, 'الاسم')
    assert.deepEqual(editor.state.document.selectedPages, [1, 3, 5])
  })

  test('can include the preserved original extraction when asked', () => {
    const editor = richEditor()
    const json = serializeDocument(editor.state.document, { includeOriginalExtraction: true })
    assert.equal(json.pages[0].originalExtraction.elements[3].content.value, '١٢٣٤')
    assert.equal(json.pages[1].originalExtraction, null)
  })

  test('round trips through JSON text and validates on parse', () => {
    const editor = richEditor()
    const text = stringifyDocument(editor.state.document, { includeOriginalExtraction: true })
    const parsed = parseDocumentJson(text)
    assert.equal(parsed.ok, true)
    assert.deepEqual(parsed.document, JSON.parse(text))
    assert.deepEqual(serializeDocument(parsed.document, { includeOriginalExtraction: true }), JSON.parse(text))

    const plain = parseDocumentJson(stringifyDocument(editor.state.document))
    assert.equal(plain.ok, true)
    assert.equal(plain.document.pages[0].originalExtraction, null)
  })

  test('refuses to serialize an invalid document', () => {
    const editor = richEditor()
    const broken = { ...editor.state.document, schemaVersion: '9.9' }
    assertOperationError(() => serializeDocument(broken), 'INVALID_DOCUMENT')
    assertOperationError(() => stringifyDocument(null), 'INVALID_DOCUMENT')
  })
})

describe('JSON parsing rejects malformed or unsupported data', () => {
  const valid = () => JSON.parse(stringifyDocument(richEditor().state.document))
  const codes = (data) => {
    const result = parseDocumentJson(JSON.stringify(data))
    assert.equal(result.ok, false)
    return result.errors.map((error) => error.code)
  }

  test('malformed JSON text', () => {
    const result = parseDocumentJson('{ not json')
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, 'MALFORMED_JSON')
  })

  test('an unsupported or missing schema version', () => {
    assert.deepEqual(codes({ ...valid(), schemaVersion: '99' }), ['UNSUPPORTED_SCHEMA_VERSION'])
    const { schemaVersion: _removed, ...withoutVersion } = valid()
    assert.deepEqual(codes(withoutVersion), ['UNSUPPORTED_SCHEMA_VERSION'])
  })

  test('data that is not a document', () => {
    for (const data of [null, [], 5, 'x']) {
      assert.ok(codes(data).length > 0)
    }
  })
})

describe('validation', () => {
  const documentWith = (change) => {
    const document = JSON.parse(JSON.stringify(richEditor().state.document))
    change(document)
    return document
  }
  const errorsOf = (change) => validateDocument(documentWith(change)).errors

  test('accepts a valid document', () => {
    assert.deepEqual(validateDocument(richEditor().state.document), { valid: true, errors: [] })
  })

  test('requires document and page IDs', () => {
    assert.ok(errorsOf((d) => { d.id = '' }).some((e) => e.code === 'MISSING_ID' && e.path === 'id'))
    assert.ok(errorsOf((d) => { d.pages[0].id = '  ' }).some((e) => e.code === 'MISSING_ID'))
  })

  test('requires element IDs and rejects duplicates across pages and within tables', () => {
    assert.ok(errorsOf((d) => { d.pages[0].elements[0].id = '' }).some((e) => e.code === 'MISSING_ID'))
    const duplicateElement = errorsOf((d) => { d.pages[0].elements[1].id = d.pages[0].elements[0].id })
    assert.ok(duplicateElement.some((e) => e.code === 'DUPLICATE_ID'))
    const duplicateAcrossPages = errorsOf((d) => {
      d.pages[1].elements = [{ ...d.pages[0].elements[0] }]
    })
    assert.ok(duplicateAcrossPages.some((e) => e.code === 'DUPLICATE_ID'))
    const duplicateCell = errorsOf((d) => {
      const rows = d.pages[0].elements[2].content.rows
      rows[1].cells[0].id = rows[0].cells[0].id
    })
    assert.ok(duplicateCell.some((e) => e.code === 'DUPLICATE_ID'))
  })

  test('rejects unsupported element types', () => {
    const errors = errorsOf((d) => { d.pages[0].elements[0].type = 'image' })
    assert.ok(errors.some((e) => e.code === 'INVALID_TYPE' && e.path === 'pages[0].elements[0].type'))
  })

  test('rejects invalid page numbers and selected-page problems', () => {
    assert.ok(errorsOf((d) => { d.pages[0].pageNumber = 0 }).some((e) => e.code === 'INVALID_VALUE'))
    assert.ok(errorsOf((d) => { d.selectedPages = [1, 3, 9] }).some((e) => e.code === 'INVALID_SELECTED_PAGES'))
    assert.ok(errorsOf((d) => { d.selectedPages = [3, 1, 5] }).some((e) => e.code === 'INVALID_SELECTED_PAGES'))
    assert.ok(errorsOf((d) => { d.selectedPages = [] }).some((e) => e.code === 'INVALID_SELECTED_PAGES'))
  })

  test('rejects pages that do not match the selection (missing, extra, duplicated, out of order)', () => {
    const missing = errorsOf((d) => { d.pages.pop() })
    assert.deepEqual(missing.find((e) => e.code === 'PAGE_SELECTION_MISMATCH').details.missing, [5])
    const extra = errorsOf((d) => {
      d.pages.push({ ...d.pages[0], id: 'page_x', pageNumber: 2, elements: [] })
      d.pages.sort((a, b) => a.pageNumber - b.pageNumber)
    })
    assert.deepEqual(extra.find((e) => e.code === 'PAGE_SELECTION_MISMATCH').details.extra, [2])
    assert.ok(errorsOf((d) => { d.pages[1].pageNumber = 1 }).some((e) => e.code === 'PAGE_SELECTION_MISMATCH'))
    assert.ok(errorsOf((d) => { d.pages.reverse() }).some((e) => e.code === 'PAGE_SELECTION_MISMATCH'))
  })

  test('rejects an inconsistent element order', () => {
    const errors = errorsOf((d) => { d.pages[0].elements[1].order = 4 })
    const mismatch = errors.find((e) => e.code === 'ORDER_MISMATCH')
    assert.deepEqual(mismatch.details, { expected: 1, actual: 4 })
    assert.ok(errorsOf((d) => { d.pages[0].elements[0].order = -1 }).length > 0)
  })

  test('rejects invalid table structures and cell dimensions', () => {
    const ragged = errorsOf((d) => { d.pages[0].elements[2].content.rows[1].cells.pop() })
    assert.deepEqual(ragged.find((e) => e.code === 'INVALID_TABLE').details, { expected: 2, actual: 1 })
    assert.ok(errorsOf((d) => { d.pages[0].elements[2].content.rows = [] }).some((e) => e.code === 'INVALID_TABLE'))
    assert.ok(errorsOf((d) => { d.pages[0].elements[2].content.rows[0].cells = [] }).some((e) => e.code === 'INVALID_TABLE'))
    assert.ok(errorsOf((d) => { d.pages[0].elements[2].content.rows[0].cells[0].text = 5 }).some((e) => e.code === 'INVALID_VALUE'))
    assert.ok(errorsOf((d) => { delete d.pages[0].elements[2].content.rows[0].cells[0].id }).some((e) => e.code === 'MISSING_FIELD'))
  })

  test('rejects an invalid field structure', () => {
    assert.ok(errorsOf((d) => { delete d.pages[0].elements[3].content.value }).some((e) => e.code === 'MISSING_FIELD'))
    assert.ok(errorsOf((d) => { d.pages[0].elements[3].content.key = 5 }).some((e) => e.code === 'INVALID_VALUE'))
    assert.ok(errorsOf((d) => { d.pages[0].elements[3].content.extra = 'x' }).some((e) => e.code === 'UNKNOWN_KEY'))
  })

  test('rejects invalid heading levels, source kinds, locations and metadata', () => {
    assert.ok(errorsOf((d) => { d.pages[0].elements[0].content.level = 9 }).some((e) => e.path.endsWith('content.level')))
    assert.ok(errorsOf((d) => { d.pages[0].elements[0].source.kind = 'robot' }).some((e) => e.path.endsWith('source.kind')))
    assert.ok(errorsOf((d) => { d.pages[0].elements[0].location.x = 5 }).some((e) => e.path.endsWith('location.x')))
    assert.ok(errorsOf((d) => { d.pages[0].elements[0].metadata = [] }).some((e) => e.path.endsWith('metadata')))
  })

  test('rejects inconsistent review and processing states', () => {
    assert.ok(errorsOf((d) => { d.pages[0].review = { status: 'reviewed', confirmedAt: null } }).some((e) => e.code === 'INVALID_REVIEW_STATE'))
    assert.ok(errorsOf((d) => { d.pages[0].review = { status: 'notReviewed', confirmedAt: NOW } }).some((e) => e.code === 'INVALID_REVIEW_STATE'))
    assert.ok(errorsOf((d) => { d.pages[0].review.status = 'approved' }).some((e) => e.code === 'INVALID_REVIEW_STATE'))
    assert.ok(errorsOf((d) => { d.pages[0].processing.status = 'done' }).some((e) => e.path.endsWith('processing.status')))
  })

  test('rejects unknown keys instead of silently dropping them', () => {
    assert.ok(errorsOf((d) => { d.surprise = 1 }).some((e) => e.code === 'UNKNOWN_KEY' && e.path === 'surprise'))
    assert.ok(errorsOf((d) => { d.pages[0].extra = 1 }).some((e) => e.code === 'UNKNOWN_KEY'))
    assert.ok(errorsOf((d) => { d.pages[0].elements[0].extra = 1 }).some((e) => e.code === 'UNKNOWN_KEY'))
  })

  test('validates the preserved original extraction as well', () => {
    const errors = errorsOf((d) => { d.pages[0].originalExtraction.elements[0].type = 'image' })
    assert.ok(errors.some((e) => e.path.includes('originalExtraction')))
  })

  test('does not repair or modify the data it validates', () => {
    const document = documentWith((d) => { d.pages[0].elements[1].order = 4 })
    const snapshot = JSON.stringify(document)
    validateDocument(document)
    assert.equal(JSON.stringify(document), snapshot)
  })

  test('reports every problem with a path, not only the first', () => {
    const errors = errorsOf((d) => {
      d.pages[0].elements[0].id = ''
      d.pages[0].elements[1].order = 9
      d.pages[0].elements[3].content.key = 1
    })
    assert.ok(errors.length >= 3)
    assert.ok(errors.every((error) => error.path && error.message && error.code))
  })
})
