import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { AuthLoading } from '../components/auth/AuthStatusScreen.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { ROUTES } from '../routes/paths.js'

// The sidebar's "Sign out" goes HERE through the router, so the review page's navigation
// guard (unsaved or interrupted work) runs first, exactly as for any other navigation.
// Only when the user really arrives does this page end the session.
export default function LogoutPage() {
  const { status, logout } = useAuth()

  useEffect(() => {
    if (status === 'authenticated') logout()
  }, [status, logout])

  if (status === 'authenticated' || status === 'initializing') return <AuthLoading />
  return <Navigate to={ROUTES.login} replace />
}
