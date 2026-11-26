import { matchPath } from 'react-router'
import { ADMIN_ROLES, ALL_ROLES } from '../constants/roles.js'
import { ROUTES } from './paths.js'

// Sidebar navigation definition. `roles` lists who sees each item (and AppRoutes uses the
// same lists for its route guards). It only shapes the interface; the backend enforces
// permissions.
export const navigationItems = Object.freeze([
  { id: 'dashboard', path: ROUTES.dashboard, labelKey: 'nav.dashboard', icon: 'dashboard', group: 'main', roles: ALL_ROLES },
  { id: 'upload', path: ROUTES.upload, labelKey: 'nav.upload', icon: 'upload', group: 'main', roles: ALL_ROLES },
  { id: 'archive', path: ROUTES.archive, labelKey: 'nav.archive', icon: 'archive', group: 'main', roles: ALL_ROLES },
  { id: 'corrections', path: ROUTES.corrections, labelKey: 'nav.corrections', icon: 'fileWarning', group: 'main', roles: ALL_ROLES },
  { id: 'templates', path: ROUTES.templates, labelKey: 'nav.templates', icon: 'templates', group: 'main', roles: ALL_ROLES },
  { id: 'adminEmployees', path: ROUTES.adminEmployees, labelKey: 'nav.adminEmployees', icon: 'users', group: 'admin', roles: ADMIN_ROLES },
  { id: 'settings', path: ROUTES.settings, labelKey: 'nav.settings', icon: 'settings', group: 'system', roles: ALL_ROLES },
])

// The items of one sidebar group that `role` may see. An unknown role sees nothing.
export function getNavigationGroup(group, role) {
  return navigationItems.filter((item) => item.group === group && item.roles.includes(role))
}

// The item for a URL. Pages below a section (e.g. /corrections/review/:id) belong
// to that section, so they keep its title and its highlighted sidebar entry.
export function findNavigationItem(pathname) {
  return (
    navigationItems.find((item) => matchPath({ path: item.path, end: true }, pathname)) ??
    navigationItems.find((item) => item.path !== ROUTES.dashboard && matchPath({ path: `${item.path}/*` }, pathname))
  )
}
