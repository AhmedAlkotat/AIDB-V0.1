// Editor state for the document review workflow (Task 2 / Phase 1).
// A plain reducer: framework-independent and testable without React.
//
// State:
//   document         the canonical document (corrected working content +
//                    preserved original extraction per page)
//   histories        { [pageNumber]: { undo: [{ elements }], redo: [...] } }
//                    independent per page, at most MAX_UNDO_OPERATIONS undo
//                    entries each. Entries are cheap snapshots (immutable
//                    updates share unchanged parts).
//   lastVisitedPage  the active page (undo/redo apply to it by default)
//   lastError        null, or { code, message, details } of the last rejected
//                    action (the state is otherwise unchanged)
//
// Boundaries:
// - Undo/redo only cover ordinary content edits (ELEMENT_EDIT_ACTIONS).
// - Page review confirmation, applying an AI extraction and (later) document
//   approval are NOT undoable and never enter the history.
// - Any change to a page's corrected content (including undo/redo) invalidates
//   that page's review confirmation; nothing else does.
// - Actions that change nothing return the SAME state object.
// Action payloads that create IDs use `generateId` (inject one for tests).

import { changeElementType } from '../../domain/document/conversion.js'
import { findIdConflict, replacePage, requirePage } from '../../domain/document/document.js'
import { normalizeOrder } from '../../domain/document/elements.js'
import {
  addTableColumn,
  addTableRow,
  editElement,
  insertElement,
  moveElement,
  removeElement,
  removeTableColumn,
  removeTableRow,
  setTableCell,
} from '../../domain/document/elementOperations.js'
import { DocumentOperationError, ERROR_CODE, fail } from '../../domain/document/errors.js'
import { generateId as defaultGenerateId } from '../../domain/document/ids.js'
import { confirmedReview, getReviewConfirmationBlocker, invalidateReview } from '../../domain/document/review.js'
import { MAX_UNDO_OPERATIONS, PROCESSING_STATUS, PROCESSING_STATUS_LIST } from '../../domain/document/schema.js'
import { deepClone, deepEqual, deepFreeze, isPlainObject } from '../../domain/document/utils.js'
import { validateDocument } from '../../domain/document/validation.js'

export const ACTION = Object.freeze({
  // Navigation (no content change)
  pageSelected: 'pageSelected',
  // Undoable content edits
  elementAdded: 'elementAdded',
  elementEdited: 'elementEdited',
  elementRemoved: 'elementRemoved',
  elementMoved: 'elementMoved',
  elementTypeChanged: 'elementTypeChanged',
  tableCellEdited: 'tableCellEdited',
  tableRowAdded: 'tableRowAdded',
  tableRowRemoved: 'tableRowRemoved',
  tableColumnAdded: 'tableColumnAdded',
  tableColumnRemoved: 'tableColumnRemoved',
  // History
  undone: 'undone',
  redone: 'redone',
  // Not undoable
  pageReviewConfirmed: 'pageReviewConfirmed',
  extractionApplied: 'extractionApplied',
  pageProcessingStatusSet: 'pageProcessingStatusSet',
  errorDismissed: 'errorDismissed',
})

const EMPTY_HISTORY = Object.freeze({ undo: [], redo: [] })

export function createInitialEditorState(document) {
  const result = validateDocument(document)
  if (!result.valid) fail(ERROR_CODE.invalidDocument, 'Cannot edit an invalid document.', { errors: result.errors })
  return { document, histories: {}, lastVisitedPage: document.selectedPages[0], lastError: null }
}

// Same state, minus a previous error (identity kept when there was none).
function cleared(state) {
  return state.lastError === null ? state : { ...state, lastError: null }
}

// Rejects edits (and undo/redo steps) that would give two things the same ID
// anywhere in the document. The state is left untouched by the caller.
function assertNoIdConflict(document, pageNumber, previousElements, nextElements) {
  const id = findIdConflict(document, pageNumber, previousElements, nextElements)
  if (id !== null) {
    fail(ERROR_CODE.duplicateId, `ID "${id}" is already used elsewhere in the document.`, { id, pageNumber })
  }
}

// Applies a content edit to one page: records history (clearing redo),
// invalidates the page's review and leaves every other page untouched.
// `produce(elements)` returns the new elements, or the same array for "no change".
function editContent(state, pageNumber, produce) {
  const page = requirePage(state.document, pageNumber)
  const elements = produce(page.elements)
  if (elements === page.elements) return cleared(state)
  assertNoIdConflict(state.document, pageNumber, page.elements, elements)

  const history = state.histories[pageNumber] ?? EMPTY_HISTORY
  return {
    ...state,
    document: replacePage(state.document, pageNumber, { ...page, elements, review: invalidateReview(page.review) }),
    histories: {
      ...state.histories,
      [pageNumber]: { undo: [...history.undo, { elements: page.elements }].slice(-MAX_UNDO_OPERATIONS), redo: [] },
    },
    lastError: null,
  }
}

// Moves one history entry between the undo and redo stacks and restores that
// content. Not itself recorded as an undoable operation.
function stepHistory(state, pageNumber, direction) {
  const target = pageNumber ?? state.lastVisitedPage
  const page = requirePage(state.document, target)
  const history = state.histories[target] ?? EMPTY_HISTORY
  const isUndo = direction === 'undo'
  const source = isUndo ? history.undo : history.redo
  if (source.length === 0) return cleared(state)

  const entry = source[source.length - 1]
  // Restoring old content must not bring back an ID another page uses now.
  assertNoIdConflict(state.document, target, page.elements, entry.elements)
  const remaining = source.slice(0, -1)
  const other = [...(isUndo ? history.redo : history.undo), { elements: page.elements }]
  const nextHistory = isUndo
    ? { undo: remaining, redo: other }
    : { undo: other.slice(-MAX_UNDO_OPERATIONS), redo: remaining }

  return {
    ...state,
    document: replacePage(state.document, target, {
      ...page,
      elements: entry.elements,
      // Content changed, so a confirmation never survives (or returns through) undo/redo.
      review: invalidateReview(page.review),
    }),
    histories: { ...state.histories, [target]: nextHistory },
    lastError: null,
  }
}

function applyExtraction(state, { pageNumber, elements }) {
  const page = requirePage(state.document, pageNumber)
  if (!Array.isArray(elements) || !elements.every(isPlainObject)) {
    fail(ERROR_CODE.invalidElement, 'An extraction must be an array of canonical elements.')
  }
  const working = normalizeOrder(deepClone(elements))
  const contentChanged = !deepEqual(page.elements, working)
  const candidate = replacePage(state.document, pageNumber, {
    ...page,
    // The preserved AI output is a frozen copy: editing the working copy can never reach it.
    originalExtraction: { elements: deepFreeze(deepClone(working)) },
    elements: working,
    processing: { status: PROCESSING_STATUS.succeeded, errorCode: null },
    review: contentChanged ? invalidateReview(page.review) : page.review,
  })
  const result = validateDocument(candidate)
  if (!result.valid) fail(ERROR_CODE.invalidDocument, 'The extraction is not valid.', { errors: result.errors })

  return {
    ...state,
    document: candidate,
    // A new AI result is a boundary: earlier edits cannot be undone across it.
    histories: { ...state.histories, [pageNumber]: EMPTY_HISTORY },
    lastError: null,
  }
}

function confirmReview(state, { pageNumber, at }) {
  const page = requirePage(state.document, pageNumber)
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
    fail(ERROR_CODE.invalidArgument, 'A review confirmation needs a valid timestamp ("at").', { at })
  }
  if (page.review.status === 'reviewed') return cleared(state)
  const blocker = getReviewConfirmationBlocker(page)
  if (blocker !== null) {
    fail(ERROR_CODE.reviewNotAllowed, `Page ${pageNumber} cannot be confirmed yet (${blocker}).`, {
      pageNumber,
      reason: blocker,
    })
  }
  return {
    ...state,
    document: replacePage(state.document, pageNumber, { ...page, review: confirmedReview(at) }),
    lastError: null,
  }
}

function setProcessingStatus(state, { pageNumber, status, errorCode = null }) {
  const page = requirePage(state.document, pageNumber)
  if (!PROCESSING_STATUS_LIST.includes(status)) {
    fail(ERROR_CODE.invalidArgument, `Unknown processing status "${status}".`, { status })
  }
  if (errorCode !== null && (typeof errorCode !== 'string' || errorCode.trim() === '')) {
    fail(ERROR_CODE.invalidArgument, 'errorCode must be null or a non-empty string.', { errorCode })
  }
  if (page.processing.status === status && page.processing.errorCode === errorCode) return cleared(state)
  return {
    ...state,
    document: replacePage(state.document, pageNumber, { ...page, processing: { status, errorCode } }),
    lastError: null,
  }
}

// Creates the reducer. `generateId` is used for new table rows/cells created
// by table operations and type conversions.
export function createEditorReducer({ generateId = defaultGenerateId } = {}) {
  function reduce(state, action) {
    const { pageNumber } = action
    switch (action.type) {
      case ACTION.pageSelected:
        requirePage(state.document, pageNumber)
        return state.lastVisitedPage === pageNumber
          ? cleared(state)
          : { ...state, lastVisitedPage: pageNumber, lastError: null }

      case ACTION.elementAdded:
        return editContent(state, pageNumber, (elements) => insertElement(elements, action.element, action.index))
      case ACTION.elementEdited:
        return editContent(state, pageNumber, (elements) => editElement(elements, action.elementId, action.patch))
      case ACTION.elementRemoved:
        return editContent(state, pageNumber, (elements) => removeElement(elements, action.elementId))
      case ACTION.elementMoved:
        return editContent(state, pageNumber, (elements) => moveElement(elements, action.elementId, action.toIndex))
      case ACTION.elementTypeChanged:
        return editContent(state, pageNumber, (elements) =>
          changeElementType(elements, action.elementId, action.targetType, { confirmed: action.confirmed === true, generateId }),
        )
      case ACTION.tableCellEdited:
        return editContent(state, pageNumber, (elements) =>
          setTableCell(elements, action.elementId, { row: action.row, column: action.column, text: action.text }),
        )
      case ACTION.tableRowAdded:
        return editContent(state, pageNumber, (elements) =>
          addTableRow(elements, action.elementId, { index: action.index }, { generateId }),
        )
      case ACTION.tableRowRemoved:
        return editContent(state, pageNumber, (elements) => removeTableRow(elements, action.elementId, { index: action.index }))
      case ACTION.tableColumnAdded:
        return editContent(state, pageNumber, (elements) =>
          addTableColumn(elements, action.elementId, { index: action.index }, { generateId }),
        )
      case ACTION.tableColumnRemoved:
        return editContent(state, pageNumber, (elements) => removeTableColumn(elements, action.elementId, { index: action.index }))

      case ACTION.undone:
        return stepHistory(state, pageNumber, 'undo')
      case ACTION.redone:
        return stepHistory(state, pageNumber, 'redo')

      case ACTION.pageReviewConfirmed:
        return confirmReview(state, action)
      case ACTION.extractionApplied:
        return applyExtraction(state, action)
      case ACTION.pageProcessingStatusSet:
        return setProcessingStatus(state, action)
      case ACTION.errorDismissed:
        return cleared(state)

      default:
        return fail(ERROR_CODE.unknownAction, `Unknown action "${action.type}".`, { type: action.type })
    }
  }

  // Rejected actions leave the state unchanged and record `lastError`.
  return function editorReducer(state, action) {
    try {
      if (!isPlainObject(action) || typeof action.type !== 'string') {
        let received = typeof action
        if (action === null) received = 'null'
        else if (Array.isArray(action)) received = 'array'
        fail(ERROR_CODE.invalidArgument, 'An action must be an object with a string "type".', { received })
      }
      return reduce(state, action)
    } catch (error) {
      if (error instanceof DocumentOperationError) return { ...state, lastError: error.toPlain() }
      throw error
    }
  }
}
