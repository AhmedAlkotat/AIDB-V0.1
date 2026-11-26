import { useState } from 'react'
import { Alert } from '../components/common/Alert.jsx'
import { workflowErrorMessage } from '../components/common/workflowErrorMessage.js'
import { documentWorkflowService } from '../services/documentWorkflowService.js'
import { useTranslation } from './useTranslation.js'

// "Retry processing" for a document list (decision 11): the stored original is processed again, WITHOUT a
// new upload. The document goes back to Pending and the queue picks it up in FIFO order. Render `feedback`
// somewhere in the page. `service` can be replaced (tests).
export function useDocumentRetry({ service = documentWorkflowService } = {}) {
  const { t } = useTranslation()
  const [busyId, setBusyId] = useState(null)
  const [result, setResult] = useState(null) // { ok, name, code }

  async function onRetry(item) {
    setResult(null)
    setBusyId(item.id)
    try {
      await service.retryDocument(item.id)
      setResult({ ok: true, name: item.name })
    } catch (error) {
      setResult({ ok: false, name: item.name, code: error?.code })
    } finally {
      setBusyId(null)
    }
  }

  return {
    busyId,
    onRetry,
    feedback: result && (
      <Alert tone={result.ok ? 'success' : 'error'} onDismiss={() => setResult(null)}>
        {result.ok ? t('documents.retry.done', { name: result.name }) : workflowErrorMessage(t, result.code)}
      </Alert>
    ),
  }
}
