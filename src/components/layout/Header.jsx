import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'
import { LanguageSwitcher } from './LanguageSwitcher.jsx'
import { NotificationBell } from './NotificationBell.jsx'
import { UserBadge } from './UserBadge.jsx'

export function Header({ title, sidebarId, isSidebarOpen, onMenuToggle, menuButtonRef, headerRef }) {
  const { t } = useTranslation()

  return (
    <header ref={headerRef} className="app-header">
      <div className="app-header__start">
        <button
          ref={menuButtonRef}
          type="button"
          className="icon-button app-header__menu"
          aria-label={isSidebarOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={isSidebarOpen}
          aria-controls={sidebarId}
          onClick={onMenuToggle}
        >
          <Icon name="menu" />
        </button>
        <h1 className="app-header__title">{title}</h1>
      </div>

      <div className="app-header__actions">
        <LanguageSwitcher />
        <NotificationBell />
        <UserBadge />
      </div>
    </header>
  )
}
