// User roles planned for AIDP. Authorization is NOT enforced yet; these values
// only prepare the navigation and user model for a future phase.
export const USER_ROLES = Object.freeze({
  employee: 'employee',
  orgAdmin: 'orgAdmin',
})

export const ALL_ROLES = Object.freeze(Object.values(USER_ROLES))
