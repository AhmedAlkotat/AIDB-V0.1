import { useAuth } from '../../hooks/useAuth.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'

// Full-page states while the session is being checked, and when that check failed.
export function AuthLoading() {
  const { t } = useTranslation()
  return (
    <div className="auth-screen">
      <p className="auth-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        {t('auth.loading')}
      </p>
    </div>
  )
}

export function AuthFailed() {
  const { t } = useTranslation()
  const { retryInitialize } = useAuth()
  return (
    <div className="auth-screen">
      <section className="card auth-card auth-card--message">
        <Alert tone="error" title={t('auth.initFailed.title')}>
          {t('auth.initFailed.text')}
        </Alert>
        <button type="button" className="button button--primary" onClick={() => retryInitialize()}>
          {t('auth.initFailed.retry')}
        </button>
      </section>
    </div>
  )
}
