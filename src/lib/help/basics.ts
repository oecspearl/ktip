import type { HelpCategory } from './types'

// Accounts, sign-in and finding your way around the platform.

export const GETTING_STARTED_CATEGORY: HelpCategory = {
  id: 'getting-started',
  title: 'Getting Started',
  description: 'Create an account, sign in, and set up your profile.',
  icon: 'Rocket',
  articles: [
    {
      id: 'create-account',
      title: 'How do I create an account?',
      content: `Click "Sign Up" in the top right corner of any page.\n\nStep 1 asks for your email, a password, your display name and a role. The role picker offers Student, Mentor, Investor, Entrepreneur, Private Sector and Faculty. Step 2 is optional and covers your organisation, industry, country, bio, skills, interests and what kind of collaboration you are open to.\n\nYour password must be at least 8 characters and include a number, a symbol and both upper and lowercase letters. The checklist under the field ticks off each rule as you type.\n\nAfter you submit, check your email for a confirmation link. Roles that need review (such as Student or Faculty) are confirmed by your institution or an OECS reviewer after you sign up.`,
      tags: ['signup', 'register', 'account', 'new', 'join', 'password'],
    },
    {
      id: 'login',
      title: 'How do I log in?',
      content: `Click "Log In" in the top right corner of the page.\n\nEnter the email and password you signed up with, then click "Log In".\n\nIf you added a secondary email in Settings, you can sign in with either address using the same password.\n\nIf you forget your password, click "Forgot Password?" on the login page.`,
      tags: ['login', 'sign in', 'access', 'password'],
    },
    {
      id: 'google-microsoft-login',
      title: 'Can I log in with Google or Microsoft?',
      content: `Yes. On the Login or Sign Up page you will see "Continue with Google" and "Continue with Microsoft".\n\nClick one and you are redirected to that provider to verify your identity, then returned to KTIP already signed in.\n\nThe first time you use it, you land on a short onboarding wizard so you can confirm your name and pick a role.\n\nIf you sign up this way you have no KTIP password, so the email/password form will not work for you — always use the same provider button.`,
      tags: ['google', 'microsoft', 'oauth', 'social login', 'sso'],
    },
    {
      id: 'onboarding-wizard',
      title: 'What is the onboarding wizard?',
      content: `After a Google or Microsoft signup you land on the onboarding wizard instead of going straight to the site.\n\nStep 1 confirms your display name (pre-filled from your provider) and asks you to pick a role. This step is required.\n\nStep 2 is optional profile detail: organisation, industry, country, a short bio, skills, interests and your openness to collaborate.\n\nYou can skip step 2 and fill it in later from Settings, but a fuller profile makes you much easier to find in the member directory.`,
      tags: ['onboarding', 'wizard', 'first time', 'setup', 'role'],
    },
    {
      id: 'vc-signin',
      title: 'Signing in from the OECS Virtual Campus',
      content: `Learners who arrive from the OECS Virtual Campus are already authenticated by the Campus. You are handed to KTIP with a one-time ticket, which is exchanged for a KTIP session automatically.\n\nYou do not need a separate KTIP password for this route.\n\nIf the handoff fails you are sent back to the login page with an error code in the address bar and a short explanation on screen. Returning to the Campus and clicking through again usually clears it, because the ticket is single use.`,
      tags: ['virtual campus', 'vc', 'sso', 'campus', 'handoff', 'learner'],
    },
    {
      id: 'reset-password',
      title: 'How do I reset my password?',
      content: `On the Login page, click "Forgot Password?".\n\nEnter your email address and click "Send Reset Link". You will receive an email with a link to set a new password.\n\nOpen the link, enter the new password twice, and you can sign in with it right away.\n\nThis only applies to email/password accounts. If you signed up with Google or Microsoft, reset your password with that provider instead.`,
      tags: ['forgot', 'reset', 'password', 'recover'],
    },
    {
      id: 'setup-profile',
      title: 'How do I set up my profile?',
      content: `Profile editing lives in Settings. Click your avatar in the top right, choose "Settings", then open the Profile tab.\n\nYou can set your display name, avatar, bio, country, organisation, industry, skills, interests and what collaboration you are open to.\n\nThe Profile tab on your Dashboard is the read-only view — it shows how other members see you, but you make the changes in Settings.\n\nSkills and interests are what the directory filters and the "For You" sorting work from, so they are worth filling in.`,
      tags: ['profile', 'setup', 'bio', 'avatar', 'name', 'skills'],
    },
    {
      id: 'what-are-roles',
      title: 'What are the different user roles?',
      content: `Roles are a list, not a single choice — an account can hold several. They sit in three tiers.\n\nAdmin — Super Admin (OECS Secretariat: system-wide management, policy, audit logs) and Safety Admin (moderation queues and escalations). "OECS Admin" is a legacy label that resolves to Super Admin.\n\nOrganisation — Investor / Funding Agency, Verified SME, Private Sector, Educational Partner and Chamber of Commerce.\n\nIndividual — Entrepreneur, Faculty, Researcher, Mentor and Student.\n\nInvestor, Private Sector, Entrepreneur, Researcher and Mentor are self-assignable: you pick them yourself. Student, Faculty, Verified SME, Educational Partner, Chamber of Commerce and the admin roles are granted only after review by an institution, a Chamber or OECS.\n\nWhat each role can do is controlled by a permission matrix that OECS administrators maintain, so some buttons appear for one role and not another. Two rules never change: Students cannot submit a grant application without a sponsor, and Students cannot start unmonitored direct messages.`,
      tags: ['roles', 'student', 'mentor', 'investor', 'entrepreneur', 'faculty', 'sme', 'permissions'],
    },
    {
      id: 'acting-as-role',
      title: 'Switching which role you are acting as',
      content: `If your account holds more than one role, the avatar menu shows an "Acting as" switcher.\n\nPicking a context narrows your Dashboard rail to the tabs that belong to that role. Switching to your SME context, for example, hides the faculty tabs.\n\nIt never changes what your account actually holds and never signs you out — it is a view filter, not a permission change.\n\nTabs that have no role requirement stay visible in every context.`,
      tags: ['acting as', 'role switcher', 'context', 'multi-role', 'dashboard'],
    },
    {
      id: 'public-vs-signed-in',
      title: 'What can I do without an account?',
      content: `A lot of KTIP is public. Without signing in you can browse Discover, Projects, Events, Grants, Forums, the member Directory, the Leaderboard, member pages, published CVs, Resources and this Help Center.\n\nYou need an account to create anything, apply for a grant, RSVP, post or reply in the forums, send messages, use the collaboration tools, or enter an event venue.\n\nSome actions need more than an account. Creating a project, for example, requires the project-creation permission, which not every role holds.`,
      tags: ['public', 'sign in', 'anonymous', 'guest', 'browse'],
    },
  ],
}

export const NAVIGATION_CATEGORY: HelpCategory = {
  id: 'navigation',
  title: 'Getting Around',
  description: 'Search, tours, notifications and display options.',
  icon: 'Compass',
  articles: [
    {
      id: 'global-search',
      title: 'Find anything with global search',
      content: `Click the magnifier in the navigation bar, or press Ctrl+K (Cmd+K on Mac), to open search from anywhere.\n\nSearch covers pages, projects, events, grants, forum boards, members, resources and every help article at once. Use the arrow keys to move through results and Enter to open one.\n\nWhen a result is a how-to, press the right arrow to expand the steps inline instead of leaving the page.\n\nThe brain icon in the panel turns on AI-guided navigation: describe what you are trying to do in plain language and it points you to the right page.`,
      tags: ['search', 'ctrl+k', 'cmd+k', 'find', 'navigate', 'ai'],
    },
    {
      id: 'page-tours',
      title: 'Taking a page tour',
      content: `Some pages have a guided tour. Open the floating action button in the bottom right and pick the graduation-cap action to start it.\n\nThe tour highlights each part of the page in turn with a short explanation. Press Escape to leave at any point, and start it again whenever you like.\n\nTours can read themselves aloud if you turn narration on.\n\nThe tour action only appears on pages that actually have a tour, so you will not see it everywhere.`,
      tags: ['tour', 'tutorial', 'walkthrough', 'guide', 'narration'],
    },
    {
      id: 'section-rail',
      title: 'The section rail on long pages',
      content: `On long pages a thin rail appears at the right edge with a dot per section.\n\nHover it to see section names, click a dot to jump straight there, and the current section stays highlighted as you scroll.\n\nThe rail builds itself from the page's own sections, and hides itself on pages with fewer than two, so short pages stay clean.`,
      tags: ['rail', 'sections', 'scroll', 'jump', 'navigation'],
    },
    {
      id: 'notifications-bell',
      title: 'Using the notifications bell',
      content: `The bell in the navigation bar carries a count of everything unread.\n\nOpen it to see your newest notifications — messages, event and project activity, collaboration shares, connection requests and achievements. Clicking one takes you to whatever it refers to and marks it read.\n\n"Mark all as read" clears the badge, and "View all invitations" jumps to your invitations inbox.\n\nWhich notifications you receive is up to you: Settings has a switch per category under Preferences.`,
      tags: ['notifications', 'bell', 'unread', 'alerts', 'badge'],
    },
    {
      id: 'floating-action-button',
      title: 'What is the floating button in the corner?',
      content: `The floating button in the bottom right corner is a shortcut stack.\n\nIt opens your messages panel, toggles dark mode, and starts the page tour when the page you are on has one.\n\nIt stays available on every page inside the app, so you never have to go back to the navigation bar for those three things.`,
      tags: ['floating', 'button', 'fab', 'shortcut', 'corner'],
    },
    {
      id: 'display-options',
      title: 'Dark mode and readable text',
      content: `Both live in Settings under Preferences, and dark mode is also on the floating action button.\n\nDark mode applies instantly across the whole platform. Readable font mode switches to a more legible typeface with looser spacing, which helps with long articles and forms.\n\nBoth are stored per device, so your phone and your laptop can be set differently.`,
      tags: ['dark mode', 'theme', 'readable', 'font', 'accessibility', 'contrast'],
    },
  ],
}
