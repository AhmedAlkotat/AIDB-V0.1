import { useTranslation } from '../../hooks/useTranslation.js'
import { ConfirmActionDialog } from '../common/ConfirmActionDialog.jsx'
import { systemErrorMessage } from '../common/systemErrorMessage.js'

// Admin only (decision 42): asks for explicit confirmation before a document is moved to the
// recycle bin. The move is a soft delete: the original, results, drafts and versions are kept and
// the document only disappears from the normal lists (decision 43). A document that is being
// processed has its processing stopped safely first, and finished results are kept (decision 45).
export function MoveToBinDialog({ item, service, onCancel, onDone }) {
  const { t } = useTranslation()
  return (
    <ConfirmActionDialog
      title={t('recycleBin.move.title', { name: item.name })}
      confirmLabel={t('recycleBin.move.confirm')}
      onConfirm={async () => {
        try {
          return { ok: true, ...(await service.moveToBin(item.id)) }
        } catch (error) {
          return { ok: false, message: systemErrorMessage(t, error?.code) }
        }
      }}
      onCancel={onCancel}
      onDone={onDone}
    >
      <p>{t('recycleBin.move.text')}</p>
      {item.processingCount > 0 && <p className="confirm-warning">{t('recycleBin.move.processing')}</p>}
    </ConfirmActionDialog>
  )
}
