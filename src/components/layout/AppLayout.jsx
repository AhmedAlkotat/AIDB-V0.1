import { useCallback, useEffect, useRef, useState } from 'react'
import { matchPath, Outlet, useLocation } from 'react-router'
import { NotificationsProvider } from '../../contexts/NotificationsProvider.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { findNavigationItem } from '../../routes/navigation.js'
import { ROUTES } from '../../routes/paths.js'
import { Header } from './Header.jsx'
import { Sidebar } from './Sidebar.jsx'

const SIDEBAR_ID = 'app-sidebar'
// Must match the desktop breakpoint in layout.css (drawer below 1024px).
const DESKTOP_QUERY = '(min-width: 1024px)'

// Application shell: sidebar + header + routed page content.
//
// The sidebar has two independent states:
// - Desktop (>= 1024px): docked column that can be collapsed so the content
//   uses the full width. Visible by default.
// - Tablet/mobile (< 1024px): off-canvas drawer. Hidden by default.
// The header menu button and the sidebar close button act on whichever
// state applies to the current screen size.
export function AppLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false)
  const menuButtonRef = useRef(null)
  const headerRef = useRef(null)

  const isSidebarVisible = isDesktop ? !isDesktopCollapsed : isDrawerOpen
  const isDrawerActive = !isDesktop && isDrawerOpen

  // The review workspace uses the whole width (two panels side by side); other pages keep
  // the readable maximum width.
  const isReviewPage = matchPath(ROUTES.reviewDocument, pathname) !== null
  const currentItem = findNavigationItem(pathname)
  const pageTitle = t(currentItem ? currentItem.labelKey : 'pages.notFound.title')

  // Closes only the mobile drawer (used after following a link, so the
  // docked desktop sidebar stays open while navigating).
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), [])

  // Close button inside the sidebar. Focus returns to the menu button, since
  // the close button itself disappears.
  const closeSidebar = useCallback(() => {
    if (isDesktop) setIsDesktopCollapsed(true)
    else setIsDrawerOpen(false)
    menuButtonRef.current?.focus()
  }, [isDesktop])

  const toggleSidebar = useCallback(() => {
    if (isDesktop) setIsDesktopCollapsed((collapsed) => !collapsed)
    else setIsDrawerOpen((open) => !open)
  }, [isDesktop])

  // Publishes the REAL height of the sticky header (it grows when its content wraps)
  // as --app-header-height, so sticky panels and scroll offsets sit right below it.
  useEffect(() => {
    const header = headerRef.current
    if (!header) return undefined
    const root = document.documentElement
    const publish = () => root.style.setProperty('--app-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(header)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-header-height')
    }
  }, [])

  useEffect(() => {
    document.title = `${pageTitle} | ${t('app.name')}`
  }, [pageTitle, t])

  useEffect(() => {
    if (!isDrawerActive) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsDrawerOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDrawerActive])

  return (
    <NotificationsProvider>
    <div className={`app-shell${isDesktopCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        {t('a11y.skipToContent')}
      </a>

      <Sidebar id={SIDEBAR_ID} isOpen={isDrawerOpen} onClose={closeSidebar} onNavigate={closeDrawer} />
      {isDrawerActive && (
        <div className="sidebar-backdrop" aria-hidden="true" onClick={closeDrawer} />
      )}

      <div className="app-main">
        <Header
          title={pageTitle}
          sidebarId={SIDEBAR_ID}
          isSidebarOpen={isSidebarVisible}
          onMenuToggle={toggleSidebar}
          menuButtonRef={menuButtonRef}
          headerRef={headerRef}
        />
        <main id="main-content" className={`app-content${isReviewPage ? ' app-content--wide' : ''}`} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
    </NotificationsProvider>
  )
}
