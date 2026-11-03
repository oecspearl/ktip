import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { rememberReturnTo } from '../lib/return-to'
import { RouteSplash } from './RouteSplash'

/**
 * Detail pages that need an account but were browsable before.
 *
 * Lists stay open so a visitor can see what is on the platform; opening one
 * item takes an account. A signed-out visitor is sent to /signup rather than
 * /login, because most people who reach a shared grant or event link have no
 * account yet. The page they wanted is parked in the tab (return-to.ts) as
 * well as handed over in `state.from`, so the email OTP, an OAuth round trip
 * or a hop over to /login all land them back on it.
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

  if (auth.loading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    // Idempotent, so calling it during render is safe; SignupPage writes the
    // same value again from `state.from` when it mounts.
    rememberReturnTo(location)
    return <Navigate to="/signup" replace state={{ from: location }} />
  }

  return <Outlet />
}
