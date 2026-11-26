import { Outlet } from 'react-router'
import { useAuth } from '../../hooks/useAuth.js'
import ForbiddenPage from '../../pages/ForbiddenPage.jsx'
import { getRouteDecision, ROUTE_DECISION } from '../../routes/routeAccess.js'

// Layout route (inside RequireAuth): child routes are only for the listed roles. Anyone
// else sees the access-denied page at the same address.
export function RequireRole({ roles }) {
  const { status, user } = useAuth()
  const decision = getRouteDecision({ status, user }, roles)
  return decision === ROUTE_DECISION.allow ? <Outlet /> : <ForbiddenPage />
}
