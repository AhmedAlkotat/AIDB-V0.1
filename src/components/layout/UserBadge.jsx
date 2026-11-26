import { useCurrentUser } from '../../hooks/useCurrentUser.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { getInitials } from '../../utils/userInitials.js'

// Shows the signed-in user's name and role.
export function UserBadge() {
  const { t } = useTranslation()
  const { displayName, role } = useCurrentUser()
  const roleLabel = t(`roles.${role}`)

  return (
    <div className="user-badge" aria-label={`${t('header.currentUser')}: ${displayName}, ${roleLabel}`}>
      <span className="avatar" aria-hidden="true">
        {getInitials(displayName)}
      </span>
      <span className="user-badge__text" aria-hidden="true">
        <span className="user-badge__name">{displayName}</span>
        <span className="user-badge__role">{roleLabel}</span>
      </span>
    </div>
  )
}
