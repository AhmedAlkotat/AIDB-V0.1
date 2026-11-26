import { USER_ROLES } from '../../constants/roles.js'

// DEMO DATA ONLY: the owner of the demonstration documents (and the id of the development
// mock employee, see dev/mockAuthService.js). It is NOT the runtime identity: the signed-in
// user comes from the authentication state (hooks/useCurrentUser.js).
export const DEMO_USER = Object.freeze({
  isDemo: true,
  id: 'demo-employee',
  role: USER_ROLES.employee,
})
