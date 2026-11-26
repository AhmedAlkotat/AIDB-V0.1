// The two user roles of AIDP (approved decisions 15 and 20: one institution per
// installation, one Admin, no Super Admin). `orgAdmin` is the Admin role. These values
// are the frontend's internal identifiers; how the backend names roles in its responses
// is still to be agreed (the auth service is the only place that should map them).
//
// Frontend role checks only decide what the INTERFACE shows. They are not a security
// boundary: the backend must enforce every permission itself.
export const USER_ROLES = Object.freeze({
  employee: 'employee',
  orgAdmin: 'orgAdmin',
})

export const ALL_ROLES = Object.freeze(Object.values(USER_ROLES))

// Roles allowed on Admin-only screens and navigation entries.
export const ADMIN_ROLES = Object.freeze([USER_ROLES.orgAdmin])
