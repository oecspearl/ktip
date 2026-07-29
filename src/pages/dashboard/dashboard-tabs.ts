import {
  LayoutDashboard,
  User,
  TrendingUp,
  FolderKanban,
  Calendar,
  Users,
  Inbox,
  Wallet,
  GraduationCap,
  FlaskConical,
  Building2,
  Shield,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '../../types'

export interface DashboardTab {
  /** Route path relative to /dashboard; '' is the index route */
  to: string
  label: string
  icon: LucideIcon
  description: string
  /** Shown only if the member holds one of these roles. Absent = everyone. */
  roles?: UserRole[]
  /** Absolute link out of the dashboard rather than a tab panel */
  external?: boolean
}

export const DASHBOARD_TABS: DashboardTab[] = [
  { to: '', label: 'Overview', icon: LayoutDashboard, description: 'Network, submissions, calendar' },
  { to: 'profile', label: 'Profile', icon: User, description: 'How others see you' },
  { to: 'progress', label: 'Progress', icon: TrendingUp, description: 'Your activity timeline' },
  // Links out: the gallery is a full page, not a panel — it carries filters,
  // collections and showcase editing that do not fit the tab shell.
  { to: '/achievements', label: 'Achievements', icon: Trophy, description: 'Badges, points and rank', external: true },
  { to: 'projects', label: 'Projects', icon: FolderKanban, description: 'Projects you own' },
  { to: 'events', label: 'Events', icon: Calendar, description: 'Events you organize' },
  { to: 'connections', label: 'Connections', icon: Users, description: 'People you know' },
  { to: 'submissions', label: 'Submissions', icon: Inbox, description: 'Your submitted copies' },

  // Role-gated. Panels are stubs for now — the gating is what's wired up.
  { to: 'funding', label: 'Funding', icon: Wallet, description: 'Deal flow and applications', roles: ['investor'] },
  { to: 'mentees', label: 'Mentees', icon: GraduationCap, description: 'People you mentor', roles: ['mentor', 'faculty'] },
  { to: 'research', label: 'Research', icon: FlaskConical, description: 'Research and publications', roles: ['faculty', 'researcher'] },
  // Links out to the real page rather than a stub panel.
  { to: '/sme/verification', label: 'Business', icon: Building2, description: 'Chamber verification and SME status', roles: ['sme', 'private_sector'], external: true },
  { to: '/admin', label: 'Admin', icon: Shield, description: 'Platform administration', roles: ['oecs', 'super_admin', 'safety_admin'], external: true },
]

/**
 * Tabs this member can see, in rail order.
 *
 * `activeRole` narrows the rail to one operating context without changing what
 * the account holds — switching to the SME context hides the faculty tabs, but
 * a tab with no role requirement is always present. Passing null (the default)
 * keeps the previous behaviour of showing every role's tabs at once.
 */
export function visibleDashboardTabs(
  roles: UserRole[] | undefined,
  activeRole?: UserRole | null
): DashboardTab[] {
  const held = roles || []
  // Never widen: the context must be a role the account actually holds.
  const effective = activeRole && held.includes(activeRole) ? [activeRole] : held
  return DASHBOARD_TABS.filter((tab) => !tab.roles || tab.roles.some((r) => effective.includes(r)))
}
