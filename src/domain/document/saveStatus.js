// Save states shown to the user. They describe what the configured storage has
// ACKNOWLEDGED, never what has merely been requested:
//   saved    the storage confirmed the latest changes
//   unsaved  changes exist that were not handed to the storage yet
//   saving   a save is in progress (not confirmed yet)
//   failed   the storage rejected the last save; the changes are NOT saved
export const SAVE_STATUS = Object.freeze({
  saved: 'saved',
  unsaved: 'unsaved',
  saving: 'saving',
  failed: 'failed',
})
