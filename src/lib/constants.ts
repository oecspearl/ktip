// Application Constants

import { ROLE_DEFINITIONS } from './permissions'

export const APP_NAME = 'KTIP'
export const APP_FULL_NAME = 'Knowledge, Technology and Innovation Platform'
export const APP_DESCRIPTION = 'Caribbean innovation and collaboration platform'

// User Roles
export const USER_ROLES = {
  STUDENT: 'student',
  MENTOR: 'mentor',
  INVESTOR: 'investor',
  ENTREPRENEUR: 'entrepreneur',
  PRIVATE_SECTOR: 'private_sector',
  FACULTY: 'faculty',
  OECS: 'oecs',
} as const

// The seven original roles keep their hand-written labels — they are the ones
// already on live profile cards, and "Student/Youth Innovator" is the platform's
// own language for the audience rather than a description of the permission.
// The six added by 063 fall back to the catalog, so a member holding one is
// never rendered as a bare slug.
const LEGACY_ROLE_LABELS: Record<string, string> = {
  student: 'Student/Youth Innovator',
  mentor: 'Mentor',
  investor: 'Investor/Funding Agency',
  entrepreneur: 'Entrepreneur',
  private_sector: 'Private Sector/SME',
  faculty: 'Faculty/Researcher',
  oecs: 'OECS Admin',
}

export const ROLE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ROLE_DEFINITIONS.map((r) => [r.slug, r.label])),
  ...LEGACY_ROLE_LABELS,
}

/**
 * Roles worth offering as a filter on the public member directory.
 *
 * Admin-tier slugs are excluded deliberately. Letting a visitor list the
 * platform's administrators is a reconnaissance affordance, not a browsing one,
 * and nobody looking for a collaborator filters by "Safety Admin".
 */
export const DIRECTORY_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_DEFINITIONS.filter((r) => r.tier !== 'admin').map((r) => [
    r.slug,
    ROLE_LABELS[r.slug] ?? r.label,
  ])
)

export const ROLE_COLORS: Record<string, string> = {
  student: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  mentor: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  investor: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  entrepreneur: 'bg-ktip-ocean-50 text-ktip-ocean-600 border-ktip-ocean-100',
  private_sector: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
  faculty: 'bg-ktip-tropical-50 text-ktip-tropical-800 border-ktip-tropical-100',
  oecs: 'bg-brand-navy text-white border-brand-navy',
}

/**
 * Roles offered on the "I am a..." grid at signup and onboarding.
 *
 * `requiresVerification` is the important column. Student and Faculty are NOT
 * self-assignable: role_definitions marks them verification-gated, and the 063
 * guard triggers enforce that — an INSERT silently strips them and an UPDATE
 * raises. They stayed on this grid anyway, which meant anyone picking either
 * one created an account that could never finish onboarding: stripped to no
 * roles, bounced back here by ProtectedRoute, and rejected again on save.
 *
 * They are still offered, because "I am a student" is the truthful answer for
 * a large part of the intended audience and hiding it would be worse. Picking
 * one now routes into school verification instead of writing the role. See
 * RolePicker and OnboardingPage.
 */
export const SELECTABLE_ROLES = [
  { value: USER_ROLES.ENTREPRENEUR, label: ROLE_LABELS.entrepreneur, description: 'Build and launch innovations', requiresVerification: false },
  { value: USER_ROLES.STUDENT, label: ROLE_LABELS.student, description: 'Learn and collaborate on projects', requiresVerification: true },
  { value: USER_ROLES.FACULTY, label: ROLE_LABELS.faculty, description: 'Research and teach in academia', requiresVerification: true },
  { value: USER_ROLES.MENTOR, label: ROLE_LABELS.mentor, description: 'Guide and support innovators', requiresVerification: false },
  { value: 'researcher', label: ROLE_LABELS.researcher, description: 'Publish research and collaborate on studies', requiresVerification: false },
  { value: USER_ROLES.INVESTOR, label: ROLE_LABELS.investor, description: 'Discover and fund projects', requiresVerification: false },
  { value: USER_ROLES.PRIVATE_SECTOR, label: ROLE_LABELS.private_sector, description: 'Partner with innovators', requiresVerification: false },
] as const

/** Slugs from SELECTABLE_ROLES that a school or chamber has to approve. */
export const VERIFICATION_GATED_ROLES = new Set<string>(
  SELECTABLE_ROLES.filter((r) => r.requiresVerification).map((r) => r.value)
)

// Project Phases
export const PROJECT_PHASES = {
  CONCEPT: 'concept',
  PROTOTYPE: 'prototype',
  FUNDING: 'funding',
  LAUNCH: 'launch',
} as const

export const PHASE_LABELS: Record<string, string> = {
  concept: 'Concept',
  prototype: 'Prototype',
  funding: 'Funding',
  launch: 'Launch',
}

export const PHASE_COLORS: Record<string, string> = {
  concept: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
  prototype: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  funding: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  launch: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
}

// Project Categories
export const PROJECT_CATEGORIES = [
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'environment', label: 'Environment' },
  { value: 'other', label: 'Other' },
] as const

// Event Types
export const EVENT_TYPES = {
  HACKATHON: 'hackathon',
  WORKSHOP: 'workshop',
  MEETUP: 'meetup',
  CONFERENCE: 'conference',
  DEMO_DAY: 'demo_day',
  CHALLENGE: 'challenge',
} as const

export const EVENT_TYPE_LABELS: Record<string, string> = {
  hackathon: 'Hackathon',
  workshop: 'Workshop',
  meetup: 'Meetup',
  conference: 'Conference',
  demo_day: 'Demo Day',
  challenge: 'Challenge',
}

export const EVENT_TYPE_COLORS: Record<string, string> = {
  hackathon: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  workshop: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  meetup: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  conference: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  demo_day: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  challenge: 'bg-purple-100 text-purple-700 border-purple-200',
}

// Solid accent colors for calendar day dots / compact-card accent bars
export const EVENT_TYPE_DOT_COLORS: Record<string, string> = {
  hackathon: 'bg-ktip-ocean-500',
  workshop: 'bg-ktip-tropical-500',
  meetup: 'bg-ktip-sun-500',
  conference: 'bg-ktip-ocean-500',
  demo_day: 'bg-ktip-tropical-500',
  challenge: 'bg-purple-500',
}

// Soft gradient fills for week-view cards and month chips. Built from brand
// ramps only, so the dark-mode token flip re-themes them with no extra classes.
export const EVENT_TYPE_GRADIENTS: Record<string, string> = {
  hackathon:
    'bg-gradient-to-br from-ktip-ocean-50 to-ktip-ocean-100 border-ktip-ocean-200 text-ktip-ocean-800',
  workshop:
    'bg-gradient-to-br from-ktip-tropical-50 to-ktip-tropical-100 border-ktip-tropical-200 text-ktip-tropical-800',
  meetup:
    'bg-gradient-to-br from-ktip-sun-50 to-ktip-sun-100 border-ktip-sun-200 text-ktip-sun-800',
  conference:
    'bg-gradient-to-br from-ktip-ocean-50 to-ktip-ocean-100 border-ktip-ocean-200 text-ktip-ocean-800',
  demo_day:
    'bg-gradient-to-br from-ktip-tropical-50 to-ktip-tropical-100 border-ktip-tropical-200 text-ktip-tropical-800',
  challenge:
    'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 text-purple-800',
}

/** Neutral gradient for items with no type-specific color. */
/**
 * Chrome for the small badges on a calendar row — type badge, registration
 * badge. Shared so the pixel-literal type sizes live in one place until the
 * `--text-*` tokens land (see src/design/tokens.test.ts).
 */
export const CALENDAR_BADGE_CLASS = 'text-[10px] font-semibold px-1.5 py-0.5 rounded border'

/** Same, for the tighter pills on week-view cards. */
export const CALENDAR_PILL_CLASS =
  'truncate rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider'

export const CALENDAR_FALLBACK_GRADIENT =
  'bg-gradient-to-br from-ktip-sand-50 to-ktip-sand-100 border-ktip-sand-200 text-ktip-sand-800'

// Event Statuses
export const EVENT_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

export const EVENT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  published: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  completed: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
}

// Challenge brief (migration 062). Ordered: what to achieve, what limits you,
// what you hand in, how it gets judged.
export const EVENT_CRITERION_KINDS = [
  'objective',
  'constraint',
  'deliverable',
  'judging_criterion',
] as const

export const EVENT_CRITERION_LABELS: Record<string, string> = {
  objective: 'Objective',
  constraint: 'Constraint',
  deliverable: 'Deliverable',
  judging_criterion: 'Judging Criterion',
}

export const EVENT_CRITERION_GROUP_LABELS: Record<string, string> = {
  objective: 'Objectives',
  constraint: 'Constraints',
  deliverable: 'Deliverables',
  judging_criterion: 'Judging Criteria',
}

export const EVENT_CRITERION_GROUP_HINTS: Record<string, string> = {
  objective: 'What participants must achieve',
  constraint: 'Rules and limits entries must respect',
  deliverable: 'What each entry has to hand in',
  judging_criterion: 'How entries are scored',
}

export const EVENT_CRITERION_COLORS: Record<string, string> = {
  objective: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  constraint: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  deliverable: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  judging_criterion: 'bg-purple-100 text-purple-700 border-purple-200',
}

// RSVP Statuses
export const RSVP_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending approval',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  checked_in: 'Checked In',
  declined: 'Declined',
}

export const RSVP_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  confirmed: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  waitlisted: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  checked_in: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  declined: 'bg-red-100 text-red-700 border-red-200',
}

/** Solid accents for the lower half of a calendar item's split accent bar */
export const RSVP_STATUS_DOT_COLORS: Record<string, string> = {
  pending: 'bg-ktip-sun-500',
  confirmed: 'bg-ktip-tropical-500',
  waitlisted: 'bg-ktip-sun-500',
  cancelled: 'bg-ktip-sand-400',
  checked_in: 'bg-ktip-ocean-500',
  declined: 'bg-ktip-sand-400',
}

/**
 * How an RSVP reads once it is folded into its event — "Registered", not
 * "Confirmed", because the badge answers *your relation to this event*.
 */
export const RSVP_RELATION_LABELS: Record<string, string> = {
  pending: 'Awaiting approval',
  confirmed: 'Registered',
  waitlisted: 'Waitlisted',
  cancelled: 'Registration cancelled',
  checked_in: 'Checked in',
  declined: 'Registration declined',
}

/**
 * Competing or watching. The blurbs are what the registrant picks between, so
 * they describe what you get to do rather than what you are called.
 */
export const ATTENDANCE_TYPE_LABELS: Record<string, string> = {
  participant: 'Participant',
  viewer: 'Viewer',
}

export const ATTENDANCE_TYPE_BLURBS: Record<string, string> = {
  participant: 'Join a team, build, and submit. Takes one of the participant places.',
  viewer: 'Watch the rooms and follow along. No team, no submission.',
}

// Event Update Types
export const EVENT_UPDATE_TYPE_LABELS: Record<string, string> = {
  announcement: 'Announcement',
  schedule_change: 'Schedule Change',
  reminder: 'Reminder',
}

export const EVENT_UPDATE_TYPE_COLORS: Record<string, string> = {
  announcement: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  schedule_change: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  reminder: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
}

// Event Article Types
export const EVENT_ARTICLE_TYPE_LABELS: Record<string, string> = {
  recap: 'Event Recap',
  resources: 'Resources',
  summary: 'Summary',
  blog: 'Blog Post',
}

// Event Page Section Types
export const EVENT_SECTION_TYPE_LABELS: Record<string, string> = {
  about: 'About',
  faq: 'FAQ',
  venue: 'Venue',
  sponsors: 'Sponsors',
  custom: 'Custom Section',
}

// Grant Types
export const GRANT_TYPE_LABELS: Record<string, string> = {
  startup: 'Startup',
  research: 'Research',
  innovation: 'Innovation',
  development: 'Development',
  education: 'Education',
}

export const GRANT_TYPE_COLORS: Record<string, string> = {
  startup: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  research: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  innovation: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  development: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  education: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
}

// Grant Application Statuses
export const GRANT_APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const GRANT_APPLICATION_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-ktip-sand-100 text-gray-600 border-ktip-sand-200',
  pending: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  under_review: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  approved: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
}

// Dashboard Calendar Kinds
export const CALENDAR_KIND_LABELS: Record<string, string> = {
  event: 'Events',
  grant_deadline: 'Grant Deadlines',
  rsvp: 'My Registrations',
  grant_application: 'Applications',
}

export const CALENDAR_KIND_COLORS: Record<string, string> = {
  event: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  grant_deadline: 'bg-red-100 text-red-700 border-red-200',
  rsvp: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  grant_application: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
}

export const CALENDAR_KIND_DOT_COLORS: Record<string, string> = {
  event: 'bg-ktip-ocean-500',
  grant_deadline: 'bg-red-500',
  rsvp: 'bg-ktip-tropical-500',
  grant_application: 'bg-ktip-sun-500',
}

export const CALENDAR_KIND_GRADIENTS: Record<string, string> = {
  event:
    'bg-gradient-to-br from-ktip-ocean-50 to-ktip-ocean-100 border-ktip-ocean-200 text-ktip-ocean-800',
  // No dark: variants on any kind — the red/ocean/tropical/sun scales all
  // invert under html.dark, so the base classes already produce a dark tint
  // with light text. Adding dark: overrides here flipped the ramp back.
  grant_deadline:
    'bg-gradient-to-br from-red-50 to-red-100 border-red-200 text-red-800',
  rsvp: 'bg-gradient-to-br from-ktip-tropical-50 to-ktip-tropical-100 border-ktip-tropical-200 text-ktip-tropical-800',
  grant_application:
    'bg-gradient-to-br from-ktip-sun-50 to-ktip-sun-100 border-ktip-sun-200 text-ktip-sun-800',
}

// Schedule Item Types
export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  session: 'Session',
  break: 'Break',
  keynote: 'Keynote',
  workshop: 'Workshop',
  networking: 'Networking',
  other: 'Other',
}

export const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  session: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  break: 'bg-ktip-sand-100 text-ktip-sand-600 border-ktip-sand-200',
  keynote: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  workshop: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  networking: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  other: 'bg-ktip-sand-100 text-gray-600 border-ktip-sand-200',
}

// Caribbean Countries
export const CARIBBEAN_COUNTRIES = [
  'Antigua and Barbuda',
  'Bahamas',
  'Barbados',
  'Belize',
  'Dominica',
  'Grenada',
  'Guyana',
  'Haiti',
  'Jamaica',
  'Montserrat',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Vincent and the Grenadines',
  'Suriname',
  'Trinidad and Tobago',
] as const

// Navigation Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  DISCOVER: '/discover',
  PROJECTS: '/projects',
  PROJECT_DETAIL: (id: string) => `/projects/${id}`,
  CREATE_PROJECT: '/projects/new',
  EVENTS: '/events',
  EVENT_DETAIL: (id: string) => `/events/${id}`,
  CREATE_EVENT: '/events/new',
  GRANTS: '/grants',
  GRANT_DETAIL: (id: string) => `/grants/${id}`,
  GRANT_APPLY: (id: string) => `/grants/${id}/apply`,
  MY_APPLICATIONS: '/grants/my-applications',
  MESSAGES: '/messages',
  FORUMS: '/forums',
  FORUM_BOARD: (slug: string) => `/forums/${slug}`,
  FORUM_POST: (slug: string, postId: string) => `/forums/${slug}/${postId}`,
  CREATE_FORUM_POST: (slug: string) => `/forums/${slug}/new`,
  // In-app, members still open in a drawer over the directory — it is faster
  // and keeps you in context. MEMBER_PAGE is the standalone page reintroduced
  // in 066 for links that leave the app: a rank nobody outside KTIP can see
  // is not worth chasing. Use PROFILE for in-app navigation, MEMBER_PAGE when
  // the URL will be shared.
  PROFILE: (id: string) => `/directory?member=${id}`,
  MEMBER_PAGE: (id: string) => `/user/${id}`,
  MY_PROFILE: '/dashboard/profile',
  ACHIEVEMENTS: '/achievements',
  LEADERBOARD: '/leaderboard',
  SETTINGS: '/settings',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  COLLABORATE: '/collaborate',
  WHITEBOARD: '/collaborate/whiteboard',
  DOCUMENT_EDITOR: '/collaborate/document',
  CODE_EDITOR: '/collaborate/code',
  SNIPPETS: '/collaborate/snippets',
  VIDEO_CONFERENCE: '/collaborate/video',
  INVITATIONS: '/invitations',
  ADMIN: '/admin',
  ADMIN_EVENTS: '/admin/events',
  ADMIN_EVENT_DETAIL: (id: string) => `/admin/events/${id}`,
  ADMIN_USERS: '/admin/users',
  ADMIN_GRANTS: '/admin/grants',
  ADMIN_FORUMS: '/admin/forums',
  ADMIN_RESOURCES: '/admin/resources',
  DIRECTORY: '/directory',
  RESOURCES: '/resources',
  RESOURCE_DETAIL: (id: string) => `/resources/${id}`,
  REPORT_USER: (userId: string) => `/grievances/report/${userId}`,
  MY_GRIEVANCES: '/grievances/my-reports',
  ADMIN_GRIEVANCES: '/admin/grievances',
} as const

// Skill Suggestions
export const SKILL_SUGGESTIONS = [
  'Software Development',
  'Data Science',
  'UX/UI Design',
  'Project Management',
  'Marketing',
  'Finance',
  'Agriculture Technology',
  'Renewable Energy',
  'Marine Conservation',
  'Climate Resilience',
  'Education Technology',
  'Healthcare Innovation',
  'Tourism Innovation',
  'Business Strategy',
  'Community Development',
  'Policy & Governance',
  'Creative Arts',
  'Supply Chain',
  'Water Management',
  'Disaster Preparedness',
] as const

// Interest Suggestions
export const INTEREST_SUGGESTIONS = [
  'AgriTech',
  'Climate Adaptation',
  'Digital Transformation',
  'Youth Entrepreneurship',
  'Sustainable Tourism',
  'Blue Economy',
  'Renewable Energy',
  'Social Innovation',
  'Artificial Intelligence',
  'Circular Economy',
  'Food Security',
  'Health Innovation',
  'Creative Industries',
  'Financial Inclusion',
  'Smart Cities',
  'Ocean Conservation',
] as const

// Industries (curated Caribbean-relevant list; "Other" handled in UI)
export const INDUSTRIES = [
  'Agriculture & Agri-processing',
  'Tourism & Hospitality',
  'Renewable Energy',
  'ICT & Digital Services',
  'Blue Economy & Fisheries',
  'Creative Industries',
  'Health & Wellness',
  'Education & Training',
  'Financial Services',
  'Manufacturing',
  'Climate Resilience & Environment',
  'Transport & Logistics',
] as const

export const INDUSTRY_OTHER = 'Other'

// Openness to Collaborate
export const COLLABORATION_OPTIONS = [
  { value: 'research_co_investigation', label: 'Research Co-Investigation' },
  { value: 'knowledge_transfer', label: 'Knowledge Transfer' },
  { value: 'curriculum_advisory', label: 'Curriculum Advisory' },
  { value: 'consultancy', label: 'Consultancy' },
  { value: 'not_seeking', label: 'Not Currently Seeking' },
] as const

export const COLLABORATION_LABELS: Record<string, string> = Object.fromEntries(
  COLLABORATION_OPTIONS.map((o) => [o.value, o.label])
)

// Selecting this clears all other collaboration options
export const COLLAB_EXCLUSIVE_VALUE = 'not_seeking'

// Who may see a member's connection count (profiles.connection_count_visibility)
export const CONNECTION_VISIBILITY_OPTIONS: {
  value: 'public' | 'connections' | 'private'
  label: string
  description: string
}[] = [
  { value: 'public', label: 'Everyone', description: 'Anyone viewing your profile or the directory' },
  { value: 'connections', label: 'My connections', description: 'Only members you are already connected to' },
  { value: 'private', label: 'Only me', description: 'Hidden from everyone else' },
]

export const CONNECTION_VISIBILITY_LABELS: Record<string, string> = Object.fromEntries(
  CONNECTION_VISIBILITY_OPTIONS.map((o) => [o.value, o.label])
)

// Profile privacy (083). Private is not invisible — the directory teaser
// stays, because a member nobody can find is a member nobody can ask.
export const PROFILE_VISIBILITY_OPTIONS: {
  value: 'public' | 'private'
  label: string
  description: string
}[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Any signed-in member can see your full profile and message you',
  },
  {
    value: 'private',
    label: 'Private',
    description:
      'Only your connections can see your full profile or message you. Everyone still sees your name, role and country in the directory, so they can send you a connection request.',
  },
]

export const PROFILE_VISIBILITY_LABELS: Record<string, string> = Object.fromEntries(
  PROFILE_VISIBILITY_OPTIONS.map((o) => [o.value, o.label])
)

// Resource Types
export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  article: 'Article',
  guide: 'Guide',
  case_study: 'Case Study',
  template: 'Template',
  video: 'Video',
  success_story: 'Success Story',
}

export const RESOURCE_TYPE_COLORS: Record<string, string> = {
  article: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  guide: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  case_study: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  template: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  video: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  success_story: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
}

export const RESOURCE_CATEGORY_LABELS: Record<string, string> = {
  technology: 'Technology',
  healthcare: 'Healthcare',
  education: 'Education',
  agriculture: 'Agriculture',
  environment: 'Environment',
  climate_action: 'Climate Action',
  business: 'Business',
  other: 'Other',
}

export const INTEGRATION_CATEGORY_LABELS: Record<string, string> = {
  funding: 'Funding',
  productivity: 'Productivity',
  government: 'Government',
  education: 'Education',
  developer: 'Developer Tools',
  other: 'Other',
}

// Tag suggestions offered while authoring content (resources, integrations,
// events, projects). Authoring aid only — the tag filters on the public list
// pages derive their options from what is actually stored, so this list can
// drift without ever producing a chip that returns zero results.
export const CONTENT_TAG_SUGGESTIONS = [
  'climate',
  'funding',
  'startup',
  'agriculture',
  'blue economy',
  'renewable energy',
  'tourism',
  'education',
  'healthtech',
  'fintech',
  'policy',
  'research',
  'mentorship',
  'open source',
  'data',
  'community',
] as const

// Climate Action
export const CLIMATE_ACTION_BADGE_CLASS = 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200'

// Grievance Categories
export const GRIEVANCE_CATEGORIES = {
  SOLICITING: 'soliciting',
  MISREPRESENTATION: 'misrepresentation',
  IP_INFRINGEMENT: 'ip_infringement',
  ABUSIVE_INTERACTIONS: 'abusive_interactions',
  HARASSMENT: 'harassment',
  SPAM_SCAM: 'spam_scam',
  IMPERSONATION: 'impersonation',
  HATE_SPEECH: 'hate_speech',
  PRIVACY_VIOLATIONS: 'privacy_violations',
} as const

export const GRIEVANCE_CATEGORY_LABELS: Record<string, string> = {
  soliciting: 'Soliciting',
  misrepresentation: 'Misrepresentation',
  ip_infringement: 'Intellectual Property Infringement',
  abusive_interactions: 'Abusive Interactions',
  harassment: 'Harassment',
  spam_scam: 'Spam / Scam',
  impersonation: 'Impersonation',
  hate_speech: 'Hate Speech',
  privacy_violations: 'Privacy Violations',
}

export const GRIEVANCE_CATEGORY_COLORS: Record<string, string> = {
  soliciting: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  misrepresentation: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  ip_infringement: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  abusive_interactions: 'bg-red-100 text-red-700 border-red-200',
  harassment: 'bg-red-100 text-red-700 border-red-200',
  spam_scam: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
  impersonation: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  hate_speech: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  privacy_violations: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
}

// Grievance Statuses
export const GRIEVANCE_STATUSES = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const

export const GRIEVANCE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

export const GRIEVANCE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  under_review: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  resolved: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  dismissed: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
}

// API Limits
export const LIMITS = {
  MAX_PROJECT_TITLE_LENGTH: 100,
  MAX_PROJECT_DESCRIPTION_LENGTH: 5000,
  MAX_EVENT_TITLE_LENGTH: 100,
  MAX_EVENT_DESCRIPTION_LENGTH: 5000,
  MAX_MESSAGE_LENGTH: 2000,
  MAX_BIO_LENGTH: 500,
  MAX_HASHTAGS: 10,
  MAX_SKILLS: 20,
  MAX_INTERESTS: 20,
  MAX_ORGANIZATION_LENGTH: 200,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
} as const

// Image optimization presets — see src/lib/image-optimize.ts
export const IMAGE_PRESETS = {
  AVATAR: { maxDim: 512, quality: 0.85, maxBytes: 300 * 1024 },
  SPEAKER: { maxDim: 800, quality: 0.85, maxBytes: 500 * 1024 },
  DOCUMENT: { maxDim: 1600, quality: 0.82, maxBytes: 1024 * 1024 },
  // Trophies render at 128px at most and there are ~52 of them, so they are
  // kept small: the whole set costs less over the wire than one hero image.
  TROPHY: { maxDim: 512, quality: 0.85, maxBytes: 200 * 1024 },
} as const

// Date Formats
export const DATE_FORMATS = {
  SHORT: 'MMM d, yyyy',
  LONG: 'MMMM d, yyyy',
  WITH_TIME: 'MMM d, yyyy h:mm a',
  FULL: 'EEEE, MMMM d, yyyy',
} as const

// ============================================================
// Virtual venue (migration 070)
// ============================================================

// Green 300-500 is ~1.8:1 on white — see the contrast rule in src/index.css.
// Green fills take navy text; green text starts at 700.
export const VENUE_ROOM_KIND_LABELS: Record<string, string> = {
  main_hall: 'Main Hall',
  networking: 'Networking',
  workshop: 'Workshop',
  help_desk: 'Help Desk',
  sponsor_booth: 'Sponsor Booth',
  team: 'Team Space',
  judging: 'Judging',
  stage: 'Stage',
  breakout: 'Breakout',
}

export const VENUE_ROOM_KIND_ICONS: Record<string, string> = {
  main_hall: 'Landmark',
  networking: 'Users',
  workshop: 'Wrench',
  help_desk: 'LifeBuoy',
  sponsor_booth: 'Store',
  team: 'Rocket',
  judging: 'Gavel',
  stage: 'Presentation',
  breakout: 'DoorOpen',
}

export const VENUE_ROOM_KIND_COLORS: Record<string, string> = {
  main_hall: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  networking: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  workshop: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  help_desk: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  sponsor_booth: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  team: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  judging: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
  stage: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  breakout: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
}

export const VENUE_AVAILABILITY_LABELS: Record<string, string> = {
  working: 'Working',
  away: 'Away',
  busy: 'Do not disturb',
  help_wanted: 'Needs help',
  offline: 'Offline',
}

// Solid dots. Colour alone never carries the meaning — every dot ships with a
// title and an sr-only label, because "grey vs green" is invisible to a
// significant share of members.
export const VENUE_AVAILABILITY_DOT_COLORS: Record<string, string> = {
  working: 'bg-ktip-tropical-500',
  away: 'bg-ktip-sand-400',
  busy: 'bg-red-500',
  help_wanted: 'bg-ktip-sun-500',
  offline: 'bg-ktip-sand-300',
}

export const VENUE_AVAILABILITY_PILL_COLORS: Record<string, string> = {
  working: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  away: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
  busy: 'bg-red-50 text-red-700 border-red-200',
  help_wanted: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  offline: 'bg-ktip-sand-50 text-ktip-sand-500 border-ktip-sand-200',
}

// Short form, for a badge. The editor's dropdown spells out the consequence
// ("Moderated — hosts grant the mic"); a room page only has to name the policy.
export const VENUE_AUDIO_MODE_LABELS: Record<string, string> = {
  open: 'Open mics',
  moderated: 'Moderated',
  listen_only: 'Listen only',
}

export const VENUE_ROLE_LABELS: Record<string, string> = {
  participant: 'Participant',
  mentor: 'Mentor',
  judge: 'Judge',
  organizer: 'Organizer',
  spectator: 'Spectator',
}

export const VENUE = {
  /** Presence entries older than this render as offline. */
  STALE_AFTER_MS: 2 * 60 * 1000,
  /** Cold-path heartbeat floor. One write per member per 45s, not per tick. */
  HEARTBEAT_THROTTLE_MS: 45 * 1000,
  /** Hidden/idle tab flips to 'away' unless the member set a manual status. */
  IDLE_AFTER_MS: 5 * 60 * 1000,
  /** Avatars drawn on a floorplan zone before collapsing to "+N". */
  CLUSTER_VISIBLE: 4,
  /** Room chat page size. */
  MESSAGE_PAGE_SIZE: 50,
  /**
   * Walking map (089). Position updates ride broadcast, not presence track:
   * tracking is a state replication and Supabase rate-limits it, while
   * broadcast is a fire-and-forget datagram, which is exactly what a moving
   * dot is. ~8/s is smooth once the receiver interpolates.
   */
  POS_BROADCAST_MS: 120,
  /** A peer with no movement packet for this long stops being drawn walking. */
  POS_STALE_MS: 15 * 1000,
  /** Cells per second an avatar walks. */
  WALK_SPEED: 6.5,
} as const
