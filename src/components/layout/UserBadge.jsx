import { DEMO_USER } from '../../data/mock/demoUser.mock.js'
import { useTranslation } from '../../hooks/useTranslation.js'

// Shows the current user. Until authentication exists this is the demo user.
export function UserBadge({ user = DEMO_USER }) {
  const { t } = useTranslation()
  const name = t('demoUser.name')
  const role = t(`roles.${user.role}`)

  return (
    <div className="user-badge" aria-label={`${t('header.currentUser')}: ${name}, ${role}`}>
      <span className="avatar" aria-hidden="true">
        {t('demoUser.initials')}
      </span>
      <span className="user-badge__text" aria-hidden="true">
        <span className="user-badge__name">{name}</span>
        <span className="user-badge__role">{role}</span>
      </span>
    </div>
  )
}
