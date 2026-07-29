import { Navigate } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import type { UserRole } from '../../../types'

/**
 * Placeholder for a role-gated dashboard tab. The gating is real — typing the
 * URL without the role bounces you back — but the panels themselves still need
 * data hooks that don't exist yet.
 */
export function RoleTabStub({
  title,
  blurb,
  icon: Icon,
  roles,
}: {
  title: string
  blurb: string
  icon: LucideIcon
  roles: UserRole[]
}) {
  usePageTitle(title)
  const auth = useAuth()

  // Wait for the profile before judging — on a hard reload it resolves late.
  if (!auth.profile) {
    return <div className="bg-ktip-cream rounded-2xl border border-gray-200 h-48 animate-pulse-soft" />
  }

  const allowed = roles.some((role) => auth.profile?.roles?.includes(role))
  if (!allowed) return <Navigate to="/dashboard" replace />

  return (
    <div className="bg-ktip-cream border border-gray-200 rounded-2xl p-6">
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">{title}</h2>
        <p className="text-ktip-sand-600 max-w-md mx-auto">{blurb}</p>
        <p className="text-xs text-ktip-sand-400 mt-4">Coming soon</p>
      </div>
    </div>
  )
}
