import { Link } from 'react-router'
import { PlaceholderPage } from '../components/common/PlaceholderPage.jsx'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <PlaceholderPage
      icon="search"
      titleKey="pages.notFound.title"
      descriptionKey="pages.notFound.description"
      showStatus={false}
    >
      <Link to={ROUTES.dashboard} className="button button--secondary">
        {t('common.backToDashboard')}
      </Link>
    </PlaceholderPage>
  )
}
