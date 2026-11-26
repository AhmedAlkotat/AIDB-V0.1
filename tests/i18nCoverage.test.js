// Localization guard: Arabic and English must have exactly the same keys, no text may be empty,
// and every translation key the source code uses must exist in BOTH languages. This catches an
// interface that was written in one language only (English used to fall back to Arabic for the
// queue, archive and review screens until it was found and fixed in Batch C).

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { translations } from '../src/i18n/translations.js'

const flatten = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) => (typeof value === 'object' && value !== null ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]))
const lookup = (language, path) => path.split('.').reduce((value, key) => value?.[key], translations[language])

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(js|jsx)$/.test(name) && !path.endsWith(join('i18n', 'translations.js')) ? [path] : []
  })
}

const files = sourceFiles('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }))

describe('dictionaries', () => {
  test('Arabic and English have identical keys', () => {
    const ar = new Set(flatten(translations.ar))
    const en = new Set(flatten(translations.en))
    assert.deepEqual([...ar].filter((key) => !en.has(key)), [], 'missing in English')
    assert.deepEqual([...en].filter((key) => !ar.has(key)), [], 'missing in Arabic')
  })

  test('no text is empty and every placeholder of one language exists in the other', () => {
    for (const key of flatten(translations.ar)) {
      const ar = lookup('ar', key)
      const en = lookup('en', key)
      assert.ok(String(ar).trim() !== '' && String(en).trim() !== '', key)
      const names = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')
      assert.equal(names(en), names(ar), `placeholders differ in ${key}`)
    }
  })
})

describe('keys used by the source code', () => {
  test('every literal t(\'key\') exists in both languages', () => {
    const missing = []
    for (const { path, text } of files) {
      for (const match of text.matchAll(/\bt\(\s*['"]([A-Za-z][\w.]*)['"]/g)) {
        for (const language of ['ar', 'en']) if (typeof lookup(language, match[1]) !== 'string') missing.push(`${path}: ${match[1]} (${language})`)
      }
    }
    assert.deepEqual(missing, [])
  })

  test('every labelKey / titleKey / descriptionKey literal exists in both languages', () => {
    const missing = []
    for (const { path, text } of files) {
      for (const match of text.matchAll(/(?:labelKey|titleKey|descriptionKey|textKey):\s*['"]([A-Za-z][\w.]*)['"]|(?:labelKey|titleKey|descriptionKey|textKey)=["']([A-Za-z][\w.]*)["']/g)) {
        const key = match[1] ?? match[2]
        for (const language of ['ar', 'en']) if (typeof lookup(language, key) !== 'string') missing.push(`${path}: ${key} (${language})`)
      }
    }
    assert.deepEqual(missing, [])
  })

  test('every dynamic t(`prefix.${...}`) points at an existing group in both languages', () => {
    const missing = []
    for (const { path, text } of files) {
      for (const match of text.matchAll(/\bt\(\s*`([A-Za-z][\w.]*?)\.?\$\{/g)) {
        for (const language of ['ar', 'en']) {
          const group = lookup(language, match[1])
          if (typeof group !== 'object' || group === null) missing.push(`${path}: ${match[1]} (${language})`)
        }
      }
    }
    assert.deepEqual(missing, [])
  })

  test('the groups built from enumerations have a text for every member, in both languages', () => {
    const groups = {
      'audit.categories': ['approval', 'approvedEdits', 'employeeAccounts', 'restore', 'backups', 'authentication', 'uploads', 'processing'],
      'audit.actions': ['approved', 'newVersionCreated', 'reapproved', 'employeeCreated', 'employeeUpdated', 'employeePasswordSet', 'employeeDeactivated', 'employeeReactivated', 'restoreCompleted', 'restoreFailed', 'restoreCancelled', 'backupCreated', 'backupFailed', 'loginSucceeded', 'loginFailed', 'documentUploaded', 'processingStarted', 'processingRetried', 'processingFailed'],
      'notifications.types': ['processingCompleted', 'processingFailed', 'storageWarning', 'storageCritical', 'storageFull', 'backupFailed'],
      'backups.types': ['scheduled', 'manual', 'protective'],
      'backups.status': ['completed', 'failed'],
      'backups.restore.steps': ['verify', 'protectiveBackup', 'restore'],
      'backups.restore.stepStatus': ['pending', 'done', 'failed', 'skipped'],
      'storage.level': ['ok', 'warning', 'critical', 'full'],
      'storage.dev.scenarios': ['normal', 'warning', 'critical', 'full'],
      'systemSettings.weekdays': ['0', '1', '2', '3', '4', '5', '6'],
      'systemSettings.backups.weekday.options': ['0', '1', '2', '3', '4', '5', '6'],
      'systemErrors': ['forbidden', 'notFound', 'invalidInput', 'blocked', 'notConnected', 'network', 'unknown'],
      'roles': ['employee', 'orgAdmin'],
      // Batch D
      'documents.state': ['pending', 'processing', 'readyForReview', 'failed', 'manualEditing', 'approved'],
      'documents.types': ['invoice', 'certificate', 'contract', 'administrativeRequest', 'other', 'unclassified'],
      'documents.failure': ['CANCELLED', 'MOCK_OCR_FAILED', 'PROCESSING_FAILED', 'INVALID_EXTRACTION_RESULT', 'PROCESSING_INTERRUPTED', 'unknown'],
      'workflow.errors': ['storageFull', 'storageFullTitle', 'insufficientStorage', 'fileTooLarge', 'tooManyPages', 'invalidState', 'notEligible', 'lockHeld', 'lockLost', 'noSuchVersion', 'unknown'],
      'export.formats': ['docx', 'xlsx', 'pdf', 'json'],
      'review.tabs': ['texts', 'tables', 'fields', 'json'],
      'review.tabs.hint': ['texts', 'tables', 'fields'],
      'review.attempts.status': ['succeeded', 'failed', 'cancelled', 'awaitingDecision', 'accepted', 'rejected'],
      'review.attempts.trigger': ['upload', 'retry', 'reprocess'],
      'review.stateBanner': ['failed', 'manualEditing'],
      'review.approval.notice': ['approved', 'versionCreated', 'notConnected', 'refused', 'forbidden', 'lock', 'notEligible'],
      'review.lock': ['held', 'checking', 'readOnlyTitle', 'readOnlyText', 'lostTitle', 'lostText', 'availableTitle', 'availableText', 'start'],
      'upload.actions.blocked': ['readingPdf', 'pdfError', 'pageSelection', 'limitsLoading', 'limitsError', 'fileTooLarge', 'pageLimit', 'storageFull'],
    }
    for (const [group, members] of Object.entries(groups)) {
      for (const language of ['ar', 'en']) {
        for (const member of members) {
          const value = lookup(language, `${group}.${member}`)
          assert.ok(value !== undefined, `${language} ${group}.${member}`)
        }
      }
    }
  })
})

describe('document states', () => {
  test('every lifecycle state of the domain has a text in both languages (and nothing else is listed)', async () => {
    const { DOCUMENT_STATE_LIST } = await import('../src/domain/document/lifecycle.js')
    for (const language of ['ar', 'en']) {
      assert.deepEqual(Object.keys(lookup(language, 'documents.state')).sort(), [...DOCUMENT_STATE_LIST].sort())
    }
  })

  test('the Arabic names of the six states are the approved ones in English too (decision 12)', () => {
    const english = lookup('en', 'documents.state')
    assert.deepEqual(
      [english.pending, english.processing, english.readyForReview, english.failed, english.manualEditing, english.approved],
      ['Pending', 'Processing', 'Ready for Review', 'Failed', 'Manual Editing', 'Approved'],
    )
  })
})

describe('no hardcoded user-facing text in components', () => {
  test('JSX has no literal Arabic or Latin text nodes outside the translation dictionary', () => {
    const offenders = []
    for (const { path, text } of files.filter((file) => file.path.endsWith('.jsx'))) {
      for (const match of text.matchAll(/>\s*([^<>{}\n]*[ء-يA-Za-z][^<>{}\n]*)\s*</g)) {
        const content = match[1].trim()
        // Allow the product name and the language codes, which are not translated on purpose.
        if (content === '' || ['AIDP', 'AR', 'EN', 'return'].includes(content)) continue
        // Only plain words count: operators and code that merely look like a tag are skipped.
        if (!/^[ء-يA-Za-z][ء-يA-Za-z ,.!؟…'-]*$/.test(content)) continue
        offenders.push(`${path}: ${content}`)
      }
    }
    assert.deepEqual(offenders, [])
  })
})
