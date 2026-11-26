import { useAuth } from './useAuth.js'

// The signed-in user: { id, displayName, role }. Only call it below the route guards
// (RequireAuth), where a user always exists. The role drives what the interface shows
// (domain/document/access.js, navigation); it is not a security boundary, the backend
// must enforce permissions itself.
export function useCurrentUser() {
  const { user } = useAuth()
  if (!user) throw new Error('useCurrentUser needs a signed-in user (use it inside RequireAuth).')
  return user
}
