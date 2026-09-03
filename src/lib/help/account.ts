import type { HelpCategory } from './types'

export const DASHBOARD_CATEGORY: HelpCategory = {
  id: 'dashboard',
  title: 'My Dashboard',
  description: 'Your overview, calendar, progress and submissions.',
  icon: 'LayoutDashboard',
  articles: [
    {
      id: 'dashboard-overview',
      title: 'What is on my dashboard?',
      content: `Reach it from your avatar menu, "My Dashboard". The rail on the left lists your sections.\n\nOverview — your For You rail, recent submissions and calendar at a glance. Profile — how other members see you, read-only. Progress — your activity timeline. Projects — the projects you own. Events — the events you organise. Connections — the people you know, and your pending invitations. Submissions — permanent copies of everything you have submitted.\n\nAchievements links out to the full trophy gallery, which is a page rather than a tab.\n\nSome sections only appear for certain roles: Funding for investors, Mentees for mentors and faculty, Research for faculty and researchers, Business for SME and private sector accounts, and Admin for administrators.`,
      tags: ['dashboard', 'overview', 'tabs', 'sections', 'my'],
    },
    {
      id: 'my-calendar',
      title: 'What does My Calendar show?',
      content: `The dashboard calendar pulls four things together so you have one place to look.\n\nEvents — events on the platform. My Registrations — events you have RSVP'd to. Grant Deadlines — closing dates for grants you are tracking. Applications — dates attached to your own grant applications.\n\nEach kind has its own colour, and you can turn kinds off to reduce the noise.\n\nClick a day to see everything on it in a panel, and click through from there to the event or grant itself.`,
      tags: ['calendar', 'deadlines', 'rsvp', 'schedule', 'dates', 'dashboard'],
    },
    {
      id: 'my-progress',
      title: 'What is the Progress tab?',
      content: `Progress is your activity over time — projects created, events attended, applications submitted, badges earned — as a timeline.\n\nIt also offers a Gantt view, which is more useful when you are looking at how project work and deadlines overlap rather than at individual events.\n\nIt is a record for you. Other members do not see your progress timeline.`,
      tags: ['progress', 'timeline', 'activity', 'gantt', 'history'],
    },
    {
      id: 'role-tabs-stub',
      title: 'Why is the Funding, Mentees or Research tab empty?',
      content: `Those three panels are placeholders. The role gating that decides who sees them is fully wired up, but the content inside is not built yet.\n\nSo the tab appearing is correct — it means your role holds the right permission — and the empty panel is expected rather than a fault.\n\nThe Business and Admin entries in the same rail are different: those link out to real pages.`,
      tags: ['funding', 'mentees', 'research', 'empty', 'stub', 'coming soon'],
    },
  ],
}

export const ACHIEVEMENTS_CATEGORY: HelpCategory = {
  id: 'achievements',
  title: 'Achievements & Leaderboard',
  description: 'Badges, points, streaks, showcase and rankings.',
  icon: 'Award',
  articles: [
    {
      id: 'achievements-basics',
      title: 'How do badges, points and levels work?',
      content: `Activity on the platform earns badges, and badges carry points. Points add up to a level, and consecutive days of activity build a streak.\n\nThe Achievements page is the gallery. Filter by category to see what is available in one area, or by rarity to see how hard each badge is to get.\n\nSome badges are secret: they stay hidden in the gallery until you earn them, so you cannot chase them deliberately.\n\nBadges also work as a filter in the member directory, which is how other members find, for instance, everyone with a verification badge.`,
      tags: ['badges', 'points', 'levels', 'streak', 'achievements', 'rarity'],
    },
    {
      id: 'showcase-pin',
      title: 'How do I pin trophies to my profile?',
      content: `On the Achievements page click "Edit showcase", then pick the badges you want to feature. You can pin up to five.\n\nSave the showcase and those five appear on your public member page.\n\nUntil you choose, your page shows your most recent badges. Pinning is how you put the ones that matter for your goals — a funding badge, a verification badge — in front of people instead.`,
      tags: ['showcase', 'pin', 'trophies', 'profile', 'featured', 'badges'],
    },
    {
      id: 'leaderboard',
      title: 'How does the leaderboard work?',
      content: `The Leaderboard ranks members by points and shows the top fifty.\n\nSwitch between all-time and the current month — the monthly view is where newer members can realistically place.\n\nYou can also narrow it to your own member state or to your role, which is a fairer comparison than the global list.\n\nIt is public, so anyone can view it without signing in.`,
      tags: ['leaderboard', 'ranking', 'points', 'top', 'monthly', 'country'],
    },
    {
      id: 'leaderboard-optout',
      title: 'How do I hide myself from the leaderboard?',
      content: `Go to Settings, open Preferences and turn off "Show me on the leaderboard".\n\nYou keep earning badges and points; you simply stop appearing in the public ranking.\n\nStudent accounts are excluded automatically and permanently — that is a safeguarding rule, not a setting, so there is nothing for a student to turn on or off.`,
      tags: ['leaderboard', 'hide', 'opt out', 'privacy', 'preferences', 'student'],
    },
  ],
}

export const CV_CATEGORY: HelpCategory = {
  id: 'cv',
  title: 'Your CV',
  description: 'Build, publish and download your CV.',
  icon: 'ScrollText',
  articles: [
    {
      id: 'cv-build',
      title: 'How do I build my CV?',
      content: `Your CV lives at its own page, with an editor behind the Edit action.\n\nThe editor holds the usual sections — education, experience, projects, skills, achievements — and pulls in what KTIP already knows about you so you are not retyping it.\n\nThe screen offers two views. Curated shows a shortened selection, useful for a quick read. Full CV shows everything. This affects only how the page displays; it does not delete anything.`,
      tags: ['cv', 'resume', 'build', 'edit', 'curated', 'sections'],
    },
    {
      id: 'cv-pdf',
      title: 'How do I download my CV as a PDF?',
      content: `Use the Download action on your CV page. It opens your browser's print dialog against an A4 layout — choose "Save as PDF" as the destination.\n\nThe PDF is always the complete document, even if you were looking at the Curated view when you clicked. Curated is a screen setting, not a filter on the export.\n\nIf the layout looks wrong, check that scaling is set to 100% and background graphics are enabled in the print dialog.`,
      tags: ['cv', 'pdf', 'download', 'print', 'export', 'a4'],
    },
    {
      id: 'cv-publish',
      title: 'How do I share my CV publicly?',
      content: `Publishing your CV gives it a public address that works for people who are not signed in to KTIP, which is what you want when sending it to a funder or an employer.\n\nUntil you publish, that address does not open for anyone else — an unpublished CV is private even if someone guesses the link.\n\nA published CV is also linked from your public member page.`,
      tags: ['cv', 'publish', 'public', 'share', 'link', 'employer'],
    },
    {
      id: 'cv-campus-sync',
      title: 'Virtual Campus records and manual edits',
      content: `If your account is linked to the OECS Virtual Campus, course records sync across automatically. Those entries are read-only in KTIP — the Campus owns them.\n\nAny field you edit yourself is marked as manually set, and the sync then leaves it alone. Your wording is not overwritten on the next sync.\n\nSo: edit freely, and expect course history to keep updating itself around your edits.`,
      tags: ['cv', 'virtual campus', 'sync', 'courses', 'manual', 'read only'],
    },
  ],
}

export const SETTINGS_CATEGORY: HelpCategory = {
  id: 'settings',
  title: 'Account & Settings',
  description: 'Profile, security, notifications and personalization.',
  icon: 'Settings',
  articles: [
    {
      id: 'settings-tabs',
      title: 'What is in Settings?',
      content: `Open Settings from your avatar menu. There are five tabs.\n\nProfile — name, avatar, bio, country, organisation, industry, skills, interests. Security — password and secondary email. Preferences — notifications, leaderboard visibility, connection-count privacy, dark mode and readable text. Personalization — the topics that drive "For You" sorting. Verification — evidence for a verified badge.\n\nProfile editing is here, not on your Dashboard: the Dashboard's profile tab is the read-only preview.`,
      tags: ['settings', 'tabs', 'profile', 'security', 'preferences', 'verification'],
    },
    {
      id: 'edit-profile',
      title: 'How do I edit my profile?',
      content: `Go to Settings and open the Profile tab.\n\nYou can change your display name, avatar image, bio (up to 500 characters), country, organisation, industry, up to 20 skills, up to 20 interests, and what collaboration you are open to.\n\nRoles are on this tab too, but you can only add roles that are self-assignable. Student, Faculty, Verified SME, Educational Partner and the Business Support Organisation and admin roles are granted by a reviewer, so they do not appear as options.\n\nClick "Save Changes" when you are done.`,
      tags: ['edit', 'profile', 'name', 'bio', 'country', 'skills', 'avatar'],
    },
    {
      id: 'change-password',
      title: 'How do I change my password?',
      content: `Go to Settings and open the Security tab.\n\nEnter the new password twice and save. You are not asked for your current password — you are already signed in, which is the check.\n\nThe change form only requires 6 characters. That is the floor, not advice: signup asks for 8 characters with a number, a symbol and mixed case, and that is the standard worth holding yourself to here.\n\nIf you signed in with Google or Microsoft you have no KTIP password to change — manage it with that provider.`,
      tags: ['change', 'password', 'security', 'update', 'length'],
    },
    {
      id: 'secondary-email',
      title: 'How do I add a secondary email?',
      content: `Settings, Security tab, Secondary Email.\n\nA secondary email is a backup sign-in address. Once confirmed, it signs you in with the same password as your primary address — useful when a student or work address is about to expire.\n\nAdd the address and a confirmation link is sent to it. The link is valid for 24 hours; you can resend it, or remove the address entirely, from the same panel.\n\nThis is for password accounts. If you only ever sign in with Google or Microsoft, there is no password for a second address to use.`,
      tags: ['secondary email', 'backup', 'alias', 'confirm', 'sign in', 'security'],
    },
    {
      id: 'change-email',
      title: 'How do I change my primary email address?',
      content: `Go to Settings, open the Security tab and update the email field. You will need to confirm the new address by clicking the link sent to it.\n\nUntil you confirm, sign-in stays on the old address.\n\nIf you signed up with Google or Microsoft, your email belongs to that provider and cannot be changed here. Add a secondary email instead if you need a second way in.`,
      tags: ['change', 'email', 'address', 'update', 'primary'],
    },
    {
      id: 'notification-preferences',
      title: 'How do I control what I get notified about?',
      content: `Settings, Preferences tab. There is a switch for each stream: email, messages, events, projects, forums, collaboration, connections and achievements.\n\nThe email switch governs whether anything reaches your inbox. The other seven govern in-app notifications by area.\n\nThese are enforced where notifications are created, not just where they are displayed, so turning one off actually stops it rather than hiding it.`,
      tags: ['notifications', 'preferences', 'email', 'switches', 'mute', 'settings'],
    },
    {
      id: 'personalization',
      title: 'How do I personalize what I see?',
      content: `Settings, Personalization tab.\n\nPick the topics and categories you care about, the content types you want to see, and whether to boost Climate Action work. You can also opt out of specific items you never want surfaced again.\n\nOnce set, the "For You" sort option on the Projects, Events, Grants and Resources lists ranks against these choices instead of sorting by date.\n\nEverything else stays browsable — personalization changes the order, not what exists.`,
      tags: ['personalization', 'for you', 'topics', 'interests', 'recommendations', 'climate'],
    },
    {
      id: 'delete-account',
      title: 'How do I delete my account?',
      content: `Go to Settings and scroll to the Danger Zone at the bottom of the page, then click "Delete Account" and confirm.\n\nDeletion is permanent. Your projects, grant applications, messages, badges and other data are removed and cannot be recovered.\n\nIf you only need a break, sign out instead. If it is the notifications that are the problem, turn them off under Preferences — that is reversible and this is not.`,
      tags: ['delete', 'account', 'remove', 'permanent', 'close', 'danger zone'],
    },
  ],
}

export const VERIFICATION_CATEGORY: HelpCategory = {
  id: 'verification',
  title: 'Verification',
  description: 'Verified badges for people, students and businesses.',
  icon: 'ShieldCheck',
  articles: [
    {
      id: 'identity-verification',
      title: 'How do I get a verified badge?',
      content: `Settings, Verification tab.\n\nUpload up to three files as evidence — PDF, JPG, PNG or WebP, each up to 10MB — and add a note if there is context a reviewer needs.\n\nOnly OECS administrators can see what you upload. It is not shown on your profile and other members never have access to it.\n\nAn OECS reviewer approves or declines the request, and you are notified either way. Approved accounts carry a verification badge, which members can filter by in the directory.`,
      tags: ['verification', 'verified', 'badge', 'identity', 'upload', 'documents'],
    },
    {
      id: 'student-verification',
      title: 'How does student verification work?',
      content: `Students do not upload anything. Your institutional email domain is the evidence.\n\nSign up with your school or university address and your institution approves the account. Once approved you hold the Student role.\n\nThat role brings the safeguarding rules with it: no unmonitored direct messages, no administering awarded funds yourself, and automatic exclusion from the public leaderboard.\n\nIf your institution is not yet registered on KTIP, your account cannot be domain-verified until it is.`,
      tags: ['student', 'verification', 'school', 'email domain', 'institution', 'approve'],
    },
    {
      id: 'date-of-birth',
      title: 'Why am I asked for my date of birth?',
      content: `Every KTIP account declares a date of birth when it is created — on the sign-up form, or on the short onboarding form straight after if you signed in with Google or Microsoft, since neither of them tells us your birthday.\n\nIt is stored separately from your profile and is never shown to other members. Only you and KTIP's safety staff can see it. What the rest of the platform gets is a single yes/no: whether the account belongs to someone under 18.\n\nYou must be at least 13 to hold a KTIP account.\n\nIt cannot be edited afterwards. If you entered it wrong, contact support and a member of staff will correct it.`,
      tags: ['date of birth', 'birthday', 'age', 'signup', 'privacy', 'minor', '18', '13'],
    },
    {
      id: 'under-18-accounts',
      title: 'What is different about an account under 18?',
      content: `Members under 18 use KTIP normally, with protections that cannot be switched off.\n\nThe main one is messaging: one-to-one direct messages between an adult member and a member under 18 are not available in either direction. Group channels, event rooms and forums are open as usual — those are visible to more than two people, which is the point.\n\nStudent accounts carry further rules on top, whatever their age: grant applications need a faculty sponsor, and the public leaderboard excludes them.\n\nThe protections lift by themselves on the account's 18th birthday. Nothing needs to be requested.`,
      tags: ['under 18', 'minor', 'safeguarding', 'messages', 'dm', 'child', 'protection'],
    },
    {
      id: 'student-birth-year',
      title: 'What can my school see about my age?',
      content: `A verified student account keeps a safeguarding record with your institution, and that record carries the year you were born — the year only, never the full date.\n\nIt is taken from the date of birth on your account. You are not asked for it twice, and it cannot drift out of step with what you declared.\n\nIt is there so your school's designated staff can apply the right protections to their own students. Other members never see it. To correct it, contact support.`,
      tags: ['birth year', 'age', 'student', 'safeguarding', 'privacy', 'minor', 'institution'],
    },
    {
      id: 'sme-verification',
      title: 'How do I get my business verified?',
      content: `Business verification is done by your national Chamber of Commerce, not by OECS directly.\n\nOpen the SME verification page (it is also the Business entry on your dashboard rail if you hold a Private Sector or SME role). Enter your legal business name, your member state and your business registration number, then click "Submit to Chamber".\n\nYour Chamber reviews the submission against its own records. Once approved your account becomes a Verified SME, which unlocks the SME capabilities and shows a verified badge to funders and partners.\n\nA Private Sector account is the unverified state of the same thing — everything keeps working while you wait.`,
      tags: ['sme', 'business', 'chamber', 'verification', 'registration', 'private sector'],
    },
  ],
}
