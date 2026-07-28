import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexts/AuthContext'

export const ProtectedRoute = () => {
  const auth = useAuth()
  const location = useLocation()

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
        <div className="text-center">
          <img
            src="/KTIP%20LOGO.png"
            alt="KTIP Logo"
            className="w-12 h-12 object-contain mx-auto animate-pulse-soft"
          />
          <p className="mt-4 text-ktip-sand-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // OAuth users who never finished onboarding have no role yet — send them
  // back to complete their profile (email signups always set a role).
  if (auth.profile && auth.profile.roles.length === 0) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
