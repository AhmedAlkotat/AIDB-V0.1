import { useTranslation } from '../../hooks/useTranslation.js'

// Visible marker for any UI that displays mock (non-real) data.
export function DemoBadge() {
  const { t } = useTranslation()
  return <span className="badge badge--demo">{t('common.demoData')}</span>
}
