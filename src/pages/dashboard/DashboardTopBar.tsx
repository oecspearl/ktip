import { Link } from 'react-router'
import { CheckCircle, ChevronRight, Users } from 'lucide-react'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { ROLE_LABELS } from '../../lib/constants'
import type { UserRole } from '../../types'
import { cn } from '../../lib/utils'

/** Height of the collapsed band. Mirrored by --dash-bar-h in DashboardLayout. */
export const DASH_BAR_H = '3.5rem'

interface DashboardTopBarProps {
  displayName: string
  avatarUrl?: string | null
  isVerified?: boolean
  roles?: UserRole[] | null
  connectionCount: number
  /** True once the hero band has scrolled up past the navbar. */
  shown: boolean
}

/**
 * The hero's second state.
 *
 * Once the tall hero scrolls away this takes over its last row — breadcrumb on
 * the left, identity and role chips on the right — so the page never loses its
 * heading. Fixed rather than sticky: an in-flow bar would reserve its height
 * under the hero even while invisible, which reads as a gap above the rail.
 */
export function DashboardTopBar({
  displayName,
  avatarUrl,
  isVerified,
  roles,
  connectionCount,
  shown,
}: DashboardTopBarProps) {
  return (
    <div
      aria-hidden={!shown}
      className={cn(
        // --nav-offset, not --nav-h: the navbar auto-hides, and holding its full
        // height while it is off screen leaves this band floating mid-page.
        'fixed inset-x-0 top-[var(--nav-offset)] z-30 border-b border-white/10 bg-brand-navy/95 backdrop-blur-md',
        'transition-[top,opacity,transform] duration-300',
        shown ? 'opacity-100 translate-y-0' : 'pointer-events-none -translate-y-2 opacity-0'
      )}
      style={{ height: DASH_BAR_H }}
    >
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto h-full px-4 md:px-12 flex items-center justify-between gap-4">
        <nav className="flex items-center text-base text-white/70 min-w-0" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-white transition-colors">
            Home
          </Link>
          <ChevronRight size={15} className="mx-1.5 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-white truncate">Dashboard</span>
        </nav>

        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden sm:flex items-center gap-2 min-w-0 text-sm text-white/85">
            <DiamondAvatar src={avatarUrl} name={displayName} size={26} frameClassName="ring-1 ring-white/40" />
            <span className="font-semibold text-white truncate max-w-[12rem]">{displayName}</span>
            {isVerified && (
              <span className="text-white/90 shrink-0" title="Verified">
                <CheckCircle size={14} />
              </span>
            )}
          </span>

          <span className="hidden lg:flex items-center gap-2">
            {roles?.map((role) => (
              <span
                key={role}
                className="px-2 py-0.5 rounded-md bg-white/15 border border-white/25 text-white text-xs font-medium"
              >
                {ROLE_LABELS[role] || role}
              </span>
            ))}
          </span>

          <Link
            to="/dashboard/connections"
            className="flex shrink-0 items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-xs text-white/85 hover:text-white hover:bg-white/20 transition-colors"
          >
            <Users size={14} />
            <span className="font-semibold text-white">{connectionCount}</span>
            <span className="hidden sm:inline">
              {connectionCount === 1 ? 'connection' : 'connections'}
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
