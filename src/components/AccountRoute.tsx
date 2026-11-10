import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { rememberReturnTo } from '../lib/return-to'
import { RouteSplash } from './RouteSplash'
import { useWallForUnverified } from '../hooks/useUnverifiedRule'
import { VerificationWall } from './verification/VerificationWall'

/**
 * Detail pages that need an account but were browsable before.
 *
 * Lists stay open so a visitor can see what is on the platform; opening one
 * item takes an account. A signed-out visitor is sent to /login, like every
 * other gate; /login links to /signup for anyone without an account. The page
 * they wanted is parked in the tab (return-to.ts) as well as handed over in
 * `state.from`, so the email OTP, an OAuth round trip or a hop over to /signup
 * all land them back on it.
 *
 * Signed in, this only renders the page. It deliberately repeats none of
 * ProtectedRoute's onboarding or two-step checks: these routes were public, and
 * a member who was allowed to read them yesterday must still be allowed to.
 * Where a route also needs those checks (/projects/:id), ProtectedRoute is
 * nested inside this one.
 */
export const AccountRoute = () => {
  const auth = useAuth()
  const location = useLocation()
  const wallUnverified = useWallForUnverified()

  if (auth.loading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    // Idempotent, so calling it during render is safe; LoginPage writes the
    // same value again from `state.from` when it mounts.
    rememberReturnTo(location)
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Verification (205) is the one exception to "repeats none of
  // ProtectedRoute's checks": grant and event pages are marked open to an
  // unverified account in App.tsx; resources, courses, integrations and
  // projects are not. Waits for the profile, because `verified` reads it.
  if (auth.profileLoading) {
    return <RouteSplash />
  }
  if (!auth.verified && wallUnverified) {
    return <VerificationWall />
  }

  return <Outlet />
}
