import { NavLink } from 'react-router'
import { useTranslation } from '../../hooks/useTranslation.js'
import { getNavigationGroup } from '../../routes/navigation.js'
import { ROUTES } from '../../routes/paths.js'
import { Icon } from '../common/Icon.jsx'
import { BrandLogo } from './BrandLogo.jsx'

const mainItems = getNavigationGroup('main')
const systemItems = getNavigationGroup('system')

function SidebarNavList({ items, onNavigate }) {
  const { t } = useTranslation()

  return (
    <ul className="sidebar__list">
      {items.map((item) => (
        <li key={item.id}>
          <NavLink
            to={item.path}
            end={item.path === ROUTES.dashboard}
            className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
            onClick={onNavigate}
          >
            <Icon name={item.icon} />
            <span className="sidebar__label">{t(item.labelKey)}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

// Sits at the inline start of the layout: right in Arabic (RTL), left in
// English (LTR). Below 1024px it becomes an off-canvas drawer.
// `isOpen` controls the mobile drawer; `onClose` is the close button;
// `onNavigate` runs after following a link (closes the mobile drawer only).
export function Sidebar({ id, isOpen, onClose, onNavigate }) {
  const { t } = useTranslation()

  return (
    <aside id={id} className={`sidebar${isOpen ? ' is-open' : ''}`}>
      <div className="sidebar__brand">
        <BrandLogo onNavigate={onNavigate} />
        <button
          type="button"
          className="icon-button icon-button--on-dark sidebar__close"
          aria-label={t('nav.closeMenu')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <nav className="sidebar__nav" aria-label={t('nav.ariaLabel')}>
        <p className="sidebar__section-label">{t('nav.sections.main')}</p>
        <SidebarNavList items={mainItems} onNavigate={onNavigate} />
        <p className="sidebar__section-label">{t('nav.sections.system')}</p>
        <SidebarNavList items={systemItems} onNavigate={onNavigate} />
      </nav>

      <div className="sidebar__footer">
        {/* Visual placeholder only: authentication is not implemented yet. */}
        <button
          type="button"
          className="sidebar__link sidebar__logout"
          aria-disabled="true"
          title={t('common.comingSoon')}
        >
          <Icon name="logout" className="icon--flip-rtl" />
          <span className="sidebar__label">{t('nav.logout')}</span>
          <span className="sidebar__soon">{t('common.comingSoon')}</span>
        </button>
      </div>
    </aside>
  )
}
