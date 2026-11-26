import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from './Alert.jsx'
import { Icon } from './Icon.jsx'

// Shows the loading state or the error (with a retry button) of a useResource result, and the
// children once the data is ready.
export function ResourceState({ resource, children }) {
  const { t } = useTranslation()

  if (resource.status === 'loading') {
    return (
      <p className="auth-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        {t('common.loading')}
      </p>
    )
  }
  if (resource.status === 'error') {
    return (
      <Alert tone="error" title={t('common.loadFailed')}>
        <p>{systemErrorMessage(t, resource.error)}</p>
        <p>
          <button type="button" className="button button--secondary button--sm" onClick={() => resource.reload()}>
            <Icon name="refresh" size={16} />
            {t('common.retry')}
          </button>
        </p>
      </Alert>
    )
  }
  return children
}
