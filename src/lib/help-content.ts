import type { UserRole } from '../types'

export interface HelpArticle {
  id: string
  title: string
  content: string
  tags: string[]
}

export interface HelpCategory {
  id: string
  title: string
  description: string
  icon: string
  articles: HelpArticle[]
}

export interface GettingStartedGuide {
  role: UserRole
  title: string
  description: string
  steps: string[]
  quickLinks: { label: string; href: string }[]
}

// ---------------------------------------------------------------------------
// Help Categories & Articles
// ---------------------------------------------------------------------------

export const HELP_CATEGORIES: HelpCategory[] = [
  // 1. Getting Started
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics of creating an account and setting up your profile.',
    icon: 'Rocket',
    articles: [
      {
        id: 'create-account',
        title: 'How do I create an account?',
        content: `Go to the Sign Up page by clicking "Sign Up" in the top right corner of any page.\n\nYou can create an account by entering your email address and choosing a password. You will also pick a display name and select your role (for example Student, Mentor, or Entrepreneur).\n\nAfter you submit the form, check your email for a confirmation link. Click it to activate your account, then you can log in right away.`,
        tags: ['signup', 'register', 'account', 'new', 'join'],
      },
      {
        id: 'login',
        title: 'How do I log in?',
        content: `Click "Log In" in the top right corner of the page.\n\nEnter the email and password you used when you signed up. Then click the "Log In" button.\n\nIf you forget your password, click the "Forgot Password?" link on the login page to reset it.`,
        tags: ['login', 'sign in', 'access', 'password'],
      },
      {
        id: 'google-microsoft-login',
        title: 'Can I log in with Google or Microsoft?',
        content: `Yes! On the Login or Sign Up page, you will see buttons for "Continue with Google" and "Continue with Microsoft".\n\nClick one of these buttons and you will be redirected to Google or Microsoft to verify your identity. Once verified, you will be automatically logged in to KTIP.\n\nThis is a quick way to get started without creating a separate password.`,
        tags: ['google', 'microsoft', 'oauth', 'social login', 'sso'],
      },
      {
        id: 'reset-password',
        title: 'How do I reset my password?',
        content: `If you forgot your password, go to the Login page and click "Forgot Password?".\n\nEnter your email address and click "Send Reset Link". You will receive an email with a link to create a new password.\n\nClick the link in the email, enter your new password, and confirm it. You can then log in with your new password.`,
        tags: ['forgot', 'reset', 'password', 'recover'],
      },
      {
        id: 'setup-profile',
        title: 'How do I set up my profile?',
        content: `After logging in, click your name or avatar in the top right corner and select your profile, or go to Settings.\n\nIn the Profile section, you can add a display name, write a short bio about yourself, select your country, and update your role.\n\nA complete profile helps other users understand who you are and makes it easier to connect with the right people.`,
        tags: ['profile', 'setup', 'bio', 'avatar', 'name'],
      },
      {
        id: 'what-are-roles',
        title: 'What are the different user roles?',
        content: `KTIP has six roles you can choose from:\n\nStudent — You are learning and want to explore projects, events, and grants.\n\nMentor — You have experience and want to guide others on their innovation journey.\n\nEntrepreneur — You are building a business or project and looking for support.\n\nInvestor — You want to discover promising projects and fund innovation.\n\nPrivate Sector — You represent a company interested in partnerships and collaboration.\n\nOECS — You are part of the Organisation of Eastern Caribbean States and support regional innovation.\n\nYou can change your role at any time from your Settings page.`,
        tags: ['roles', 'student', 'mentor', 'investor', 'entrepreneur', 'oecs', 'private sector'],
      },
    ],
  },

  // 2. Projects
  {
    id: 'projects',
    title: 'Projects',
    description: 'Create, browse, and manage innovation projects.',
    icon: 'FolderKanban',
    articles: [
      {
        id: 'browse-projects',
        title: 'How do I browse projects?',
        content: `Click "Projects" in the navigation bar at the top of the page.\n\nYou will see a list of all public projects. You can search by keyword, filter by category (like Technology or Healthcare), or filter by phase (like Concept or Funding).\n\nClick on any project card to see its full details, including the description, owner, and comments.`,
        tags: ['browse', 'projects', 'search', 'filter', 'explore'],
      },
      {
        id: 'create-project',
        title: 'How do I create a new project?',
        content: `You need to be logged in to create a project. Go to the Projects page and click the "Create Project" button.\n\nFill in the project title, choose a category (Technology, Healthcare, Education, Agriculture, Environment, or Other), and write a description of your project.\n\nSelect your current phase: Concept (just an idea), Prototype (building something), Funding (looking for money), or Launch (ready to go).\n\nYou can also add hashtags to help people find your project and choose whether it is public or private.`,
        tags: ['create', 'project', 'new', 'start', 'build'],
      },
      {
        id: 'edit-project',
        title: 'How do I edit my project?',
        content: `Go to your project's detail page by clicking on it from the Projects list.\n\nIf you are the owner, you will see an "Edit" button near the top of the page. Click it to update the title, description, category, phase, hashtags, or visibility.\n\nWhen you are done, click "Save Changes" to update your project.`,
        tags: ['edit', 'update', 'modify', 'change', 'project'],
      },
      {
        id: 'project-phases',
        title: 'What do the project phases mean?',
        content: `Each project has a phase that shows where it is in its journey:\n\nConcept — The project is still just an idea. You are exploring whether it could work.\n\nPrototype — You are actively building a first version or minimum viable product (MVP).\n\nFunding — Your project needs money to grow. You are looking for grants, investors, or sponsors.\n\nLaunch — Your project is ready to go live or has already launched.\n\nYou can update the phase at any time as your project progresses.`,
        tags: ['phase', 'concept', 'prototype', 'funding', 'launch', 'stages'],
      },
      {
        id: 'project-comments',
        title: 'How do comments and likes work?',
        content: `On any project detail page, you can leave a comment to share your thoughts or ask questions. Scroll down to the Comments section and type your message.\n\nYou can also click the heart button to like a project. This helps the project owner know their idea is appreciated and helps popular projects get noticed.\n\nYou need to be logged in to comment or like a project.`,
        tags: ['comments', 'likes', 'feedback', 'engage', 'interact'],
      },
    ],
  },

  // 3. Events
  {
    id: 'events',
    title: 'Events',
    description: 'Discover and organize hackathons, workshops, meetups, and more.',
    icon: 'Calendar',
    articles: [
      {
        id: 'browse-events',
        title: 'How do I find events?',
        content: `Click "Events" in the navigation bar to see all upcoming events.\n\nYou can search by keyword, filter by event type (Hackathon, Workshop, Meetup, Conference, or Demo Day), or look for virtual-only events.\n\nEach event card shows the title, date, location, and type so you can quickly find what interests you.`,
        tags: ['browse', 'events', 'find', 'search', 'upcoming'],
      },
      {
        id: 'create-event',
        title: 'How do I create an event?',
        content: `You need to be logged in to create an event. Go to the Events page and click "Create Event".\n\nFill in the event title, description, and choose the type (Hackathon, Workshop, Meetup, Conference, or Demo Day).\n\nSet the start date and time. You can also add an end date and time if the event spans multiple hours or days.\n\nChoose whether the event is virtual or in-person. For in-person events, add a location. You can optionally set a maximum capacity.`,
        tags: ['create', 'event', 'organize', 'new', 'host'],
      },
      {
        id: 'event-types',
        title: 'What types of events can I create?',
        content: `KTIP supports five types of events:\n\nHackathon — A coding or innovation competition where teams build something in a short time.\n\nWorkshop — A hands-on learning session focused on a specific skill or topic.\n\nMeetup — A casual gathering for networking and discussion.\n\nConference — A larger event with speakers, panels, and presentations.\n\nDemo Day — A showcase where innovators present their projects to an audience.\n\nChoose the type that best fits your event when creating it.`,
        tags: ['hackathon', 'workshop', 'meetup', 'conference', 'demo day', 'types'],
      },
      {
        id: 'virtual-events',
        title: 'How do virtual events work?',
        content: `When creating an event, check the "This is a virtual event" box. Virtual events do not need a physical location.\n\nYou can use KTIP's built-in Video Conference tool (under Collaboration Tools) or include a link to your preferred video platform in the event description.\n\nVirtual events are a great way to include participants from across the Caribbean and beyond.`,
        tags: ['virtual', 'online', 'remote', 'video', 'event'],
      },
      {
        id: 'edit-event',
        title: 'How do I edit or update my event?',
        content: `Go to your event's detail page and click the "Edit" button. Only the event organizer can edit an event.\n\nYou can update the title, description, type, date, time, location, and capacity.\n\nClick "Save Changes" when you are done. Attendees will see the updated information immediately.`,
        tags: ['edit', 'update', 'event', 'change', 'modify'],
      },
    ],
  },

  // 4. Grants & Funding
  {
    id: 'grants',
    title: 'Grants & Funding',
    description: 'Find funding opportunities to support your innovation.',
    icon: 'DollarSign',
    articles: [
      {
        id: 'browse-grants',
        title: 'How do I find grants?',
        content: `Click "Grants" in the navigation bar to see all available funding opportunities.\n\nYou can search by keyword and filter by grant type or status. Each grant shows the funding amount range, deadline, and eligibility requirements.\n\nClick on a grant to see full details including how to apply.`,
        tags: ['grants', 'funding', 'browse', 'find', 'money'],
      },
      {
        id: 'grant-eligibility',
        title: 'How do I know if I am eligible for a grant?',
        content: `Each grant listing includes an "Eligibility" section that describes who can apply.\n\nCommon eligibility criteria include your role (student, entrepreneur, etc.), your country, the type of project, and the project phase.\n\nRead the eligibility section carefully before applying. If you are unsure, contact the grant provider using the details on the grant page.`,
        tags: ['eligibility', 'qualify', 'requirements', 'criteria', 'grant'],
      },
      {
        id: 'apply-grant',
        title: 'How do I apply for a grant?',
        content: `On the grant detail page, you will find the application link or instructions.\n\nSome grants have an external application link that takes you to the grant provider's website. Others may have specific instructions listed in the description.\n\nMake sure to apply before the deadline shown on the grant page. You can track your applications from the "My Applications" page.`,
        tags: ['apply', 'application', 'grant', 'submit', 'deadline'],
      },
      {
        id: 'track-applications',
        title: 'How do I track my grant applications?',
        content: `After logging in, go to "My Applications" from the Grants section.\n\nThis page shows all the grants you have applied for, along with their current status.\n\nYou can see which applications are pending, approved, or declined.`,
        tags: ['track', 'applications', 'status', 'my', 'grants'],
      },
      {
        id: 'grant-types',
        title: 'What types of grants are available?',
        content: `KTIP lists various types of grants and funding opportunities:\n\nResearch Grants — For academic or scientific research projects.\n\nStartup Funding — For new businesses and entrepreneurial ventures.\n\nProject Grants — For specific innovation projects with clear goals.\n\nScholarships — For students pursuing education in innovation-related fields.\n\nThe funding amounts and deadlines vary for each opportunity. Check regularly for new listings.`,
        tags: ['types', 'research', 'startup', 'scholarship', 'funding'],
      },
    ],
  },

  // 5. Forums
  {
    id: 'forums',
    title: 'Forums',
    description: 'Join community discussions and share knowledge.',
    icon: 'Users',
    articles: [
      {
        id: 'browse-forums',
        title: 'How do I browse the forums?',
        content: `Click "Forums" in the navigation bar to see all discussion boards.\n\nEach board has a topic (like General Discussion, Project Help, or Funding Advice). Click on a board to see all the posts inside it.\n\nYou can read posts without logging in, but you need to be logged in to create posts or reply.`,
        tags: ['forums', 'browse', 'boards', 'discussions', 'topics'],
      },
      {
        id: 'create-post',
        title: 'How do I create a forum post?',
        content: `Go to the board where you want to post and click the "New Post" button.\n\nEnter a title for your post and write your content. Try to be clear and specific so others can help you or join the conversation.\n\nClick "Create Post" to publish it. Other users can then reply to your post.`,
        tags: ['create', 'post', 'new', 'forum', 'write'],
      },
      {
        id: 'reply-post',
        title: 'How do I reply to a post?',
        content: `Open the post you want to reply to by clicking on it.\n\nScroll down to the reply section. Type your response in the text box and click "Reply".\n\nYour reply will appear at the bottom of the conversation. Be respectful and helpful in your replies.`,
        tags: ['reply', 'respond', 'comment', 'forum', 'post'],
      },
      {
        id: 'pinned-posts',
        title: 'What are pinned posts?',
        content: `Pinned posts are important posts that stay at the top of a board. They are marked with a pin icon.\n\nPinned posts usually contain important announcements, rules, or frequently referenced information.\n\nOnly board moderators can pin or unpin posts.`,
        tags: ['pinned', 'pin', 'sticky', 'important', 'top'],
      },
    ],
  },

  // 6. Messages
  {
    id: 'messages',
    title: 'Messages',
    description: 'Send direct messages and chat with other users.',
    icon: 'MessageSquare',
    articles: [
      {
        id: 'send-message',
        title: 'How do I send a message to someone?',
        content: `You need to be logged in to use messages. Click "Messages" in the navigation bar.\n\nTo start a new conversation, click "New Message" and search for the user you want to contact by name.\n\nType your message and press Enter or click the send button. The other user will see your message the next time they check their messages.`,
        tags: ['send', 'message', 'chat', 'contact', 'direct'],
      },
      {
        id: 'view-conversations',
        title: 'How do I view my conversations?',
        content: `Go to the Messages page by clicking "Messages" in the navigation bar.\n\nYou will see a list of all your conversations on the left side. Click on any conversation to see the full chat history.\n\nNew messages are shown in real time, so you do not need to refresh the page.`,
        tags: ['view', 'conversations', 'inbox', 'messages', 'history'],
      },
      {
        id: 'message-tips',
        title: 'Tips for effective messaging',
        content: `Introduce yourself when messaging someone for the first time.\n\nBe clear about what you are looking for or offering. For example: "Hi, I am a student working on a healthcare app and would love your mentoring advice."\n\nKeep messages professional and respectful. Remember that KTIP connects people across different countries and backgrounds.\n\nUse the forum boards for general questions. Save direct messages for personal or specific conversations.`,
        tags: ['tips', 'messaging', 'etiquette', 'best practices'],
      },
    ],
  },

  // 7. Grant Applications
  {
    id: 'grant-applications',
    title: 'Grant Applications',
    description: 'Apply for grants with the guided application wizard.',
    icon: 'FileText',
    articles: [
      {
        id: 'apply-for-grant',
        title: 'How do I apply for a grant?',
        content: `Open a grant from the Grants page and click "Apply Now".\n\nThe application wizard guides you through 5 steps: Basics, Summary & Problem, Solution & Plan, Budget & Team, and Impact & Review.\n\nYour work is auto-saved every few seconds, so you will not lose your progress. You can also click "Save Draft" at any time.\n\nOn the final step, review your application and click "Submit Application".`,
        tags: ['apply', 'grant', 'application', 'wizard', 'steps'],
      },
      {
        id: 'ai-suggestions',
        title: 'How do the AI suggestions work?',
        content: `Each text field in the application wizard has AI-powered tools:\n\nImprove — Rewrites your existing content to be more professional and compelling.\n\nSuggest — Generates content for a section based on the grant and what you have written so far.\n\nTone — Adjusts the tone of your content (Professional, Persuasive, Academic, or Concise).\n\nLook for the small buttons below each text field. Click one and the AI will generate a suggestion. You can accept it, modify it, or discard it.\n\nThe AI Review on the final step scores your complete application and gives specific feedback.`,
        tags: ['ai', 'suggestions', 'improve', 'generate', 'review', 'tone'],
      },
      {
        id: 'resume-draft',
        title: 'How do I continue working on a draft application?',
        content: `Go to My Applications (under Grants) to see all your applications.\n\nDrafts are marked with a "Draft" badge. Click "Continue" to pick up where you left off.\n\nThe wizard will take you to the step where you stopped, and all your previous work will be there. You can also reopen the grant page — the button will read "Continue Application".`,
        tags: ['draft', 'resume', 'continue', 'edit', 'save', 'application'],
      },
      {
        id: 'application-status',
        title: 'How do I track my application status?',
        content: `Go to My Applications to see the status of each application:\n\nDraft — You have not submitted yet. Click "Continue" to finish.\n\nPending — Submitted and waiting for review.\n\nUnder Review — An administrator is reviewing your application.\n\nApproved / Rejected — The final decision on your application.`,
        tags: ['status', 'track', 'pending', 'approved', 'rejected'],
      },
    ],
  },

  // 8. Collaboration Tools
  {
    id: 'collaboration',
    title: 'Collaboration Tools',
    description: 'Work together with whiteboards, documents, code, and video.',
    icon: 'Handshake',
    articles: [
      {
        id: 'collaboration-overview',
        title: 'What collaboration tools are available?',
        content: `KTIP provides four collaboration tools to help you work with others:\n\nWhiteboard — A visual canvas for brainstorming, drawing diagrams, and mapping ideas.\n\nDocument Editor — A shared document space for writing and editing text together.\n\nCode Editor — A coding environment where you can write and share code.\n\nVideo Conference — A face-to-face meeting tool for real-time video calls.\n\nAll collaboration tools require you to be logged in.`,
        tags: ['collaboration', 'tools', 'overview', 'whiteboard', 'document', 'code', 'video'],
      },
      {
        id: 'whiteboard',
        title: 'How do I use the Whiteboard?',
        content: `Go to the Collaborate section and click "Whiteboard".\n\nThe whiteboard is a free-form canvas where you can draw, write text, add shapes, and move things around.\n\nUse the toolbar at the top or side to select tools like pen, text, shapes, or eraser.\n\nThe whiteboard is great for brainstorming sessions, planning project layouts, or sketching ideas before building them.`,
        tags: ['whiteboard', 'draw', 'brainstorm', 'canvas', 'diagram'],
      },
      {
        id: 'document-editor',
        title: 'How do I use the Document Editor?',
        content: `Go to the Collaborate section and click "Document Editor".\n\nYou can create and edit documents with rich text formatting (bold, italic, lists, headings, etc.).\n\nThis is perfect for writing project plans, meeting notes, research outlines, or any other shared documents.`,
        tags: ['document', 'editor', 'write', 'text', 'collaborate'],
      },
      {
        id: 'code-editor',
        title: 'How do I use the Code Editor?',
        content: `Go to the Collaborate section and click "Code Editor".\n\nThe code editor provides a coding environment with syntax highlighting. You can write, edit, and review code.\n\nThis tool is useful for hackathons, coding workshops, or when working on a technical project with others.`,
        tags: ['code', 'editor', 'programming', 'coding', 'syntax'],
      },
      {
        id: 'video-conference',
        title: 'How do I start a video conference?',
        content: `Go to the Collaborate section and click "Video Conference".\n\nYou can start a video call to meet face-to-face with other users. Make sure your browser has permission to access your camera and microphone.\n\nVideo conferences are great for team meetings, mentoring sessions, or pitching ideas to investors.`,
        tags: ['video', 'conference', 'call', 'meeting', 'camera'],
      },
    ],
  },

  // 9. Account & Settings
  {
    id: 'settings',
    title: 'Account & Settings',
    description: 'Manage your profile, password, and account preferences.',
    icon: 'Settings',
    articles: [
      {
        id: 'edit-profile',
        title: 'How do I edit my profile?',
        content: `Click your name or avatar in the top right corner and go to Settings.\n\nIn the Profile tab, you can update your display name, bio, country, and role.\n\nClick "Save Changes" when you are done. Your updated profile will be visible to other users.`,
        tags: ['edit', 'profile', 'name', 'bio', 'country'],
      },
      {
        id: 'change-password',
        title: 'How do I change my password?',
        content: `Go to Settings and find the Security or Password section.\n\nEnter your new password and confirm it. Click "Update Password" to save the change.\n\nMake sure your new password is at least 8 characters long and includes a mix of letters and numbers for security.`,
        tags: ['change', 'password', 'security', 'update'],
      },
      {
        id: 'change-email',
        title: 'How do I change my email address?',
        content: `Go to Settings and find the Email section.\n\nEnter your new email address and click "Update Email". You may need to verify the new email address by clicking a link sent to it.\n\nNote: If you signed up with Google or Microsoft, your email is managed by that provider.`,
        tags: ['change', 'email', 'address', 'update'],
      },
      {
        id: 'delete-account',
        title: 'How do I delete my account?',
        content: `Go to Settings and scroll to the Danger Zone at the bottom.\n\nClick "Delete Account". You will be asked to confirm this action.\n\nWarning: Deleting your account is permanent. All your projects, grant applications, messages, and other data will be removed and cannot be recovered.\n\nIf you just want to take a break, consider logging out instead of deleting your account.`,
        tags: ['delete', 'account', 'remove', 'permanent', 'close'],
      },
    ],
  },

  // 10. Troubleshooting
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Solutions for common issues and problems.',
    icon: 'Wrench',
    articles: [
      {
        id: 'page-not-loading',
        title: 'A page is not loading properly',
        content: `Try these steps in order:\n\n1. Refresh the page by pressing F5 or clicking the refresh button in your browser.\n\n2. Clear your browser cache. In most browsers, press Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac) and clear cached files.\n\n3. Try opening the page in a private/incognito window.\n\n4. Make sure your internet connection is working.\n\n5. Try a different browser (Chrome, Firefox, or Edge are recommended).\n\nIf the problem continues, it may be a temporary server issue. Wait a few minutes and try again.`,
        tags: ['loading', 'error', 'broken', 'page', 'not working'],
      },
      {
        id: 'cant-login',
        title: 'I cannot log in to my account',
        content: `Make sure you are using the correct email address and password.\n\nIf you forgot your password, click "Forgot Password?" on the login page to reset it.\n\nIf you signed up with Google or Microsoft, make sure you are clicking the correct provider button, not trying to log in with email/password.\n\nClear your browser cookies and try again. Sometimes old session data can cause login issues.\n\nIf you still cannot log in, your account may have been deactivated. Contact support through the Forums.`,
        tags: ['login', 'cannot', 'error', 'locked', 'access'],
      },
      {
        id: 'profile-not-showing',
        title: 'My profile information is not showing',
        content: `If you see a recovery banner at the top of the page, click "Retry" to reload your profile.\n\nTry logging out and logging back in. This refreshes your session and reloads your profile data.\n\nIf the issue persists, go to Settings and make sure your profile fields are filled in and saved.`,
        tags: ['profile', 'missing', 'not showing', 'blank', 'empty'],
      },
      {
        id: 'ai-not-working',
        title: 'The AI suggestions are not working',
        content: `AI features require an active internet connection and may take a few seconds to respond.\n\nIf you see an error message, the AI service may be temporarily unavailable. Wait a moment and try again.\n\nMake sure you have content in the field before clicking "Improve". The "Suggest" button works even on empty fields.\n\nIf AI features consistently do not work, there may be a configuration issue. Check back later or use the forums to report the problem.`,
        tags: ['ai', 'suggestions', 'not working', 'error', 'broken'],
      },
      {
        id: 'browser-support',
        title: 'Which browsers does KTIP support?',
        content: `KTIP works best on modern browsers:\n\nGoogle Chrome (recommended) — version 90 and above\n\nMozilla Firefox — version 90 and above\n\nMicrosoft Edge — version 90 and above\n\nApple Safari — version 15 and above\n\nKTIP also works on mobile browsers on iPhone and Android devices.\n\nFor the best experience, keep your browser up to date. Older browsers may not support all features.`,
        tags: ['browser', 'support', 'chrome', 'firefox', 'safari', 'edge', 'mobile'],
      },
      {
        id: 'clear-cache',
        title: 'How do I clear my browser cache?',
        content: `Clearing your cache can fix many display and loading issues.\n\nChrome: Press Ctrl+Shift+Delete, select "Cached images and files", and click "Clear data".\n\nFirefox: Press Ctrl+Shift+Delete, select "Cache", and click "Clear Now".\n\nEdge: Press Ctrl+Shift+Delete, select "Cached images and files", and click "Clear now".\n\nSafari: Go to Safari menu > Settings > Privacy > Manage Website Data > Remove All.\n\nOn Mac, use Cmd instead of Ctrl in the shortcuts above.`,
        tags: ['cache', 'clear', 'browser', 'fix', 'refresh'],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Role-Based Getting Started Guides
// ---------------------------------------------------------------------------

export const GETTING_STARTED_GUIDES: GettingStartedGuide[] = [
  {
    role: 'student',
    title: 'Students',
    description: 'Explore projects, join events, and find funding for your ideas.',
    steps: [
      'Create your account and set your role to Student',
      'Browse projects for inspiration or create your own',
      'Check the Events page for hackathons and workshops',
      'Explore grants and scholarships you can apply for',
      'Join forum discussions to learn from the community',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Find Events', href: '/events' },
      { label: 'Explore Grants', href: '/grants' },
    ],
  },
  {
    role: 'mentor',
    title: 'Mentors',
    description: 'Guide innovators, review ideas, and share your expertise.',
    steps: [
      'Create your account and set your role to Mentor',
      'Complete your profile with your expertise and experience',
      'Browse projects to find innovators you can help',
      'Use direct messages to connect with mentees',
      'Share your knowledge in the community forums',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Visit Forums', href: '/forums' },
      { label: 'Messages', href: '/messages' },
    ],
  },
  {
    role: 'entrepreneur',
    title: 'Entrepreneurs',
    description: 'Launch projects, apply for grants, and find investors.',
    steps: [
      'Create your account and set your role to Entrepreneur',
      'Create a project to showcase your innovation',
      'Browse grants and apply with the guided application wizard',
      'Track your applications under My Applications',
      'Connect with mentors and investors through messages',
    ],
    quickLinks: [
      { label: 'Create Project', href: '/projects/new' },
      { label: 'Find Grants', href: '/grants' },
      { label: 'My Applications', href: '/grants/my-applications' },
    ],
  },
  {
    role: 'investor',
    title: 'Investors',
    description: 'Discover promising projects and connect with innovators.',
    steps: [
      'Create your account and set your role to Investor',
      'Browse projects to find promising innovations',
      'Follow projects you are interested in to track their progress',
      'Message entrepreneurs directly to discuss opportunities',
      'Attend demo days and conferences listed on Events',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Find Events', href: '/events' },
      { label: 'Messages', href: '/messages' },
    ],
  },
  {
    role: 'private_sector',
    title: 'Private Sector',
    description: 'Find partnerships, attend events, and support innovation.',
    steps: [
      'Create your account and set your role to Private Sector',
      'Browse projects for partnership opportunities',
      'Attend events to connect with the innovation community',
      'Use collaboration tools for joint projects',
      'Post in the forums to share industry insights',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Collaborate', href: '/collaborate' },
      { label: 'Find Events', href: '/events' },
    ],
  },
  {
    role: 'oecs',
    title: 'OECS Administrators',
    description: 'Support regional innovation, manage grants, and organize events.',
    steps: [
      'Create your account and set your role to OECS',
      'Review projects across the Caribbean region',
      'Organize events like conferences and workshops',
      'Manage and publish grant opportunities',
      'Engage with the community through forums and messages',
    ],
    quickLinks: [
      { label: 'Create Event', href: '/events/new' },
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Visit Forums', href: '/forums' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Search Utility
// ---------------------------------------------------------------------------

export function searchHelpContent(
  categories: HelpCategory[],
  query: string,
  categoryFilter: string
): HelpCategory[] {
  const q = query.toLowerCase().trim()

  return categories
    .filter((cat) => !categoryFilter || cat.id === categoryFilter)
    .map((cat) => {
      if (!q) return cat

      const filteredArticles = cat.articles.filter(
        (article) =>
          article.title.toLowerCase().includes(q) ||
          article.content.toLowerCase().includes(q) ||
          article.tags.some((tag) => tag.toLowerCase().includes(q))
      )

      return { ...cat, articles: filteredArticles }
    })
    .filter((cat) => cat.articles.length > 0)
}
