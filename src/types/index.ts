// Custom types for KTIP application

/**
 * Every platform role. The first seven predate the tiered hierarchy and are
 * still stored on live profiles — `oecs` in particular resolves to
 * `super_admin` via ROLE_ALIASES rather than being renamed, so the existing
 * `'oecs' = ANY(roles)` RLS clauses keep working. See src/lib/permissions.ts.
 */
export type RoleSlug =
  // legacy — still assigned
  | 'student'
  | 'mentor'
  | 'investor'
  | 'entrepreneur'
  | 'private_sector'
  | 'faculty'
  | 'oecs'
  // tier 1 — admin
  | 'super_admin'
  | 'safety_admin'
  // tier 2 — organization
  | 'sme'
  | 'educational_partner'
  | 'chamber_admin'
  // tier 3 — individual
  | 'researcher'

/** Historical name for RoleSlug. Kept so existing imports keep compiling. */
export type UserRole = RoleSlug

export type RoleTier = 'admin' | 'organization' | 'individual'

export type PermissionKey =
  | 'org:manage'
  | 'members:manage'
  | 'role:manage'
  | 'audit:view'
  | 'moderation:view'
  | 'moderation:action'
  | 'moderation:escalate'
  | 'grant:view'
  | 'grant:apply'
  | 'grant:sponsor'
  | 'grant:post'
  | 'grant:manage_funds'
  | 'project:create'
  | 'project:manage'
  | 'forum:post'
  | 'forum:comment'
  | 'mentorship:offer'
  | 'dm:initiate'
  | 'dm:receive'
  | 'dm:supervise'
  | 'sme:verify'
  | 'institution:verify'
  | 'institution:approve_students'

export type ProjectPhase = 'concept' | 'prototype' | 'funding' | 'launch'

export type EventType = 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day'

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed'

export type RSVPStatus = 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in'

export type EventUpdateType = 'announcement' | 'schedule_change' | 'reminder'

export type EventArticleType = 'recap' | 'resources' | 'summary' | 'blog'

export type RegistrationFieldType = 'text' | 'textarea' | 'number' | 'email' | 'select' | 'checkbox' | 'date'

export type EventSectionType = 'about' | 'faq' | 'venue' | 'sponsors' | 'custom'

export type ScheduleItemType = 'session' | 'break' | 'keynote' | 'workshop' | 'networking' | 'other'

export interface RegistrationFieldConfig {
  id: string
  label: string
  type: RegistrationFieldType
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
  helpText?: string
}

export interface DetailItem {
  id: string
  label: string
  value: string
}

export interface DetailEntry {
  id: string
  label: string
  value?: string
  items?: DetailItem[]
}

export type ProjectCategory =
  | 'technology'
  | 'healthcare'
  | 'education'
  | 'agriculture'
  | 'environment'
  | 'other'

/** Who may see a member's connection count. */
export type ConnectionCountVisibility = 'public' | 'connections' | 'private'

export interface Profile {
  id: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  country: string | null
  organization: string | null
  industry: string | null
  roles: UserRole[]
  /** Operating context for multi-role users. Null means "all roles at once". */
  active_role: RoleSlug | null
  is_suspended: boolean
  suspended_until: string | null
  suspension_reason: string | null
  skills: string[]
  interests: string[]
  open_to: string[]
  is_verified: boolean
  connection_count_visibility: ConnectionCountVisibility
  created_at: string
  updated_at: string
}

/**
 * One reason the personalization ranker scored a row up, as returned by
 * the `rank_content` RPC (migration 061). Score and reasons are derived
 * from the same contribution array server-side, so the chip on a card can
 * never disagree with the ordering it produced.
 */
export interface MatchReason {
  code: string
  label: string
  w: number
}

/**
 * Mixed into every rankable content entity. Both fields are absent unless
 * the list was fetched under the "For You" sort, which is why nothing
 * downstream has to know whether personalization is on.
 */
export interface Ranked {
  match_score?: number
  match_reasons?: MatchReason[]
}

export interface Project extends Ranked {
  id: string
  title: string
  description: string | null
  summary: string | null
  category: ProjectCategory | null
  phase: ProjectPhase
  hashtags: string[]
  image_url: string | null
  is_public: boolean
  is_climate_action: boolean
  is_featured: boolean
  view_count: number
  details: DetailEntry[]
  owner_id: string
  created_at: string
  updated_at: string
  owner?: Profile
}

export interface Event extends Ranked {
  id: string
  title: string
  description: string | null
  summary: string | null
  tags: string[]
  event_type: EventType
  status: EventStatus
  location: string | null
  is_virtual: boolean
  start_date: string
  end_date: string | null
  capacity: number | null
  image_url: string | null
  organizer_id: string
  registration_fields: RegistrationFieldConfig[]
  is_climate_action: boolean
  /** Migration 062 — event sets a goal attendees must accomplish. */
  has_challenge: boolean
  submission_deadline: string | null
  details: DetailEntry[]
  created_at: string
  organizer?: Profile
}

/** The four parts of a challenge brief; all share one table. */
export type EventCriterionKind =
  | 'objective'
  | 'constraint'
  | 'deliverable'
  | 'judging_criterion'

export interface EventCriterion {
  id: string
  event_id: string
  kind: EventCriterionKind
  title: string
  description: string | null
  /** Hard rule vs guidance; ignored for judging_criterion. */
  is_required: boolean
  /** Judging criteria only — relative weight. */
  weight: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EventRSVP {
  id: string
  event_id: string
  user_id: string
  status: RSVPStatus
  registration_data: Record<string, any>
  created_at: string
  user?: Profile
}

export interface EventUpdate {
  id: string
  event_id: string
  author_id: string
  title: string
  content: string
  update_type: EventUpdateType
  is_published: boolean
  created_at: string
  updated_at: string
  author?: Profile
}

export interface EventArticle {
  id: string
  event_id: string
  author_id: string
  title: string
  content: string
  article_type: EventArticleType
  is_published: boolean
  image_url: string | null
  created_at: string
  updated_at: string
  author?: Profile
}

export interface EventPageSection {
  id: string
  event_id: string
  section_type: EventSectionType
  title: string
  content: Record<string, any>
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export interface EventSpeaker {
  id: string
  event_id: string
  name: string
  title: string | null
  bio: string | null
  photo_url: string | null
  website: string | null
  sort_order: number
  created_at: string
}

export interface EventScheduleItem {
  id: string
  event_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  location: string | null
  speaker_id: string | null
  schedule_type: ScheduleItemType
  sort_order: number
  created_at: string
  speaker?: EventSpeaker
}

export interface Grant extends Ranked {
  id: string
  title: string
  description: string | null
  summary: string | null
  amount_min: number | null
  amount_max: number | null
  currency: string
  deadline: string | null
  eligibility: string | null
  application_url: string | null
  grant_type: string | null
  /** Migration 060 — grants joined the tag vocabulary last. */
  tags: string[]
  is_active: boolean
  is_climate_action: boolean
  details: DetailEntry[]
  created_at: string
}

export type GrantApplicationStatus = 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected'

export interface GrantApplication {
  id: string
  grant_id: string
  user_id: string
  application_data: Record<string, any>
  status: GrantApplicationStatus
  current_step: number
  created_at: string
  updated_at: string
  grant?: Grant
  applicant?: Profile
}

export interface GrantApplicationEvent {
  id: string
  application_id: string
  status: GrantApplicationStatus
  changed_by: string | null
  created_at: string
}

export interface ProjectPhaseEvent {
  id: string
  project_id: string
  phase: ProjectPhase
  changed_by: string | null
  created_at: string
}

export interface ProjectComment {
  id: string
  project_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  author?: Profile
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

// Submission receipts — the applicant's frozen copy of a submitted
// grant application, event registration or grievance report.
export type SubmissionKind = 'grant_application' | 'event_registration' | 'grievance'

export interface SubmissionReceipt {
  id: string
  user_id: string
  kind: SubmissionKind
  source_table: string
  source_id: string
  title: string
  subtitle: string | null
  data: Record<string, any>
  // Frozen at submit time so labels survive later edits to the source form
  field_config: RegistrationFieldConfig[] | null
  template_key: string | null
  link: string
  submitted_at: string
}

export type ConversationParticipantRole = 'admin' | 'member'

export interface ConversationParticipant {
  id: string
  conversation_id: string
  user_id: string
  role: ConversationParticipantRole
  joined_at: string
  user?: Profile
}

export interface Conversation {
  id: string
  name: string | null
  is_group: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  participants?: ConversationParticipant[]
  last_message?: Message
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  sender?: Profile
}

export interface ForumBoard {
  id: string
  name: string
  description: string | null
  slug: string
  icon: string | null
  sort_order: number
  created_at: string
  post_count?: number
  latest_activity?: string
}

export interface ForumPost {
  id: string
  board_id: string
  author_id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  author?: Profile
  board?: ForumBoard
  reply_count?: number
}

export interface ForumReply {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
  author?: Profile
}

export type ResourceType = 'article' | 'guide' | 'case_study' | 'template' | 'video' | 'success_story'

export type ResourceCategory = 'technology' | 'healthcare' | 'education' | 'agriculture' | 'environment' | 'climate_action' | 'business' | 'other'

export interface Resource extends Ranked {
  id: string
  title: string
  description: string | null
  summary: string | null
  content: string | null
  resource_type: ResourceType
  category: ResourceCategory | null
  tags: string[]
  author_id: string | null
  is_published: boolean
  download_url: string | null
  thumbnail_url: string | null
  is_climate_action: boolean
  created_at: string
  updated_at: string
  author?: Profile
}

export interface Document {
  id: string
  title: string
  content: string | null
  owner_id: string
  created_at: string
  updated_at: string
}

export interface Whiteboard {
  id: string
  title: string
  snapshot: Record<string, any> | null
  owner_id: string
  created_at: string
  updated_at: string
}

// Code snippets — the DB-backed successor to the sandbox's
// `ktip_sandbox_${language}` localStorage drafts (migration 052).
export type SnippetLanguage = 'javascript' | 'python' | 'html' | 'css' | 'json' | 'markdown'

export interface Snippet {
  id: string
  title: string
  language: SnippetLanguage
  content: string | null
  owner_id: string
  created_at: string
  updated_at: string
}

// Collaboration sharing & invitations
export type CollabResourceType = 'whiteboard' | 'document' | 'snippet'
export type SharePermission = 'view' | 'edit'
export type ShareStatus = 'pending' | 'accepted' | 'declined'

/** A row in whiteboard_shares / document_shares / snippet_shares. */
export interface CollabShare {
  id: string
  shared_with: string
  shared_by: string
  permission: SharePermission
  status: ShareStatus
  created_at: string
}

/** A pending share flattened across the three tables for the invitations inbox. */
export interface CollabInvite extends CollabShare {
  resource_type: CollabResourceType
  resource_id: string
  resource_title: string
  inviter?: Profile
  recipient?: Profile
}

export type EmailInviteResourceType = CollabResourceType | 'platform'
export type EmailInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface EmailInvite {
  id: string
  email: string
  invited_by: string
  resource_type: EmailInviteResourceType
  resource_id: string | null
  resource_title: string | null
  permission: SharePermission
  status: EmailInviteStatus
  expires_at: string
  accepted_by: string | null
  accepted_at: string | null
  created_at: string
}

/**
 * A secondary email that can sign in to the same account with the same
 * password. `verification_token` exists on the row but is deliberately never
 * selected by the client — see useEmailAlias.
 */
export interface UserEmailAlias {
  id: string
  user_id: string
  email: string
  verified_at: string | null
  token_expires_at: string | null
  created_at: string
}

// Grievance types
export type GrievanceCategory =
  | 'soliciting'
  | 'misrepresentation'
  | 'ip_infringement'
  | 'abusive_interactions'
  | 'harassment'
  | 'spam_scam'
  | 'impersonation'
  | 'hate_speech'
  | 'privacy_violations'

export type GrievanceStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed'

// Project team types
export type ProjectMemberRole = 'editor' | 'viewer'
export type ProjectMemberStatus = 'pending' | 'accepted' | 'declined'

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: ProjectMemberRole
  status: ProjectMemberStatus
  invited_by: string | null
  created_at: string
  updated_at: string
  user?: Profile
  project?: Project
}

// Connection types
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'

export interface Connection {
  id: string
  requester_id: string
  addressee_id: string
  status: ConnectionStatus
  created_at: string
  updated_at: string
  requester?: Profile
  addressee?: Profile
}

// Verification types
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export interface VerificationRequest {
  id: string
  user_id: string
  status: VerificationStatus
  document_paths: string[]
  user_note: string | null
  admin_note: string | null
  reviewer_id: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  user?: Profile
}

// Employer types (migration 058)

export interface Country {
  code: string
  name: string
  is_oecs_member: boolean
  sort_order: number
}

/**
 * Employer-scoped verification. Distinct from VerificationStatus above, which
 * is person-level identity KYC — 'verified' here asserts the *company* was
 * checked, and 'revoked' exists because that assertion can be withdrawn after
 * the fact (see api/partner/v1/employers.ts for how consumers learn about it).
 */
export type EmployerVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'revoked'

export type EmployerVerificationMethod =
  | 'document_review'
  | 'registry_lookup'
  | 'manual_attestation'

export interface Employer {
  id: string
  slug: string
  legal_name: string
  trading_name: string | null
  industry: string | null
  website_url: string | null
  logo_url: string | null
  description: string | null

  // Address hierarchy, coarse -> fine. country_code is a FK to countries.
  country_code: string
  administrative_area: string | null
  locality: string | null
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null

  contact_email: string
  contact_email_verified_at: string | null
  contact_phone: string | null

  verification_status: EmployerVerificationStatus
  verification_method: EmployerVerificationMethod | null
  registration_number: string | null
  verified_at: string | null
  verified_by: string | null
  /** INTERNAL reviewer commentary. Never leaves the system. */
  verification_note: string | null
  /** INTERNAL paths into the private verification-documents bucket. */
  document_paths: string[]
  /** Generated column — lets the feed report evidence volume without reading the paths. */
  document_count: number

  share_externally: boolean
  created_by: string | null
  created_at: string
  updated_at: string

  country?: Country
}

export type EmployerMemberRole = 'owner' | 'admin' | 'recruiter'

export interface EmployerMember {
  id: string
  employer_id: string
  user_id: string
  role: EmployerMemberRole
  created_at: string
  user?: Profile
  employer?: Employer
}

export interface EmployerVerificationEvent {
  id: string
  employer_id: string
  from_status: EmployerVerificationStatus | null
  to_status: EmployerVerificationStatus
  method: EmployerVerificationMethod | null
  note: string | null
  actor_id: string | null
  created_at: string
}

// Partner API types (migration 059)

export interface ApiClient {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  last_used_at: string | null
  revoked_at: string | null
  created_by: string | null
  created_at: string
}

// Notification preferences
export interface NotificationPreferences {
  user_id: string
  email: boolean
  messages: boolean
  events: boolean
  projects: boolean
  forums: boolean
  collaboration: boolean
  connections: boolean
  updated_at: string
}

// Personalization types (migration 055)

/**
 * Settings › Personalization. The three arrays are stored in the
 * *content* vocabulary — real tags, the shared project/resource
 * category enum, and namespaced type keys ('resource:guide') — so the
 * ranker can compare them to content rows directly.
 */
export interface UserPersonalization {
  user_id: string
  enabled: boolean
  use_profile_signals: boolean
  use_behavior_signals: boolean
  use_badge_signals: boolean
  climate_focus: boolean
  topics: string[]
  categories: string[]
  content_types: string[]
  created_at: string
  updated_at: string
}

// Feedback types
export type FeedbackCategory = 'bug' | 'feature_request' | 'general' | 'content'
export type FeedbackStatus = 'new' | 'in_review' | 'resolved' | 'dismissed'

export interface Feedback {
  id: string
  user_id: string | null
  category: FeedbackCategory
  subject: string
  message: string
  status: FeedbackStatus
  admin_note: string | null
  created_at: string
  updated_at: string
  user?: Profile
}

// Integration directory types
export type IntegrationCategory = 'funding' | 'productivity' | 'government' | 'education' | 'developer' | 'other'

export interface Integration {
  id: string
  name: string
  description: string
  summary: string | null
  tags: string[]
  category: IntegrationCategory
  logo_url: string | null
  website_url: string
  is_published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// Badge types
export interface BadgeDefinition {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  color: string
  created_at: string
}

export interface UserBadge {
  id: string
  user_id: string
  badge_id: string
  awarded_at: string
  badge?: BadgeDefinition
}

/** Directory row: profile with its earned badges embedded by the directory query. */
export interface DirectoryMember extends Profile {
  user_badges?: UserBadge[]
}

// ============================================================
// Entity document library (migration 048)
// ============================================================

/** What a document can be attached to. */
export type DocumentEntityType = 'grant' | 'project'

/**
 * private     — owner (and OECS admins) only; not even listed to others
 * restricted  — listed to everyone, readable only after the owner approves
 * members     — any signed-in member can read
 * public      — anyone, signed in or not
 */
export type DocumentVisibility = 'private' | 'restricted' | 'members' | 'public'

export type DocumentAccessRole = 'owner' | 'editor' | 'viewer'

export type DocumentExtractionStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'unsupported'

/** One AI-proposed value for a column on the parent grant/project. Never auto-applied. */
export interface ExtractedField {
  value: string | number | boolean | string[] | null
  confidence: number
  evidence?: string
}

export type ExtractedFields = Record<string, ExtractedField>

/** Full row — only readable by someone with access (RLS on entity_documents). */
export interface EntityDocument {
  id: string
  entity_type: DocumentEntityType
  entity_id: string
  owner_id: string
  title: string
  description: string | null
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  visibility: DocumentVisibility
  /** Rich-text twin the WYSIWYG editor reads and writes. */
  content_html: string | null
  /** Plain markdown derived from content_html; what the AI and search read. */
  markdown: string | null
  extraction_status: DocumentExtractionStatus
  extraction_error: string | null
  extracted_fields: ExtractedFields
  created_at: string
  updated_at: string
}

/**
 * Listing row from the get_entity_documents() RPC. Carries no markdown, and
 * storage_path is null when the caller has no access — that is what makes a
 * restricted document visible without being readable.
 */
export interface EntityDocumentSummary {
  id: string
  entity_type: DocumentEntityType
  entity_id: string
  owner_id: string
  owner_name: string | null
  owner_avatar_url: string | null
  title: string
  description: string | null
  storage_path: string | null
  file_name: string
  mime_type: string
  file_size: number
  visibility: DocumentVisibility
  has_content: boolean
  extraction_status: DocumentExtractionStatus
  extraction_error: string | null
  extracted_field_count: number
  my_role: DocumentAccessRole | null
  pending_request: boolean
  open_request_count: number
  created_at: string
  updated_at: string
}

export interface DocumentAccessGrant {
  id: string
  document_id: string
  user_id: string
  role: 'viewer' | 'editor'
  granted_by: string | null
  created_at: string
  user?: Profile
}

export type DocumentAccessRequestStatus = 'pending' | 'approved' | 'denied'

export interface DocumentAccessRequest {
  id: string
  document_id: string
  requester_id: string
  message: string | null
  status: DocumentAccessRequestStatus
  granted_role: 'viewer' | 'editor' | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
  requester?: Profile
  document?: EntityDocumentSummary
}

export interface Grievance {
  id: string
  reporter_id: string
  reported_user_id: string
  category: GrievanceCategory
  description: string
  evidence_url: string | null
  context: string | null
  status: GrievanceStatus
  admin_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  reporter?: Profile
  reported_user?: Profile
  resolver?: Profile
}

// ============================================================
// RBAC (migration 063)
// ============================================================

export interface RoleDefinitionRow {
  slug: RoleSlug
  label: string
  tier: RoleTier
  description: string | null
  is_system: boolean
  is_self_assignable: boolean
  requires_verification: boolean
  alias_of: RoleSlug | null
  sort_order: number
}

export interface PermissionDefinitionRow {
  key: PermissionKey
  label: string
  description: string | null
  category: string
  is_safeguard: boolean
  sort_order: number
}

export interface RolePermissionRow {
  role_slug: RoleSlug
  permission_key: PermissionKey
  allowed: boolean
  updated_by: string | null
  updated_at: string
}

export interface RolePermissionEvent {
  id: string
  role_slug: RoleSlug
  permission_key: PermissionKey
  from_allowed: boolean | null
  to_allowed: boolean
  actor_id: string | null
  created_at: string
  actor?: Profile
}

// ============================================================
// Institutions & student safeguarding (migration 064)
// ============================================================

export type InstitutionKind = 'school' | 'university' | 'tvet' | 'chamber'
export type InstitutionStatus = 'pending' | 'verified' | 'rejected'
export type InstitutionMemberRole = 'admin' | 'educator' | 'student'
export type InstitutionMemberStatus = 'pending' | 'approved' | 'rejected'

export interface Institution {
  id: string
  slug: string
  name: string
  kind: InstitutionKind
  country_code: string
  /** Email domains this institution owns, e.g. ['dsc.edu.dm']. */
  email_domains: string[]
  status: InstitutionStatus
  contact_email: string | null
  website_url: string | null
  verified_by: string | null
  verified_at: string | null
  review_note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  country?: Country
}

export interface InstitutionMember {
  id: string
  institution_id: string
  user_id: string
  role: InstitutionMemberRole
  status: InstitutionMemberStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
  user?: Profile
  institution?: Institution
}

/**
 * Minor-safety record. Only the birth *year* is stored — enough to decide
 * minor status for COPPA/GDPR handling without holding a full date of birth.
 */
export interface StudentSafeguarding {
  user_id: string
  institution_id: string | null
  verified_domain: string | null
  sponsor_user_id: string | null
  birth_year: number | null
  is_minor: boolean
  guardian_consent_at: string | null
  guardian_consent_ref: string | null
  created_at: string
  updated_at: string
  institution?: Institution
  sponsor?: Profile
}

// ============================================================
// Moderation (migration 065)
// ============================================================

export type ContentStatus = 'active' | 'quarantined' | 'removed'

export type ModerationTargetType =
  | 'forum_post'
  | 'forum_reply'
  | 'project'
  | 'project_comment'
  | 'message'
  | 'profile'
  | 'grant'

export type ReportCategory =
  | 'hate_harassment'
  | 'bullying'
  | 'nsfw'
  | 'spam_scam'
  | 'grooming_risk'
  | 'pii_leak'

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed'

export type ModerationSeverity = 'low' | 'medium' | 'high'

export type ModerationAction =
  | 'flagged'
  | 'warned'
  | 'quarantined'
  | 'restored'
  | 'removed'
  | 'suspended'
  | 'escalated'

export interface ContentReport {
  id: string
  reporter_id: string
  target_type: ModerationTargetType
  target_id: string
  target_author_id: string | null
  category: ReportCategory
  detail: string | null
  /** Frozen at report time so triage survives an edit or delete. */
  content_snapshot: string | null
  status: ReportStatus
  severity: ModerationSeverity | null
  admin_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  reporter?: Profile
  target_author?: Profile
}

export interface ModerationTerm {
  id: string
  pattern: string
  kind: 'term' | 'regex'
  severity: ModerationSeverity
  category: ReportCategory | null
  /** Scopes a regional slur to one country; null applies everywhere. */
  country_code: string | null
  is_active: boolean
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ModerationLogEntry {
  id: string
  actor_kind: 'system' | 'admin' | 'reporter'
  actor_id: string | null
  user_id: string | null
  target_type: ModerationTargetType | null
  target_id: string | null
  severity: ModerationSeverity | null
  action: ModerationAction
  detail: Record<string, unknown> | null
  created_at: string
  actor?: Profile
  user?: Profile
}

export interface ModerationSettings {
  id: number
  report_threshold: number
  report_window_minutes: number
  auto_quarantine_enabled: boolean
  low_action: ModerationAction
  medium_action: ModerationAction
  high_action: ModerationAction
  updated_by: string | null
  updated_at: string
}

/** One row of the moderation queue — a report or an automated flag. */
export interface ModerationQueueItem {
  source: 'report' | 'automated'
  id: string
  target_type: ModerationTargetType
  target_id: string
  target_author_id: string | null
  category: ReportCategory | null
  severity: ModerationSeverity | null
  status: string
  report_count: number
  content_snapshot: string | null
  created_at: string
}
