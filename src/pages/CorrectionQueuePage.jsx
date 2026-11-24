import { Link } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { DocumentListItem } from '../components/review/DocumentListItem.jsx'
import { selectCorrectionQueue } from '../domain/document/access.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useDocumentList } from '../hooks/useDocumentList.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { ROUTES } from '../routes/paths.js'

// Correction queue: the documents waiting for human review (approved documents move to
// the archive). An employee sees their own documents, an administrator all of them
// (simulated, see domain/document/access.js). Opening one goes to its own review page
// (the editor is NOT embedded here).
//
// Until a backend exists the queue lists the documents held in this browser tab's
// memory: the demonstration documents (mock data) and any document opened for review
// from the upload page. They are lost on reload.
export default function CorrectionQueuePage() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const items = selectCorrectionQueue(useDocumentList(), user)

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
        <p>{t('queue.temporaryNote')}</p>
        <p>{t('queue.simulatedNote')}</p>
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
          {items.map((item) => (
            <DocumentListItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}
