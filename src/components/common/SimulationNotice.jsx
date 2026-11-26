import { useTranslation } from '../../hooks/useTranslation.js'
import { Alert } from './Alert.jsx'
import { DemoBadge } from './DemoBadge.jsx'

// Says plainly that what the page shows (or does) is SIMULATED by the development mock and that
// nothing real happens. Pages render it only while their service is a mock (service.isMock);
// `textKey` is the translation key of the page-specific explanation.
export function SimulationNotice({ textKey }) {
  const { t } = useTranslation()
  return (
    <Alert tone="warning" title={t('simulation.title')}>
      <p>
        <DemoBadge /> {t(textKey)}
      </p>
    </Alert>
  )
}
