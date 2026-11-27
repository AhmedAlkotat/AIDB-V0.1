import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from '../common/Alert.jsx'

// Shown while the server rejected the session but the user still has UNSAVED WORK on screen (see
// state/auth/authStore.js): nothing is discarded; the same user signs in again in place and the save is retried.
// Another user's credentials are refused. "Sign out" is the user's own explicit choice to give the work up.
export function SessionExpiredBanner() {
  const { t } = useTranslation()
  const { sessionExpiring, error, isSubmitting, reauthenticate, logout } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  if (!sessionExpiring) return null

  async function handleSubmit(event) {
    event.preventDefault()
    const ok = await reauthenticate({ identifier, password })
    if (ok) setPassword('')
  }

  return (
    <div className="session-expired" role="alertdialog" aria-labelledby="session-expired-title">
      <Alert tone="warning" title={<span id="session-expired-title">{t('auth.reauth.title')}</span>}>
        <p>{t('auth.reauth.text')}</p>
        {error && error !== 'sessionExpired' && <p role="alert">{t(`auth.errors.${error}`)}</p>}
        <form className="session-expired__form" onSubmit={handleSubmit} noValidate>
          <input className="form-field__input" type="text" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" aria-label={t('auth.login.identifier')} placeholder={t('auth.login.identifier')} value={identifier} disabled={isSubmitting} onChange={(event) => setIdentifier(event.target.value)} />
          <input className="form-field__input" type="password" name="password" autoComplete="current-password" aria-label={t('auth.login.password')} placeholder={t('auth.login.password')} value={password} disabled={isSubmitting} onChange={(event) => setPassword(event.target.value)} />
          <button type="submit" className="button button--primary button--sm" disabled={isSubmitting}>
            {isSubmitting ? t('auth.reauth.submitting') : t('auth.reauth.submit')}
          </button>
          <button type="button" className="button button--secondary button--sm" disabled={isSubmitting} onClick={() => logout()}>
            {t('auth.reauth.signOut')}
          </button>
        </form>
      </Alert>
    </div>
  )
}
