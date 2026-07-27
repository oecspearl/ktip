// Custom types for KTIP application

export type UserRole = 'student' | 'mentor' | 'investor' | 'entrepreneur' | 'private_sector' | 'faculty' | 'oecs'

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

export type ProjectCategory =
  | 'technology'
  | 'healthcare'
  | 'education'
  | 'agriculture'
  | 'environment'
  | 'other'

export interface Profile {
  id: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  country: string | null
  organization: string | null
  industry: string | null
  roles: UserRole[]
  skills: string[]
  interests: string[]
  open_to: string[]
  is_verified: boolean
  created_at: string
  updated_at: string
}

export interface Project {
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
  owner_id: string
  created_at: string
  updated_at: string
  owner?: Profile
}

export interface Event {
  id: string
  title: string
  description: string | null
  summary: string | null
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
  created_at: string
  organizer?: Profile
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

export interface Grant {
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
  is_active: boolean
  is_climate_action: boolean
  created_at: string
}

export type GrantApplicationStatus = 'pending' | 'under_review' | 'approved' | 'rejected'

export interface GrantApplication {
  id: string
  grant_id: string
  user_id: string
  application_data: Record<string, any>
  status: GrantApplicationStatus
  created_at: string
  updated_at: string
  grant?: Grant
  applicant?: Profile
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

export interface Resource {
  id: string
  title: string
  description: string | null
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

export type ProposalType = 'funding' | 'project' | 'research' | 'business'
export type ProposalStatus = 'draft' | 'completed'

export interface Proposal {
  id: string
  user_id: string
  type: ProposalType
  title: string
  status: ProposalStatus
  proposal_data: Record<string, any>
  current_step: number
  share_token: string | null
  project_id: string | null
  created_at: string
  updated_at: string
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
