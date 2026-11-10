import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useTranslation } from '../../hooks/useTranslation.js'
import { findNavigationItem } from '../../routes/navigation.js'
import { Header } from './Header.jsx'
import { Sidebar } from './Sidebar.jsx'

const SIDEBAR_ID = 'app-sidebar'

// Application shell: sidebar + header + routed page content.
export function AppLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const currentItem = findNavigationItem(pathname)
  const pageTitle = t(currentItem ? currentItem.labelKey : 'pages.notFound.title')

  const closeSidebar = useCallback(() => setIsSidebarOpen(false), [])
  const toggleSidebar = useCallback(() => setIsSidebarOpen((open) => !open), [])

  useEffect(() => {
    document.title = `${pageTitle} | ${t('app.name')}`
  }, [pageTitle, t])

  useEffect(() => {
    if (!isSidebarOpen) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsSidebarOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSidebarOpen])

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        {t('a11y.skipToContent')}
      </a>

      <Sidebar id={SIDEBAR_ID} isOpen={isSidebarOpen} onClose={closeSidebar} />
      {isSidebarOpen && (
        <div className="sidebar-backdrop" aria-hidden="true" onClick={closeSidebar} />
      )}

      <div className="app-main">
        <Header
          title={pageTitle}
          sidebarId={SIDEBAR_ID}
          isSidebarOpen={isSidebarOpen}
          onMenuToggle={toggleSidebar}
        />
        <main id="main-content" className="app-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
