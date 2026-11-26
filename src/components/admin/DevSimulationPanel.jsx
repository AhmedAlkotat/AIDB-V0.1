import { useTranslation } from '../../hooks/useTranslation.js'

// A small panel for DEVELOPMENT builds only: it lets a developer force the simulated failures and
// states the mock services offer. A page renders it only when its service exposes `dev` (the
// production services never do). `children` are the controls.
export function DevSimulationPanel({ children }) {
  const { t } = useTranslation()
  return (
    <section className="card dev-panel" aria-label={t('simulation.devTitle')}>
      <h3 className="dev-panel__title">
        <span className="badge badge--demo">{t('simulation.devBadge')}</span>
        {t('simulation.devTitle')}
      </h3>
      <p className="dev-panel__note">{t('simulation.devNote')}</p>
      <div className="dev-panel__controls">{children}</div>
    </section>
  )
}
