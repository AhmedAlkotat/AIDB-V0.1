import { useEffect, useState, useSyncExternalStore } from 'react'
import { createManualSaveConfirmation, MANUAL_SAVE } from '../components/review/manualSave.js'

// Runs the explicit "Save draft" and tells whether to show its confirmation (see components/review/manualSave.js):
//   { run, dismiss, isSaving, isConfirmed }
// `save` is the review session's saveDraft (resolves { ok }). The controller is created once per mounted indicator and is
// handed the newest `save` after every render; leaving the screen cancels what is pending (it stays usable, so React's
// development double-mount is harmless).
export function useManualSaveConfirmation(save) {
  const [controller] = useState(() => createManualSaveConfirmation({ save }))
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  useEffect(() => {
    controller.setSave(save)
  })
  useEffect(() => () => controller.cancel(), [controller])
  return { run: controller.run, dismiss: controller.dismiss, isSaving: state.status === MANUAL_SAVE.saving, isConfirmed: state.status === MANUAL_SAVE.confirmed }
}
