import { useState } from 'react'
import { Alert } from '../components/common/Alert.jsx'
import { MoveToBinDialog } from '../components/documents/MoveToBinDialog.jsx'
import { USER_ROLES } from '../constants/roles.js'
import { recycleBinService } from '../services/recycleBinService.js'
import { useCurrentUser } from './useCurrentUser.js'
import { useTranslation } from './useTranslation.js'

// "Move to the recycle bin" for a document list (queue, archive, dashboard). Only the Admin may
// delete documents (decision 42), so for an employee `onDelete` is undefined and the lists show no
// delete button. Render `feedback` and `dialog` somewhere in the page.
//
// `service` can be replaced (tests).
export function useDocumentDeletion({ service = recycleBinService } = {}) {
  const { t } = useTranslation()
  const { role } = useCurrentUser()
  const [target, setTarget] = useState(null)
  const [moved, setMoved] = useState(null)

  if (role !== USER_ROLES.orgAdmin) return { onDelete: undefined, dialog: null, feedback: null }

  return {
    onDelete: (item) => {
      setMoved(null)
      setTarget(item)
    },
    dialog: target && (
      <MoveToBinDialog
        item={target}
        service={service}
        onCancel={() => setTarget(null)}
        onDone={(result) => {
          setMoved({ name: target.name, cancelledProcessing: result.cancelledProcessing })
          setTarget(null)
        }}
      />
    ),
    feedback: moved && (
      <Alert tone="success" onDismiss={() => setMoved(null)}>
        {t(moved.cancelledProcessing ? 'recycleBin.moved.cancelledProcessing' : 'recycleBin.moved.done', { name: moved.name })}
      </Alert>
    ),
  }
}
