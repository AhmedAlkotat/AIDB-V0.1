import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { DemoBadge } from '../components/common/DemoBadge.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { seedDemoReviewDocuments } from '../data/mock/reviewDemo.mock.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { documentStore } from '../services/documentStore.js'
import { reviewPath, ROUTES } from '../routes/paths.js'

// Correction queue: the documents waiting for human review. Opening one goes to
// its own review page (the editor is NOT embedded here).
//
// Until a backend exists the queue lists the documents held in this browser
// tab's memory: the demonstration documents below (mock data) and any document
// opened for review from the upload page. They are lost on reload.
export default function CorrectionQueuePage() {
  const { t, formatNumber } = useTranslation()
  const [items, setItems] = useState(() => {
    seedDemoReviewDocuments(documentStore)
    return documentStore.list()
  })

  useEffect(() => documentStore.subscribe(() => setItems(documentStore.list())), [])

  return (
    <div className="page">
      <section className="card page-intro" aria-labelledby="queue-title">
        <span className="page-intro__icon">
          <Icon name="fileWarning" size={26} />
        </span>
        <div className="page-intro__text">
          <h2 id="queue-title" className="page-intro__title">
            {t('nav.corrections')}
          </h2>
          <p className="page-intro__description">{t('queue.description')}</p>
        </div>
      </section>

      <Alert tone="info" title={t('queue.temporaryTitle')}>
        {t('queue.temporaryNote')}
      </Alert>

      {items.length === 0 ? (
        <section className="card queue-empty">
          <p>{t('queue.empty')}</p>
          <Link className="button button--primary" to={ROUTES.upload}>
            <Icon name="upload" />
            {t('dashboard.uploadCta')}
          </Link>
        </section>
      ) : (
        <ul className="queue-list" aria-label={t('queue.listLabel')}>
          {items.map((item) => {
            const isApproved = item.approvalStatus === 'approved'
            return (
              <li key={item.id} className="card queue-item">
                <div className="queue-item__main">
                  <h3 className="queue-item__name" dir="auto">
                    {item.name}
                  </h3>
                  <div className="queue-item__badges">
                    {item.usesMockProcessing && <DemoBadge />}
                    {isApproved && <span className="badge badge--success">{t('review.header.approvedBadge')}</span>}
                  </div>
                  <p className="queue-item__meta">
                    <span>{t('queue.pages', { selected: formatNumber(item.selectedCount), total: formatNumber(item.totalPages) })}</span>
                    <span>{t('queue.reviewed', { reviewed: formatNumber(item.reviewedCount), selected: formatNumber(item.selectedCount) })}</span>
                  </p>
                </div>
                <Link className="button button--primary" to={reviewPath(item.id)}>
                  <Icon name="fileText" />
                  {t(isApproved ? 'queue.openReadOnly' : 'queue.open')}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
