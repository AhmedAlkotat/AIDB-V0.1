import { Icon } from '../components/common/Icon.jsx'
import { ResourceState } from '../components/common/ResourceState.jsx'
import { SimulationNotice } from '../components/common/SimulationNotice.jsx'
import { useResource } from '../hooks/useResource.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { templateService } from '../services/templateService.js'

// Document templates, within what the approved decisions say (docs/batch-d-document-management.md):
//   - the system supports layouts it has never seen, and NEVER rejects a document only because it matches no
//     template; choosing a template is never required, so nothing on the upload screen asks for one;
//   - layouts the system already recognises are listed here, read only.
// How templates are created, edited or approved, who may manage them and any training workflow are NOT defined
// by the decisions, so this page offers none of that (it is an open question, reported, not invented).
export default function DocumentTemplatesPage({ service = templateService }) {
  const { t } = useTranslation()
  const templates = useResource(() => service.list())

  return (
    <div className="page">
      <section className="card page-intro" aria-labelledby="templates-title">
        <span className="page-intro__icon">
          <Icon name="templates" size={26} />
        </span>
        <div className="page-intro__text">
          <h2 id="templates-title" className="page-intro__title">
            {t('nav.templates')}
          </h2>
          <p className="page-intro__description">{t('templates.description')}</p>
        </div>
      </section>

      {service.isMock && <SimulationNotice textKey="templates.simulated" />}

      <section className="card info-card" aria-labelledby="templates-policy-title">
        <h2 id="templates-policy-title">{t('templates.policy.title')}</h2>
        <ul className="confirm-list">
          <li>{t('templates.policy.unknown')}</li>
          <li>{t('templates.policy.optional')}</li>
          <li>{t('templates.policy.management')}</li>
        </ul>
      </section>

      <section className="card info-card" aria-labelledby="templates-known-title">
        <h2 id="templates-known-title">{t('templates.known.title')}</h2>
        <ResourceState resource={templates}>
          {templates.data?.length === 0 ? (
            <p>{t('templates.known.empty')}</p>
          ) : (
            <ul className="template-list" aria-label={t('templates.known.title')}>
              {templates.data?.map((template) => (
                <li key={template.id} className="template-list__item">
                  <strong dir="auto">{template.name}</strong>
                  {template.documentType && <span className="badge badge--neutral">{t(`documents.types.${template.documentType}`)}</span>}
                </li>
              ))}
            </ul>
          )}
        </ResourceState>
      </section>
    </div>
  )
}
