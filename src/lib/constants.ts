// Application Constants

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
  OECS: 'oecs',
} as const

export const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  mentor: 'Mentor',
  investor: 'Investor',
  entrepreneur: 'Entrepreneur',
  private_sector: 'Private Sector',
  oecs: 'OECS Admin',
}

export const ROLE_COLORS: Record<string, string> = {
  student: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  mentor: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  investor: 'bg-purple-100 text-purple-700 border-purple-200',
  entrepreneur: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  private_sector: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  oecs: 'bg-pink-100 text-pink-700 border-pink-200',
}

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
  concept: 'bg-gray-100 text-gray-700 border-gray-200',
  prototype: 'bg-blue-100 text-blue-700 border-blue-200',
  funding: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  launch: 'bg-green-100 text-green-700 border-green-200',
}

// Project Categories
export const PROJECT_CATEGORIES = [
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { value: 'education', label: 'Education', icon: '📚' },
  { value: 'agriculture', label: 'Agriculture', icon: '🌾' },
  { value: 'environment', label: 'Environment', icon: '🌍' },
  { value: 'other', label: 'Other', icon: '✨' },
] as const

// Event Types
export const EVENT_TYPES = {
  HACKATHON: 'hackathon',
  WORKSHOP: 'workshop',
  MEETUP: 'meetup',
  CONFERENCE: 'conference',
  DEMO_DAY: 'demo_day',
} as const

export const EVENT_TYPE_LABELS: Record<string, string> = {
  hackathon: 'Hackathon',
  workshop: 'Workshop',
  meetup: 'Meetup',
  conference: 'Conference',
  demo_day: 'Demo Day',
}

export const EVENT_TYPE_COLORS: Record<string, string> = {
  hackathon: 'bg-purple-100 text-purple-700 border-purple-200',
  workshop: 'bg-blue-100 text-blue-700 border-blue-200',
  meetup: 'bg-green-100 text-green-700 border-green-200',
  conference: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  demo_day: 'bg-pink-100 text-pink-700 border-pink-200',
}

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
  draft: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  published: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
}

// RSVP Statuses
export const RSVP_STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  checked_in: 'Checked In',
}

export const RSVP_STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  waitlisted: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  checked_in: 'bg-blue-100 text-blue-700 border-blue-200',
}

// Event Update Types
export const EVENT_UPDATE_TYPE_LABELS: Record<string, string> = {
  announcement: 'Announcement',
  schedule_change: 'Schedule Change',
  reminder: 'Reminder',
}

export const EVENT_UPDATE_TYPE_COLORS: Record<string, string> = {
  announcement: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  schedule_change: 'bg-orange-100 text-orange-700 border-orange-200',
  reminder: 'bg-purple-100 text-purple-700 border-purple-200',
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
  startup: 'bg-purple-100 text-purple-700 border-purple-200',
  research: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  innovation: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  development: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  education: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

// Grant Application Statuses
export const GRANT_APPLICATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const GRANT_APPLICATION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  under_review: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  approved: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
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
  keynote: 'bg-purple-100 text-purple-700 border-purple-200',
  workshop: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  networking: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
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
  MESSAGES: '/messages',
  FORUMS: '/forums',
  FORUM_BOARD: (slug: string) => `/forums/${slug}`,
  FORUM_POST: (slug: string, postId: string) => `/forums/${slug}/${postId}`,
  CREATE_FORUM_POST: (slug: string) => `/forums/${slug}/new`,
  PROFILE: (id: string) => `/profile/${id}`,
  MY_PROFILE: '/profile/me',
  SETTINGS: '/settings',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  PROPOSALS: '/proposals',
  CREATE_PROPOSAL: '/proposals/new',
  PROPOSAL_DETAIL: (id: string) => `/proposals/${id}`,
  SHARED_PROPOSAL: (token: string) => `/proposals/shared/${token}`,
  COLLABORATE: '/collaborate',
  WHITEBOARD: '/collaborate/whiteboard',
  DOCUMENT_EDITOR: '/collaborate/document',
  CODE_EDITOR: '/collaborate/code',
  VIDEO_CONFERENCE: '/collaborate/video',
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

// Proposal Types
export const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  funding: 'Funding/Grant Proposal',
  project: 'Project Proposal',
  research: 'Research Proposal',
  business: 'Business Proposal',
}

export const PROPOSAL_TYPE_COLORS: Record<string, string> = {
  funding: 'bg-purple-100 text-purple-700 border-purple-200',
  project: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  research: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  business: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
}

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  completed: 'Completed',
}

export const PROPOSAL_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  completed: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
}

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
  guide: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  case_study: 'bg-purple-100 text-purple-700 border-purple-200',
  template: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  video: 'bg-pink-100 text-pink-700 border-pink-200',
  success_story: 'bg-yellow-100 text-yellow-700 border-yellow-200',
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

// Climate Action
export const CLIMATE_ACTION_BADGE_CLASS = 'bg-emerald-100 text-emerald-700 border-emerald-200'

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
  soliciting: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  misrepresentation: 'bg-orange-100 text-orange-700 border-orange-200',
  ip_infringement: 'bg-purple-100 text-purple-700 border-purple-200',
  abusive_interactions: 'bg-red-100 text-red-700 border-red-200',
  harassment: 'bg-red-100 text-red-700 border-red-200',
  spam_scam: 'bg-gray-100 text-gray-700 border-gray-200',
  impersonation: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  hate_speech: 'bg-pink-100 text-pink-700 border-pink-200',
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
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  under_review: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  resolved: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  dismissed: 'bg-gray-100 text-gray-700 border-gray-200',
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
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
} as const

// Date Formats
export const DATE_FORMATS = {
  SHORT: 'MMM d, yyyy',
  LONG: 'MMMM d, yyyy',
  WITH_TIME: 'MMM d, yyyy h:mm a',
  FULL: 'EEEE, MMMM d, yyyy',
} as const
