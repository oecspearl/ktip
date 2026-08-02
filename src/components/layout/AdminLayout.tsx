import { Link, Outlet, useLocation } from 'react-router'
import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  Users,
  DollarSign,
  MessageSquare,
  BookOpen,
  Flag,
  BarChart3,
  ClipboardCheck,
  BadgeCheck,
  MessageCircle,
  Puzzle,
  Building2,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  GraduationCap,
  Landmark,
  Trophy,
  Bug,
  FlaskConical,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import type { PermissionKey } from '../../types'

/**
 * The admin sidebar.
 *
 * `requires` is what keeps this honest. AdminRoute admits anyone holding
 * org:manage OR moderation:view, so a Safety Admin — whose whole remit is the
 * moderation queue — was being shown all 22 entries, including Roles &
 * Permissions and Partner API. The pages themselves were safe (RLS and the
 * api/admin/* guards both refuse), but every one of them rendered as an empty
 * screen or a 403, which reads as a broken console rather than a closed door.
 *
 * A super_admin holds every permission, so their sidebar is unchanged.
 */
const adminNavItems: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
  requires?: PermissionKey
}[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban, requires: 'org:manage' },
  { href: '/admin/events', label: 'Events', icon: Calendar, requires: 'org:manage' },
  { href: '/admin/users', label: 'Users', icon: Users, requires: 'members:manage' },
  { href: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck, requires: 'role:manage' },
  { href: '/admin/achievements', label: 'Achievements', icon: Trophy, requires: 'org:manage' },
  { href: '/admin/moderation', label: 'Moderation', icon: ShieldAlert, requires: 'moderation:view' },
  { href: '/admin/institutions', label: 'Institutions', icon: GraduationCap, requires: 'institution:verify' },
  { href: '/admin/chamber', label: 'Chamber Review', icon: Landmark, requires: 'sme:verify' },
  { href: '/admin/grants', label: 'Grants', icon: DollarSign, requires: 'org:manage' },
  { href: '/admin/forums', label: 'Forums', icon: MessageSquare, requires: 'org:manage' },
  { href: '/admin/resources', label: 'Resources', icon: BookOpen, requires: 'org:manage' },
  // Grievances and moderation are the same job seen from two directions, so
  // this is the one non-org:manage page a Safety Admin keeps.
  { href: '/admin/grievances', label: 'Grievances', icon: Flag, requires: 'moderation:view' },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageCircle, requires: 'org:manage' },
  { href: '/admin/verification', label: 'Verification', icon: BadgeCheck, requires: 'org:manage' },
  { href: '/admin/integrations', label: 'Integrations', icon: Puzzle, requires: 'org:manage' },
  { href: '/admin/employers', label: 'Employers', icon: Building2, requires: 'org:manage' },
  { href: '/admin/partner-api', label: 'Partner API', icon: KeyRound, requires: 'org:manage' },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, requires: 'org:manage' },
  { href: '/admin/uat', label: 'UAT Feedback', icon: ClipboardCheck, requires: 'org:manage' },
  // exact, or the simulator route below would light both entries up.
  { href: '/admin/errors', label: 'Errors', icon: Bug, exact: true, requires: 'org:manage' },
  { href: '/admin/errors/simulate', label: 'Error Simulator', icon: FlaskConical, requires: 'org:manage' },
]

export function AdminLayout() {
  const location = useLocation()
  const auth = useAuth()
  const navItems = adminNavItems.filter((item) => !item.requires || auth.can(item.requires))

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href
    return location.pathname.startsWith(href)
  }

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-8 pt-[calc(var(--nav-h)+1.5rem)] pb-8">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar — desktop */}
        <div className="hidden lg:block lg:w-56 shrink-0">
          <div className="bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-2 sticky top-[calc(var(--nav-h)+1.5rem)]">
            {/* Both navs carry the anchor; only one has a non-zero rect at any
                width, and findVisible picks that one. */}
            <nav data-tutorial="admin-sidebar" className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
                    isActive(item.href, item.exact)
                      ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                      : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                  )}
                >
                  <item.icon size={20} />
                  <span className="font-medium text-sm">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="lg:hidden overflow-x-auto scrollbar-hide -mx-4 px-4">
          <nav
            data-tutorial="admin-sidebar"
            className="flex gap-1 min-w-max bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-2"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                  isActive(item.href, item.exact)
                    ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                    : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                )}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div data-tutorial="admin-content" className="flex-1 min-w-0">
          <div key={location.pathname} className="contents page-reveal">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
