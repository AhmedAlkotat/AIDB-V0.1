// What a protected route should do, given the authentication state. Pure, so the
// rules can be tested; RequireAuth and RequireRole render according to it.
//
// This only protects the INTERFACE. Every API call must still be authorized by the
// backend: a user who edits the frontend code gets no extra rights from it.

export const ROUTE_DECISION = Object.freeze({
  loading: 'loading', // still looking for an existing session
  failed: 'failed', // the session check failed (retry offered)
  login: 'login', // nobody is signed in
  forbidden: 'forbidden', // signed in, but the role may not open this route
  allow: 'allow',
})

// `allowedRoles`: roles that may open the route; omit it for "any signed-in user".
export function getRouteDecision({ status, user }, allowedRoles) {
  if (status === 'initializing') return ROUTE_DECISION.loading
  if (status === 'failed') return ROUTE_DECISION.failed
  if (status !== 'authenticated' || !user) return ROUTE_DECISION.login
  if (allowedRoles && !allowedRoles.includes(user.role)) return ROUTE_DECISION.forbidden
  return ROUTE_DECISION.allow
}

// Where to send a user after signing in: the page they originally asked for, when it is
// an ordinary in-app path (never the login/logout pages, never an external address).
export function getPostLoginPath(from, { fallback, loginPath, logoutPath }) {
  const pathname = from?.pathname
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return fallback
  if (pathname === loginPath || pathname === logoutPath) return fallback
  return `${pathname}${from.search ?? ''}${from.hash ?? ''}`
}
