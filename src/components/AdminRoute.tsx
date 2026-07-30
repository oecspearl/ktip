import { Navigate, Outlet, useLocation } from 'react-router'
import { ShieldX } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export const AdminRoute = () => {
  const auth = useAuth()
  const location = useLocation()
  // Capability, not slug: legacy 'oecs' accounts resolve to super_admin via
  // ROLE_ALIASES and keep their access, and a Safety Admin can be admitted to
  // the console by the matrix without being made a Secretariat admin.
  const isAdmin = auth.can('org:manage') || auth.can('moderation:view')

  // `can()` falls back to the compiled defaults for profile.roles until the
  // permissions RPC resolves, so it reads as "no permissions" while the profile
  // itself is still loading. Waiting keeps that from flashing a denial.
  if (auth.loading || auth.profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
        <div className="text-center">
          <img
            src="/ktip-logo.webp"
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

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldX size={32} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold font-display text-ktip-sand-900 mb-2">Access Denied</h1>
          <p className="text-ktip-sand-600">
            This area is restricted to OECS administrators. If you believe you should have access,
            please contact your organization.
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
