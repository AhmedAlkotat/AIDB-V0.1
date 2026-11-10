import { USER_ROLES } from '../../constants/roles.js'

// DEMO DATA ONLY: placeholder signed-in user until authentication exists.
// Display name and initials are translated (see demoUser.* keys).
export const DEMO_USER = Object.freeze({
  isDemo: true,
  id: 'demo-employee',
  role: USER_ROLES.employee,
})
