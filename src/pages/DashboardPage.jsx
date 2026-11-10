import { Link } from 'react-router'
import { DemoBadge } from '../components/common/DemoBadge.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { StatCard } from '../components/common/StatCard.jsx'
import { DEMO_DASHBOARD_STATS } from '../data/mock/dashboardStats.mock.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'

const summaryCards = [
  { id: 'total', labelKey: 'dashboard.stats.total', statKey: 'totalDocuments', icon: 'fileText', tone: 'navy' },
  { id: 'completed', labelKey: 'dashboard.stats.completed', statKey: 'completedDocuments', icon: 'checkCircle', tone: 'teal' },
  { id: 'correction', labelKey: 'dashboard.stats.needsCorrection', statKey: 'needsCorrection', icon: 'fileWarning', tone: 'warning' },
  { id: 'awaiting', labelKey: 'dashboard.stats.awaitingProcessing', statKey: 'awaitingProcessing', icon: 'clock', tone: 'info' },
]

export default function DashboardPage() {
  const { t, formatNumber } = useTranslation()
  // Demo data only; see src/data/mock/.
  const stats = DEMO_DASHBOARD_STATS

  return (
    <div className="page">
      <section className="card welcome-card">
        <div className="welcome-card__text">
          <p className="welcome-card__eyebrow">{t('app.tagline')}</p>
          <h2 className="welcome-card__title">
            {t('dashboard.welcomeTitle', { name: t('demoUser.name') })}
          </h2>
          <p className="welcome-card__subtitle">{t('dashboard.welcomeSubtitle')}</p>
        </div>
        <Link to={ROUTES.upload} className="button button--primary">
          <Icon name="upload" />
          {t('dashboard.uploadCta')}
        </Link>
      </section>

      <section aria-labelledby="overview-heading">
        <div className="section-heading">
          <h2 id="overview-heading">{t('dashboard.overview')}</h2>
          {stats.isDemo && <DemoBadge />}
        </div>
        <div className="stats-grid">
          {summaryCards.map((card) => (
            <StatCard
              key={card.id}
              label={t(card.labelKey)}
              value={formatNumber(stats[card.statKey])}
              icon={card.icon}
              tone={card.tone}
            />
          ))}
        </div>
        {stats.isDemo && (
          <p className="demo-note">
            <Icon name="info" size={18} />
            {t('dashboard.demoNote')}
          </p>
        )}
      </section>
    </div>
  )
}
