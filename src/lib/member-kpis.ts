import {
  CalendarCheck,
  CalendarPlus,
  FileCheck2,
  FilePlus2,
  FolderKanban,
  Heart,
  Inbox,
  MessageSquare,
  Reply,
  UserPlus,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ORGANIZATION_ROLES, expandRoles } from './permissions'
import type { UserRole } from '../types'
import type { MemberStats } from '../hooks/useMemberStats'
import type { AchievementStats } from '../types'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** Everything a tile can read, assembled by the host so descriptors stay pure. */
export interface KpiSource {
  stats?: MemberStats
  achievements?: AchievementStats
}

export interface KpiTile {
  key: string
  label: MessageDescriptor
  icon: LucideIcon
  /**
   * `null` means "no readable value" and the tile is dropped. Returning 0 is a
   * claim — that the member really has none — so only return it when the count
   * is trustworthy.
   */
  value: (source: KpiSource) => number | null
  /** Shown only if the member holds one of these roles. Absent = everyone. */
  roles?: UserRole[]
  /** Where the number came from, in a click */
  to?: string
}

/**
 * Role-specific tiles, in rail order.
 *
 * Roles share sets on purpose: an entrepreneur and a researcher build and
 * apply for the same things, a mentor and a member of faculty both answer
 * people. Where a role differs it differs for a structural reason, and the
 * reason is written down next to it.
 */
const ROLE_SPECIFIC: KpiTile[] = [
  // --- Leads --------------------------------------------------------------
  // First tile out of the filter becomes the 4x4 hero of the bento, so the
  // role-exclusive numbers come first: an investor's dashboard should open on
  // the grants they run, not on a project count they may never use. These are
  // gated to single roles, so they never displace anyone else's lead.
  {
    key: 'grants_posted',
    label: msg`Grants posted`,
    icon: Wallet,
    value: (s) => s.stats?.grants_posted ?? null,
    to: '/dashboard/funding',
    roles: ['investor'],
  },
  {
    key: 'sponsorships',
    label: msg`Sponsorships given`,
    icon: FileCheck2,
    value: (s) => s.stats?.sponsorships ?? null,
    roles: ['faculty', 'educational_partner'],
  },

  // --- Builders -----------------------------------------------------------
  {
    key: 'projects',
    label: msg`Projects created`,
    icon: FolderKanban,
    value: (s) => s.stats?.projects ?? null,
    to: '/dashboard/projects',
  },
  {
    key: 'applications',
    label: msg`Grant applications`,
    icon: FilePlus2,
    value: (s) => s.stats?.applications ?? null,
    to: '/dashboard/submissions',
    // Everyone but students. SAFEGUARD_DENY permanently withholds grant:apply
    // from student accounts, so this tile could only ever read 0 for them —
    // and a zero that can never move is a dead end, not a metric.
    roles: [
      'entrepreneur',
      'researcher',
      'mentor',
      'faculty',
      'sme',
      'private_sector',
      'educational_partner',
      'investor',
    ],
  },
  {
    key: 'likes',
    label: msg`Likes received`,
    icon: Heart,
    value: (s) => s.stats?.likes_received ?? null,
    roles: ['entrepreneur', 'researcher', 'student', 'sme', 'private_sector'],
  },
  {
    key: 'rsvps',
    label: msg`Events attended`,
    icon: CalendarCheck,
    value: (s) => s.stats?.rsvps ?? null,
    to: '/dashboard/events',
    roles: ['entrepreneur', 'researcher', 'student', 'mentor'],
  },

  // --- Student ------------------------------------------------------------
  // No grant or DM tiles above; forum activity is the surface a student can
  // actually move, and sponsorship is what unblocks the rest for them.
  {
    key: 'forum_posts',
    label: msg`Forum posts`,
    icon: MessageSquare,
    value: (s) => s.stats?.forum_posts ?? null,
    roles: ['student', 'chamber_admin'],
  },

  // --- Mentor / faculty ---------------------------------------------------
  {
    key: 'pending_requests',
    label: msg`Requests to answer`,
    icon: UserPlus,
    value: (s) => s.stats?.connections_pending ?? null,
    to: '/dashboard/connections',
    roles: ['mentor', 'faculty'],
  },
  {
    key: 'forum_replies',
    label: msg`Forum replies`,
    icon: Reply,
    value: (s) => s.stats?.forum_replies ?? null,
    roles: ['mentor', 'faculty'],
  },
  {
    key: 'events_organized',
    label: msg`Events organized`,
    icon: CalendarPlus,
    value: (s) => s.stats?.events_organized ?? null,
    to: '/dashboard/events',
    // Ungated: every role can create an event, and this is the tile that keeps
    // the common cases at six — a 4x4 lead with five around it
  },

  // --- Investor -----------------------------------------------------------
  {
    key: 'applications_received',
    label: msg`Applications received`,
    icon: Inbox,
    value: (s) => s.stats?.applications_received ?? null,
    to: '/dashboard/funding',
    // Reads null until get_my_member_stats() lands — RLS does not let the
    // browser count rows written by other people against your grants
    roles: ['investor'],
  },

  // --- Organizations ------------------------------------------------------
  // `resources` used to sit here. It is a chart-row card now — as a tile it was
  // the seventh in the faculty set, and seven 2x2s around a 4x4 lead cannot
  // close a rectangle.
  {
    key: 'forum_activity',
    label: msg`Forum replies`,
    icon: Reply,
    value: (s) => s.stats?.forum_replies ?? null,
    // chamber_admin is already in the organization tier, so it is covered
    roles: ORGANIZATION_ROLES,
  },

  // --- Admin tier ---------------------------------------------------------
  // Deliberately nothing. The admin dashboard already computes the queue
  // depths, and a second surface that could disagree with it is worse than one
  // surface — the Admin entry in the dashboard rail is the way through. Admins
  // keep the universal row, because an admin is a member too.
]

/**
 * Every tile is role-specific: the head of this list becomes the bento's 4x4
 * lead tile, and no number belongs to all of them.
 *
 * "Connections" used to be a universal tile at the tail. It is reached from the
 * rail and from the profile, and as the last tile it was the one left over when
 * a role's set did not divide into the bento — a filler slot for a number that
 * already had two homes.
 */
export const MEMBER_KPIS: KpiTile[] = ROLE_SPECIFIC

/**
 * Tiles this member can see, role-defining ones first.
 *
 * Same contract as `visibleDashboardTabs`: aliases expand before comparison
 * (a live account can hold 'oecs' and never 'super_admin'), and `activeRole`
 * narrows to one operating context without ever widening past what the account
 * actually holds.
 */
export function visibleKpis(
  roles: UserRole[] | undefined,
  activeRole?: UserRole | null
): KpiTile[] {
  const held = expandRoles(roles)
  const effective = activeRole && held.includes(activeRole) ? [activeRole] : held
  return MEMBER_KPIS.filter((tile) => !tile.roles || tile.roles.some((r) => effective.includes(r)))
}

/** Chart cards are gated the same way, by key. */
export type ChartKey = 'activity' | 'engagement' | 'pipeline' | 'rank' | 'resources'

const CHART_ROLES: Partial<Record<ChartKey, UserRole[]>> = {
  // A student has no application pipeline to draw — see SAFEGUARD_DENY above
  pipeline: [
    'entrepreneur',
    'researcher',
    'mentor',
    'faculty',
    'sme',
    'private_sector',
    'educational_partner',
    'investor',
  ],
  // The roles that publish to the resource library. A plain count rather than a
  // plot, but it rides in the chart row because the tile block packs in threes
  // and this is the number that broke the count for all four of them.
  resources: ['mentor', 'faculty', 'researcher', 'educational_partner'],
}

export function visibleCharts(
  roles: UserRole[] | undefined,
  activeRole?: UserRole | null
): ChartKey[] {
  const held = expandRoles(roles)
  const effective = activeRole && held.includes(activeRole) ? [activeRole] : held
  const all: ChartKey[] = ['activity', 'engagement', 'pipeline', 'rank', 'resources']
  return all.filter((key) => {
    const gate = CHART_ROLES[key]
    return !gate || gate.some((r) => effective.includes(r))
  })
}
