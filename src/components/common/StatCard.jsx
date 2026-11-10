import { Icon } from './Icon.jsx'

// Summary card: icon, label and a single value. `tone` selects the accent
// colour: navy | teal | warning | info.
export function StatCard({ label, value, icon, tone = 'navy' }) {
  return (
    <article className={`card stat-card stat-card--${tone}`}>
      <span className="stat-card__icon">
        <Icon name={icon} size={24} />
      </span>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
      </div>
    </article>
  )
}
