import { Link } from 'react-router'
import { useTranslation } from '../../hooks/useTranslation.js'
import { ROUTES } from '../../routes/paths.js'
import { Icon } from '../common/Icon.jsx'

export function BrandLogo({ onNavigate }) {
  const { t } = useTranslation()

  return (
    <Link to={ROUTES.dashboard} className="brand" onClick={onNavigate}>
      <span className="brand__mark">
        <Icon name="fileText" size={22} />
      </span>
      <span className="brand__text">
        <span className="brand__name" lang="en" dir="ltr">
          {t('app.name')}
        </span>
        <span className="brand__tagline">{t('app.tagline')}</span>
      </span>
    </Link>
  )
}
