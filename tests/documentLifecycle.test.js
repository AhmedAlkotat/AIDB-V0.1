// Batch D, pure rules: the six document states and their transitions (decision 12), permissions (14, 15, 39,
// 42, 46), the central FIFO queue (22, 23), the edit lock (47), approved versions (14), attempts and accepted
// results (11, 40), what an export contains (8, 46), optional coordinates (50), the Admin's upload limits (36, 48)
// and the archive search and filters (9). Frontend rules only: the server must enforce all of them again.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { selectArchive } from '../src/domain/document/access.js'
import { addAcceptedResult, appendAttempt, ATTEMPT_STATUS, listAcceptedResults, nextAttemptNumber, sanitizeAttempt, sortAttempts, updateAttempt } from '../src/domain/document/attempts.js'
import { availableTypes, EMPTY_FILTERS, filterDocuments, hasActiveFilters, UNCLASSIFIED } from '../src/domain/document/archiveFilter.js'
import { buildExportDataset, buildExportFileName, buildJsonExport, EXPORT_FORMAT_LIST, isExportablePage } from '../src/domain/document/exportScope.js'
import { canTransition, DEFAULT_WORKFLOW, DOCUMENT_STATE, DOCUMENT_STATE_LIST, getDocumentState, getPagesToProcess, isArchived, isBeingProcessed, isInCorrectionQueue, isReviewable, WORKFLOW_PHASE } from '../src/domain/document/lifecycle.js'
import { hasLocation, rotateLocation, toPercentStyle } from '../src/domain/document/location.js'
import { assertHolds, isLockActive, LOCK_ERROR, releaseLock, renewLock, requestLock } from '../src/domain/document/lock.js'
import { canApprove, canCreateNewVersion, canDelete, canEditContent, canExport, canRetryProcessing, canView, canViewVersionHistory, getDocumentActions } from '../src/domain/document/permissions.js'
import { countRunning, createQueue, enqueue, getQueuePosition, listJobs, markRunning, pickJobsToStart, removeJob, removeJobsOfDocument } from '../src/domain/document/queue.js'
import { appendApprovedVersion, getVersion, isNewVersionDraft, latestVersion, summarizeVersions } from '../src/domain/document/versions.js'
import { getApprovalEligibility, APPROVAL_BLOCKER } from '../src/domain/document/approval.js'
import { checkFileSize, checkSelectedPageCount, LIMIT_ERROR, mbToBytes } from '../src/utils/uploadLimits.js'
import { validateDocumentFile } from '../src/utils/documentFile.js'
import { createElement } from '../src/domain/document/elements.js'
import { createSequentialIdGenerator } from '../src/domain/document/ids.js'
import { makeEditor, NOW, paragraph } from './helpers.js'

const employee = (id) => ({ id, role: 'employee' })
const admin = { id: 'boss', role: 'orgAdmin' }
const page = (pageNumber, { status = 'notProcessed', elements = [], reviewed = false, original = null } = {}) => ({
  id: `p${pageNumber}`,
  pageNumber,
  processing: { status, errorCode: null },
  review: { status: reviewed ? 'reviewed' : 'notReviewed', confirmedAt: reviewed ? NOW : null },
  originalExtraction: original,
  elements,
})
const textElement = (text) => ({ id: `e-${text}`, type: 'paragraph', order: 0, content: { text }, source: { kind: 'manual', details: {} }, location: null, metadata: {} })

describe('document states (decision 12)', () => {
  test('there are exactly the six approved states', () => {
    assert.deepEqual([...DOCUMENT_STATE_LIST].sort(), ['approved', 'failed', 'manualEditing', 'pending', 'processing', 'readyForReview'])
  })

  test('the state is derived from the approval, the queue phase and the content', () => {
    const state = (workflow, pages = [], approvalStatus = 'none') => getDocumentState({ approvalStatus, workflow, pages })
    assert.equal(state({ phase: WORKFLOW_PHASE.pending }), DOCUMENT_STATE.pending)
    assert.equal(state({ phase: WORKFLOW_PHASE.processing }), DOCUMENT_STATE.processing)
    assert.equal(state({ phase: WORKFLOW_PHASE.completed }), DOCUMENT_STATE.readyForReview)
    assert.equal(state(DEFAULT_WORKFLOW), DOCUMENT_STATE.readyForReview)
    assert.equal(state({ phase: WORKFLOW_PHASE.failed }, [page(1)]), DOCUMENT_STATE.failed)
    assert.equal(state({ phase: WORKFLOW_PHASE.failed }, [page(1, { status: 'failed' })]), DOCUMENT_STATE.failed)
    // typed content after a failure: Manual Editing (decision 11)
    assert.equal(state({ phase: WORKFLOW_PHASE.failed }, [page(1, { status: 'failed', elements: [textElement('نص')] })]), DOCUMENT_STATE.manualEditing)
    // whitespace is not content
    assert.equal(state({ phase: WORKFLOW_PHASE.failed }, [page(1, { elements: [textElement('   ')] })]), DOCUMENT_STATE.failed)
    // approval wins over everything else
    assert.equal(state({ phase: WORKFLOW_PHASE.pending }, [], 'approved'), DOCUMENT_STATE.approved)
  })

  test('the allowed transitions follow the approved flow, and nothing else', () => {
    const allowed = [
      ['pending', 'processing'],
      ['processing', 'readyForReview'],
      ['processing', 'failed'],
      ['readyForReview', 'approved'],
      ['failed', 'processing'], // retry without a new upload (11)
      ['failed', 'manualEditing'],
      ['manualEditing', 'processing'],
      ['manualEditing', 'approved'],
      ['approved', 'readyForReview'], // the Admin's new version (14)
    ]
    for (const [from, to] of allowed) assert.equal(canTransition(from, to), true, `${from} -> ${to}`)
    for (const from of DOCUMENT_STATE_LIST) {
      for (const to of DOCUMENT_STATE_LIST) {
        if (!allowed.some(([a, b]) => a === from && b === to)) assert.equal(canTransition(from, to), false, `${from} -> ${to}`)
      }
    }
    // nothing skips the queue and a Pending document is never approved directly
    assert.equal(canTransition('pending', 'approved'), false)
    assert.equal(canTransition('pending', 'readyForReview'), false)
  })

  test('the archive lists every state except Pending; the queue every state except Approved', () => {
    for (const state of DOCUMENT_STATE_LIST) {
      assert.equal(isArchived(state), state !== 'pending', state)
      assert.equal(isInCorrectionQueue(state), state !== 'approved', state)
    }
    const items = DOCUMENT_STATE_LIST.map((state) => ({ id: state, state, approvalStatus: state === 'approved' ? 'approved' : 'none', ownerId: 'a' }))
    assert.deepEqual(selectArchive(items, admin).map((item) => item.id), ['processing', 'readyForReview', 'failed', 'manualEditing', 'approved'])
  })

  test('pending and processing documents are being processed; only the others have content to review', () => {
    assert.equal(isBeingProcessed('pending'), true)
    assert.equal(isBeingProcessed('processing'), true)
    assert.equal(isBeingProcessed('failed'), false)
    for (const state of ['readyForReview', 'failed', 'manualEditing']) assert.equal(isReviewable(state), true)
    for (const state of ['pending', 'processing', 'approved']) assert.equal(isReviewable(state), false)
  })

  test('a retry processes the pages without a successful extraction and keeps the completed ones', () => {
    const pages = [page(1, { status: 'succeeded' }), page(3, { status: 'failed' }), page(5, { status: 'notProcessed' })]
    assert.deepEqual(getPagesToProcess(pages), [3, 5])
  })
})

describe('permissions (decisions 14, 15, 39, 42, 46)', () => {
  const doc = (state, extra = {}) => ({ id: 'd', ownerId: 'a', state, versionCount: 0, ...extra })

  test('an employee sees only their own documents; the Admin sees all', () => {
    assert.equal(canView(employee('a'), doc('failed')), true)
    assert.equal(canView(employee('b'), doc('failed')), false)
    assert.equal(canView(admin, doc('failed')), true)
  })

  test('an employee approves their own documents only; the Admin approves any; there is no reviewer role', () => {
    assert.equal(canApprove(employee('a'), doc('readyForReview')), true)
    assert.equal(canApprove(employee('b'), doc('readyForReview')), false)
    assert.equal(canApprove(admin, doc('readyForReview')), true)
    assert.equal(canApprove({ id: 'a', role: 'reviewer' }, doc('readyForReview')), false)
  })

  test('nobody edits an approved document; only the Admin can create a new version of it', () => {
    assert.equal(canEditContent(employee('a'), doc('approved')), false)
    assert.equal(canEditContent(admin, doc('approved')), false)
    assert.equal(canEditContent(employee('a'), doc('readyForReview')), true)
    assert.equal(canCreateNewVersion(admin, doc('approved')), true)
    assert.equal(canCreateNewVersion(employee('a'), doc('approved')), false)
    assert.equal(canCreateNewVersion(admin, doc('readyForReview')), false)
  })

  test('only the Admin deletes, even the employee own documents', () => {
    assert.equal(canDelete(admin), true)
    assert.equal(canDelete(employee('a')), false)
  })

  test('a retry is for a failed or manually edited document of the user', () => {
    assert.equal(canRetryProcessing(employee('a'), doc('failed')), true)
    assert.equal(canRetryProcessing(employee('a'), doc('manualEditing')), true)
    assert.equal(canRetryProcessing(employee('a'), doc('readyForReview')), false)
    assert.equal(canRetryProcessing(employee('b'), doc('failed')), false)
  })

  test('export and the version history need an approved version and the right to see the document', () => {
    assert.equal(canExport(employee('a'), doc('approved', { versionCount: 1 })), true)
    assert.equal(canExport(employee('b'), doc('approved', { versionCount: 1 })), false)
    assert.equal(canExport(employee('a'), doc('readyForReview', { versionCount: 0 })), false)
    // a new version in progress does not hide the approved one
    assert.equal(canExport(employee('a'), doc('readyForReview', { versionCount: 1 })), true)
    assert.equal(canViewVersionHistory(admin, doc('approved', { versionCount: 2 })), true)
    assert.equal(canViewVersionHistory(admin, doc('approved', { versionCount: 0 })), false)
  })

  test('the row actions come from one place and follow the state and the role', () => {
    assert.equal(getDocumentActions(employee('a'), doc('pending')).open, 'status')
    assert.equal(getDocumentActions(employee('a'), doc('processing')).open, 'status')
    assert.equal(getDocumentActions(employee('a'), doc('readyForReview')).open, 'review')
    assert.equal(getDocumentActions(employee('a'), doc('approved', { versionCount: 1 })).open, 'readOnly')
    const failedActions = getDocumentActions(employee('a'), doc('failed'))
    assert.equal(failedActions.retry, true)
    assert.equal(failedActions.manualEntry, true)
    assert.equal(failedActions.delete, false)
    assert.equal(getDocumentActions(admin, doc('pending')).delete, true)
    assert.equal(getDocumentActions(admin, doc('pending')).deleteCancelsProcessing, true)
    assert.equal(getDocumentActions(admin, doc('approved', { versionCount: 1 })).newVersion, true)
    assert.equal(getDocumentActions(employee('b'), doc('failed')).open, null)
  })

  test('approval eligibility adds the owner and lock conditions', () => {
    const editor = makeEditor()
    const base = { document: editor.state.document, saveStatus: 'saved', role: 'employee', approvalStatus: 'none' }
    assert.ok(getApprovalEligibility({ ...base, isOwner: false }).blockers.includes(APPROVAL_BLOCKER.noPermission))
    assert.ok(getApprovalEligibility({ ...base, role: 'orgAdmin', isOwner: false }).blockers.every((blocker) => blocker !== APPROVAL_BLOCKER.noPermission))
    assert.ok(getApprovalEligibility({ ...base, holdsLock: false }).blockers.includes(APPROVAL_BLOCKER.editLock))
    assert.ok(!getApprovalEligibility(base).blockers.includes(APPROVAL_BLOCKER.editLock)) // unknown = held (older callers)
  })
})

describe('central queue (decisions 22, 23)', () => {
  const job = (id, documentId = id) => ({ id, kind: 'document', documentId, enqueuedAt: NOW })

  test('first come, first served: jobs start in arrival order whatever the role of their owner', () => {
    let queue = createQueue()
    for (const id of ['a', 'b', 'c']) queue = enqueue(queue, job(id)).queue
    assert.deepEqual(pickJobsToStart(queue, 1).map((entry) => entry.id), ['a'])
    assert.deepEqual(pickJobsToStart(queue, 2).map((entry) => entry.id), ['a', 'b'])
    // a job's data has no role, so nothing can jump the line
    assert.ok(queue.jobs.every((entry) => !('role' in entry) && !('priority' in entry)))
  })

  test('capacity counts the running jobs, and finished ones free a place', () => {
    let queue = createQueue()
    for (const id of ['a', 'b', 'c']) queue = enqueue(queue, job(id)).queue
    queue = markRunning(queue, 'a')
    assert.equal(countRunning(queue), 1)
    assert.deepEqual(pickJobsToStart(queue, 1), [])
    assert.deepEqual(pickJobsToStart(queue, 2).map((entry) => entry.id), ['b'])
    queue = removeJob(queue, 'a')
    assert.deepEqual(pickJobsToStart(queue, 1).map((entry) => entry.id), ['b'])
  })

  test('positions count the waiting jobs only; running jobs have none', () => {
    let queue = createQueue()
    for (const id of ['a', 'b', 'c']) queue = enqueue(queue, job(id)).queue
    queue = markRunning(queue, 'a')
    assert.equal(getQueuePosition(queue, 'a'), null)
    assert.equal(getQueuePosition(queue, 'b'), 1)
    assert.equal(getQueuePosition(queue, 'c'), 2)
    assert.deepEqual(listJobs(queue).map((entry) => entry.id), ['a', 'b', 'c'])
  })

  test('removing a document removes all its jobs and nobody else', () => {
    let queue = createQueue()
    queue = enqueue(queue, job('a', 'doc-1')).queue
    queue = enqueue(queue, { ...job('b', 'doc-1'), kind: 'page', pageNumber: 2 }).queue
    queue = enqueue(queue, job('c', 'doc-2')).queue
    assert.deepEqual(removeJobsOfDocument(queue, 'doc-1').jobs.map((entry) => entry.id), ['c'])
  })
})

describe('edit lock (decision 47)', () => {
  const t0 = new Date('2026-06-01T10:00:00.000Z')
  const at = (ms) => new Date(t0.getTime() + ms)
  const lease = 60_000

  test('one editor at a time; others are refused and told who holds it', () => {
    const first = requestLock(null, { userId: 'a', userName: 'علي', now: t0, leaseMs: lease })
    assert.equal(first.granted, true)
    const second = requestLock(first.lock, { userId: 'b', userName: 'سارة', now: at(1000), leaseMs: lease })
    assert.equal(second.granted, false)
    assert.equal(second.code, LOCK_ERROR.held)
    assert.equal(second.lock.holderName, 'علي')
    // the holder asking again keeps the lock (and the time it was first acquired)
    const again = requestLock(first.lock, { userId: 'a', userName: 'علي', now: at(5000), leaseMs: lease })
    assert.equal(again.granted, true)
    assert.equal(again.lock.acquiredAt, first.lock.acquiredAt)
  })

  test('an expired lock is free for anybody; the server check refuses a save from a user who lost it', () => {
    const { lock } = requestLock(null, { userId: 'a', userName: 'علي', now: t0, leaseMs: lease })
    assert.equal(isLockActive(lock, at(lease - 1)), true)
    assert.equal(isLockActive(lock, at(lease + 1)), false)
    assert.equal(requestLock(lock, { userId: 'b', userName: 'سارة', now: at(lease + 1), leaseMs: lease }).granted, true)
    assert.deepEqual(assertHolds(lock, { userId: 'a', now: at(10) }), { ok: true })
    assert.equal(assertHolds(lock, { userId: 'b', now: at(10) }).code, LOCK_ERROR.held)
    assert.equal(assertHolds(lock, { userId: 'a', now: at(lease + 1) }).code, LOCK_ERROR.lost)
    assert.equal(assertHolds(null, { userId: 'a', now: t0 }).code, LOCK_ERROR.notHeld)
  })

  test('only the holder renews or releases', () => {
    const { lock } = requestLock(null, { userId: 'a', userName: 'علي', now: t0, leaseMs: lease })
    const renewed = renewLock(lock, { userId: 'a', now: at(30_000), leaseMs: lease })
    assert.equal(renewed.ok, true)
    assert.equal(new Date(renewed.lock.expiresAt).getTime(), at(30_000 + lease).getTime())
    assert.equal(renewLock(lock, { userId: 'b', now: at(10), leaseMs: lease }).code, LOCK_ERROR.held)
    assert.equal(renewLock(lock, { userId: 'a', now: at(lease + 1), leaseMs: lease }).code, LOCK_ERROR.lost)
    assert.equal(releaseLock(lock, { userId: 'b', now: at(10) }).ok, false)
    assert.deepEqual(releaseLock(lock, { userId: 'a', now: at(10) }), { ok: true, lock: null })
  })

  test('the module decides no duration: the lease always comes from whoever creates the lock', () => {
    const short = requestLock(null, { userId: 'a', userName: 'ا', now: t0, leaseMs: 1000 })
    const long = requestLock(null, { userId: 'a', userName: 'ا', now: t0, leaseMs: 3_600_000 })
    assert.equal(new Date(short.lock.expiresAt).getTime() - t0.getTime(), 1000)
    assert.equal(new Date(long.lock.expiresAt).getTime() - t0.getTime(), 3_600_000)
  })
})

describe('approved versions (decision 14)', () => {
  const snapshot = (pages = [1, 2]) => ({ schemaVersion: '0.1', id: 'd', file: { name: 'x.pdf', totalPages: 5 }, selectedPages: pages, pages: pages.map((n) => page(n, { status: 'succeeded', reviewed: true, elements: [textElement(`نص ${n}`)] })) })

  test('versions are numbered upwards, keep their content and their dates, and cannot be changed afterwards', () => {
    const source = snapshot()
    let versions = appendApprovedVersion([], { snapshot: source, approvedAt: NOW, approvedBy: 'a', approvedByName: 'علي' })
    versions = appendApprovedVersion(versions, { snapshot: snapshot([1]), approvedAt: '2026-11-24T10:00:00.000Z', approvedBy: 'boss', approvedByName: 'سارة' })
    assert.deepEqual(versions.map((version) => version.number), [1, 2])
    assert.equal(latestVersion(versions).number, 2)
    assert.equal(getVersion(versions, 1).approvedAt, NOW)
    source.pages[0].elements[0].content.text = 'تغيّر'
    assert.equal(getVersion(versions, 1).snapshot.pages[0].elements[0].content.text, 'نص 1') // a copy was stored
  })

  test('the history lists newest first with metadata only, and a draft is a not-approved document with versions', () => {
    const versions = appendApprovedVersion(appendApprovedVersion([], { snapshot: snapshot(), approvedAt: NOW, approvedBy: 'a' }), { snapshot: snapshot([1]), approvedAt: NOW, approvedBy: 'b', approvedByName: 'سارة' })
    const summary = summarizeVersions(versions)
    assert.deepEqual(summary.map((entry) => entry.number), [2, 1])
    assert.equal(summary[0].isLatest, true)
    assert.ok(summary.every((entry) => !('snapshot' in entry)))
    assert.equal(summary[1].pageCount, 2)
    assert.equal(isNewVersionDraft('none', versions), true)
    assert.equal(isNewVersionDraft('approved', versions), false)
    assert.equal(isNewVersionDraft('none', []), false)
  })
})

describe('attempts and accepted results (decisions 11, 40)', () => {
  test('an attempt entry carries metadata only: content can never leak into the log', () => {
    const entry = sanitizeAttempt({ id: 'x', scope: 'page', pageNumber: 2, attempt: 1, trigger: 'reprocess', status: 'rejected', startedAt: NOW, elements: [textElement('سري')], content: 'سري', text: 'سري' })
    assert.deepEqual(Object.keys(entry).sort(), ['attempt', 'errorCode', 'finishedAt', 'id', 'pageNumber', 'scope', 'startedAt', 'status', 'trigger'])
    assert.ok(!JSON.stringify(entry).includes('سري'))
  })

  test('every attempt is kept with its date, status and failure reason; a decision updates the same entry', () => {
    let attempts = appendAttempt([], { id: 'a1', scope: 'page', pageNumber: 2, attempt: 1, trigger: 'upload', status: ATTEMPT_STATUS.failed, errorCode: 'MOCK_OCR_FAILED', startedAt: '2026-06-01T10:00:00.000Z' })
    attempts = appendAttempt(attempts, { id: 'a2', scope: 'page', pageNumber: 2, attempt: 2, trigger: 'reprocess', status: ATTEMPT_STATUS.awaitingDecision, startedAt: '2026-06-01T11:00:00.000Z' })
    attempts = updateAttempt(attempts, 'a2', { status: ATTEMPT_STATUS.rejected, finishedAt: '2026-06-01T11:05:00.000Z' })
    assert.equal(attempts.length, 2)
    assert.equal(attempts.find((entry) => entry.id === 'a2').status, 'rejected')
    assert.equal(attempts.find((entry) => entry.id === 'a1').errorCode, 'MOCK_OCR_FAILED')
    assert.deepEqual(sortAttempts(attempts).map((entry) => entry.id), ['a2', 'a1'])
    assert.equal(nextAttemptNumber(attempts, 2), 3)
    assert.equal(nextAttemptNumber(attempts, 5), 1)
  })

  test('document-level attempts count for every page', () => {
    const attempts = appendAttempt([], { id: 'd1', scope: 'document', attempt: 3, trigger: 'retry', status: 'succeeded', startedAt: NOW })
    assert.equal(nextAttemptNumber(attempts, 7), 4)
  })

  test('every accepted result is kept in full, the earlier ones too, and never twice', () => {
    let history = addAcceptedResult({}, 1, { attempt: 1, acceptedAt: NOW, elements: [textElement('الأول')] })
    history = addAcceptedResult(history, 1, { attempt: 2, acceptedAt: NOW, elements: [textElement('الثاني')] })
    history = addAcceptedResult(history, 1, { attempt: 2, acceptedAt: NOW, elements: [textElement('مكرر')] })
    assert.deepEqual(listAcceptedResults(history, 1).map((entry) => entry.elements[0].content.text), ['الأول', 'الثاني'])
    assert.deepEqual(listAcceptedResults(history, 9), [])
  })
})

describe('what an export contains (decisions 8, 46)', () => {
  const approved = (pages, selected) => ({ schemaVersion: '0.1', id: 'd', file: { name: 'تقرير.final.pdf', totalPages: 9 }, selectedPages: selected ?? pages.map((entry) => entry.pageNumber), pages })
  const reviewedPage = (n) => page(n, { status: 'succeeded', reviewed: true, elements: [{ ...textElement(`نص ${n}`), source: { kind: 'ai', details: { mock: true } } }] })

  test('only the selected and approved pages, in the ORIGINAL order, with their source page numbers', () => {
    const dataset = buildExportDataset(approved([reviewedPage(8), reviewedPage(2), reviewedPage(5)]))
    assert.deepEqual(dataset.pages.map((entry) => entry.sourcePage), [2, 5, 8])
    assert.deepEqual(dataset.selectedPages, [2, 5, 8])
    assert.equal(dataset.pageCount, 3)
    assert.equal(dataset.file.totalPages, 9) // the original has 9 pages; unselected ones are simply absent
  })

  test('a page that is not reviewed, or was never selected, is not exported', () => {
    const unreviewed = page(3, { status: 'succeeded', elements: [textElement('لم تُراجع')] })
    const unselected = reviewedPage(7)
    const dataset = buildExportDataset(approved([reviewedPage(1), unreviewed, unselected], [1, 3]))
    assert.deepEqual(dataset.pages.map((entry) => entry.sourcePage), [1])
    assert.equal(isExportablePage(unreviewed, [1, 3]), false)
    assert.equal(isExportablePage(unselected, [1, 3]), false)
  })

  test('the internal source (AI / manual) is not part of the export (decision 49), the content and coordinates are', () => {
    const located = { ...reviewedPage(1), elements: [{ ...textElement('نص'), location: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } }] }
    const dataset = buildExportDataset(approved([located]))
    const element = dataset.pages[0].elements[0]
    assert.deepEqual(Object.keys(element).sort(), ['content', 'location', 'order', 'type'])
    assert.deepEqual(element.location, { x: 0.1, y: 0.1, width: 0.5, height: 0.1 })
    const json = buildJsonExport(dataset, { version: 2 })
    assert.equal(JSON.parse(json).version, 2)
    assert.ok(!json.includes('"source"'))
  })

  test('the four formats, and file names that keep the document name with the right extension', () => {
    assert.deepEqual([...EXPORT_FORMAT_LIST].sort(), ['docx', 'json', 'pdf', 'xlsx'])
    assert.equal(buildExportFileName('تقرير.final.pdf', 'docx'), 'تقرير.final.docx')
    assert.equal(buildExportFileName('a/b:c*.pdf', 'json'), 'a_b_c_.json')
    assert.equal(buildExportFileName('', 'pdf'), 'document.pdf')
  })
})

describe('optional coordinates (decision 50)', () => {
  test('an element has coordinates only when the model gave them', () => {
    const ids = createSequentialIdGenerator()
    assert.equal(hasLocation(paragraph(ids)), false)
    assert.equal(hasLocation(createElement('paragraph', { content: { text: 'ا' }, location: { x: 0, y: 0, width: 1, height: 1 } }, { generateId: ids })), true)
  })

  test('the marked area follows the display rotation of the page', () => {
    const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }
    assert.deepEqual(rotateLocation(box, 0), box)
    const close = (a, b) => Object.keys(a).every((key) => Math.abs(a[key] - b[key]) < 1e-9)
    assert.ok(close(rotateLocation(box, 90), { x: 0.7, y: 0.1, width: 0.1, height: 0.3 }))
    assert.ok(close(rotateLocation(box, 180), { x: 0.6, y: 0.7, width: 0.3, height: 0.1 }))
    assert.ok(close(rotateLocation(box, 270), { x: 0.2, y: 0.6, width: 0.1, height: 0.3 }))
    // four quarter turns come back
    let turned = box
    for (let i = 0; i < 4; i += 1) turned = rotateLocation(turned, 90)
    assert.ok(close(turned, box))
    assert.deepEqual(toPercentStyle(box), { left: '10%', top: '20%', width: '30%', height: '10%' })
  })
})

describe("the Admin's upload limits (decisions 36, 48)", () => {
  const limits = { maxFileSizeMb: 5, maxSelectedPages: 20 }

  test('the file size and the selected page count are checked against the limits the Admin set', () => {
    assert.equal(checkFileSize(mbToBytes(5), limits), null)
    assert.deepEqual(checkFileSize(mbToBytes(5) + 1, limits), { code: LIMIT_ERROR.fileTooLarge, max: 5 })
    assert.equal(checkSelectedPageCount(20, limits), null)
    assert.deepEqual(checkSelectedPageCount(21, limits), { code: LIMIT_ERROR.tooManyPages, max: 20, selected: 21 })
  })

  test('the page limit counts the SELECTED pages, independent of the file size', () => {
    assert.equal(checkFileSize(1024, { maxFileSizeMb: 1, maxSelectedPages: 1 }), null)
    assert.ok(checkSelectedPageCount(2, { maxFileSizeMb: 1000, maxSelectedPages: 1 }))
  })

  test('without limits nothing is guessed: no check is made (the screen waits for them)', () => {
    assert.equal(checkFileSize(10 ** 9, null), null)
    assert.equal(checkSelectedPageCount(10 ** 6, undefined), null)
    const file = new File([new Uint8Array(2048)], 'a.pdf', { type: 'application/pdf' })
    assert.equal(validateDocumentFile(file).valid, true) // no built-in size limit any more
    assert.equal(validateDocumentFile(file, 1024).error, 'tooLarge')
    assert.equal(validateDocumentFile(file, 4096).valid, true)
  })
})

describe('archive search and filters (decision 9)', () => {
  const items = [
    { id: '1', name: 'فاتورة المورد', documentType: 'invoice', state: 'approved', approvalStatus: 'approved', createdAt: '2026-05-01T10:00:00.000Z' },
    { id: '2', name: 'عقد الإيجار', documentType: 'contract', state: 'readyForReview', approvalStatus: 'none', createdAt: '2026-05-10T10:00:00.000Z' },
    { id: '3', name: 'scan-007.pdf', documentType: null, state: 'failed', approvalStatus: 'none', createdAt: '2026-05-20T10:00:00.000Z' },
    { id: '4', name: 'Invoice June.pdf', documentType: 'invoice', state: 'processing', approvalStatus: 'none', createdAt: '2026-06-02T10:00:00.000Z' },
  ]
  const ids = (list) => list.map((item) => item.id)

  test('no filter lists everything, newest first', () => {
    assert.deepEqual(ids(filterDocuments(items, EMPTY_FILTERS)), ['4', '3', '2', '1'])
    assert.equal(hasActiveFilters(EMPTY_FILTERS), false)
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, query: 'x' }), true)
  })

  test('searches the name, in Arabic and Latin, ignoring case', () => {
    assert.deepEqual(ids(filterDocuments(items, { ...EMPTY_FILTERS, query: 'فاتورة' })), ['1'])
    assert.deepEqual(ids(filterDocuments(items, { ...EMPTY_FILTERS, query: 'INVOICE' })), ['4'])
    assert.deepEqual(ids(filterDocuments(items, { ...EMPTY_FILTERS, query: 'لا شيء' })), [])
  })

  test('filters by type (including "unclassified"), status and the upload date range (inclusive)', () => {
    assert.deepEqual(ids(filterDocuments(items, { ...EMPTY_FILTERS, type: 'invoice' })), ['4', '1'])
    assert.deepEqual(ids(filterDocuments(items, { ...EMPTY_FILTERS, type: UNCLASSIFIED })), ['3'])
    assert.deepEqual(ids(filterDocuments(items, { ...EMPTY_FILTERS, state: 'failed' })), ['3'])
    assert.deepEqual(ids(filterDocuments(items, { ...EMPTY_FILTERS, from: '2026-05-10', to: '2026-05-20' })), ['3', '2'])
    assert.deepEqual(ids(filterDocuments(items, { query: 'invoice', type: 'invoice', state: 'processing', from: '2026-06-01', to: '' })), ['4'])
  })

  test('offers the types that exist, with "unclassified" when something has none', () => {
    assert.deepEqual(availableTypes(items), ['contract', 'invoice', UNCLASSIFIED])
    assert.deepEqual(availableTypes(items.filter((item) => item.documentType)), ['contract', 'invoice'])
  })
})
