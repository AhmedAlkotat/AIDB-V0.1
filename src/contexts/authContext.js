import { createContext } from 'react'

// Value: { status, user, error, isSubmitting, login, logout, clearError, retryInitialize,
// devAccounts }. See state/auth/authStore.js. Read it with useAuth (hooks/useAuth.js).
export const AuthContext = createContext(null)
