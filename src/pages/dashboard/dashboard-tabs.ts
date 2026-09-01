import {
  LayoutDashboard,
  FileText,
  TrendingUp,
  FolderKanban,
  Calendar,
  Users,
  UsersRound,
  Inbox,
  Wallet,
  GraduationCap,
  FlaskConical,
  Building2,
  Shield,
  Trophy,
  UserPen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { INDIVIDUAL_ROLES, ORGANIZATION_ROLES, expandRoles, rolesOfTier } from '../../lib/permissions'
import type { UserRole } from '../../types'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

export interface DashboardTab {
  /** Route path relative to /dashboard; '' is the index route */
  to: string
  label: MessageDescriptor
  icon: LucideIcon
  description: MessageDescriptor
  /** Shown only if the member holds one of these roles. Absent = everyone. */
  roles?: UserRole[]
  /** Absolute link out of the dashboard rather than a tab panel */
  external?: boolean
}

export const DASHBOARD_TABS: DashboardTab[] = [
  { to: '', label: msg`Overview`, icon: LayoutDashboard, description: msg`Network, submissions, calendar` },
  // The member's public face: the profile editor (shared with Settings) plus
  // the profile lock (083). 'profile' was already taken by the CV tab below,
  // hence the longer slug.
  {
    to: 'my-profile',
    label: msg`My Profile`,
    icon: UserPen,
    description: msg`What others see, and who can see it`,
  },
  // Kept at 'profile' so existing /dashboard/profile links and bookmarks still
  // land somewhere; the panel is the full CV page — designs, downloads and
  // publishing included. /cv redirects here.
  //
  // People only. A résumé is a person's evidence of work; an investor or an
  // SME account has no version of it to write, and was being offered one
  // anyway because this entry was the only one in the list with no `roles`.
  // Businesses get the Business profile tab below instead. Admins are people
  // too, so the admin tier keeps the tab even in an admin operating context.
  {
    to: 'profile',
    label: msg`My CV`,
    icon: FileText,
    description: msg`Your résumé, ready to send`,
    roles: [...INDIVIDUAL_ROLES, ...rolesOfTier('admin')],
  },
  { to: 'progress', label: msg`Progress`, icon: TrendingUp, description: msg`Your activity timeline` },
  // A real panel, not a link out. The gallery renders in embedded mode (see
  // AchievementsTab); the old /achievements address redirects here.
  { to: 'achievements', label: msg`Achievements`, icon: Trophy, description: msg`Badges, points and rank` },
  { to: 'projects', label: msg`Projects`, icon: FolderKanban, description: msg`Projects you own` },
  { to: 'events', label: msg`Events`, icon: Calendar, description: msg`Events you organize` },
  { to: 'connections', label: msg`Connections`, icon: Users, description: msg`People you know` },
  { to: 'submissions', label: msg`Submissions`, icon: Inbox, description: msg`Your submitted copies` },

  // Role-gated. Panels are stubs for now — the gating is what's wired up.
  { to: 'funding', label: msg`Funding`, icon: Wallet, description: msg`Deal flow and applications`, roles: ['investor'] },
  { to: 'mentees', label: msg`Mentees`, icon: GraduationCap, description: msg`People you mentor`, roles: ['mentor', 'faculty'] },
  { to: 'research', label: msg`Research`, icon: FlaskConical, description: msg`Research and publications`, roles: ['faculty', 'researcher'] },
  // A real panel since the move in from /org/edit (which now redirects here).
  // Every organisation role, not just SMEs: an investor or an educational
  // partner has a profile and a body of work to show for exactly the same
  // reason a business does.
  { to: 'business', label: msg`Business profile`, icon: Building2, description: msg`Your organisation and its portfolio`, roles: ORGANIZATION_ROLES },
  // Migration 111 gave employer_members a readable policy and a backfilled
  // owner row, which is what finally made a roster screen possible. The
  // engagement switch lives here rather than on the Business tab, directly
  // above the people it governs.
  { to: 'team', label: msg`Team`, icon: UsersRound, description: msg`Who belongs to your organisation`, roles: ORGANIZATION_ROLES },
  { to: '/admin', label: msg`Admin`, icon: Shield, description: msg`Platform administration`, roles: ['oecs', 'super_admin', 'admin', 'safety_admin'], external: true },
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
  // Aliases resolved first, so a tab list can be written against the modern
  // slug alone. The Admin entry below still names 'oecs' explicitly for the
  // same reason 063 kept the slug alive, but new entries need not.
  const held = expandRoles(roles)
  // Never widen: the context must be a role the account actually holds.
  const effective = activeRole && held.includes(activeRole) ? [activeRole] : held
  return DASHBOARD_TABS.filter((tab) => !tab.roles || tab.roles.some((r) => effective.includes(r)))
}
