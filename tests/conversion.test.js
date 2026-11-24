import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { changeElementType, planConversion, previewElementConversion } from '../src/domain/document/conversion.js'
import { editElement, insertElement } from '../src/domain/document/elementOperations.js'
import { assertOperationError, field, heading, makeIds, paragraph, table, unclassified } from './helpers.js'

const one = (element) => insertElement([], element)

describe('safe conversions (nothing meaningful is lost)', () => {
  test('paragraph <-> heading keeps the text and the heading level', () => {
    const ids = makeIds()
    const start = one(heading(ids, 'عنوان', 3))
    const asParagraph = changeElementType(start, start[0].id, 'paragraph', { generateId: ids })
    assert.equal(asParagraph[0].type, 'paragraph')
    assert.deepEqual(asParagraph[0].content, { text: 'عنوان' })
    const back = changeElementType(asParagraph, start[0].id, 'heading', { generateId: ids })
    assert.deepEqual(back[0].content, { text: 'عنوان', level: 3 })
  })

  test('a converted element keeps its ID, order, source, location and metadata', () => {
    const ids = makeIds()
    const source = { kind: 'ai', details: { model: 'm' } }
    const location = { x: 0, y: 0.5, width: 1, height: 0.1 }
    const start = insertElement(one(paragraph(ids, 'أول')), paragraph(ids, 'ثاني', { source, location, metadata: { keep: 1 } }))
    const [, second] = start
    const next = changeElementType(start, second.id, 'heading', { generateId: ids })
    assert.equal(next[1].id, second.id)
    assert.equal(next[1].order, 1)
    assert.deepEqual(next[1].source, source)
    assert.deepEqual(next[1].location, location)
    assert.equal(next[1].metadata.keep, 1)
  })

  test('text-like to field, table and unclassified is lossless', () => {
    const ids = makeIds()
    const start = one(paragraph(ids, 'محتوى'))
    const id = start[0].id
    assert.deepEqual(changeElementType(start, id, 'field', { generateId: ids })[0].content, { key: '', value: 'محتوى' })
    assert.deepEqual(
      changeElementType(start, id, 'table', { generateId: ids })[0].content.rows.map((row) => row.cells.map((cell) => cell.text)),
      [['محتوى']],
    )
    assert.deepEqual(changeElementType(start, id, 'unclassified', { generateId: ids })[0].content, { text: 'محتوى', raw: null })
  })

  test('field -> unclassified -> field restores the exact key and value', () => {
    const ids = makeIds()
    const start = one(field(ids, 'رقم الهوية', '١٢٣'))
    const plan = planConversion(start[0], 'unclassified', { generateId: ids })
    assert.equal(plan.lossless, true)
    const asUnclassified = changeElementType(start, start[0].id, 'unclassified', { generateId: ids })
    assert.deepEqual(asUnclassified[0].content, { text: 'رقم الهوية: ١٢٣', raw: { key: 'رقم الهوية', value: '١٢٣' } })
    const back = changeElementType(asUnclassified, start[0].id, 'field', { generateId: ids })
    assert.deepEqual(back[0].content, { key: 'رقم الهوية', value: '١٢٣' })
  })

  test('table -> unclassified -> table restores the exact grid', () => {
    const ids = makeIds()
    const grid = [['أ', 'ب'], ['ج', 'د']]
    const start = one(table(ids, grid))
    const asUnclassified = changeElementType(start, start[0].id, 'unclassified', { generateId: ids })
    assert.deepEqual(asUnclassified[0].content.raw, { rows: grid })
    const back = changeElementType(asUnclassified, start[0].id, 'table', { generateId: ids })
    assert.deepEqual(back[0].content.rows.map((row) => row.cells.map((cell) => cell.text)), grid)
  })

  test('field <-> table (one row, two cells) and empty or one-cell tables are lossless', () => {
    const ids = makeIds()
    const asTable = changeElementType(one(field(ids, 'مفتاح', 'قيمة')), 'el_1', 'table', { generateId: ids })
    assert.deepEqual(asTable[0].content.rows.map((row) => row.cells.map((cell) => cell.text)), [['مفتاح', 'قيمة']])
    assert.deepEqual(changeElementType(asTable, asTable[0].id, 'field', { generateId: ids })[0].content, { key: 'مفتاح', value: 'قيمة' })

    const empty = one(table(ids, [['', ''], ['', '']]))
    assert.equal(planConversion(empty[0], 'paragraph').lossless, true)
    const single = one(table(ids, [['فقط']]))
    assert.equal(planConversion(single[0], 'paragraph').lossless, true)
    assert.equal(planConversion(single[0], 'paragraph').preview.content.text, 'فقط')
  })

  test('unclassified without raw data converts to text-like types losslessly', () => {
    const ids = makeIds()
    const start = one(unclassified(ids, 'نص حر', null))
    assert.equal(planConversion(start[0], 'paragraph').lossless, true)
    assert.equal(planConversion(start[0], 'heading').lossless, true)
  })
})

describe('destructive conversions need explicit confirmation', () => {
  test('a table with real content cannot become text without confirmation, but a preview is available', () => {
    const ids = makeIds()
    const start = one(table(ids, [['الاسم', 'العمر'], ['سارة', '٣٠']]))
    const plan = previewElementConversion(start, start[0].id, 'paragraph')
    assert.equal(plan.requiresConfirmation, true)
    assert.equal(plan.lossless, false)
    assert.deepEqual(plan.lostData, [{ code: 'tableStructure' }])
    assert.equal(plan.preview.content.text, 'الاسم\tالعمر\nسارة\t٣٠')
    assert.equal(plan.preview.type, 'paragraph')
    assert.equal(start[0].type, 'table')

    assert.throws(
      () => changeElementType(start, start[0].id, 'paragraph', { generateId: ids }),
      (error) => {
        assert.equal(error.code, 'CONFIRMATION_REQUIRED')
        assert.equal(error.details.plan.preview.content.text, plan.preview.content.text)
        return true
      },
    )
    assert.equal(start[0].type, 'table')
  })

  test('with confirmation the conversion is applied and the element ID is preserved', () => {
    const ids = makeIds()
    const start = one(table(ids, [['أ', 'ب'], ['ج', 'د']]))
    const next = changeElementType(start, start[0].id, 'paragraph', { confirmed: true, generateId: ids })
    assert.equal(next[0].type, 'paragraph')
    assert.equal(next[0].id, start[0].id)
    assert.equal(next[0].content.text, 'أ\tب\nج\tد')
  })

  test('confirmed must be exactly true', () => {
    const ids = makeIds()
    const start = one(table(ids, [['أ', 'ب']]))
    for (const confirmed of ['true', 1, undefined, null]) {
      assertOperationError(() => changeElementType(start, start[0].id, 'paragraph', { confirmed, generateId: ids }), 'CONFIRMATION_REQUIRED')
    }
  })

  test('a field with both key and value merged into text loses the relationship', () => {
    const ids = makeIds()
    const start = one(field(ids, 'الاسم', 'سارة'))
    const plan = planConversion(start[0], 'paragraph')
    assert.deepEqual(plan.lostData, [{ code: 'fieldRelationship' }])
    assert.equal(plan.preview.content.text, 'الاسم: سارة')
    assertOperationError(() => changeElementType(start, start[0].id, 'heading', { generateId: ids }), 'CONFIRMATION_REQUIRED')
  })

  test('a field with only one side filled converts to text without loss', () => {
    const ids = makeIds()
    assert.equal(planConversion(one(field(ids, '', 'قيمة'))[0], 'paragraph').lossless, true)
    assert.equal(planConversion(one(field(ids, 'مفتاح', ''))[0], 'paragraph').lossless, true)
  })

  test('unclassified raw data is never dropped silently', () => {
    const ids = makeIds()
    const start = one(unclassified(ids, 'ختم', { kind: 'stamp', pts: [1, 2] }))
    for (const target of ['paragraph', 'heading', 'field', 'table']) {
      const plan = planConversion(start[0], target, { generateId: ids })
      assert.deepEqual(plan.lostData, [{ code: 'unclassifiedRaw' }], target)
      assertOperationError(() => changeElementType(start, start[0].id, target, { generateId: ids }), 'CONFIRMATION_REQUIRED')
    }
  })

  test('a table that is not 1x2 becomes a field only with confirmation', () => {
    const ids = makeIds()
    const start = one(table(ids, [['أ', 'ب', 'ج']]))
    assert.equal(planConversion(start[0], 'field').requiresConfirmation, true)
  })
})

describe('invalid conversions', () => {
  test('rejects the same type, unknown types and missing elements', () => {
    const ids = makeIds()
    const start = one(paragraph(ids))
    assertOperationError(() => changeElementType(start, start[0].id, 'paragraph'), 'SAME_TYPE')
    assertOperationError(() => changeElementType(start, start[0].id, 'chart'), 'INVALID_ARGUMENT')
    assertOperationError(() => changeElementType(start, 'missing', 'heading'), 'ELEMENT_NOT_FOUND')
  })

  test('does not mutate the input list', () => {
    const ids = makeIds()
    const start = one(field(ids))
    const snapshot = JSON.stringify(start)
    changeElementType(start, start[0].id, 'table', { generateId: ids })
    assert.equal(JSON.stringify(start), snapshot)
  })
})

describe('no silent data loss', () => {
  test('a blank key never hides a real value', () => {
    const ids = makeIds()
    for (const key of [' ', '   ', '\t', '\u00a0']) {
      const start = one(field(ids, key, 'قيمة مهمة'))
      for (const target of ['paragraph', 'heading']) {
        const plan = planConversion(start[0], target)
        assert.equal(plan.preview.content.text, 'قيمة مهمة', `${JSON.stringify(key)} -> ${target}`)
        assert.equal(plan.lossless, true)
      }
      const plan = planConversion(start[0], 'unclassified')
      assert.equal(plan.preview.content.text, 'قيمة مهمة')
      assert.deepEqual(plan.preview.content.raw, { key, value: 'قيمة مهمة' })
    }
  })

  test('a blank value never hides a real key, and two blank sides stay blank', () => {
    const ids = makeIds()
    assert.equal(planConversion(one(field(ids, 'مفتاح', '  '))[0], 'paragraph').preview.content.text, 'مفتاح')
    const blank = planConversion(one(field(ids, ' ', ' '))[0], 'paragraph')
    assert.equal(blank.preview.content.text.trim(), '')
    assert.equal(blank.lossless, true)
  })

  test('a field whose key and value are both filled still reports the lost relationship', () => {
    const ids = makeIds()
    const plan = planConversion(one(field(ids, 'مفتاح', 'قيمة'))[0], 'paragraph')
    assert.deepEqual(plan.lostData, [{ code: 'fieldRelationship' }])
    assert.equal(plan.preview.content.text, 'مفتاح: قيمة')
  })

  test('a blank key survives field -> unclassified -> field exactly', () => {
    const ids = makeIds()
    const start = one(field(ids, ' ', 'قيمة'))
    const asUnclassified = changeElementType(start, start[0].id, 'unclassified', { generateId: ids })
    const back = changeElementType(asUnclassified, start[0].id, 'field', { generateId: ids })
    assert.deepEqual(back[0].content, { key: ' ', value: 'قيمة' })
  })

  test('edited unclassified text is never replaced by the older raw key/value', () => {
    const ids = makeIds()
    const start = one(field(ids, 'الاسم', 'سارة'))
    let list = changeElementType(start, start[0].id, 'unclassified', { generateId: ids })
    list = editElement(list, start[0].id, { text: 'نص صححه المراجع' })

    const plan = planConversion(list[0], 'field')
    assert.equal(plan.lossless, false)
    assert.equal(plan.requiresConfirmation, true)
    assert.deepEqual(plan.lostData, [{ code: 'unclassifiedRaw' }])
    // The reviewer's text is what is kept.
    assert.deepEqual(plan.preview.content, { key: '', value: 'نص صححه المراجع' })

    const before = JSON.stringify(list)
    assertOperationError(() => changeElementType(list, start[0].id, 'field', { generateId: ids }), 'CONFIRMATION_REQUIRED')
    assert.equal(JSON.stringify(list), before)
    const confirmed = changeElementType(list, start[0].id, 'field', { confirmed: true, generateId: ids })
    assert.deepEqual(confirmed[0].content, { key: '', value: 'نص صححه المراجع' })
  })

  test('edited unclassified text is never replaced by the older raw table', () => {
    const ids = makeIds()
    const start = one(table(ids, [['أ', 'ب'], ['ج', 'د']]))
    let list = changeElementType(start, start[0].id, 'unclassified', { generateId: ids })
    list = editElement(list, start[0].id, { text: 'نص جديد تمامًا' })

    const plan = planConversion(list[0], 'table')
    assert.deepEqual(plan.lostData, [{ code: 'unclassifiedRaw' }])
    assert.deepEqual(plan.preview.content.rows.map((row) => row.cells.map((cell) => cell.text)), [['نص جديد تمامًا']])
    assertOperationError(() => changeElementType(list, start[0].id, 'table', { generateId: ids }), 'CONFIRMATION_REQUIRED')
  })

  test('unedited text still restores the raw data exactly, even after an edit that was reverted', () => {
    const ids = makeIds()
    const start = one(table(ids, [['أ', 'ب'], ['ج', 'د']]))
    let list = changeElementType(start, start[0].id, 'unclassified', { generateId: ids })
    const original = list[0].content.text
    list = editElement(list, start[0].id, { text: 'مؤقت' })
    list = editElement(list, start[0].id, { text: original })
    const plan = planConversion(list[0], 'table')
    assert.equal(plan.lossless, true)
    assert.deepEqual(plan.preview.content.rows.map((row) => row.cells.map((cell) => cell.text)), [['أ', 'ب'], ['ج', 'د']])
  })

  test('the heading level survives a trip through every other type', () => {
    const ids = makeIds()
    for (const via of ['unclassified', 'table', 'field', 'paragraph']) {
      const start = one(heading(ids, 'عنوان', 4))
      const there = changeElementType(start, start[0].id, via, { generateId: ids })
      const back = changeElementType(there, start[0].id, 'heading', { generateId: ids })
      assert.deepEqual(back[0].content, { text: 'عنوان', level: 4 }, via)
    }
  })

  test('a lossy conversion never changes the input list', () => {
    const ids = makeIds()
    const start = one(table(ids, [['أ', 'ب']]))
    const before = JSON.stringify(start)
    assertOperationError(() => changeElementType(start, start[0].id, 'paragraph', { generateId: ids }), 'CONFIRMATION_REQUIRED')
    assert.equal(JSON.stringify(start), before)
  })
})
