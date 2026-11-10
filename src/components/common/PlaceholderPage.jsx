import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from './Icon.jsx'

// Styled placeholder for pages whose functionality comes in a later phase.
export function PlaceholderPage({ icon, titleKey, descriptionKey, showStatus = true, children }) {
  const { t } = useTranslation()

  return (
    <div className="page">
      <section className="card placeholder-card" aria-labelledby="placeholder-title">
        <span className="placeholder-card__icon">
          <Icon name={icon} size={30} />
        </span>
        {showStatus && <span className="badge badge--neutral">{t('common.underDevelopment')}</span>}
        <h2 id="placeholder-title" className="placeholder-card__title">
          {t(titleKey)}
        </h2>
        <p className="placeholder-card__description">{t(descriptionKey)}</p>
        {showStatus && <p className="placeholder-card__hint">{t('pages.placeholderHint')}</p>}
        {children}
      </section>
    </div>
  )
}
