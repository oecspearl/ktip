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
  Shield,
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
  { to: 'projects', label: 'Projects', icon: FolderKanban, description: 'Projects you own' },
  { to: 'events', label: 'Events', icon: Calendar, description: 'Events you organize' },
  { to: 'connections', label: 'Connections', icon: Users, description: 'People you know' },
  { to: 'submissions', label: 'Submissions', icon: Inbox, description: 'Your submitted copies' },

  // Role-gated. Panels are stubs for now — the gating is what's wired up.
  { to: 'funding', label: 'Funding', icon: Wallet, description: 'Deal flow and applications', roles: ['investor'] },
  { to: 'mentees', label: 'Mentees', icon: GraduationCap, description: 'People you mentor', roles: ['mentor'] },
  { to: 'research', label: 'Research', icon: FlaskConical, description: 'Research and publications', roles: ['faculty'] },
  { to: '/admin', label: 'Admin', icon: Shield, description: 'Platform administration', roles: ['oecs'], external: true },
]

/** Tabs this member can see, in rail order. */
export function visibleDashboardTabs(roles: UserRole[] | undefined): DashboardTab[] {
  const held = roles || []
  return DASHBOARD_TABS.filter((tab) => !tab.roles || tab.roles.some((r) => held.includes(r)))
}
