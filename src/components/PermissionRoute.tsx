import { Navigate, Outlet, useLocation } from 'react-router'
import { ShieldX } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { PERMISSION_BY_KEY } from '../lib/permissions'
import type { PermissionKey } from '../types'

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
  const auth = useAuth()
  const location = useLocation()
  const required = Array.isArray(require) ? require : [require]
  const allowed = required.some((key) => auth.can(key))

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

  if (!allowed) {
    const label = PERMISSION_BY_KEY[required[0]]?.label ?? required[0]
    return (
      <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldX size={32} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold font-display text-ktip-sand-900 mb-2">Access Denied</h1>
          <p className="text-ktip-sand-600">
            This area requires the “{label}” permission. If you believe you should have access,
            please contact your organization.
          </p>
        </div>
      </div>
    )
  }

  return children ? <>{children}</> : <Outlet />
}

export default PermissionRoute
