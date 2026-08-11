import type { HelpCategory } from './types'

export const SAFETY_CATEGORY: HelpCategory = {
  id: 'safety',
  title: 'Safety & Reporting',
  description: 'Report a member, track your reports, and what happens next.',
  icon: 'LifeBuoy',
  articles: [
    {
      id: 'report-member',
      title: 'How do I report a member?',
      content: `Use the report action on the member's profile, which opens the grievance form.\n\nPick one of nine categories: Soliciting, Misrepresentation, Intellectual Property Infringement, Abusive Interactions, Harassment, Spam / Scam, Impersonation, Hate Speech or Privacy Violations.\n\nDescribe what happened in at least 20 characters, and add a link to evidence and where on the platform it happened if you can. Specifics make a report actionable; "this person is rude" does not.\n\nThe last step asks you to confirm, and warns that knowingly false reports are themselves a breach. Read it before you submit.\n\nTo report one post or message rather than a person, use the report control on the content itself.`,
      tags: ['report', 'grievance', 'member', 'harassment', 'abuse', 'safety'],
    },
    {
      id: 'track-reports',
      title: 'How do I track a report I filed?',
      content: `"My Reports" in your avatar menu lists every grievance you have filed with its state.\n\nPending — received, not yet picked up. Under Review — a reviewer is working on it. Resolved — action was taken. Dismissed — the reviewer found no breach.\n\nYou are notified when a state changes, so you do not need to keep checking.`,
      tags: ['reports', 'track', 'grievance', 'status', 'pending', 'resolved'],
    },
    {
      id: 'how-reports-handled',
      title: 'What happens after I report something?',
      content: `Reports go to a queue that only OECS and Safety administrators can see. Content reports and member grievances are separate queues with separate handling.\n\nReviewers look at the report, the content and the account history. Outcomes range from no action, through removing content, to restricting or suspending an account.\n\nReported content may be quarantined while it is reviewed — visible to its author with a notice, hidden from everyone else.\n\nYour identity as the reporter is not disclosed to the person reported. You are told the outcome, but not the internal detail of what was decided about someone else's account.`,
      tags: ['moderation', 'review', 'outcome', 'quarantine', 'safety', 'process'],
    },
  ],
}

export const RESOURCES_CATEGORY: HelpCategory = {
  id: 'resources',
  title: 'Resources & Integrations',
  description: 'The knowledge base and partner tools.',
  icon: 'BookOpen',
  articles: [
    {
      id: 'browse-resources',
      title: 'What is in Resources?',
      content: `The Resources page has two tabs: the knowledge base and Integrations.\n\nKnowledge base content comes in six types — Article, Guide, Case Study, Template, Video and Success Story — and is filed under categories including Technology, Healthcare, Education, Agriculture, Environment, Climate Action and Business.\n\nTemplates are the ones worth knowing about early: reusable documents you can adapt rather than starting a proposal from nothing.\n\nYou can sort by "For You" here too, once your personalization topics are set. Resources are public — no account needed to read them.`,
      tags: ['resources', 'knowledge base', 'guides', 'templates', 'case study', 'video'],
    },
    {
      id: 'integrations',
      title: 'What are Integrations?',
      content: `Integrations are partner tools and services connected to or recommended for KTIP work, on the second tab of the Resources page. The /integrations address goes straight there.\n\nThey are grouped into Funding, Productivity, Government, Education and Developer Tools.\n\nEach entry explains what the tool does and how it relates to what you are doing on KTIP. OECS administrators curate the list, so it is a vetted set rather than an open directory.`,
      tags: ['integrations', 'partners', 'tools', 'funding', 'government', 'developer'],
    },
  ],
}

export const TROUBLESHOOTING_CATEGORY: HelpCategory = {
  id: 'troubleshooting',
  title: 'Troubleshooting',
  description: 'Fixes for the problems that come up most.',
  icon: 'Wrench',
  articles: [
    {
      id: 'page-not-loading',
      title: 'A page is not loading properly',
      content: `Work through these in order.\n\n1. Refresh with F5, or Ctrl+Shift+R (Cmd+Shift+R on Mac) for a hard refresh that bypasses the cache.\n\n2. Clear your browser cache — Ctrl+Shift+Delete, or Cmd+Shift+Delete on Mac.\n\n3. Try a private or incognito window. If it works there, the problem is cached data or an extension.\n\n4. Check your internet connection.\n\n5. Try another browser.\n\nIf none of that helps it may be a temporary platform issue. Wait a few minutes, then ask the KTIP Assistant.`,
      tags: ['loading', 'error', 'broken', 'page', 'not working', 'refresh'],
    },
    {
      id: 'cant-login',
      title: 'I cannot log in to my account',
      content: `Check the obvious first: the right email, the right password, caps lock off.\n\nIf you signed up with Google or Microsoft you have no KTIP password. Use the same provider button you originally signed up with — the email/password form will always fail for you.\n\nIf you added a secondary email, either address works with the same password.\n\nForgotten password? Use "Forgot Password?" on the login page.\n\nArriving from the OECS Virtual Campus and bounced back with an error code? The handoff ticket is single use. Go back to the Campus and click through again.\n\nStill locked out? Clear your cookies for the site — stale session data causes this — and if it persists your account may be suspended, in which case reach out through the Help Center contact options.`,
      tags: ['login', 'cannot', 'error', 'locked', 'access', 'oauth', 'suspended'],
    },
    {
      id: 'profile-not-showing',
      title: 'My profile information is not showing',
      content: `If a recovery banner appears at the top of the page, click "Retry" — that reloads your profile without a full sign-in.\n\nOtherwise sign out and back in, which rebuilds the session.\n\nIf fields are genuinely blank, open Settings and check they were saved. The Dashboard profile tab is read-only, so anything you typed there was never stored.`,
      tags: ['profile', 'missing', 'not showing', 'blank', 'empty', 'recovery'],
    },
    {
      id: 'ai-not-working',
      title: 'The AI suggestions are not working',
      content: `AI features call out to a service, so they need a working connection and take a few seconds.\n\n"Improve" needs existing text to work on and does nothing on an empty field. "Suggest" is the one that works from nothing.\n\nAn error message usually means the service is briefly unavailable — wait and try again.\n\nIf AI features fail consistently rather than occasionally, that is a configuration problem on the platform side, not something you can fix. Report it through the forums or the KTIP Assistant.`,
      tags: ['ai', 'suggestions', 'not working', 'error', 'broken', 'improve'],
    },
    {
      id: 'notifications-not-arriving',
      title: 'I am not getting notifications',
      content: `Check Settings, Preferences first. There is a switch per stream, and the email switch governs everything that reaches your inbox.\n\nThese preferences are enforced where notifications are created, so a stream that is off produces nothing at all — there is no backlog to find later.\n\nFor missing email specifically, check your spam folder and, if you added a secondary email, which address the mail actually went to.\n\nIn-app notifications appear on the bell in the navigation bar rather than as browser pop-ups.`,
      tags: ['notifications', 'missing', 'email', 'spam', 'bell', 'preferences'],
    },
    {
      id: 'browser-support',
      title: 'Which browsers does KTIP support?',
      content: `Chrome 90+ (recommended), Firefox 90+, Edge 90+ and Safari 15+.\n\nMobile browsers on iOS and Android work for browsing, messaging and forms.\n\nThe collaboration tools — whiteboard, code sandbox and especially video conferencing — want a desktop browser and a real keyboard.\n\nKeep your browser current. Older versions silently lack features the platform depends on.`,
      tags: ['browser', 'support', 'chrome', 'firefox', 'safari', 'edge', 'mobile'],
    },
    {
      id: 'clear-cache',
      title: 'How do I clear my browser cache?',
      content: `Clearing the cache fixes a lot of display and loading problems.\n\nChrome: Ctrl+Shift+Delete, select "Cached images and files", clear.\n\nFirefox: Ctrl+Shift+Delete, select "Cache", clear.\n\nEdge: Ctrl+Shift+Delete, select "Cached images and files", clear.\n\nSafari: Safari menu, Settings, Privacy, Manage Website Data, Remove All.\n\nOn Mac use Cmd in place of Ctrl. Clearing the cache does not sign you out; clearing cookies does.`,
      tags: ['cache', 'clear', 'browser', 'fix', 'refresh', 'cookies'],
    },
  ],
}

export const ADMIN_CATEGORY: HelpCategory = {
  id: 'admin',
  title: 'For Administrators',
  description: 'The admin console, for OECS and Safety administrators.',
  icon: 'Shield',
  articles: [
    {
      id: 'admin-overview',
      title: 'What is in the admin console?',
      content: `Administrators reach the console from the Admin entry on the dashboard rail. It is only visible to accounts holding an admin role.\n\nIt covers projects, events, users, roles, achievements, moderation, institutions, chambers, grants, forums, resources, grievances, feedback, verification, integrations, employers, the partner API, analytics and UAT feedback.\n\nSafety administrators see the moderation and grievance side. Super administrators see everything.\n\nActions here apply platform-wide, so they are worth being deliberate about.`,
      tags: ['admin', 'console', 'overview', 'oecs', 'management'],
    },
    {
      id: 'admin-users-roles',
      title: 'Managing users and the permission matrix',
      content: `The Users page lists every account with its roles, and lets you grant or remove roles and suspend accounts.\n\nThe Roles page is the permission matrix: a grid of roles against permissions that you can toggle. It is the live source of what each role can do, so a change here changes the product for those users immediately.\n\nSome cells are locked and cannot be toggled. Those are the safeguarding rules — students not initiating direct messages, students not administering funds — and they are deliberately outside admin reach.\n\n"Reset to defaults" restores the shipped matrix.`,
      tags: ['users', 'roles', 'permissions', 'matrix', 'suspend', 'admin', 'rbac'],
    },
    {
      id: 'admin-event-workspace',
      title: 'The event workspace',
      content: `Opening an event in the admin console gives you a workspace of tabs rather than a single edit form.\n\nRegistrations — the attendee list, exportable as CSV. Speakers — the speaker grid. Schedule — sessions, keynotes, breaks and networking slots. Updates — announcements, schedule changes and reminders that reach attendees. Articles — recaps and resource posts published after the event. Challenge — the objectives, constraints, deliverables and judging criteria. Form Builder — a custom registration form. Page Builder — the event's own page layout. Venue — virtual rooms and the floorplan.\n\nFor anything attendees must notice, post an Update. Editing the event record silently changes the page but does not notify anyone.`,
      tags: ['events', 'admin', 'registrations', 'speakers', 'schedule', 'form builder', 'venue'],
    },
    {
      id: 'admin-moderation',
      title: 'The moderation queue',
      content: `Moderation collects reported content and anything the automated filters caught.\n\nEach item shows the content, who reported it and why, and the author's history. You can restore it, remove it, or escalate.\n\nThe filter term list is managed here as well. Terms are what put content into quarantine automatically, so keep them tight — a broad term quarantines legitimate discussion and members experience that as the platform being broken.\n\nGrievances against members are a separate queue with its own page.`,
      tags: ['moderation', 'queue', 'reports', 'filter', 'quarantine', 'admin'],
    },
    {
      id: 'admin-verification-queues',
      title: 'Verification and vetting queues',
      content: `Several queues sit behind the verified badges.\n\nVerification — individual identity requests, with the evidence members uploaded. Institutions — schools and universities, including the email domains that then auto-verify their students. Chamber — Chambers of Commerce and the SME submissions they handle. Employers — employer accounts and their recruiters.\n\nApproving an institution's domain is the high-leverage action: every future student signing up with that domain is verified automatically, so getting the domain right matters more than any single account.`,
      tags: ['verification', 'institutions', 'chamber', 'sme', 'employers', 'queue', 'admin'],
    },
    {
      id: 'admin-publishing',
      title: 'Publishing grants, resources and integrations',
      content: `Grants, Resources, Integrations, Forums and Achievements each have an admin page for creating and curating what members see.\n\nGrants take a title, description, amount range, currency, deadline, eligibility text and either an external application URL or nothing. Leaving the URL empty is what routes applicants into KTIP's own five-step wizard — with a URL set, you never see their applications.\n\nResources and Integrations are straightforward publishing. Forums is where boards are created and posts pinned. Achievements is where badge definitions live.`,
      tags: ['publishing', 'grants', 'resources', 'integrations', 'forums', 'admin', 'curate'],
    },
    {
      id: 'admin-api-analytics',
      title: 'Partner API, analytics and UAT feedback',
      content: `Partner API — issue and revoke API keys for partner organisations. Treat a key as a credential: revoke rather than reuse when a partner relationship changes.\n\nAnalytics — platform usage across projects, events, grants and members.\n\nUAT — feedback submitted during user acceptance testing, with its state.\n\nOne known gap worth being aware of: some guidance refers to a feedback button on every page, but that control is not currently mounted in the app. Feedback reaches you through the forums and the KTIP Assistant instead.`,
      tags: ['api', 'partner', 'keys', 'analytics', 'uat', 'feedback', 'admin'],
    },
  ],
}
