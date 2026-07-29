import { Check, Repeat } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { ROLE_BY_SLUG } from '../../lib/permissions'
import type { RoleSlug } from '../../types'

interface RoleSwitcherProps {
  onSwitch?: () => void
}

/**
 * Context switcher for accounts that hold more than one role — a faculty member
 * who also owns an SME, an admin checking the entrepreneur view.
 *
 * Switching writes profiles.active_role. It is not a re-authentication: the JWT
 * is untouched, no sign-out happens, and the active context can only ever be a
 * subset of the roles the account already holds (enforced by the 063 guard
 * trigger and by has_permission_as).
 */
export function RoleSwitcher({ onSwitch }: RoleSwitcherProps) {
  const auth = useAuth()
  const toast = useToast()

  const held = (auth.profile?.roles || []) as RoleSlug[]

  // A single-role account has nothing to switch between.
  if (held.length < 2) return null

  const handleSelect = async (role: RoleSlug | null) => {
    try {
      await auth.setActiveRole(role)
      toast.success(
        role ? `Now acting as ${ROLE_BY_SLUG[role]?.label ?? role}` : 'Showing all your roles'
      )
      onSwitch?.()
    } catch (err: any) {
      toast.error(err.message || 'Could not switch role')
    }
  }

  return (
    <div className="px-2 py-1">
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ktip-sand-400 flex items-center gap-1.5">
        <Repeat size={12} />
        Acting as
      </p>

      <button
        type="button"
        onClick={() => handleSelect(null)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <span>All roles</span>
        {!auth.activeRole && <Check size={15} className="text-ktip-ocean-600" />}
      </button>

      {held.map((slug) => (
        <button
          key={slug}
          type="button"
          onClick={() => handleSelect(slug)}
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
        >
          <span className="truncate">{ROLE_BY_SLUG[slug]?.label ?? slug}</span>
          {auth.activeRole === slug && <Check size={15} className="text-ktip-ocean-600 flex-shrink-0" />}
        </button>
      ))}

      {/* Owned by the switcher so a single-role account gets no stray divider. */}
      <hr className="mt-2 border-ktip-sand-100" />
    </div>
  )
}

export default RoleSwitcher
