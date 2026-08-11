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
    slug: 'sme',
    label: msg`Verified SME`,
    tier: 'organization',
    description: msg`Business account vetted by its National Chamber of Commerce.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 40,
  },
  {
    slug: 'private_sector',
    label: msg`Private Sector`,
    tier: 'organization',
    description: msg`Unverified business account. Gains SME capabilities once a Chamber verifies it.`,
    selfAssignable: true,
    requiresVerification: false,
    sortOrder: 50,
  },
  {
    slug: 'educational_partner',
    label: msg`Educational Partner`,
    tier: 'organization',
    description: msg`School or university. Manages domain verification, approves student accounts, oversees submissions.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 60,
  },
  {
    slug: 'chamber_admin',
    label: msg`Chamber of Commerce`,
    tier: 'organization',
    description: msg`Country-level vetting authority that verifies and onboards local SMEs.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 70,
  },

  // The six ecosystem actors from Roadmap Table 3. All organisation-tier and
  // all review-gated: every one of them speaks for a body rather than a person,
  // and the claim to be that body is exactly what an administrator checks.
  //
  // `research_institution` is deliberately NOT "post-secondary institution":
  // schools and universities are already `educational_partner`, and a second
  // slug for the same thing would split the student-approval path in two. What
  // was missing is the research body that publishes and co-hosts without being
  // anyone's school.
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
    slug: 'bso',
    label: msg`Business Support Organization`,
    tier: 'organization',
    description: msg`Incubator, accelerator or MSME support agency. Mentors founders, hosts programmes, channels funding to its cohort.`,
    selfAssignable: false,
    requiresVerification: true,
    sortOrder: 73,
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
  community: 'Community',
  messaging: 'Messaging',
  verification: 'Verification',
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Platform
  { key: 'org:manage', label: msg`Manage platform`, description: msg`Global settings, policy and system configuration.`, category: 'platform', safeguard: false, sortOrder: 10 },
  { key: 'members:manage', label: msg`Manage members`, description: msg`Create, edit, suspend and delete user accounts.`, category: 'platform', safeguard: false, sortOrder: 20 },
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
  { key: 'forum:comment', label: msg`Reply & comment`, description: msg`Reply to forum posts and comment on projects.`, category: 'community', safeguard: false, sortOrder: 160 },
  { key: 'mentorship:offer', label: msg`Offer mentorship`, description: msg`Appear in mentor discovery and accept mentorship requests.`, category: 'community', safeguard: false, sortOrder: 170 },

  // Messaging
  { key: 'dm:initiate', label: msg`Start direct messages`, description: msg`Open a 1-to-1 conversation. Denied to students — they use supervised channels only.`, category: 'messaging', safeguard: true, sortOrder: 180 },
  { key: 'dm:receive', label: msg`Receive messages`, description: msg`Participate in conversations they have been added to.`, category: 'messaging', safeguard: false, sortOrder: 190 },
  { key: 'dm:supervise', label: msg`Supervise student channels`, description: msg`Counts as the designated educator that makes a student channel monitored.`, category: 'messaging', safeguard: true, sortOrder: 200 },

  // Verification
  { key: 'sme:verify', label: msg`Verify SMEs`, description: msg`Chamber of Commerce review of corporate registry data; issues Verified SME status.`, category: 'verification', safeguard: false, sortOrder: 210 },
  { key: 'institution:verify', label: msg`Verify institutions`, description: msg`Approve schools and chambers, and the email domains they own.`, category: 'verification', safeguard: false, sortOrder: 220 },
  { key: 'institution:approve_students', label: msg`Approve student accounts`, description: msg`Approve students registering on the institution’s verified email domain.`, category: 'verification', safeguard: true, sortOrder: 230 },
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
    'forum:comment',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  sme: [
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'forum:comment',
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
    'forum:comment',
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
    'forum:comment',
    'dm:initiate',
    'dm:receive',
    'dm:supervise',
  ],

  chamber_admin: [
    'sme:verify',
    'grant:view',
    'forum:post',
    'forum:comment',
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
    'forum:comment',
    'mentorship:offer',
    'dm:initiate',
    'dm:receive',
  ],

  // ngo's set plus sme:verify. An incubator already knows which of its cohort
  // are trading businesses — that is the whole content of its programme — so it
  // is a second competent verifier alongside the chambers.
  bso: [
    'grant:view',
    'grant:apply',
    'project:create',
    'project:manage',
    'event:create',
    'forum:post',
    'forum:comment',
    'mentorship:offer',
    'sme:verify',
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
    'forum:comment',
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
    'forum:comment',
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
    'forum:comment',
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
    'forum:comment',
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
