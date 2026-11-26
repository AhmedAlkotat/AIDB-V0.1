import { Link } from 'react-router'
import { PlaceholderPage } from '../components/common/PlaceholderPage.jsx'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'

// 403: the user is signed in but their role may not open this page.
export default function ForbiddenPage() {
  const { t } = useTranslation()

  return (
    <PlaceholderPage icon="lock" titleKey="pages.forbidden.title" descriptionKey="pages.forbidden.description" showStatus={false}>
      <Link to={ROUTES.dashboard} className="button button--secondary">
        {t('common.backToDashboard')}
      </Link>
    </PlaceholderPage>
  )
}
