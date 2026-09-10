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
      content: `Reach it from your avatar menu, "My Dashboard". The rail on the left lists your sections.\n\nOverview — your For You rail, recent submissions and calendar at a glance. My Profile — the editor for everything other members see. Connections — the people you know, and your pending invitations. Projects — the projects you own. Events — the events you organise. Submissions — permanent copies of everything you have submitted. Feedback — what you have sent us, and our replies. Progress — your activity timeline. Achievements — the full trophy gallery, embedded here rather than on a page of its own.\n\nUnder Account, further down: Security, Preferences, Personalization, Verification, and Legal & Consent.\n\nSome sections only appear for certain roles: Funding for investors, Mentees for mentors and faculty, Research for faculty and researchers, Business profile and Team for organisation accounts, and Admin for administrators.`,
      tags: ['dashboard', 'overview', 'tabs', 'sections', 'my'],
    },
    {
      id: 'my-calendar',
      title: 'What does My Calendar show?',
      content: `The dashboard calendar pulls four things together so you have one place to look.\n\nEvents — events on the platform. My Registrations — events you have RSVP'd to. Funding Deadlines — closing dates for the calls you are tracking. Applications — dates attached to your own funding applications.\n\nEach kind has its own colour, and you can turn kinds off to reduce the noise.\n\nClick a day to see everything on it in a panel, and click through from there to the event or grant itself.`,
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
      content: `Those three panels are placeholders. The role gating that decides who sees them is fully wired up, but the content inside is not built yet.\n\nSo the tab appearing is correct — it means your role holds the right permission — and the empty panel is expected rather than a fault.\n\nBusiness profile is a real tab in the same rail. Admin is the only entry that leaves the dashboard.`,
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
      content: `Go to your Dashboard, open Preferences and turn off "Show me on the leaderboard".\n\nYou keep earning badges and points; you simply stop appearing in the public ranking.\n\nStudent accounts are excluded automatically and permanently — that is a safeguarding rule, not a setting, so there is nothing for a student to turn on or off.`,
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
  description: 'Your profile, security, notifications and personalization — all on the dashboard.',
  icon: 'Settings',
  articles: [
    {
      id: 'settings-tabs',
      title: 'Where are my settings?',
      content: `On your Dashboard. There is no separate Settings page any more — everything that was on it is a tab on the dashboard rail.\n\nMy Profile — your name, photo, banner, bio, country, organisation, skills, interests and languages, edited directly on a preview of the page other members see. Under Account, further down the rail: Security — password, two-step verification, your sign-in addresses, a download of your own data, and the options for leaving KTIP. Preferences — notifications, leaderboard visibility, connection-count privacy, dark mode and readable text. Personalization — the topics that drive "For You" sorting. Verification — evidence for a verified badge. Legal & Consent — what you have agreed to.\n\nOld /settings links still work and land on the matching tab.`,
      tags: ['settings', 'tabs', 'profile', 'security', 'preferences', 'verification', 'dashboard'],
    },
    {
      id: 'edit-profile',
      title: 'How do I edit my profile?',
      content: `Open My Profile on your Dashboard.\n\nThe tab shows your profile as other members see it. Every block you can change carries a pencil — click one and a small editor opens over the preview, which updates as you type. Between them they cover your display name, photo, banner, bio (up to 500 characters), country, organisation, industry, website, up to 20 skills, up to 20 interests, your languages, and what collaboration you are open to. The photo block opens the portrait studio, which can cut the background out of your picture.\n\nRoles are in the name-and-roles editor, but you can only add roles that are self-assignable. Student, Faculty, the organisation roles and the admin roles are granted by a reviewer, so they do not appear as options.\n\nEach editor saves on its own — there is no page-wide Save.`,
      tags: ['edit', 'profile', 'name', 'bio', 'country', 'skills', 'avatar'],
    },
    {
      id: 'portrait-studio',
      title: 'Cutting the background out of your photo',
      content: `The photo block on My Profile opens the portrait studio. Upload a picture, then use the cut action to lift yourself off the background and drop a colour, a gradient or one of the backdrops behind you instead.\n\nThe cut happens in your own browser. The picture is not sent anywhere to be processed, and nothing leaves your device until you save the result.\n\nThat also means it depends on your device. If the cut is refused or comes back looking wrong, your plain photo is kept and used as it is — nothing is lost. A clear subject, an uncluttered background and decent light give it the best chance; a second person at the edge of the frame is what most often confuses it.\n\nYou can go back to the plain photo at any time from the same studio.`,
      tags: ['photo', 'portrait', 'cutout', 'background', 'avatar', 'studio', 'backdrop', 'gradient'],
    },
    {
      id: 'change-password',
      title: 'How do I change my password?',
      content: `Open Security on your Dashboard, under Account.\n\nEnter the new password twice and save. You are not asked for your current password — you are already signed in, which is the check.\n\nThe change form only requires 6 characters. That is the floor, not advice: signup asks for 8 characters with a number, a symbol and mixed case, and that is the standard worth holding yourself to here.\n\nIf you signed in with Google or Microsoft you have no KTIP password to change — manage it with that provider.`,
      tags: ['change', 'password', 'security', 'update', 'length'],
    },
    {
      id: 'two-step-overview',
      title: 'What is two-step verification?',
      content: `A second check after your password, so a stolen password is not enough on its own. Set it up under Security on your Dashboard.\n\nThere are two methods and you pick one. An authenticator app shows a new six-digit code every 30 seconds and works with no signal; this is the recommended one. Email codes send a six-digit code to your address instead, which needs no app but does need you to reach your mail.\n\nSome roles must have it. Entrepreneur is one — a new account with that role is held on the set-up screen until the second step is in place, and cannot turn it off afterwards. Accounts that already existed when the requirement arrived were left as they were.\n\nEither way you also get ten recovery codes. Keep them somewhere that is not the phone.\n`,
      tags: ['two-step', 'two-factor', '2fa', 'mfa', 'security', 'authenticator', 'email code', 'verification'],
    },
    {
      id: 'two-step-authenticator',
      title: 'Setting up an authenticator app',
      content: `Open Security on your Dashboard and choose the authenticator app method. A QR code appears; scan it with your app and type the six-digit code back to confirm.\n\nIf you have no app yet, the set-up screen carries a second QR that opens a guide to the ones we recommend, including Apple Passwords, Google Authenticator and Microsoft Authenticator, plus desktop options. The same guide is on the sign-in screen behind "Where do I find my code?".\n\nCodes change every 30 seconds and are generated on the device itself, so this method works on a plane or with no signal.\n\nIf a code is refused even though it looks right, check that your phone's clock is set automatically. A drifting clock is the usual cause.`,
      tags: ['authenticator', 'totp', 'app', 'qr', 'google authenticator', 'setup', 'two-step'],
    },
    {
      id: 'two-step-email-code',
      title: 'Using email codes instead of an app',
      content: `Pick "Email code" under Security if you would rather not install anything, or do not have a smartphone.\n\nWe send a six-digit code to your account's email address. It lasts ten minutes, only one code is live at a time, and you can ask for another after 30 seconds.\n\nYou are asked for a code the first time you sign in on a new device, and then again every 30 days on that same device. The Security tab tells you how long the device you are on has left.\n\nA new browser, a new phone or a cleared cookie jar all count as a new device, so expect a code then.\n\nIf nothing arrives, wait out the 30 seconds and send another, then check your spam folder.`,
      tags: ['email code', 'otp', 'six digit', 'no smartphone', 'two-step', '30 days', 'device'],
    },
    {
      id: 'two-step-recovery',
      title: 'Recovery codes, and losing your phone',
      content: `Setting up two-step verification gives you ten recovery codes. Each one works once. They are the way back in when the phone or the mailbox is gone, so save them somewhere separate — printed, or in a password manager, not on the phone itself.\n\nOn the code screen at sign-in, click "Use a recovery code" and enter one.\n\nSecurity on your Dashboard shows how many you have left and can generate a fresh ten. Generating a new set makes every earlier code stop working, so replace your saved copy at the same time.\n\nYou can also switch methods there at any time, in either direction, without losing your account.\n\nOut of codes and out of devices? An OECS administrator can reset the second step once they have confirmed who you are. Use the contact options at the foot of the Help Center.`,
      tags: ['recovery code', 'backup code', 'lost phone', 'locked out', 'reset', 'two-step', 'regenerate'],
    },
    {
      id: 'secondary-email',
      title: 'How do I add a secondary email?',
      content: `Dashboard, Security, Secondary Email.\n\nA secondary email is a backup sign-in address. Once confirmed, it signs you in with the same password as your primary address — useful when a student or work address is about to expire.\n\nAdd the address and a confirmation link is sent to it. The link is valid for 24 hours; you can resend it, or remove the address entirely, from the same panel.\n\nThis is for password accounts. If you only ever sign in with Google or Microsoft, there is no password for a second address to use.`,
      tags: ['secondary email', 'backup', 'alias', 'confirm', 'sign in', 'security'],
    },
    {
      id: 'change-email',
      title: 'How do I change my primary email address?',
      content: `Open Security on your Dashboard and update the email field. You will need to confirm the new address by clicking the link sent to it.\n\nUntil you confirm, sign-in stays on the old address.\n\nIf you signed up with Google or Microsoft, your email belongs to that provider and cannot be changed here. Add a secondary email instead if you need a second way in.`,
      tags: ['change', 'email', 'address', 'update', 'primary'],
    },
    {
      id: 'notification-preferences',
      title: 'How do I control what I get notified about?',
      content: `Dashboard, Preferences. There is a switch for each stream: email, messages, events, projects, forums, collaboration, connections and achievements.\n\nThe email switch governs whether anything reaches your inbox. The other seven govern in-app notifications by area.\n\nThese are enforced where notifications are created, not just where they are displayed, so turning one off actually stops it rather than hiding it.`,
      tags: ['notifications', 'preferences', 'email', 'switches', 'mute', 'settings'],
    },
    {
      id: 'personalization',
      title: 'How do I personalize what I see?',
      content: `Dashboard, Personalization.\n\nPick the topics and categories you care about, the content types you want to see, and whether to boost Climate Action work. You can also opt out of specific items you never want surfaced again.\n\nOnce set, the "For You" sort option on the Projects, Events, Funding and Resources lists ranks against these choices instead of sorting by date.\n\nEverything else stays browsable — personalization changes the order, not what exists.`,
      tags: ['personalization', 'for you', 'topics', 'interests', 'recommendations', 'climate'],
    },
    {
      id: 'delete-account',
      title: 'How do I delete my account?',
      content: `Open Security on your Dashboard and scroll to the bottom. There are three ways to leave, and two of them can be undone.\n\nDeactivate — you disappear from the directory and your contributions stay where they are. Sign in again within 90 days and nothing is lost. After that the account is anonymised.\n\nSchedule deletion — the account is erased after 7 days. Signing in during that week cancels it, and a banner tells you the date your data is kept until.\n\nDelete now — permanent. Your projects, funding applications, messages, badges and other data are removed and cannot be recovered.\n\nBefore any of them, "Download your data" gives you a single file with your content in it, built in your browser.\n\nIf it is only the notifications that are the problem, turn them off under Preferences instead.`,
      tags: ['delete', 'account', 'remove', 'permanent', 'close', 'deactivate', 'break', 'download data', 'export'],
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
      content: `your Dashboard, Verification tab. The fastest way is a work or school email address.\n\nIf you signed up with an address at a trusted organisation — OECS, a ministry, a partner agency — your account is verified the moment you confirm that address. Nothing to upload, nobody to wait for. The same goes for a partner school or college, which links you to it as a student.\n\nSigned up with a personal address? Enter your work or school address on the Verification tab. KTIP emails it a link; press Confirm and the same check runs. That address never becomes a way to sign in — it only proves you hold it.\n\nNo such address? Upload up to three files as evidence — PDF, JPG, PNG or WebP, each up to 10MB — and add a note if there is context a reviewer needs. Only OECS administrators can see what you upload. A reviewer approves or declines the request, and you are notified either way.\n\nVerified accounts carry a badge, which members can filter by in the directory, and can publish, apply for funding and message other members.`,
      tags: ['verification', 'verified', 'badge', 'identity', 'upload', 'documents', 'work email', 'domain'],
    },
    {
      id: 'student-verification',
      title: 'How does student verification work?',
      content: `Students do not upload anything. Your institutional email address is the evidence.\n\nSign up with your school or university address, or add it on the Verification tab, and confirm it. If your institution has switched on automatic approval, or gave KTIP a list of its students, you are approved on the spot. Otherwise an educator there approves the request. Either way, once approved you hold the Student role and a verified badge.\n\nThat role brings the safeguarding rules with it: no unmonitored direct messages, no administering awarded funds yourself, and automatic exclusion from the public leaderboard.\n\nIf your institution is not yet registered on KTIP, your account cannot be domain-verified until it is.`,
      tags: ['student', 'verification', 'school', 'email domain', 'institution', 'approve', 'roster'],
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
      content: `Members under 18 use KTIP normally, with protections that cannot be switched off.\n\nThe main one is messaging: one-to-one direct messages between an adult member and a member under 18 are not available in either direction. Group channels, event rooms and forums are open as usual — those are visible to more than two people, which is the point.\n\nStudent accounts carry one further rule on top, whatever their age: the public leaderboard excludes them. Funding applications do not need a faculty sponsor — a sponsor is an endorsement students may add if they want one.\n\nThe protections lift by themselves on the account's 18th birthday. Nothing needs to be requested.`,
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
      content: `Business verification is done by a Business Support Organisation, not by OECS directly. In most member states that is your national Chamber of Commerce; it can also be an incubator, an accelerator or an MSME agency.\n\nOpen the SME verification page — it is also the Business profile entry on your dashboard rail if you hold an organisation role. Enter your legal business name, your member state and your business registration number, then submit.\n\nThe reviewing organisation checks the submission against its own records. Once approved, your business is verified and a verified badge shows to funders and partners.\n\nA Private Sector account is the unverified state of the same thing — everything keeps working while you wait.`,
      tags: ['sme', 'business', 'chamber', 'verification', 'registration', 'private sector'],
    },
  ],
}
