import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../hooks/useAuth.js'
import { ROUTES } from '../../routes/paths.js'
import { getRouteDecision, ROUTE_DECISION } from '../../routes/routeAccess.js'
import { AuthFailed, AuthLoading } from './AuthStatusScreen.jsx'

// Layout route: renders its child routes only for a signed-in user. Others wait (session
// check), see the retry screen, or go to the login page (which brings them back here).
export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()
  const decision = getRouteDecision({ status, user })

  if (decision === ROUTE_DECISION.loading) return <AuthLoading />
  if (decision === ROUTE_DECISION.failed) return <AuthFailed />
  if (decision === ROUTE_DECISION.login) return <Navigate to={ROUTES.login} replace state={{ from: location }} />
  return <Outlet />
}
