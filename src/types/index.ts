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
  | 'event:create'
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

export type EventType = 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day' | 'challenge'

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

/**
 * Whether a member's profile is open to every signed-in member, or only to
 * the connections they have accepted (083). Everyone still sees the teaser —
 * name, avatar, roles, country — so a private member stays findable and can
 * be sent a connection request.
 */
export type ProfileVisibility = 'public' | 'private'

export interface Profile {
  id: string
  /**
   * Vanity segment for /u/<username> (migration 087). display_name is neither
   * unique nor stable, so it cannot be the URL.
   */
  username: string | null
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
  /**
   * Contact details (082). Optional on the type, not because the columns are
   * nullable — they are — but because a deploy can run ahead of the migration
   * and PostgREST then omits them from every row.
   */
  phone?: string | null
  website?: string | null
  languages?: string[]
  is_verified: boolean
  connection_count_visibility: ConnectionCountVisibility
  /**
   * Leaderboard opt-out (066). 'private' keeps the member off the public
   * board while they keep earning and keep seeing their own rank. Students
   * are excluded server-side whatever this says.
   */
  leaderboard_visibility?: 'public' | 'private'
  /**
   * Profile privacy (083). Optional for the same reason as the 082 contact
   * fields: a deploy can run ahead of the migration, and a missing column
   * has to read as 'public' rather than crash the directory.
   */
  profile_visibility?: ProfileVisibility
  /**
   * Age state (091). Derived from the declared date of birth, never written
   * directly — the 063 guard trigger rejects an attempt.
   *
   * `is_minor` is a UI hint and can be one day stale (the account turned 18
   * overnight and has not signed in since). Anything that has to be right calls
   * account_is_minor() server-side.
   *
   * `requires_age_declaration` is the onboarding gate. Optional for the same
   * reason as the 082 contact fields: a deploy can run ahead of the migration,
   * and a missing column must read as "nothing owed" rather than trap everyone
   * on /onboarding.
   */
  is_minor?: boolean
  requires_age_declaration?: boolean
  age_declared_at?: string | null
  created_at: string
  updated_at: string
}

/**
 * One row of `get_profile_view()` (083). The teaser fields are always
 * populated; everything under `can_view` is NULL when the viewer has not
 * been granted access, so a member page renders one shape either way.
 */
export interface ProfileView {
  id: string
  display_name: string | null
  avatar_url: string | null
  roles: UserRole[]
  country: string | null
  is_verified: boolean
  created_at: string
  profile_visibility: ProfileVisibility
  can_view: boolean
  bio: string | null
  skills: string[] | null
  interests: string[] | null
  open_to: string[] | null
  organization: string | null
  industry: string | null
  phone: string | null
  website: string | null
  languages: string[] | null
  /**
   * Teaser field, not gated by `can_view` (091): it decides whether a Message
   * button may be offered at all, which matters just as much to a viewer who
   * cannot see the rest of the profile.
   *
   * Optional because a deploy can run ahead of migration 091, and a missing
   * value has to read as "adult" rather than hide every button on the page.
   */
  is_minor?: boolean
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
  /** URL segment (migration 087). Assigned on insert, frozen after. */
  slug: string | null
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
  /** Accepted collaborators, kept in step by a trigger (migration 079).
   *  Denormalised because project_members is unreadable to non-members. */
  member_count: number
  details: DetailEntry[]
  owner_id: string
  created_at: string
  updated_at: string
  owner?: Profile
}

export interface Event extends Ranked {
  id: string
  /** URL segment (migration 087). Assigned on insert, frozen after. */
  slug: string | null
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
  /**
   * Migration 070 — the event runs a live virtual venue. Like has_challenge,
   * this is a flag rather than an event_type: a conference may want a
   * networking area and a hackathon may not want a venue at all.
   */
  has_venue: boolean
  venue_floorplan_url: string | null
  /**
   * Migration 089 — the drawn floorplan's grid and floor list. NULL means the
   * host never drew one; an uploaded SVG (above) may still exist.
   */
  venue_map: {
    v: 1
    cols: number
    rows: number
    floors: { key: string; name: string }[]
  } | null
  /** Non-organizers cannot enter outside this window. NULL = always open. */
  venue_opens_at: string | null
  venue_closes_at: string | null
  spectators_enabled: boolean
  spectator_scope: SpectatorScope
  /**
   * Migration 092 — when sign-ups shut, which is rarely the moment the event
   * starts. NULL means open until it does. Enforced by the RSVP trigger, not
   * only by the form.
   */
  registration_closes_at: string | null
  /** Migration 092 — NULL min means the event is not entered by teams. */
  team_size_min: number | null
  team_size_max: number | null
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

/**
 * What a participant submits against a challenge (migration 085).
 *
 * The mirror image of EventCriterion: the brief is written by the organizer,
 * a solution is written by an entrant, and carries uploads of its own through
 * entity_documents (entity_type 'event_solution').
 */
export interface EventSolution {
  id: string
  event_id: string
  author_id: string
  title: string
  description: string | null
  /** Demo, repo or write-up hosted elsewhere. */
  link_url: string | null
  created_at: string
  updated_at: string
  author?: Profile
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

// ============================================================
// Virtual venue (migration 070)
//
// Generic on purpose: nothing here knows what a team is. The hackathon layer
// (072+) references these types; they never reference it.
// ============================================================

export type SpectatorScope = 'members' | 'registered' | 'public'

/**
 * What a room is for. Drives the icon, the default audio policy and which
 * panels the room page renders — a networking room shows the full occupant
 * list, a stage does not.
 */
export type VenueRoomKind =
  | 'main_hall'
  | 'networking'
  | 'workshop'
  | 'help_desk'
  | 'sponsor_booth'
  | 'team'
  | 'judging'
  | 'stage'
  | 'breakout'

/** Who may publish audio/video. Consumed by venue_room_grant() in 071. */
export type VenueAudioMode = 'open' | 'moderated' | 'listen_only'

export type VenueRole = 'participant' | 'mentor' | 'judge' | 'organizer' | 'spectator'

/**
 * Self-reported status. 'offline' is never written by a client — the reducer
 * derives it for members with no live presence entry and a stale last_seen_at.
 */
export type VenueAvailability = 'working' | 'away' | 'busy' | 'help_wanted' | 'offline'

export interface VenueRoom {
  id: string
  event_id: string
  /** Stable slug. Deep links use this, never the name. */
  key: string
  name: string
  kind: VenueRoomKind
  description: string | null
  /** id attribute of a shape in the event's floorplan SVG. */
  svg_zone_id: string | null
  /** Which floor of the drawn map this room sits on (089). */
  floor: number
  /** Grid cells the room covers, [[x,y], ...]. Empty = not on the drawn map. */
  cells: [number, number][]
  /** Hex from the venue palette. NULL falls back to a colour from `kind`. */
  color: string | null
  wall_height: number
  /** Venue roles allowed in. Empty = everyone; enforced by enter_venue_room(). */
  allowed_roles: VenueRole[]
  /**
   * Panels the room page renders (091), as [{id, enabled, order, config}].
   * Empty = the default set for this `kind`. Parsed by src/lib/venue-room-sections.ts;
   * left as unknown here because an id this build does not know is legal on the wire.
   */
  sections: unknown[]
  capacity: number | null
  audio_mode: VenueAudioMode
  max_publishers: number
  recording_enabled: boolean
  is_open: boolean
  sponsor_name: string | null
  sponsor_logo_url: string | null
  sponsor_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EventVenueMember {
  id: string
  event_id: string
  user_id: string
  role: VenueRole
  /** Cold mirror of presence. Live presence wins while a client is connected. */
  availability: VenueAvailability
  status_note: string | null
  current_room_id: string | null
  skills: string[]
  looking_for_team: boolean
  is_discoverable: boolean
  /** Extension point — a future walking map writes { x, y } here. */
  meta: Record<string, any>
  first_entered_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
  user?: Profile
}

export interface VenueRoomMessage {
  id: string
  room_id: string
  event_id: string
  author_id: string | null
  body: string
  kind: 'chat' | 'system'
  reply_to: string | null
  is_removed: boolean
  created_at: string
  author?: Profile
}

/**
 * Where a member is standing on the drawn map. Grid coordinates, fractional —
 * a walker is between cells most of the time.
 */
export interface VenuePosition {
  x: number
  y: number
  /** Floor index. Absent means the ground floor. */
  f?: number
}

/**
 * What a client tracks on the `venue:{eventId}` presence channel.
 *
 * `pos` was reserved by 070 and is filled in by the walking map: it rides the
 * tracked payload for the coarse position (so a late joiner paints everyone
 * immediately) while the smooth motion goes over broadcast. `v` lets a
 * mixed-version crowd degrade cleanly — a v1 reader ignores what it does not
 * know, and a client with no map simply sends null.
 */
export interface VenuePresencePayload {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  role: VenueRole
  availability: Exclude<VenueAvailability, 'offline'>
  status_note: string | null
  room_id: string | null
  team_id: string | null
  pos: VenuePosition | null
  v: 1
}

/** One person as the floorplan and occupant lists see them. */
export interface VenueOccupant {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  role: VenueRole
  availability: VenueAvailability
  status_note: string | null
  room_id: string | null
  team_id: string | null
  /** Last known map position, or null for a member who is not on the map. */
  pos: VenuePosition | null
  /** False when derived from the DB mirror rather than a live presence entry. */
  is_live: boolean
}

export interface Grant extends Ranked {
  id: string
  /** URL segment (migration 087). Assigned on insert, frozen after. */
  slug: string | null
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
  /**
   * Migration 077 — who posted it. NULL on rows created before 077, which are
   * manageable by OECS admins only; before 077 there was no creator to check,
   * so any `grant:post` holder could edit or delete anyone's grant.
   */
  created_by: string | null
  /**
   * Migration 080 — what this call asks applicants to attach. Copy the funder
   * writes once per grant, so it is JSONB rather than a relation.
   */
  required_documents: RequiredDocument[]
  created_at: string
}

/** One row of a grant's supporting-documents checklist. */
export interface RequiredDocument {
  key: string
  label: string
  description: string
  required: boolean
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
  /** When this member last had the thread open — drives the unread dot (086) */
  last_read_at: string
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
  /** URL segment (migration 087). Unique within a board, not globally. */
  slug: string | null
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
  /** URL segment (migration 087). Assigned on insert, frozen after. */
  slug: string | null
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

/**
 * A member asking to join a project they don't own (migration 079).
 *
 * Separate from ProjectMember on purpose: a request is a conversation the
 * owner has not answered yet, while a membership row is a decision. Approving
 * one writes the other, atomically, in decide_project_join_request().
 */
export type ProjectJoinRequestStatus = 'pending' | 'approved' | 'denied'

export interface ProjectJoinRequest {
  id: string
  project_id: string
  requester_id: string
  message: string | null
  status: ProjectJoinRequestStatus
  decided_by: string | null
  decided_at: string | null
  created_at: string
  requester?: Profile
  project?: Project
}

/** Row shape of get_project_team() — the roster a visitor is allowed to see. */
export interface ProjectTeamMember {
  user_id: string
  role: ProjectMemberRole
  display_name: string | null
  avatar_url: string | null
  country: string | null
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

/**
 * What a public reader is allowed to see of an employer (migration 081).
 *
 * A strict subset of Employer, named separately because the difference is the
 * point: `verification_note` is internal reviewer commentary and
 * `document_paths` are private bucket paths, and neither is in this shape.
 */
export interface PublicEmployer {
  id: string
  slug: string
  legal_name: string
  trading_name: string | null
  industry: string | null
  website_url: string | null
  logo_url: string | null
  description: string | null
  country_code: string
  locality: string | null
  verification_status: EmployerVerificationStatus
  verified_at: string | null
  created_by: string | null
  created_at: string
}

/** A directory row — PublicEmployer plus how much work it has published. */
export interface PublicEmployerSummary {
  id: string
  slug: string
  legal_name: string
  trading_name: string | null
  industry: string | null
  logo_url: string | null
  description: string | null
  country_code: string
  portfolio_count: number
}

/** One piece of work a business wants to be judged on (migration 081). */
export interface EmployerPortfolioItem {
  id: string
  employer_id: string
  title: string
  summary: string | null
  description: string | null
  image_url: string | null
  link_url: string | null
  client_name: string | null
  completed_on: string | null
  tags: string[]
  sort_order: number
  created_at: string
  updated_at: string
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
  /**
   * Added in 066. Before it existed, 'badge_awarded' fell through the
   * enforcement trigger's CASE to ELSE TRUE and could not be switched off —
   * tolerable for six badges, not for a points engine.
   */
  achievements: boolean
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

// OECS Virtual Campus course catalog (see ktip-catalog-api.md). Sourced live
// from the campus, not a KTIP-owned table — no id/timestamps of our own.
export interface ExternalCourse {
  catalog_type: 'external' | 'native'
  course_id: string
  candidate_id?: string | null
  title: string
  short_description?: string | null
  thumbnail_url?: string | null
  difficulty?: string | null
  subject_area?: string | null
  grade_level?: string | null
  language?: string | null
  is_external?: boolean
  external_launch_url?: string | null
  provider_key?: string | null
  provider_name?: string | null
  canonical_url?: string | null
  enrollable?: boolean
  published?: boolean
}

export interface CourseEnrollmentResult {
  message: string
  enrollment_id: string
  is_new_user: boolean
  sign_in_url: string
  course_url: string
}

export interface KtipEnrollment {
  enrollment_id: string
  course_id: string
  course_url: string
  enrolled_at: string | null
  progress_percentage: number | null
}

// ============================================================
// Badges and gamification (migrations 039, 066, 067)
// ============================================================

/** Drives points via rarity_points() in SQL — never set points client-side. */
export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** Position on a bronze->diamond ladder. Null for standalone badges. */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond'

/** Pill styling. All four are OECS brand primitives; see index.css. */
export type BadgeColor = 'ocean' | 'tropical' | 'sand' | 'sun'

export interface BadgeDefinition {
  id: string
  slug: string
  name: string
  description: string
  /** Kebab-case lucide name; resolved by src/lib/badge-icons.ts. */
  icon: string
  color: BadgeColor | string
  created_at: string

  // Added in 066. Optional so rows read through older queries still typecheck.
  category?: string
  rarity?: BadgeRarity
  points?: number
  tier?: BadgeTier | null
  tier_group?: string | null
  /** Key into achievement_counts(); null means trigger-awarded only. */
  check_key?: string | null
  check_value?: number | null
  is_hidden?: boolean
  sort_order?: number
  /** Resolves with `tier` to shared artwork in trophy_assets. */
  trophy_type?: string | null
  /** Per-badge artwork override, wins over trophy_type. */
  image_url?: string | null
}

export interface UserBadge {
  id: string
  user_id: string
  badge_id: string
  awarded_at: string
  badge?: BadgeDefinition
}

/** One shared trophy image, keyed by type x tier. */
export interface TrophyAsset {
  id: string
  type: string
  tier: BadgeTier
  image_url: string | null
  alt_text: string
  sort_order: number
  updated_at: string
}

/** type -> tier -> asset, the shape every trophy renderer looks up against. */
export type TrophyAssetMap = Record<string, Partial<Record<BadgeTier, TrophyAsset>>>

/**
 * A member's standing. `next_required` is null at the highest rank —
 * render "highest rank reached" rather than a progress bar.
 */
export interface MemberRank {
  level: number
  name: string
  earned: number
  next_name: string | null
  next_required: number | null
}

/** Enough of a badge to render an unlock popup without a second fetch. */
export interface NewlyEarnedAchievement {
  slug: string
  name: string
  description: string
  icon: string
  color: string
  rarity: BadgeRarity
  tier: BadgeTier | null
  points: number
  category: string
  trophy_type: string | null
  image_url: string | null
}

export interface AchievementProgress {
  slug: string
  /** Clamped to `target` server-side, so a bar can never exceed 100%. */
  current: number
  target: number
}

export interface AchievementCollection {
  slug: string
  name: string
  description: string
  icon: string
  total: number
  earned: number
}

export interface AchievementStats {
  points: number
  earned: number
  total_available: number
  streak_days: number
  total_active_days: number
  rank: MemberRank
  by_category: Record<string, number>
}

/** Whole payload of check_my_achievements() — one round trip. */
export interface AchievementCheckResult {
  newly_earned: NewlyEarnedAchievement[]
  stats: AchievementStats
  progress: AchievementProgress[]
  collections: AchievementCollection[]
}

export type LeaderboardScope = 'global' | 'country' | 'role'
export type LeaderboardWindow = 'all' | 'month'

export interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string | null
  avatar_url: string | null
  country: string | null
  roles: string[] | null
  is_verified: boolean | null
  points: number
  badge_count: number
  level: number
  rank_name: string
}

/** Own standing, returned even when outside the top N. */
export interface MyLeaderboardRank {
  rank: number
  points: number
  badge_count: number
  board_size: number
  /** False when opted out, suspended, or a student: your score, seen only by you. */
  listed: boolean
}

export interface ShowcaseEntry {
  position: number
  badge: BadgeDefinition
}

/** Public-profile stats. `streak_days` is null unless viewing your own. */
export interface ProfileStats {
  user_id: string
  points: number
  badge_count: number
  rank: MemberRank
  streak_days: number | null
  showcase: ShowcaseEntry[]
}

/** Batched variant for directory cards and leaderboard rows. */
export interface ProfileStatsRow {
  user_id: string
  points: number
  badge_count: number
  level: number
  rank_name: string
}

/** Frontend-only signals; the SQL allowlist in track_my_flag() must match. */
export type TrackableFlag =
  | 'leaderboard_views'
  | 'achievements_views'
  | 'directory_views'
  | 'search_uses'
  | 'ai_assistant_uses'

/** Directory row: profile with its earned badges embedded by the directory query. */
export interface DirectoryMember extends Profile {
  user_badges?: UserBadge[]
}

// ============================================================
// Entity document library (migration 048)
// ============================================================

/**
 * What a document can be attached to. 'grant_application' added in 080,
 * 'event' in 084, 'event_solution' in 085.
 */
export type DocumentEntityType =
  | 'grant'
  | 'project'
  | 'grant_application'
  | 'event'
  | 'event_solution'

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
 * Minor-safety record, shared with the member's institution.
 *
 * `birth_year` is a projection of [AccountAge].date_of_birth since 091, kept in
 * sync by trigger and no longer writable by the student — it exists because
 * institution staff can read this row and cannot read the declaration itself.
 * Year only, deliberately: the school gets the coarse value.
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
// Age declaration (migration 091)
// ============================================================

/**
 * The date of birth every account created from 091 onwards declares, on the
 * signup form or — for Google and Microsoft, which share no birthday claim — on
 * the onboarding form straight after.
 *
 * Deliberately narrow reach. The row is readable only by the member and by
 * moderation staff, has no INSERT or UPDATE policy (both routes in are
 * SECURITY DEFINER RPCs), and no ordinary feature should ever query it: the
 * derived `Profile.is_minor` is what the UI reads, and account_is_minor() is
 * what enforcement reads.
 *
 * Unrelated to [StudentSafeguarding], which stores a birth *year* and only for
 * students verified by an institution.
 */
export interface AccountAge {
  user_id: string
  /** `YYYY-MM-DD`. */
  date_of_birth: string
  declared_at: string
  source: 'signup' | 'onboarding' | 'vc_sso' | 'admin'
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
