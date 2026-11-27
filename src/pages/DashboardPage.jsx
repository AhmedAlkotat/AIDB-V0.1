import { Link } from 'react-router'
import { DemoBadge } from '../components/common/DemoBadge.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { StatCard } from '../components/common/StatCard.jsx'
import { EmployeeSummary } from '../components/dashboard/EmployeeSummary.jsx'
import { DocumentListItem } from '../components/review/DocumentListItem.jsx'
import { USER_ROLES } from '../constants/roles.js'
import { DocumentStateBadge } from '../components/documents/DocumentStateBadge.jsx'
import { DOCUMENT_STATE_LIST } from '../domain/document/lifecycle.js'
import { selectVisibleDocuments } from '../domain/document/access.js'
import { getDocumentStats, getRecentDocuments } from '../domain/dashboard/stats.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useDocumentDeletion } from '../hooks/useDocumentDeletion.jsx'
import { useDocumentListState } from '../hooks/useDocumentListState.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'
import { documentService } from '../services/documentService.js'
import { Alert } from '../components/common/Alert.jsx'

// Role-based dashboard.
//
// - An employee sees figures and recent activity for their OWN documents only.
// - The Admin sees institution-wide figures (all documents) and the employee accounts.
//
// Document figures are computed from the documents the signed-in user may see
// (domain/document/access.js), so they always agree with the queue and the archive. Until a
// backend exists those documents live in this browser tab's memory (the development simulation behind the
// document service, not durable, including the labelled demonstration documents), and the section says so.
export default function DashboardPage() {
  const { t, formatNumber } = useTranslation()
  const user = useCurrentUser()
  const isAdmin = user.role === USER_ROLES.orgAdmin
  const scope = isAdmin ? 'admin' : 'employee'
  const list = useDocumentListState()
  const documents = selectVisibleDocuments(list.items, user)
  const stats = getDocumentStats(documents)
  const recent = getRecentDocuments(documents)
  const deletion = useDocumentDeletion()

  return (
    <div className="page">
      <section className="card welcome-card">
        <div className="welcome-card__text">
          <p className="welcome-card__eyebrow">{t('app.tagline')}</p>
          <h2 className="welcome-card__title">{t('dashboard.welcomeTitle', { name: user.displayName })}</h2>
          <p className="welcome-card__subtitle">{t(isAdmin ? 'dashboard.welcomeSubtitleAdmin' : 'dashboard.welcomeSubtitle')}</p>
        </div>
        <Link to={ROUTES.upload} className="button button--primary">
          <Icon name="upload" />
          {t('dashboard.uploadCta')}
        </Link>
      </section>

      <section aria-labelledby="overview-heading">
        <div className="section-heading">
          <h2 id="overview-heading">{t(`dashboard.documents.${scope}Title`)}</h2>
          {documentService.isMock && <DemoBadge />}
        </div>
        {list.status === 'loading' && (
          <p className="auth-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            {t('common.loading')}
          </p>
        )}
        {list.status === 'error' && (
          <Alert tone="error" title={t('common.loadFailed')}>
            <p>
              <button type="button" className="button button--secondary button--sm" onClick={() => list.reload()}>
                <Icon name="refresh" size={16} />
                {t('common.retry')}
              </button>
            </p>
          </Alert>
        )}
        <div className="stats-grid">
          <StatCard label={t(`dashboard.documents.${scope}Total`)} value={formatNumber(stats.total)} icon="fileText" tone="navy" />
          <StatCard label={t('dashboard.documents.approved')} value={formatNumber(stats.approved)} icon="checkCircle" tone="teal" />
          <StatCard label={t('dashboard.documents.needsCorrection')} value={formatNumber(stats.needsCorrection)} icon="fileWarning" tone="warning" />
        </div>
        <ul className="state-counts" aria-label={t('dashboard.documents.byState')}>
          {DOCUMENT_STATE_LIST.map((state) => (
            <li key={state} data-state={state}>
              <DocumentStateBadge state={state} /> <strong>{formatNumber(stats.byState[state])}</strong>
            </li>
          ))}
        </ul>
        {documentService.isMock && (
          <p className="demo-note">
            <Icon name="info" size={18} />
            {t('dashboard.documents.temporaryNote')}
          </p>
        )}
      </section>

      {deletion.feedback}

      {isAdmin && <EmployeeSummary />}

      <section aria-labelledby="recent-heading">
        <div className="section-heading">
          <h2 id="recent-heading">{t(`dashboard.recent.${scope}Title`)}</h2>
        </div>
        {recent.length === 0 ? (
          <p className="card queue-empty">{t('dashboard.recent.empty')}</p>
        ) : (
          <ul className="queue-list" aria-label={t(`dashboard.recent.${scope}Title`)}>
            {recent.map((item) => (
              <DocumentListItem key={item.id} item={item} onDelete={deletion.onDelete} />
            ))}
          </ul>
        )}
      </section>
      {deletion.dialog}
    </div>
  )
}
