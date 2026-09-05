import type { Tutorial } from '../../components/tutorial/types'
import { adminTutorialSteps } from './admin'
import {
  adminAchievementsTutorialSteps,
  adminAnalyticsTutorialSteps,
  adminChamberTutorialSteps,
  adminEmployersTutorialSteps,
  adminErrorsTutorialSteps,
  adminEventDetailTutorialSteps,
  adminEventsTutorialSteps,
  adminFeedbackTutorialSteps,
  adminForumsTutorialSteps,
  adminGrantsTutorialSteps,
  adminGrievancesTutorialSteps,
  adminInstitutionsTutorialSteps,
  adminIntegrationsTutorialSteps,
  adminModerationTutorialSteps,
  adminPartnerApiTutorialSteps,
  adminProjectsTutorialSteps,
  adminResourcesTutorialSteps,
  adminRolesTutorialSteps,
  adminUatTutorialSteps,
  adminUsersTutorialSteps,
  adminVerificationTutorialSteps,
} from './admin-sections'
import { chamberTutorialSteps } from './chamber'
import {
  codeTutorialSteps,
  collabListTutorialSteps,
  documentTutorialSteps,
  videoTutorialSteps,
  whiteboardTutorialSteps,
} from './collab-tools'
import { collaborateTutorialSteps } from './collaborate'
import { cvTutorialSteps } from './cv'
import { cvEditTutorialSteps } from './cv-edit'
import { dashboardTutorialSteps } from './dashboard'
import {
  dashboardAchievementsTutorialSteps,
  dashboardConnectionsTutorialSteps,
  dashboardEventsTutorialSteps,
  dashboardProgressTutorialSteps,
  dashboardProjectsTutorialSteps,
  dashboardSubmissionsTutorialSteps,
} from './dashboard-tabs'
import { directoryTutorialSteps } from './directory'
import { eventDetailTutorialSteps } from './event-detail'
import { eventFormTutorialSteps } from './event-form'
import { eventsTutorialSteps } from './events'
import { forumBoardTutorialSteps } from './forum-board'
import { forumPostTutorialSteps } from './forum-post'
import { forumPostFormTutorialSteps } from './forum-post-form'
import { forumsTutorialSteps } from './forums'
import { grantApplicationTutorialSteps } from './grant-application'
import { grantDetailTutorialSteps } from './grant-detail'
import { grantsTutorialSteps } from './grants'
import {
  faqTutorialSteps,
  hackathonsTutorialSteps,
  helpTutorialSteps,
  invitationsTutorialSteps,
  leaderboardTutorialSteps,
  myApplicationsTutorialSteps,
  myGrievancesTutorialSteps,
  resourcesTutorialSteps,
} from './listings'
import { projectDetailTutorialSteps } from './project-detail'
import { projectFormTutorialSteps } from './project-form'
import { projectsTutorialSteps } from './projects'
import { publicCvTutorialSteps } from './public-cv'
import { publicProfileTutorialSteps } from './public-profile'
import { reportUserTutorialSteps } from './report-user'
import { resourceDetailTutorialSteps } from './resource-detail'
import { settingsTutorialSteps } from './settings'
import { submissionReceiptTutorialSteps } from './submission-receipt'
import { venueRoomTutorialSteps, venueTutorialSteps } from './venue'

export const TUTORIAL_IDS = {
  // No entry for '/' — the home page deliberately has no tour.
  PROJECTS: 'projects',
  PROJECT_DETAIL: 'project-detail',
  PROJECT_FORM: 'project-form',
  EVENTS: 'events',
  EVENT_DETAIL: 'event-detail',
  EVENT_FORM: 'event-form',
  GRANTS: 'grants',
  GRANT_DETAIL: 'grant-detail',
  GRANT_APPLICATION: 'grant-application',
  FORUMS: 'forums',
  FORUM_BOARD: 'forum-board',
  FORUM_POST: 'forum-post',
  FORUM_POST_FORM: 'forum-post-form',
  DIRECTORY: 'directory',
  PUBLIC_PROFILE: 'public-profile',
  PUBLIC_CV: 'public-cv',
  RESOURCES: 'resources',
  RESOURCE_DETAIL: 'resource-detail',
  LEADERBOARD: 'leaderboard',
  HACKATHONS: 'hackathons',
  HELP: 'help',
  FAQ: 'faq',
  INVITATIONS: 'invitations',
  MY_APPLICATIONS: 'my-applications',
  MY_GRIEVANCES: 'my-grievances',
  COLLABORATE: 'collaborate',
  COLLAB_LIST: 'collab-list',
  WHITEBOARD: 'whiteboard',
  DOCUMENT: 'document',
  CODE: 'code',
  VIDEO: 'video',
  VENUE: 'venue',
  VENUE_ROOM: 'venue-room',
  DASHBOARD: 'dashboard',
  SUBMISSION_RECEIPT: 'submission-receipt',
  DASHBOARD_PROGRESS: 'dashboard-progress',
  DASHBOARD_ACHIEVEMENTS: 'dashboard-achievements',
  DASHBOARD_PROJECTS: 'dashboard-projects',
  DASHBOARD_EVENTS: 'dashboard-events',
  DASHBOARD_CONNECTIONS: 'dashboard-connections',
  DASHBOARD_SUBMISSIONS: 'dashboard-submissions',
  SETTINGS: 'settings',
  CV: 'cv',
  CV_EDIT: 'cv-edit',
  REPORT_USER: 'report-user',
  CHAMBER: 'chamber',
  ADMIN: 'admin',
  ADMIN_PROJECTS: 'admin-projects',
  ADMIN_EVENTS: 'admin-events',
  ADMIN_EVENT_DETAIL: 'admin-event-detail',
  ADMIN_USERS: 'admin-users',
  ADMIN_ROLES: 'admin-roles',
  ADMIN_ACHIEVEMENTS: 'admin-achievements',
  ADMIN_MODERATION: 'admin-moderation',
  ADMIN_INSTITUTIONS: 'admin-institutions',
  ADMIN_CHAMBER: 'admin-chamber',
  ADMIN_GRANTS: 'admin-grants',
  ADMIN_FORUMS: 'admin-forums',
  ADMIN_RESOURCES: 'admin-resources',
  ADMIN_GRIEVANCES: 'admin-grievances',
  ADMIN_FEEDBACK: 'admin-feedback',
  ADMIN_VERIFICATION: 'admin-verification',
  ADMIN_INTEGRATIONS: 'admin-integrations',
  ADMIN_EMPLOYERS: 'admin-employers',
  ADMIN_PARTNER_API: 'admin-partner-api',
  ADMIN_ANALYTICS: 'admin-analytics',
  ADMIN_UAT: 'admin-uat',
  ADMIN_ERRORS: 'admin-errors',
} as const

export type TutorialId = (typeof TUTORIAL_IDS)[keyof typeof TUTORIAL_IDS]

interface RegisteredTutorial extends Tutorial {
  id: TutorialId
  /**
   * Route pattern this tour belongs to, with `:param` segments — `/projects/:id`
   * matches `/projects/123`. The FAB uses it to decide whether the current page
   * has a tour.
   */
  route: string
}

/**
 * Every tour, in route-matching order.
 *
 * Order is load-bearing: the first pattern that matches wins, so a literal route
 * must sit above any param pattern that would also swallow it —
 * `/projects/new` before `/projects/:id`. `tutorials.test.ts` asserts it by
 * resolving a sample path for each entry and checking it lands back here.
 *
 * An id may appear twice with different routes. That is how a create and an edit
 * page share one tour: the forms are the same fields in the same order, so one
 * set of steps describes both rather than two that drift apart.
 *
 * `autoStart` is deliberately rare — the hub pages only. See useTutorialAutoStart.
 */
const REGISTRY: RegisteredTutorial[] = [
  // ---------------------------------------------------------------- Projects
  {
    id: TUTORIAL_IDS.PROJECT_FORM,
    route: '/projects/new',
    name: 'Creating a project',
    description: 'What each field on the project form does.',
    steps: projectFormTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.PROJECT_FORM,
    route: '/projects/:id/edit',
    name: 'Editing a project',
    description: 'What each field on the project form does.',
    steps: projectFormTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.PROJECT_DETAIL,
    route: '/projects/:id',
    name: 'Project page',
    description: 'Reading a project, and joining one.',
    steps: projectDetailTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.PROJECTS,
    route: '/projects',
    name: 'Projects',
    description: 'Browse and filter innovation projects.',
    steps: projectsTutorialSteps,
    autoStart: true,
  },

  // ------------------------------------------------------------------ Events
  // One entry per public venue segment — a generic ':segment' pattern would
  // also swallow /events/<slug>/setup (the matcher's :param takes anything),
  // so the segments are spelled out. Same id, same steps, either door.
  {
    id: TUTORIAL_IDS.VENUE_ROOM,
    route: '/events/virtual-hackathon/:slug/room/:roomKey',
    name: 'Venue room',
    description: 'Chat, presence and what is coming next.',
    steps: venueRoomTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.VENUE_ROOM,
    route: '/events/virtual-conference/:slug/room/:roomKey',
    name: 'Venue room',
    description: 'Chat, presence and what is coming next.',
    steps: venueRoomTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.VENUE,
    route: '/events/virtual-hackathon/:slug',
    name: 'Virtual venue',
    description: 'Rooms, presence and how to move between them.',
    steps: venueTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.VENUE,
    route: '/events/virtual-conference/:slug',
    name: 'Virtual venue',
    description: 'Rooms, presence and how to move between them.',
    steps: venueTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.EVENT_FORM,
    route: '/events/new',
    name: 'Creating an event',
    description: 'What each field on the event form does.',
    steps: eventFormTutorialSteps,
  },
  // '/events/:id/edit' has no tutorial entry any more: the route is now a
  // redirect into the management workspace, where the same form lives on the
  // Details tab.
  {
    id: TUTORIAL_IDS.EVENT_DETAIL,
    route: '/events/:id',
    name: 'Event page',
    description: 'Registering, and finding the venue.',
    steps: eventDetailTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.EVENTS,
    route: '/events',
    name: 'Events',
    description: 'Find, filter and create events across the region.',
    steps: eventsTutorialSteps,
    autoStart: true,
  },

  // ------------------------------------------------------------------ Grants
  {
    id: TUTORIAL_IDS.MY_APPLICATIONS,
    route: '/grants/my-applications',
    name: 'My Applications',
    description: 'Track drafts, submissions and sponsorships.',
    steps: myApplicationsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.GRANT_APPLICATION,
    route: '/grants/:id/apply',
    name: 'Applying for a grant',
    description: 'The step-by-step application and how drafts work.',
    steps: grantApplicationTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.GRANT_DETAIL,
    route: '/grants/:id',
    name: 'Grant page',
    description: 'Eligibility, deadlines and applying.',
    steps: grantDetailTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.GRANTS,
    route: '/grants',
    name: 'Grants',
    description: 'Browse funding opportunities across the OECS.',
    steps: grantsTutorialSteps,
    autoStart: true,
  },

  // ------------------------------------------------------------------ Forums
  {
    id: TUTORIAL_IDS.FORUM_POST_FORM,
    route: '/forums/:slug/new',
    name: 'New discussion',
    description: 'Starting a discussion on a board.',
    steps: forumPostFormTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.FORUM_POST,
    route: '/forums/:slug/:postId',
    name: 'Forum discussion',
    description: 'Reading a thread and replying.',
    steps: forumPostTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.FORUM_BOARD,
    route: '/forums/:slug',
    name: 'Forum board',
    description: 'Finding a thread, or starting one.',
    steps: forumBoardTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.FORUMS,
    route: '/forums',
    name: 'Forums',
    description: 'Join community discussions.',
    steps: forumsTutorialSteps,
    autoStart: true,
  },

  // --------------------------------------------------------------- Community
  {
    id: TUTORIAL_IDS.DIRECTORY,
    route: '/directory',
    name: 'Member Directory',
    description: 'Find and connect with members across the region.',
    steps: directoryTutorialSteps,
    autoStart: true,
  },
  {
    id: TUTORIAL_IDS.PUBLIC_CV,
    route: '/user/:id/cv',
    name: 'Published CV',
    description: 'Downloading someone’s published résumé.',
    steps: publicCvTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.PUBLIC_PROFILE,
    route: '/user/:id',
    name: 'Member page',
    description: 'Reading a profile and connecting.',
    steps: publicProfileTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.RESOURCE_DETAIL,
    route: '/resources/:id',
    name: 'Resource',
    description: 'Reading and downloading a resource.',
    steps: resourceDetailTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.RESOURCES,
    route: '/resources',
    name: 'Resources',
    description: 'The knowledge base and the integrations list.',
    steps: resourcesTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.LEADERBOARD,
    route: '/leaderboard',
    name: 'Leaderboard',
    description: 'How points and ranks work.',
    steps: leaderboardTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.HACKATHONS,
    route: '/hackathons',
    name: 'Hackathons',
    description: 'Live, upcoming and past hackathons.',
    steps: hackathonsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.FAQ,
    route: '/help/faq',
    name: 'FAQ',
    description: 'Common questions, and how to ask for more.',
    steps: faqTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.HELP,
    route: '/help',
    name: 'Help Center',
    description: 'Articles by topic, and how to reach a person.',
    steps: helpTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.INVITATIONS,
    route: '/invitations',
    name: 'Invitations',
    description: 'Requests waiting on you, and ones you have sent.',
    steps: invitationsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.MY_GRIEVANCES,
    route: '/grievances/my-reports',
    name: 'My Reports',
    description: 'Reports you have filed and where they stand.',
    steps: myGrievancesTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.COLLAB_LIST,
    route: '/collaborate/whiteboards',
    name: 'Your whiteboards',
    description: 'What you have made, and what was shared with you.',
    steps: collabListTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.COLLAB_LIST,
    route: '/collaborate/documents',
    name: 'Your documents',
    description: 'What you have made, and what was shared with you.',
    steps: collabListTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.COLLAB_LIST,
    route: '/collaborate/snippets',
    name: 'Your snippets',
    description: 'What you have made, and what was shared with you.',
    steps: collabListTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.WHITEBOARD,
    route: '/collaborate/whiteboard/new',
    name: 'Whiteboard',
    description: 'Drawing, exporting and sharing a board.',
    steps: whiteboardTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.WHITEBOARD,
    route: '/collaborate/whiteboard/:id',
    name: 'Whiteboard',
    description: 'Drawing, exporting and sharing a board.',
    steps: whiteboardTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DOCUMENT,
    route: '/collaborate/document/new',
    name: 'Document editor',
    description: 'Co-editing, formatting and sharing.',
    steps: documentTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DOCUMENT,
    route: '/collaborate/document/:id',
    name: 'Document editor',
    description: 'Co-editing, formatting and sharing.',
    steps: documentTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.CODE,
    route: '/collaborate/code/new',
    name: 'Code sandbox',
    description: 'Writing, running and sharing snippets.',
    steps: codeTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.CODE,
    route: '/collaborate/code/:id',
    name: 'Code sandbox',
    description: 'Writing, running and sharing snippets.',
    steps: codeTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.VIDEO,
    route: '/collaborate/video',
    name: 'Video conference',
    description: 'Rooms, invitations and who can join.',
    steps: videoTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.COLLABORATE,
    route: '/collaborate',
    name: 'Collaborate',
    description: 'Whiteboards, documents, code and video in real time.',
    steps: collaborateTutorialSteps,
    autoStart: true,
  },

  // ----------------------------------------------------------------- Account
  {
    id: TUTORIAL_IDS.SUBMISSION_RECEIPT,
    route: '/dashboard/submissions/:id',
    name: 'Submission copy',
    description: 'Your record of something you submitted.',
    steps: submissionReceiptTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DASHBOARD_PROGRESS,
    route: '/dashboard/progress',
    name: 'Progress tab',
    description: 'Your activity on KTIP, in order.',
    steps: dashboardProgressTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DASHBOARD_ACHIEVEMENTS,
    route: '/dashboard/achievements',
    name: 'Achievements tab',
    description: 'Badges, points and what unlocks them.',
    steps: dashboardAchievementsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DASHBOARD_PROJECTS,
    route: '/dashboard/projects',
    name: 'Projects tab',
    description: 'Projects you own, including private ones.',
    steps: dashboardProjectsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DASHBOARD_EVENTS,
    route: '/dashboard/events',
    name: 'Events tab',
    description: 'Events you organize.',
    steps: dashboardEventsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DASHBOARD_CONNECTIONS,
    route: '/dashboard/connections',
    name: 'Connections tab',
    description: 'People you are connected to.',
    steps: dashboardConnectionsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DASHBOARD_SUBMISSIONS,
    route: '/dashboard/submissions',
    name: 'Submissions tab',
    description: 'Copies of everything you have submitted.',
    steps: dashboardSubmissionsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.DASHBOARD,
    route: '/dashboard',
    name: 'Dashboard',
    description: 'Your personal page — CV, projects, events, connections.',
    steps: dashboardTutorialSteps,
    autoStart: true,
  },
  {
    id: TUTORIAL_IDS.SETTINGS,
    route: '/settings',
    name: 'Settings',
    description: 'Profile, security, preferences, personalization, verification.',
    steps: settingsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.CV_EDIT,
    // The editor is a dashboard pane now; /cv/edit only redirects here, and a
    // tour keyed to the redirect would never find its anchors.
    route: '/dashboard/profile/edit',
    name: 'Editing your CV',
    description: 'Sections, prefill, and what saving marks as yours.',
    steps: cvEditTutorialSteps,
  },
  // Lives in the dashboard now (the My CV tab); the old /cv address redirects
  // there. This tour replaced the separate 'dashboard-profile' tab tour when
  // the tab became the full CV page.
  {
    id: TUTORIAL_IDS.CV,
    route: '/dashboard/profile',
    name: 'My CV',
    description: 'Your résumé, ready to download or publish.',
    steps: cvTutorialSteps,
    autoStart: true,
  },
  {
    id: TUTORIAL_IDS.REPORT_USER,
    route: '/grievances/report/:userId',
    name: 'Reporting a member',
    description: 'What the safety team needs, and what happens next.',
    steps: reportUserTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.CHAMBER,
    route: '/sme/verification',
    name: 'Chamber verification',
    description: 'Getting your business verified by your Chamber.',
    steps: chamberTutorialSteps,
  },

  // ------------------------------------------------------------------- Admin
  // Sections first; '/admin' is the catch-all for the console's own dashboard.
  {
    id: TUTORIAL_IDS.ADMIN_PROJECTS,
    route: '/admin/projects',
    name: 'Admin — Projects',
    description: 'Featuring and removing published projects.',
    steps: adminProjectsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_EVENT_DETAIL,
    route: '/admin/events/:id',
    name: 'Admin — Event',
    description: 'Registrations, schedule, venue and the builders.',
    steps: adminEventDetailTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_EVENTS,
    route: '/admin/events',
    name: 'Admin — Events',
    description: 'Drafts, publishing and cancellation.',
    steps: adminEventsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_USERS,
    route: '/admin/users',
    name: 'Admin — Users',
    description: 'Accounts, roles, verification and deletion.',
    steps: adminUsersTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_ROLES,
    route: '/admin/roles',
    name: 'Admin — Roles',
    description: 'The permission matrix, its locks and its history.',
    steps: adminRolesTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_ACHIEVEMENTS,
    route: '/admin/achievements',
    name: 'Admin — Achievements',
    description: 'The badge catalogue and its unlock rules.',
    steps: adminAchievementsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_MODERATION,
    route: '/admin/moderation',
    name: 'Admin — Moderation',
    description: 'Reported content, automated flags and the rules.',
    steps: adminModerationTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_INSTITUTIONS,
    route: '/admin/institutions',
    name: 'Admin — Institutions',
    description: 'Verifying institutions and the domains they own.',
    steps: adminInstitutionsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_CHAMBER,
    route: '/admin/chamber',
    name: 'Admin — Chamber Review',
    description: 'Vetting businesses against the corporate registry.',
    steps: adminChamberTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_GRANTS,
    route: '/admin/grants',
    name: 'Admin — Grants',
    description: 'Creating grants and reviewing applications.',
    steps: adminGrantsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_FORUMS,
    route: '/admin/forums',
    name: 'Admin — Forums',
    description: 'Boards, pinning, locking and removal.',
    steps: adminForumsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_RESOURCES,
    route: '/admin/resources',
    name: 'Admin — Resources',
    description: 'The knowledge base and publishing.',
    steps: adminResourcesTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_GRIEVANCES,
    route: '/admin/grievances',
    name: 'Admin — Grievances',
    description: 'Working reports filed about members.',
    steps: adminGrievancesTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_FEEDBACK,
    route: '/admin/feedback',
    name: 'Admin — Feedback',
    description: 'Bug reports and requests from the widget.',
    steps: adminFeedbackTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_VERIFICATION,
    route: '/admin/verification',
    name: 'Admin — Verification',
    description: 'Reviewing identity documents.',
    steps: adminVerificationTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_INTEGRATIONS,
    route: '/admin/integrations',
    name: 'Admin — Integrations',
    description: 'Curating the external tools directory.',
    steps: adminIntegrationsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_EMPLOYERS,
    route: '/admin/employers',
    name: 'Admin — Employers',
    description: 'Verification, history and partner-API publishing.',
    steps: adminEmployersTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_PARTNER_API,
    route: '/admin/partner-api',
    name: 'Admin — Partner API',
    description: 'Issuing and revoking partner keys.',
    steps: adminPartnerApiTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_ANALYTICS,
    route: '/admin/analytics',
    name: 'Admin — Analytics',
    description: 'Views, features, funnels and what they undercount.',
    steps: adminAnalyticsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_UAT,
    route: '/admin/uat',
    name: 'Admin — UAT Feedback',
    description: 'Structured usefulness and experience scores.',
    steps: adminUatTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN_ERRORS,
    route: '/admin/errors',
    name: 'Admin — Errors',
    description: 'Grouped runtime errors and how to triage them.',
    steps: adminErrorsTutorialSteps,
  },
  {
    id: TUTORIAL_IDS.ADMIN,
    route: '/admin',
    name: 'Admin',
    description: 'Platform administration and analytics.',
    steps: adminTutorialSteps,
    autoStart: true,
  },
]

export const tutorials = REGISTRY.reduce(
  (acc, tutorial) => {
    acc[tutorial.id] = tutorial
    return acc
  },
  {} as Record<TutorialId, Tutorial>
)

export function getTutorialById(id: string): Tutorial | undefined {
  return tutorials[id as TutorialId]
}

/** One pattern segment matches one path segment: `:param` takes anything non-empty. */
function matchesPattern(pattern: string, pathname: string): boolean {
  const p = pattern.split('/')
  const a = pathname.split('/')
  if (p.length !== a.length) return false
  return p.every((seg, i) => (seg.startsWith(':') ? a[i].length > 0 : seg === a[i]))
}

export function tutorialIdForPath(pathname: string): TutorialId | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const hit = REGISTRY.find((t) => matchesPattern(t.route, normalized))
  return hit ? hit.id : null
}

/** Exported for the registry test, which checks specific-before-general ordering. */
export const ROUTE_TUTORIAL_PATTERNS: Array<[pattern: string, id: TutorialId]> = REGISTRY.map(
  (t) => [t.route, t.id]
)
