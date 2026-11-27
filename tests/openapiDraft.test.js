// H2: docs/api/openapi.draft.yaml must be real YAML and a structurally valid OpenAPI 3.0 document.
//
// Why this exists: the draft once contained two unquoted `: ` inside plain scalars (a `summary` and a `description`),
// which is not YAML. The regex-based checks of contractServer.test.js could not see it. This file parses the whole file
// with a real YAML parser (`yaml`, dev dependency) and validates it with the official OpenAPI 3.0 schema
// (`@seriousme/openapi-schema-validator`, dev dependency). Neither is part of the production bundle.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { Validator } from '@seriousme/openapi-schema-validator'
import { parseDocument } from 'yaml'
import { ROUTES } from '../scripts/contract-server/server.mjs'

const text = readFileSync(new URL('../docs/api/openapi.draft.yaml', import.meta.url), 'utf8')
const parsed = parseDocument(text)
const draft = parsed.toJS()
const validate = (document) => new Validator().validate(document)

const METHODS = ['get', 'post', 'put', 'patch', 'delete']
const operationsOf = (document) =>
  Object.entries(document.paths).flatMap(([path, item]) => METHODS.filter((method) => item[method]).map((method) => ({ path, method: method.toUpperCase(), ...item[method] })))

// Every `$ref` of the document, with where it is.
function collectRefs(node, where = '#', found = []) {
  if (Array.isArray(node)) node.forEach((item, index) => collectRefs(item, `${where}/${index}`, found))
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push({ ref: value, where })
      else collectRefs(value, `${where}/${key}`, found)
    }
  }
  return found
}

const resolvePointer = (document, ref) =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((node, part) => (node === undefined || node === null ? undefined : node[part.replaceAll('~1', '/').replaceAll('~0', '~')]), document)

describe('openapi.draft.yaml is real YAML', () => {
  test('it parses with no error and no warning (this also rejects duplicate keys and an unquoted ": " in a plain scalar)', () => {
    assert.deepEqual(parsed.errors.map((error) => `${error.code} line ${error.linePos?.[0]?.line}: ${error.message.split('\n')[0]}`), [])
    assert.deepEqual(parsed.warnings.map((warning) => warning.message.split('\n')[0]), [])
  })

  test('the checker really fails on the defect that was found (it is not a test that cannot fail)', () => {
    const broken = parseDocument('paths:\n  /x:\n    get:\n      summary: Restore test: integrity and decryption\n')
    assert.ok(broken.errors.length > 0)
    const fixed = parseDocument("paths:\n  /x:\n    get:\n      summary: 'Restore test: integrity and decryption'\n")
    assert.equal(fixed.errors.length, 0)
    const duplicate = parseDocument('a: 1\na: 2\n')
    assert.ok(duplicate.errors.length > 0)
  })
})

describe('openapi.draft.yaml is a valid OpenAPI 3.0 document', () => {
  test('it is valid against the official OpenAPI 3.0 schema', async () => {
    const result = await validate(draft)
    assert.equal(result.valid, true, JSON.stringify(result.errors, null, 1))
    assert.equal(draft.openapi, '3.0.3')
  })

  test('the validator really rejects a broken document (it is not a test that cannot fail)', async () => {
    const withoutInfo = structuredClone(draft)
    delete withoutInfo.info
    assert.equal((await validate(withoutInfo)).valid, false)
    const badResponse = structuredClone(draft)
    badResponse.paths['/templates'].get.responses = {}
    assert.equal((await validate(badResponse)).valid, false)
    const badType = structuredClone(draft)
    badType.components.schemas.Role.type = 'banana'
    assert.equal((await validate(badType)).valid, false)
  })

  test('every $ref resolves inside the document', () => {
    const refs = collectRefs(draft)
    assert.ok(refs.length > 100, `only ${refs.length} refs found`)
    for (const { ref, where } of refs) assert.notEqual(resolvePointer(draft, ref), undefined, `dangling ${ref} (at ${where})`)
  })

  test('every operation has a unique operationId, a success response, and the extensions the project relies on', () => {
    const operations = operationsOf(draft)
    assert.ok(operations.length >= 50)
    const ids = operations.map((operation) => operation.operationId)
    assert.equal(new Set(ids).size, ids.length)
    for (const operation of operations) {
      assert.ok(Object.keys(operation.responses).some((status) => status.startsWith('2')), `${operation.operationId}: no success response`)
      assert.ok(['confirmed-requirement', 'proposed', 'open-question'].includes(operation['x-status']), `${operation.operationId}: x-status`)
      assert.ok(Array.isArray(operation['x-decisions']) && operation['x-decisions'].every(Number.isInteger), `${operation.operationId}: x-decisions`)
      assert.equal(typeof operation['x-permission'], 'string', `${operation.operationId}: x-permission`)
      assert.match(operation['x-service'], /^\w+\.[\w.]+$/, `${operation.operationId}: x-service`)
    }
  })

  test('the REAL parse and the contract server\'s route table describe exactly the same operations', () => {
    const fromDraft = operationsOf(draft).map((operation) => `${operation.operationId} ${operation.method} ${operation.path}`)
    const fromServer = ROUTES.map((route) => `${route.operationId} ${route.method} ${route.template}`)
    assert.deepEqual(fromServer.sort(), fromDraft.sort())
  })

  test('the error envelope\'s code enum is the closed list of error-codes.md', () => {
    const codes = draft.components.schemas.ErrorCode.enum
    const markdown = readFileSync(new URL('../docs/api/error-codes.md', import.meta.url), 'utf8')
    for (const code of codes) assert.ok(markdown.includes(`\`${code}\``), `error-codes.md lacks ${code}`)
    assert.equal(new Set(codes).size, codes.length)
  })
})
