import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { RouteSplash } from './RouteSplash'

export const ProtectedRoute = () => {
  const auth = useAuth()
  const location = useLocation()

  if (auth.loading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // The role check below reads profile.roles, so it has to wait for the row to
  // arrive. Falling through while the fetch is in flight let unonboarded users
  // reach pages whose writes RLS then refused with a bare 403.
  if (auth.profileLoading) {
    return <RouteSplash />
  }

  // OAuth users who never finished onboarding have no role yet — send them
  // back to complete their profile (email signups always set a role).
  //
  // requires_age_declaration catches the same accounts from the other side: a
  // Google or Microsoft signup carries no birthday claim, so their age is only
  // established on the onboarding form. It defaults to false, so no account that
  // predates migration 091 is ever caught by this.
  //
  // requires_consent (115) is the third of the same shape: an OAuth signup never
  // saw the agreements, so it arrives owing them. Only the ACCOUNT bundle sets
  // this — publishing, competition and application agreements gate an action,
  // not a session, and blocking navigation on those would be hostile. It also
  // defaults to false, so existing members are asked by the re-consent banner
  // rather than trapped here.
  if (
    auth.profile &&
    (auth.profile.roles.length === 0 ||
      auth.profile.requires_age_declaration ||
      auth.profile.requires_consent)
  ) {
    return <Navigate to="/onboarding" replace />
  }

  // Two-factor (118), in two parts that must stay in this order.
  //
  // The challenge comes first and reads from AuthContext rather than `profile`,
  // because assurance level is a property of the session. It only ever fires for
  // an account that already HAS a verified factor, so it cannot collide with the
  // enrolment gate below.
  if (auth.mfaChallengeRequired) {
    return <Navigate to="/security/verify" replace state={{ from: location }} />
  }

  // Enrolment. Same shape as requires_age_declaration and defaulted FALSE for
  // the same reason, which is load-bearing twice over here: no account predating
  // 118 is ever caught, and an app deployed ahead of the migration reads the
  // column as undefined and gates nobody rather than trapping everyone.
  //
  // Deliberately AFTER the roles/onboarding clause — an account with no role
  // owes onboarding first, and this requirement is derived from a role it does
  // not hold yet.
  if (auth.profile?.requires_mfa_enrollment) {
    return <Navigate to="/security/set-up" replace />
  }

  return <Outlet />
}
