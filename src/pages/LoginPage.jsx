import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { AuthFailed, AuthLoading } from '../components/auth/AuthStatusScreen.jsx'
import { Alert } from '../components/common/Alert.jsx'
import { BrandLogo } from '../components/layout/BrandLogo.jsx'
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher.jsx'
import { AUTH_ERROR } from '../services/authErrors.js'
import { SESSION_EXPIRED } from '../state/auth/authStore.js'
import { useAuth } from '../hooks/useAuth.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { getPostLoginPath } from '../routes/routeAccess.js'

// Sign-in page. Signing in only starts a session; what each role may do is decided by the
// route guards (UI) and, for real, by the backend. The identifier is deliberately generic
// ("username"): whether the backend uses a username or an email is still to be agreed.
export default function LoginPage() {
  const { t } = useTranslation()
  const { status, error, isSubmitting, login, clearError, devAccounts, devReset } = useAuth()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const passwordRef = useRef(null)

  useEffect(() => {
    document.title = `${t('auth.login.title')} | ${t('app.name')}`
  }, [t])

  if (status === 'authenticated') {
    const target = getPostLoginPath(location.state?.from, {
      fallback: ROUTES.dashboard,
      loginPath: ROUTES.login,
      logoutPath: ROUTES.logout,
    })
    return <Navigate to={target} replace />
  }
  if (status === 'initializing') return <AuthLoading />
  if (status === 'failed') return <AuthFailed />

  const missing = error === AUTH_ERROR.missingFields

  async function handleSubmit(event) {
    event.preventDefault()
    const signedIn = await login({ identifier, password })
    if (!signedIn) {
      // A wrong password is retyped; the account name stays.
      setPassword('')
      passwordRef.current?.focus()
    }
  }

  function fill(account) {
    clearError()
    setIdentifier(account.identifier)
    setPassword(account.password)
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__language">
        <LanguageSwitcher />
      </div>
      <section className="card auth-card" aria-labelledby="login-title">
        <div className="auth-card__brand">
          <BrandLogo />
        </div>
        <div className="auth-card__body">
          <h1 id="login-title" className="auth-card__title">
            {t('auth.login.title')}
          </h1>
          <p className="auth-card__subtitle">{t('auth.login.subtitle')}</p>

          {error && (
            <Alert tone={error === SESSION_EXPIRED ? 'warning' : 'error'}>{t(`auth.errors.${error}`)}</Alert>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="form-field">
              <label className="form-field__label" htmlFor="login-identifier">
                {t('auth.login.identifier')}
              </label>
              <input
                id="login-identifier"
                className="form-field__input"
                type="text"
                name="identifier"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                dir="ltr"
                value={identifier}
                aria-invalid={missing && identifier.trim() === ''}
                disabled={isSubmitting}
                onChange={(event) => {
                  setIdentifier(event.target.value)
                  clearError()
                }}
              />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="login-password">
                {t('auth.login.password')}
              </label>
              <input
                id="login-password"
                ref={passwordRef}
                className="form-field__input"
                type="password"
                name="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                aria-invalid={missing && password === ''}
                disabled={isSubmitting}
                onChange={(event) => {
                  setPassword(event.target.value)
                  clearError()
                }}
              />
            </div>
            <button type="submit" className="button button--primary auth-form__submit" disabled={isSubmitting}>
              {isSubmitting && <span className="spinner" aria-hidden="true" />}
              {t(isSubmitting ? 'auth.login.submitting' : 'auth.login.submit')}
            </button>
          </form>

          {devAccounts?.length > 0 && (
            <div className="auth-dev">
              <p className="auth-dev__title">
                <span className="badge badge--demo">{t('auth.dev.badge')}</span>
                {t('auth.dev.title')}
              </p>
              <p className="auth-dev__note">{t('auth.dev.note')}</p>
              <div className="auth-dev__actions">
                {devAccounts.map((account) => (
                  <button
                    key={account.identifier}
                    type="button"
                    className="button button--secondary button--sm"
                    disabled={isSubmitting}
                    onClick={() => fill(account)}
                  >
                    {t('auth.dev.fillAs', { role: t(`roles.${account.role}`) })}
                  </button>
                ))}
                {devReset && (
                  <button type="button" className="button button--secondary button--sm" disabled={isSubmitting} onClick={() => devReset().then(clearError)}>
                    {t('auth.dev.reset')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
