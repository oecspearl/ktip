// RBAC catalog — roles, permissions and the default permission matrix.
//
// This file is the source of truth for the *shape* of the model. The live
// matrix lives in the `role_permissions` table (migration 063) so admins can
// toggle it from /admin/roles; the seed in that migration mirrors
// DEFAULT_ROLE_PERMISSIONS below, and "Reset to defaults" writes it back.
//
// Authorization decisions are made in SQL by has_permission(user, key). Nothing
// here is a security boundary — client checks only decide what to render.

import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { PermissionKey, RoleSlug, RoleTier } from '../types'

// ============================================================
// Roles
// ============================================================

/**
 * Legacy slugs kept working by mapping onto their modern equivalent.
 * `oecs` predates the tiered hierarchy and is stored on live profiles, so it
 * resolves to super_admin rather than being renamed — that keeps the ~60
 * existing `'oecs' = ANY(roles)` RLS clauses correct and untouched.
 */
export const ROLE_ALIASES: Partial<Record<RoleSlug, RoleSlug>> = {
  oecs: 'super_admin',
}

export interface RoleDefinition {
  slug: RoleSlug
  label: MessageDescriptor
  tier: RoleTier
  description: MessageDescriptor
  /** Users may add this role to themselves during onboarding. */
  selfAssignable: boolean
  /** Granted only after institution / chamber / admin review. */
  requiresVerification: boolean
  /**
   * Holders must enrol a second factor before reaching the app (118).
   *
   * A compiled mirror of role_definitions.requires_mfa, and never authoritative:
   * the DB column is the switch, this exists so the signup and onboarding paths
   * can route without waiting on a round trip. If the two disagree the member
   * lands on the dashboard and ProtectedRoute bounces them — a flash, never a
   * bypass.
   */
  requiresMfa?: boolean
  /** Hidden from the matrix — resolves to another role. */
  aliasOf?: RoleSlug
  sortOrder: number
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  // Tier 1 — Admin
  {
    slug: 'super_admin',
    label: msg`Super Admin`,
    tier: 'admin',
    description: msg`OECS Secretariat. System-wide management, global policy, audit logs, suspensions.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 10,
  },
  // The Admin seat (124). Everything super_admin holds — every key, every
  // console page, every is_platform_admin() policy — and full charge of the
  // roles under the seat: supervisors, the safety admin, members. The
  // difference is not in this catalog or in the matrix at all: an Admin cannot
  // act ON another seat holder (super_admin or admin) — suspend, delete,
  // re-password, re-role — and cannot hand a seat to anyone. That ceiling is a
  // role test in SQL (is_super_admin()) and is mirrored here by
  // holdsSuperAdmin() / holdsAdminSeat() for rendering only.
  {
    slug: 'admin',
    label: msg`Admin`,
    tier: 'admin',
    description: msg`Runs the platform day to day. Every permission, every console page, and full charge of supervisors and members. Cannot suspend, delete or re-role another Admin — that stays with the Super Admin.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 11,
  },
  // The two supervisor seats. Same tier as each other, deliberately: neither
  // reports to the other, and the split is by subject matter rather than by
  // seniority. What keeps them apart is that their domain keys are disjoint —
  // rbac-parity.test.ts fails if anyone widens one into the other's territory.
  //
  // Neither holds org:manage, members:manage or role:manage. Assigning roles and
  // editing this matrix stays with super_admin alone, so a supervisor cannot
  // promote themselves and cannot promote each other.
  {
    slug: 'people_supervisor',
    label: msg`People & Trust Supervisor (Marvin)`,
    tier: 'admin',
    description: msg`Owns who people are and how they behave: member records (read-only), verification, institutions, chamber review, moderation and grievances.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 12,
  },
  {
    slug: 'programme_supervisor',
    label: msg`Programmes Supervisor (Royston)`,
    tier: 'admin',
    description: msg`Owns what the platform publishes: projects, grants, forums, resources, achievements and employers. Events and the venue stay with the Super Admin.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 14,
  },
  {
    slug: 'safety_admin',
    label: msg`Safety Admin`,
    tier: 'admin',
    description: msg`Content moderator. Owns flagged-content queues, automated moderation logs and escalations.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 20,
  },
  {
    slug: 'oecs',
    label: msg`OECS Admin (legacy)`,
    tier: 'admin',
    description: msg`Legacy admin slug. Resolves to Super Admin.`,
    selfAssignable: false,
    requiresVerification: true,
    aliasOf: 'super_admin',
    sortOrder: 25,
  },

  // Tier 2 — Organization
  {
    slug: 'investor',
    label: msg`Investor / Funding Agency`,
    tier: 'organization',
    description: msg`Posts grant opportunities, views vetted projects, connects with regional innovators.`,
    selfAssignable: true,
    requiresVerification: false,
    sortOrder: 30,
  },
  {
    slug: 'private_sector',
    label: msg`Private Sector`,
    tier: 'organization',
    description: msg`Business account. A Chamber of Commerce can verify the business, which marks the owner verified.`,
    selfAssignable: true,
    requiresVerification: false,
    sortOrder: 50,
  },
  {
    slug: 'educational_partner',
    label: msg`Post-Secondary Institution`,
    tier: 'organization',
    description: msg`College, university or other post-secondary institution. Manages domain verification, approves student accounts, oversees submissions.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 60,
  },
  {
    slug: 'chamber_admin',
    label: msg`Business Support Organisation`,
    tier: 'organization',
    description: msg`Business support organisation — a chamber of commerce, incubator, accelerator or MSME agency — that verifies local businesses and supports the cohort it works with.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 70,
  },

  // The ecosystem actors from Roadmap Table 3. All organisation-tier and all
  // review-gated: every one of them speaks for a body rather than a person, and
  // the claim to be that body is exactly what an administrator checks.
  //
  // `research_institution` is deliberately NOT the post-secondary slug —
  // `educational_partner` carries that label, and a second slug for the same
  // institution would split the student-approval path in two. What was missing
  // is the research body that publishes and co-hosts without being anyone's
  // school.
  //
  // `bso` was one of these until 125 folded it into `chamber_admin`: an
  // incubator and a chamber vet the same businesses, and two slugs for it split
  // the verifier list without splitting the duty.
  {
    slug: 'ngo',
    label: msg`Non-Governmental Organization`,
    tier: 'organization',
    description: msg`Civil-society organisation delivering programmes. Runs projects and events, applies for funding, contributes knowledge.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 72,
  },
  {
    slug: 'research_institution',
    label: msg`Research Institution`,
    tier: 'organization',
    description: msg`Research body and academic partner. Publishes knowledge, co-hosts events, sponsors and supervises the students attached to its programmes.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 74,
  },
  {
    slug: 'government',
    label: msg`Government Ministry / Agency`,
    tier: 'organization',
    description: msg`Policy enabler and programme administrator. Publishes public funding calls, administers awards, verifies institutions and businesses.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 75,
  },
  {
    slug: 'diaspora',
    label: msg`Diaspora Association / Network`,
    tier: 'organization',
    description: msg`Reconnects overseas expertise with the home market. Mentors, funds, judges challenges and connects talent.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 76,
  },
  {
    slug: 'igo',
    label: msg`Inter-governmental Regional Organization`,
    tier: 'organization',
    description: msg`Regional body such as the OECS Commission. Strategic partner and ecosystem facilitator; funds and convenes without administering the platform.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 77,
  },

  // Tier 3 — Individual
  {
    slug: 'entrepreneur',
    label: msg`Entrepreneur`,
    tier: 'individual',
    description: msg`Builds and launches innovations, applies for grants.`,
    selfAssignable: true,
    requiresVerification: false,
    // The only role with this on at 118. It is self-assignable and it applies
    // for money, which is exactly the pair that makes a throwaway account worth
    // somebody's time.
    requiresMfa: true,
    sortOrder: 80,
  },
  {
    slug: 'faculty',
    label: msg`Faculty`,
    tier: 'individual',
    description: msg`Academic staff. May sponsor student grant applications and supervise student channels.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 90,
  },
  {
    slug: 'researcher',
    label: msg`Researcher`,
    tier: 'individual',
    description: msg`Conducts and publishes research, collaborates on projects.`,
    selfAssignable: true,
    requiresVerification: false,
    sortOrder: 100,
  },
  {
    slug: 'mentor',
    label: msg`Mentor`,
    tier: 'individual',
    description: msg`Guides and supports innovators.`,
    selfAssignable: true,
    requiresVerification: false,
    sortOrder: 110,
  },
  {
    slug: 'student',
    label: msg`Student (school-verified)`,
    tier: 'individual',
    description:
      msg`Verified via an approved institutional email domain. Read-only on grants, no unmonitored direct messaging.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 120,
  },
]

export const ROLE_BY_SLUG: Record<string, RoleDefinition> = Object.fromEntries(
  ROLE_DEFINITIONS.map((r) => [r.slug, r])
)

/** Roles that own a column in the permission matrix (aliases collapse away). */
export const MATRIX_ROLES: RoleDefinition[] = ROLE_DEFINITIONS.filter((r) => !r.aliasOf)

export const TIER_LABELS: Record<RoleTier, string> = {
  admin: 'Admin',
  organization: 'Organization',
  individual: 'Individual',
}

/** Every role of a tier, aliases collapsed. */
export function rolesOfTier(tier: RoleTier): RoleSlug[] {
  return ROLE_DEFINITIONS.filter((r) => r.tier === tier).map((r) => r.slug)
}

export const ORGANIZATION_ROLES = rolesOfTier('organization')
export const INDIVIDUAL_ROLES = rolesOfTier('individual')
export const ADMIN_TIER_ROLES = rolesOfTier('admin')

/**
 * The two SEATS (migration 124): the accounts the Super Admin ceiling protects.
 *
 * Narrower than the admin tier on purpose. Supervisors and the safety admin sit
 * under the Admin and are the Admin's to manage — roles, passwords, second
 * factors, suspension, deletion. What an Admin cannot do is act on another
 * seat holder, or hand a seat to anyone. Mirrors seat_roles() in SQL; a third
 * seat is a deliberate edit in both places.
 */
export const ADMIN_SEAT_ROLES: RoleSlug[] = ['super_admin', 'admin']

/**
 * The Super Admin ceiling (migration 124), for rendering.
 *
 * Both administrators hold every permission, so `can()` cannot tell them apart
 * — and must not: a matrix key for "may act on an administrator" would be one
 * toggle away from being granted by the Admin, to the Admin. The ceiling is a
 * role test, is_super_admin() in SQL, and these are its client mirrors. Rendering
 * only: set_user_roles(), set_user_suspension(), the profile guard and
 * can_administer_account() enforce it whatever the screen shows.
 */
export function holdsSuperAdmin(roles: readonly string[] | null | undefined): boolean {
  return expandRoles(roles).includes('super_admin')
}

/** Either seat, aliases resolved (oecs → super_admin). */
export function holdsAdminSeat(roles: readonly string[] | null | undefined): boolean {
  return expandRoles(roles).some((slug) => ADMIN_SEAT_ROLES.includes(slug))
}

/**
 * May an account holding `actorRoles` suspend, delete, re-password or re-role
 * the account holding `targetRoles`? Mirrors can_administer_account(): a Super
 * Admin may act on anyone but themselves; anyone else only on accounts holding
 * no seat. Pass `isSelf` for the self-exclusion.
 */
export function canAdministerAccount(
  actorRoles: readonly string[] | null | undefined,
  targetRoles: readonly string[] | null | undefined,
  isSelf = false
): boolean {
  if (isSelf) return false
  return holdsSuperAdmin(actorRoles) || !holdsAdminSeat(targetRoles)
}

/**
 * The roles an account holding `actorRoles` may hand out or take away. The two
 * seats are the Super Admin's to grant; everything else, supervisors and the
 * safety admin included, is the Admin's (124, narrowing 116).
 */
export function assignableRolesFor(actorRoles: readonly string[] | null | undefined): RoleDefinition[] {
  const superAdmin = holdsSuperAdmin(actorRoles)
  return MATRIX_ROLES.filter((r) => superAdmin || !ADMIN_SEAT_ROLES.includes(r.slug))
}

/**
 * Does this account act as an organisation rather than a person?
 *
 * The distinction is what decides between a CV and a business profile: a
 * résumé is a person's evidence of work, and there is no version of it that
 * makes sense for a company. An account holding both (a founder who is also a
 * mentor) keeps the CV — only a purely organisational account loses it.
 */
export function isOrganizationAccount(roles: RoleSlug[] | undefined): boolean {
  const held = roles || []
  if (held.length === 0) return false
  const org = new Set<string>(ORGANIZATION_ROLES)
  const individual = new Set<string>(INDIVIDUAL_ROLES)
  return held.some((r) => org.has(r)) && !held.some((r) => individual.has(r))
}

/**
 * Per-resource roles that already exist on other tables (project_members,
 * institution_members, employer_members). They are scoped to a single record,
 * not to the platform, so they are shown in the matrix for reference but are
 * not part of role_permissions.
 */
export const SCOPED_ROLES = [
  { slug: 'project_editor', label: msg`Project Editor`, scope: 'PROJECT', source: 'project_members.role' },
  { slug: 'project_viewer', label: msg`Project Viewer`, scope: 'PROJECT', source: 'project_members.role' },
  { slug: 'institution_educator', label: msg`Educator`, scope: 'INSTITUTION', source: 'institution_members.role' },
  { slug: 'employer_recruiter', label: msg`Recruiter`, scope: 'EMPLOYER', source: 'employer_members.role' },
] as const

// ============================================================
// Permissions
// ============================================================

export type PermissionCategory =
  | 'platform'
  | 'moderation'
  | 'grants'
  | 'projects'
  | 'content'
  | 'community'
  | 'messaging'
  | 'verification'

export interface PermissionDefinition {
  key: PermissionKey
  label: MessageDescriptor
  description: MessageDescriptor
  category: PermissionCategory
  /**
   * Child-safety permission. has_permission() denies these to students before
   * consulting the matrix, so the toggle is locked in the admin UI and a direct
   * write to role_permissions still cannot grant them.
   */
  safeguard: boolean
  sortOrder: number
}

export const PERMISSION_CATEGORY_LABELS: Record<PermissionCategory, string> = {
  platform: 'Platform',
  moderation: 'Moderation & Safety',
  grants: 'Grants & Funding',
  projects: 'Projects',
  content: 'Content & Programmes',
  community: 'Community',
  messaging: 'Messaging',
  verification: 'Verification',
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Platform
  { key: 'org:manage', label: msg`Manage platform`, description: msg`Global settings, policy and system configuration.`, category: 'platform', safeguard: false, sortOrder: 10 },
  { key: 'members:manage', label: msg`Manage members`, description: msg`Create, edit, suspend and delete user accounts.`, category: 'platform', safeguard: false, sortOrder: 20 },
  // Read without write. /admin/users is the one console page two people share:
  // the People supervisor needs the member list to do verification and
  // moderation work, and creating or deleting an account is a different act.
  { key: 'members:view', label: msg`View members`, description: msg`Read the member list and account state, without creating, deleting or resetting anyone.`, category: 'platform', safeguard: false, sortOrder: 25 },
  { key: 'role:manage', label: msg`Manage roles & permissions`, description: msg`Assign roles and edit this permission matrix.`, category: 'platform', safeguard: false, sortOrder: 30 },
  { key: 'audit:view', label: msg`View audit logs`, description: msg`Read permission-change and moderation audit trails.`, category: 'platform', safeguard: false, sortOrder: 40 },

  // Moderation
  { key: 'moderation:view', label: msg`View moderation queue`, description: msg`See reported and auto-flagged content, including quarantined items.`, category: 'moderation', safeguard: true, sortOrder: 50 },
  { key: 'moderation:action', label: msg`Action moderation items`, description: msg`Quarantine, restore or remove content and issue warnings.`, category: 'moderation', safeguard: true, sortOrder: 60 },
  { key: 'moderation:escalate', label: msg`Escalate & suspend`, description: msg`Suspend accounts and escalate to safety admins and school administrators.`, category: 'moderation', safeguard: true, sortOrder: 70 },

  // Grants
  { key: 'grant:view', label: msg`View grants`, description: msg`Browse public grant opportunities.`, category: 'grants', safeguard: false, sortOrder: 80 },
  { key: 'grant:apply', label: msg`Apply for grants`, description: msg`Submit grant applications.`, category: 'grants', safeguard: false, sortOrder: 90 },
  { key: 'grant:sponsor', label: msg`Sponsor student applications`, description: msg`Act as the faculty or school sponsor on a student application.`, category: 'grants', safeguard: true, sortOrder: 100 },
  { key: 'grant:post', label: msg`Post grant opportunities`, description: msg`Publish funding calls to the platform.`, category: 'grants', safeguard: false, sortOrder: 110 },
  { key: 'grant:manage_funds', label: msg`Manage funds`, description: msg`Administer disbursement and award records. Never available to students.`, category: 'grants', safeguard: true, sortOrder: 120 },

  // Projects
  { key: 'project:create', label: msg`Create projects`, description: msg`Publish a new project.`, category: 'projects', safeguard: false, sortOrder: 130 },
  { key: 'project:manage', label: msg`Manage own projects`, description: msg`Edit, archive and manage collaborators on owned projects.`, category: 'projects', safeguard: false, sortOrder: 140 },
  { key: 'event:create', label: msg`Create events`, description: msg`Publish an event, including hackathons and challenges, and open registrations.`, category: 'projects', safeguard: false, sortOrder: 145 },

  // Community
  { key: 'forum:post', label: msg`Create forum posts`, description: msg`Start discussions on forum boards.`, category: 'community', safeguard: false, sortOrder: 150 },
  // 129. Distinct from forum:post because a board is a section of the platform
  // rather than a message in one, and distinct from forum:manage because that
  // key moderates what exists rather than adding to it.
  { key: 'forum:board', label: msg`Create discussion boards`, description: msg`Open a new forum board and edit or retire the ones you opened.`, category: 'community', safeguard: false, sortOrder: 155 },
  { key: 'forum:comment', label: msg`Reply & comment`, description: msg`Reply to forum posts and comment on projects.`, category: 'community', safeguard: false, sortOrder: 160 },
  { key: 'mentorship:offer', label: msg`Offer mentorship`, description: msg`Appear in mentor discovery and accept mentorship requests.`, category: 'community', safeguard: false, sortOrder: 170 },
  // 135. Contributing to the library is a participant act, so it lives here
  // rather than in 'content' — that category is the domain keys carved out of
  // org:manage. resource:manage stays the reviewer's key; this one only ever
  // produces a row waiting in the queue.
  { key: 'resource:submit', label: msg`Submit resources`, description: msg`Contribute a guide, template or case study to the resource library. Published after review.`, category: 'community', safeguard: false, sortOrder: 175 },

  // Messaging
  { key: 'dm:initiate', label: msg`Start direct messages`, description: msg`Open a 1-to-1 conversation. Denied to students — they use supervised channels only.`, category: 'messaging', safeguard: true, sortOrder: 180 },
  { key: 'dm:receive', label: msg`Receive messages`, description: msg`Participate in conversations they have been added to.`, category: 'messaging', safeguard: false, sortOrder: 190 },
  { key: 'dm:supervise', label: msg`Supervise student channels`, description: msg`Counts as the designated educator that makes a student channel monitored.`, category: 'messaging', safeguard: true, sortOrder: 200 },

  // Verification
  { key: 'sme:verify', label: msg`Verify SMEs`, description: msg`Chamber or BSO review of corporate registry data; marks the business owner verified.`, category: 'verification', safeguard: false, sortOrder: 210 },
  { key: 'institution:verify', label: msg`Verify institutions`, description: msg`Approve schools and chambers, and the email domains they own.`, category: 'verification', safeguard: false, sortOrder: 220 },
  { key: 'institution:approve_students', label: msg`Approve student accounts`, description: msg`Approve students registering on the institution’s verified email domain.`, category: 'verification', safeguard: true, sortOrder: 230 },
  { key: 'verification:review', label: msg`Review verification requests`, description: msg`Work the /admin/verification queue and set a member’s verified badge.`, category: 'verification', safeguard: false, sortOrder: 235 },

  // Content & Programmes — the domain keys carved out of org:manage in
  // migration 116.
  //
  // org:manage was a single bit standing behind fifteen of the twenty-two admin
  // pages, so there was no way to hand someone Grants without also handing them
  // the Error Simulator. Each key below is one console page plus the RLS
  // policies that page writes through; org:manage survives as the residual
  // operator key (analytics, UAT, feedback, integrations, partner API, errors).
  //
  // event:manage is defined even though only super_admin holds it. That is the
  // point: the events and venue policies stop naming `super_admin` directly, so
  // delegating them later is one toggle at /admin/roles rather than another
  // migration.
  { key: 'project:manage_all', label: msg`Administer all projects`, description: msg`Edit, feature, archive and delete any project, not only owned ones.`, category: 'content', safeguard: false, sortOrder: 240 },
  { key: 'event:manage', label: msg`Administer all events`, description: msg`Edit any event and its venue, schedule, speakers, articles and registrations.`, category: 'content', safeguard: false, sortOrder: 245 },
  { key: 'grant:manage', label: msg`Administer grants`, description: msg`Edit any funding call and review, decide and audit the applications to it.`, category: 'content', safeguard: false, sortOrder: 250 },
  { key: 'forum:manage', label: msg`Administer forums`, description: msg`Edit, pin and remove any post or reply on any board.`, category: 'content', safeguard: false, sortOrder: 255 },
  { key: 'resource:manage', label: msg`Administer resources`, description: msg`Publish, edit and withdraw resource-library entries.`, category: 'content', safeguard: false, sortOrder: 260 },
  { key: 'achievement:manage', label: msg`Administer achievements`, description: msg`Define badges and trophies and award or revoke them.`, category: 'content', safeguard: false, sortOrder: 265 },
  { key: 'employer:manage', label: msg`Administer employers`, description: msg`Create, verify and edit employer organisations and their member lists.`, category: 'content', safeguard: false, sortOrder: 270 },
]

export const PERMISSION_BY_KEY: Record<string, PermissionDefinition> = Object.fromEntries(
  PERMISSION_DEFINITIONS.map((p) => [p.key, p])
)

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_DEFINITIONS.map((p) => p.key)

// ============================================================
// Default matrix
// ============================================================

/**
 * Seed state for `role_permissions`. Anything not listed defaults to denied.
 * Alias roles are omitted — they resolve to their target before lookup.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  super_admin: ALL_PERMISSION_KEYS,
  // Deliberately identical. See the catalog entry: the seats differ in the
  // ceiling, not in the matrix, and rbac-parity.test.ts asserts they match.
  admin: ALL_PERMISSION_KEYS,

  // The two supervisors. Each holds their own domain keys, plus the ordinary
  // participant bundle so they can create a project, apply for a grant or post
  // to a board like any other member — which is what makes the cross-checking
  // in docs/QA-RELAY-SESSION.md possible without a second account each.
  //
  // What neither holds: org:manage, members:manage, role:manage, and each
  // other's domain keys.

  people_supervisor: [
    'members:view',
    'audit:view',
    'moderation:view',
    'moderation:action',
    'moderation:escalate',
    'sme:verify',
    'institution:verify',
    'institution:approve_students',
    'verification:review',
    // participant bundle
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
    'dm:supervise',
  ],

  // grant:manage_funds rides with grant:manage: the person deciding an
  // application is the person recording the award, and splitting those across
  // two seats would only mean every decision waits on someone else.
  programme_supervisor: [
    'project:manage_all',
    'grant:manage',
    'grant:post',
    'grant:manage_funds',
    'forum:manage',
    'resource:manage',
    'achievement:manage',
    'employer:manage',
    // participant bundle
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  // The verification keys are here because a safety admin is the first-line
  // receipt for every complaint, and a complaint about a body claiming to be a
  // school or a chamber-verified business is answered by looking at that claim.
  safety_admin: [
    'audit:view',
    'moderation:view',
    'moderation:action',
    'moderation:escalate',
    'grant:view',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'dm:initiate',
    'dm:receive',
    'dm:supervise',
    'sme:verify',
    'institution:verify',
    'institution:approve_students',
  ],

  investor: [
    'grant:view',
    'grant:post',
    'grant:manage_funds',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  private_sector: [
    'grant:view',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  educational_partner: [
    'institution:approve_students',
    'grant:view',
    'grant:apply',
    'grant:sponsor',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'dm:initiate',
    'dm:receive',
    'dm:supervise',
  ],

  // Chamber of Commerce / BSO. One column since 125: the incubator and the
  // chamber both vet local businesses, and holding two slugs for that split the
  // verifier list without ever splitting the duty. The union of the two old
  // sets, so a migrated BSO keeps the projects and events it was running.
  chamber_admin: [
    'sme:verify',
    'grant:view',
    'grant:apply',
    'grant:post',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  // --- Roadmap Table 3 organisations -------------------------------------
  // None of the six carries org:manage, members:manage or role:manage. They
  // are participants in the ecosystem, not administrators of the platform —
  // igo in particular, whose real-world referent (the OECS Commission) also
  // staffs super_admin. Keeping those two apart is the point: the Commission
  // acting as a funder is not the Commission acting as the Secretariat.

  // Delivery organisations: they run the programme rather than fund it, so
  // they apply for money and never post it.
  ngo: [
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  // educational_partner's set. A research institution takes on students the
  // same way a university does — under its own domain, sponsoring their
  // applications and supervising their channels — so it needs the same three
  // keys, and it is those keys that make the role worth having separately.
  research_institution: [
    'institution:approve_students',
    'grant:view',
    'grant:apply',
    'grant:sponsor',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'dm:initiate',
    'dm:receive',
    'dm:supervise',
  ],

  // Funders and programme administrators: investor's grant keys plus the
  // ability to run projects and events. government verifies both institutions
  // and businesses because in most member states it is the registry of record.
  government: [
    'grant:view',
    'grant:post',
    'grant:manage_funds',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'sme:verify',
    'institution:verify',
    'dm:initiate',
    'dm:receive',
  ],

  diaspora: [
    'grant:view',
    'grant:post',
    'grant:manage_funds',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'mentorship:offer',
    'institution:verify',
    'dm:initiate',
    'dm:receive',
  ],

  // No audit:view. Reading the platform's moderation and permission trails is
  // an operator's power, and it is the one thing that would collapse igo back
  // into super_admin.
  igo: [
    'grant:view',
    'grant:post',
    'grant:manage_funds',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'forum:board',
    'mentorship:offer',
    'institution:verify',
    'dm:initiate',
    'dm:receive',
  ],

  entrepreneur: [
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  faculty: [
    'institution:approve_students',
    'grant:view',
    'grant:apply',
    'grant:sponsor',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
    'dm:supervise',
  ],

  researcher: [
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  // The full grant set. A mentor is frequently the person running a small fund
  // or a prize alongside the mentoring, and splitting those across two accounts
  // was the only thing the narrower set achieved.
  mentor: [
    'grant:view',
    'grant:apply',
    'grant:post',
    'grant:manage_funds',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  // No DM initiation — see SAFEGUARD_DENY, which is still the boundary for
  // messaging. Grants are no longer part of it: students apply for their own
  // funding, with a faculty endorsement available but not required.
  student: [
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'resource:submit',
    'forum:comment',
    'dm:receive',
  ],
}

/**
 * Hard denials enforced inside has_permission() before the matrix is read.
 * Mirrored in migration 063 — an admin cannot toggle these on, and a direct
 * UPDATE on role_permissions does not grant them either.
 *
 * `grant:apply` was on this list until migration 110. It was removed
 * deliberately: students now submit their own applications, and the sponsor
 * handshake in 064 became an optional endorsement rather than a precondition.
 * What remains here is the messaging boundary and the money boundary — a
 * student can ask for funding but never administer it.
 */
export const SAFEGUARD_DENY: Record<string, PermissionKey[]> = {
  student: ['dm:initiate', 'grant:manage_funds', 'moderation:action', 'moderation:escalate'],
}

// ============================================================
// The admin console
// ============================================================

/**
 * Holding any one of these opens /admin.
 *
 * It exists because the gate was previously spelled out as
 * `can('org:manage') || can('moderation:view')` in five separate files, and
 * splitting org:manage into domain keys made every one of those expressions
 * wrong in the same way: a Programmes supervisor holds neither key and would
 * have been locked out of the console that is entirely theirs.
 *
 * This is an admission gate, not an authorization. What a console-holder can
 * actually see is decided per page by AdminLayout's `requires` and the
 * PermissionRoute around each route; what they can actually write is decided in
 * SQL.
 *
 * `sme:verify` and `institution:verify` are deliberately NOT here, even though
 * two console pages require them. Chambers, BSOs, governments, diaspora bodies
 * and IGOs all hold one or the other — they vet the members they are competent
 * to vet — and listing them would hand five organisation roles the admin
 * console. Everyone who should reach /admin/chamber or /admin/institutions is
 * admitted by another key on this list.
 */
export const ADMIN_CONSOLE_KEYS: PermissionKey[] = [
  'org:manage',
  'members:view',
  'members:manage',
  'role:manage',
  'moderation:view',
  'verification:review',
  'project:manage_all',
  'event:manage',
  'grant:manage',
  'forum:manage',
  'resource:manage',
  'achievement:manage',
  'employer:manage',
]

/** True when this permission set should be shown the admin console at all. */
export function opensAdminConsole(can: (permission: PermissionKey) => boolean): boolean {
  return ADMIN_CONSOLE_KEYS.some(can)
}

/**
 * The keys that define each supervisor seat, excluding the participant bundle
 * both of them carry. These two lists must stay disjoint — that is the whole
 * content of the three-way split, and rbac-parity.test.ts fails if they overlap.
 */
export const SUPERVISOR_DOMAIN_KEYS: Record<string, PermissionKey[]> = {
  people_supervisor: [
    'members:view',
    'audit:view',
    'moderation:view',
    'moderation:action',
    'moderation:escalate',
    'sme:verify',
    'institution:verify',
    'institution:approve_students',
    'verification:review',
  ],
  programme_supervisor: [
    'project:manage_all',
    'grant:manage',
    'grant:post',
    'grant:manage_funds',
    'forum:manage',
    'resource:manage',
    'achievement:manage',
    'employer:manage',
  ],
}

// ============================================================
// Client-side helpers (rendering only — SQL is authoritative)
// ============================================================

/** Resolve legacy slugs onto their modern equivalent, preserving order. */
export function expandRoles(roles: readonly string[] | null | undefined): RoleSlug[] {
  if (!roles?.length) return []
  const out = new Set<RoleSlug>()
  for (const role of roles) {
    const slug = role as RoleSlug
    out.add(slug)
    const alias = ROLE_ALIASES[slug]
    if (alias) out.add(alias)
  }
  return [...out]
}

/**
 * Does this role demand a second factor (118)?
 *
 * Rendering and routing only. role_definitions.requires_mfa is the switch, and
 * account_mfa_satisfied() is what actually refuses a write. Unknown slugs return
 * false rather than throwing: this is called with whatever the role picker held,
 * and a typo must not take the signup form down.
 */
export function roleRequiresMfa(role: string | null | undefined): boolean {
  if (!role) return false
  return expandRoles([role]).some(
    (slug) => ROLE_DEFINITIONS.find((definition) => definition.slug === slug)?.requiresMfa === true,
  )
}

/** True when any role in the set demands a second factor. */
export function rolesRequireMfa(roles: readonly string[] | null | undefined): boolean {
  return expandRoles(roles).some((slug) => roleRequiresMfa(slug))
}

/** True when the permission is permanently denied to any of these roles. */
export function isSafeguardDenied(roles: readonly string[], permission: PermissionKey): boolean {
  return roles.some((role) => SAFEGUARD_DENY[role]?.includes(permission))
}

/** True when the matrix cell for (role, permission) must render locked. */
export function isCellLocked(role: string, permission: PermissionKey): boolean {
  if (role === 'super_admin') return true
  return SAFEGUARD_DENY[role]?.includes(permission) ?? false
}

/**
 * Permissions implied by a role set under the default matrix. Used as the
 * fallback when the live matrix has not loaded yet; the authoritative value
 * comes from the get_my_permissions() RPC.
 */
export function defaultPermissionsFor(roles: readonly string[] | null | undefined): Set<PermissionKey> {
  const out = new Set<PermissionKey>()
  const expanded = expandRoles(roles)
  for (const role of expanded) {
    for (const key of DEFAULT_ROLE_PERMISSIONS[role] ?? []) {
      if (!isSafeguardDenied(expanded, key)) out.add(key)
    }
  }
  // A safeguard denial on any held role wins over a grant from another role.
  for (const key of out) {
    if (isSafeguardDenied(expanded, key)) out.delete(key)
  }
  return out
}
