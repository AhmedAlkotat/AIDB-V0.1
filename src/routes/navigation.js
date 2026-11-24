import { matchPath } from 'react-router'
import { ALL_ROLES } from '../constants/roles.js'
import { ROUTES } from './paths.js'

// Sidebar navigation definition. `roles` lists who should eventually see each
// item; it is informational only until role-based authorization is added.
export const navigationItems = Object.freeze([
  { id: 'dashboard', path: ROUTES.dashboard, labelKey: 'nav.dashboard', icon: 'dashboard', group: 'main', roles: ALL_ROLES },
  { id: 'upload', path: ROUTES.upload, labelKey: 'nav.upload', icon: 'upload', group: 'main', roles: ALL_ROLES },
  { id: 'archive', path: ROUTES.archive, labelKey: 'nav.archive', icon: 'archive', group: 'main', roles: ALL_ROLES },
  { id: 'corrections', path: ROUTES.corrections, labelKey: 'nav.corrections', icon: 'fileWarning', group: 'main', roles: ALL_ROLES },
  { id: 'templates', path: ROUTES.templates, labelKey: 'nav.templates', icon: 'templates', group: 'main', roles: ALL_ROLES },
  { id: 'settings', path: ROUTES.settings, labelKey: 'nav.settings', icon: 'settings', group: 'system', roles: ALL_ROLES },
])

export function getNavigationGroup(group) {
  return navigationItems.filter((item) => item.group === group)
}

// The item for a URL. Pages below a section (e.g. /corrections/review/:id) belong
// to that section, so they keep its title and its highlighted sidebar entry.
export function findNavigationItem(pathname) {
  return (
    navigationItems.find((item) => matchPath({ path: item.path, end: true }, pathname)) ??
    navigationItems.find((item) => item.path !== ROUTES.dashboard && matchPath({ path: `${item.path}/*` }, pathname))
  )
}
