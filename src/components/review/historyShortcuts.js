// Page-level Undo / Redo keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Y,
// Ctrl/Cmd+Shift+Z). Framework-independent so the rules can be tested.
//
// Rules:
// - inside a text input the browser's own undo keeps working (never handled here);
// - while ANY modal dialog is open the page behind it must not change, so the
//   shortcuts do nothing there either (confirmation dialogs, the "replace content"
//   dialog, the "leave page" dialog).

export function isTypingTarget(target) {
  return (
    Boolean(target) &&
    typeof target === 'object' &&
    (target.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

// True while a <dialog> is open (the app only opens its dialogs with showModal()).
export function isModalDialogOpen(root = globalThis.document) {
  return Boolean(root?.querySelector?.('dialog[open]'))
}

// Returns 'undo', 'redo' or null (not a history shortcut, or it must be ignored).
export function getHistoryShortcut(event, { modalOpen = false } = {}) {
  if (modalOpen) return null
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isTypingTarget(event.target)) return null
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
  if (key === 'z' && !event.shiftKey) return 'undo'
  if (key === 'y' || (key === 'z' && event.shiftKey)) return 'redo'
  return null
}
