import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { PageIntro } from '../components/common/PageIntro.jsx'
import { ResourceState } from '../components/common/ResourceState.jsx'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { languages } from '../contexts/languageContext.js'
import { USER_ROLES } from '../constants/roles.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { useResource } from '../hooks/useResource.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { settingsService } from '../services/settingsService.js'

// Settings for EVERY signed-in user: personal preferences and read-only information. Nothing
// here changes the system. The Admin-only system settings are on their own page
// (/admin/settings, behind RequireRole); an Admin gets a link to it from here.
//
// - Interface language: the existing AR/EN switch.
// - Account: the name and role. An employee cannot change their own password (decision 19):
//   the Admin does it.
// - Current limits (read-only): the file size and page limits the Admin has set (decisions 36, 48).
//
// `service` can be replaced (tests).
export default function SettingsPage({ service = settingsService }) {
  const { t, formatNumber } = useTranslation()
  const { language, setLanguage } = useLanguage()
  const user = useCurrentUser()
  const limits = useResource(() => service.getLimits())
  const isAdmin = user.role === USER_ROLES.orgAdmin

  return (
    <div className="page">
      <PageIntro id="preferences-title" icon="settings" title={t('nav.settings')} description={t('preferences.description')} />

      <section className="card info-card" aria-labelledby="language-heading">
        <h2 id="language-heading">{t('preferences.language.title')}</h2>
        <p className="settings-section__description">{t('preferences.language.description')}</p>
        <div className="page-selection__modes" role="radiogroup" aria-labelledby="language-heading">
          {Object.entries(languages).map(([code, info]) => (
            <label key={code} className="page-selection__option">
              <input type="radio" name="interface-language" checked={language === code} onChange={() => setLanguage(code)} />
              <span lang={code}>{info.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card info-card" aria-labelledby="account-heading">
        <h2 id="account-heading">{t('preferences.account.title')}</h2>
        <dl className="info-list">
          <div>
            <dt>{t('preferences.account.name')}</dt>
            <dd dir="auto">{user.displayName}</dd>
          </div>
          <div>
            <dt>{t('preferences.account.role')}</dt>
            <dd>{t(`roles.${user.role}`)}</dd>
          </div>
        </dl>
        {!isAdmin && <p className="settings-section__description">{t('preferences.account.passwordNote')}</p>}
      </section>

      <section className="card info-card" aria-labelledby="limits-heading">
        <h2 id="limits-heading">{t('preferences.limits.title')}</h2>
        <p className="settings-section__description">{t('preferences.limits.description')}</p>
        {service.isMock && <SimulationNotice textKey="preferences.limits.simulation" />}
        <ResourceState resource={limits}>
          {limits.data && (
            <dl className="info-list">
              <div>
                <dt>{t('preferences.limits.maxFileSize')}</dt>
                <dd>{t('preferences.limits.megabytes', { value: formatNumber(limits.data.maxFileSizeMb) })}</dd>
              </div>
              <div>
                <dt>{t('preferences.limits.maxPages')}</dt>
                <dd>{formatNumber(limits.data.maxSelectedPages)}</dd>
              </div>
            </dl>
          )}
        </ResourceState>
        <Alert tone="info">{t('preferences.limits.note')}</Alert>
      </section>

      {isAdmin && (
        <section className="card info-card" aria-labelledby="system-heading">
          <h2 id="system-heading">{t('preferences.system.title')}</h2>
          <p className="settings-section__description">{t('preferences.system.text')}</p>
          <p>
            <Link to={ROUTES.adminSettings} className="button button--secondary">
              <Icon name="settings" size={18} />
              {t('nav.adminSettings')}
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
