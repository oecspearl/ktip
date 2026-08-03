import { Navigate, Outlet, useLocation } from 'react-router'
import { ShieldX } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { RouteSplash } from './RouteSplash'
import { PERMISSION_BY_KEY } from '../lib/permissions'
import type { PermissionKey } from '../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface PermissionRouteProps {
  /** Any one of these grants access. */
  require: PermissionKey | PermissionKey[]
  children?: React.ReactNode
}

/**
 * Route guard keyed on a capability rather than a role, so a Safety Admin
 * reaches /admin/moderation without also being handed the whole Secretariat
 * console. RLS is the real boundary — this only decides what renders.
 */
export const PermissionRoute = ({ require, children }: PermissionRouteProps) => {
  const { i18n } = useLingui()
  const auth = useAuth()
  const location = useLocation()
  const required = Array.isArray(require) ? require : [require]
  const allowed = required.some((key) => auth.can(key))

  // `can()` falls back to the compiled defaults for profile.roles until the
  // permissions RPC resolves, so it reads as "no permissions" while the profile
  // itself is still loading. Waiting keeps that from flashing a denial.
  if (auth.loading || auth.profileLoading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!allowed) {
    const permissionLabel = i18n._(PERMISSION_BY_KEY[required[0]]?.label ?? required[0])
    return (
      <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldX size={32} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold font-display text-ktip-sand-900 mb-2">
            <Trans>Access Denied</Trans>
          </h1>
          <p className="text-ktip-sand-600">
            <Trans>
              This area requires the “{permissionLabel}” permission. If you believe you should
              have access, please contact your organization.
            </Trans>
          </p>
        </div>
      </div>
    )
  }

  return children ? <>{children}</> : <Outlet />
}

export default PermissionRoute
