// Read-only helpers over the editor state.

import { findPage } from '../../domain/document/document.js'
import { getReviewProgress } from '../../domain/document/review.js'

export function selectPage(state, pageNumber = state.lastVisitedPage) {
  return findPage(state.document, pageNumber)
}

export function selectUndoDepth(state, pageNumber = state.lastVisitedPage) {
  return state.histories[pageNumber]?.undo.length ?? 0
}

export function selectRedoDepth(state, pageNumber = state.lastVisitedPage) {
  return state.histories[pageNumber]?.redo.length ?? 0
}

export const canUndo = (state, pageNumber) => selectUndoDepth(state, pageNumber) > 0
export const canRedo = (state, pageNumber) => selectRedoDepth(state, pageNumber) > 0

export function selectReviewProgress(state) {
  return getReviewProgress(state.document)
}
