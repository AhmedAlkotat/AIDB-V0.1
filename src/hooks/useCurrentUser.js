import { DEMO_USER } from '../data/mock/demoUser.mock.js'
import { useCurrentRole } from './useReviewSession.js'

// The signed-in user: { id, role }. Authentication does not exist yet, so this is the
// DEMO user (with the optional VITE_DEMO_ROLE override for manual testing). It only
// drives the simulated visibility rules of the interface (domain/document/access.js);
// it is not a security boundary.
export function useCurrentUser() {
  const role = useCurrentRole()
  return { id: DEMO_USER.id, role }
}
