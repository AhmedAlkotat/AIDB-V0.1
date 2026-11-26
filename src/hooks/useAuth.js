import { useContext } from 'react'
import { AuthContext } from '../contexts/authContext.js'

// The authentication state and actions (see contexts/AuthProvider.jsx).
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}
