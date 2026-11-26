import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { DocumentListItem } from '../components/review/DocumentListItem.jsx'
import { selectArchive } from '../domain/document/access.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useDocumentDeletion } from '../hooks/useDocumentDeletion.jsx'
import { useDocumentList } from '../hooks/useDocumentList.js'
import { useTranslation } from '../hooks/useTranslation.js'

// Archive: APPROVED documents only, read-only. A document that is still waiting for
// review never appears here (it is in the correction queue). An employee sees their own
// documents, an administrator all of them (simulated, see domain/document/access.js).
//
// Nothing can really be approved before the backend exists, so the only approved
// document is the labelled demonstration record. Search, filtering and archive
// management with real data belong to Task 4.
export default function DocumentArchivePage() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const items = selectArchive(useDocumentList(), user)
  const deletion = useDocumentDeletion()

  return (
    <div className="page">
      <section className="card page-intro" aria-labelledby="archive-title">
        <span className="page-intro__icon">
          <Icon name="archive" size={26} />
        </span>
        <div className="page-intro__text">
          <h2 id="archive-title" className="page-intro__title">
            {t('nav.archive')}
          </h2>
          <p className="page-intro__description">{t('archive.description')}</p>
        </div>
      </section>

      {deletion.feedback}

      <Alert tone="info" title={t('archive.temporaryTitle')}>
        <p>{t('archive.temporaryNote')}</p>
        <p>{t('queue.simulatedNote')}</p>
      </Alert>

      {items.length === 0 ? (
        <section className="card queue-empty">
          <p>{t('archive.empty')}</p>
        </section>
      ) : (
        <ul className="queue-list" aria-label={t('archive.listLabel')}>
          {items.map((item) => (
            <DocumentListItem key={item.id} item={item} onDelete={deletion.onDelete} />
          ))}
        </ul>
      )}
      {deletion.dialog}
    </div>
  )
}
