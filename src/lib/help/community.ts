import type { HelpCategory } from './types'

export const FORUMS_CATEGORY: HelpCategory = {
  id: 'forums',
  title: 'Forums',
  description: 'Join community discussions and share knowledge.',
  icon: 'Users',
  articles: [
    {
      id: 'browse-forums',
      title: 'How do I browse the forums?',
      content: `Click "Forums" in the navigation bar to see the discussion boards.\n\nEach board covers one area — general discussion, project help, funding advice and so on. Open a board to see its posts.\n\nAnyone can read the forums without signing in. Posting and replying need an account.`,
      tags: ['forums', 'browse', 'boards', 'discussions', 'topics'],
    },
    {
      id: 'create-post',
      title: 'How do I create a forum post?',
      content: `Open the board you want to post in and click "New Post".\n\nGive it a title and write the body. Be specific — posts that say what you already tried get better answers than posts that just describe the problem.\n\nClick "Create Post" to publish. Other members can then reply, and you are notified when they do.`,
      tags: ['create', 'post', 'new', 'forum', 'write'],
    },
    {
      id: 'reply-post',
      title: 'How do I reply to a post?',
      content: `Open the post and scroll to the reply box at the bottom.\n\nType your response and click "Reply". It is added to the end of the thread and the post author is notified.\n\nKTIP spans many countries and backgrounds — keep replies respectful and useful.`,
      tags: ['reply', 'respond', 'comment', 'forum', 'post'],
    },
    {
      id: 'pinned-posts',
      title: 'What are pinned posts?',
      content: `Pinned posts stay at the top of a board regardless of activity, marked with a pin icon.\n\nThey usually hold announcements, board rules or reference material worth keeping to hand.\n\nOnly moderators can pin and unpin.`,
      tags: ['pinned', 'pin', 'sticky', 'important', 'top'],
    },
    {
      id: 'report-content',
      title: 'How do I report a post, reply or message?',
      content: `Forum posts, forum replies and chat messages each carry a report control.\n\nOpen it, pick the reason that fits and add anything the reviewer needs to know. Your report goes to the moderation queue, which OECS and Safety administrators work through.\n\nReporting is not public — the author is not told who filed it.\n\nTo report a person rather than a single piece of content, use the grievance form instead. That is a separate process with its own tracking.`,
      tags: ['report', 'flag', 'moderation', 'abuse', 'inappropriate'],
    },
    {
      id: 'quarantined-content',
      title: 'Why is my content hidden or quarantined?',
      content: `Content that trips the automated moderation filters, or that has been reported and is awaiting review, is quarantined. It stays visible to you with a notice explaining its state, but other members cannot see it.\n\nQuarantine is not a decision — it is a hold. A moderator reviews it and either restores it or removes it.\n\nIf you think a filter caught something unfairly, say so in the forums or through the KTIP Assistant rather than reposting: reposting usually trips the same filter again.`,
      tags: ['quarantine', 'hidden', 'moderation', 'filter', 'blocked', 'review'],
    },
  ],
}

export const MESSAGES_CATEGORY: HelpCategory = {
  id: 'messages',
  title: 'Messages',
  description: 'Direct messages, group chats and the KTIP Assistant.',
  icon: 'MessageSquare',
  articles: [
    {
      id: 'open-messages',
      title: 'Where are my messages?',
      content: `Messaging is a panel that docks on the side of whatever page you are on, not a separate page. There is no Messages link in the navigation bar.\n\nOpen it from the chat action on the floating button in the bottom right corner.\n\nThe /messages address also works — it opens the panel and returns you to where you were. Links of the form /messages?user=<id> open a conversation with that person directly, which is what the "Message" button on a member's profile uses.`,
      tags: ['messages', 'panel', 'open', 'where', 'chat', 'inbox'],
    },
    {
      id: 'send-message',
      title: 'How do I send a message to someone?',
      content: `Open the messaging panel, then click "New Message" and search for the member by name.\n\nType your message and press Enter. Messages are delivered in real time — if the other person has KTIP open, it appears immediately, and otherwise it is waiting with a notification.\n\nMessages are capped at 2000 characters.\n\nYou can also start a conversation straight from someone's profile or from the member drawer in the directory.`,
      tags: ['send', 'message', 'chat', 'contact', 'direct', 'dm'],
    },
    {
      id: 'view-conversations',
      title: 'How do I find an old conversation?',
      content: `The messaging panel lists every conversation you are part of, most recent first, with unread ones marked.\n\nClick one to open its full history. Scroll up to load older messages.\n\nNew messages arrive live, so you never need to refresh.`,
      tags: ['view', 'conversations', 'inbox', 'history', 'unread'],
    },
    {
      id: 'group-chats',
      title: 'How do group chats work?',
      content: `When you start a new conversation you can add several members instead of one, which creates a group chat.\n\nAny member of the group can post, and everyone sees the full history from when they joined.\n\nGroup settings let you rename the group, add and remove members, and leave it. Groups are useful for project teams and hackathon teams that need something more durable than a venue room.`,
      tags: ['group', 'chat', 'team', 'members', 'conversation'],
    },
    {
      id: 'ktip-assistant',
      title: 'What is the KTIP Assistant?',
      content: `The KTIP Assistant is an AI thread pinned to the top of your conversation list.\n\nAsk it how something works and it answers, and where the answer is a place on the platform it gives you links straight there. It knows the site structure and the help articles, so it is usually faster than hunting through menus.\n\nIt is also reachable from the "Ask the KTIP Assistant" button at the bottom of this Help Center.\n\nThe thread is kept on the device you use it from, so it will not follow you to another browser.`,
      tags: ['assistant', 'ai', 'help', 'bot', 'chat', 'navigate'],
    },
    {
      id: 'student-messaging-safeguards',
      title: 'Messaging rules for student accounts',
      content: `Student accounts cannot start one-to-one direct messages. This is a safeguarding rule built into the platform and cannot be turned off — not by the student, not by an administrator.\n\nStudents communicate through supervised channels with a designated educator from their institution.\n\nIf you hold a Student role alongside another role, the restriction still applies to the account.\n\nThe same principle sits behind students never administering awarded funds themselves, and the automatic exclusion of students from the public leaderboard.`,
      tags: ['student', 'safeguarding', 'restriction', 'dm', 'supervised', 'educator'],
    },
    {
      id: 'message-tips',
      title: 'Tips for effective messaging',
      content: `Introduce yourself the first time you message someone. A name with no context usually gets ignored.\n\nSay what you want in the first two lines. "I am a student building a healthcare app and I would like 20 minutes of your advice on pricing" works far better than "Can I ask you something?".\n\nKeep it professional. Members span many countries, institutions and cultures.\n\nUse the forums for questions anyone could answer, and save direct messages for things that are genuinely specific to one person.`,
      tags: ['tips', 'messaging', 'etiquette', 'best practices', 'networking'],
    },
  ],
}

export const NETWORK_CATEGORY: HelpCategory = {
  id: 'community',
  title: 'Community & Network',
  description: 'Directory, connections, invitations and your public page.',
  icon: 'Network',
  articles: [
    {
      id: 'browse-directory',
      title: 'How do I browse the member directory?',
      content: `Open "Directory" from the Community menu.\n\nSearch by name, and filter by country, role or the badges a member has earned. That last filter is the quick way to find, for instance, verified SMEs in your own member state.\n\nClicking a member opens a drawer over the page with their profile, skills, projects and a message action, so you can look at several people without losing your place in the list.\n\nFor the full page, open their member page.`,
      tags: ['directory', 'members', 'browse', 'search', 'filter', 'people'],
    },
    {
      id: 'connect-member',
      title: 'How do I connect with a member?',
      content: `Use the Connect button on their member page or in the directory drawer.\n\nThey receive a connection request, which lands in their invitations inbox and their notifications. Once they accept, you both appear in each other's connections.\n\nConnections are what the Connections tab on your Dashboard counts, and they are who you can invite directly to a video call.\n\nA request you have sent can be withdrawn from your invitations inbox.`,
      tags: ['connect', 'connection', 'request', 'network', 'follow', 'accept'],
    },
    {
      id: 'invitations-inbox',
      title: 'What is the invitations inbox?',
      content: `The invitations inbox gathers everything waiting on your answer in one place: collaboration shares on whiteboards and documents, project team invitations, and connection requests.\n\nEach one can be accepted or declined from the list.\n\nA second tab shows what you have sent and its state, so you can see who has not answered yet and withdraw anything you sent by mistake.\n\nThe bell menu links straight here with "View all invitations".`,
      tags: ['invitations', 'inbox', 'requests', 'accept', 'decline', 'pending'],
    },
    {
      id: 'redeem-invite',
      title: 'I got an invitation by email — how do I use it?',
      content: `Email invitations carry a one-time link. Open it and, if you are already signed in, the invitation is redeemed straight away and you land on whatever it gave you access to.\n\nIf you are not signed in, you are sent to sign up first. The invitation is remembered and redeemed automatically once your account exists, so you do not need to find the email again.\n\nEach link works once. If it has already been used, ask whoever invited you to send a fresh one.`,
      tags: ['invite', 'email', 'link', 'join', 'token', 'redeem'],
    },
    {
      id: 'public-member-page',
      title: 'Your shareable member page',
      content: `Every member has a public page that works for people who are not signed in to KTIP. That makes it safe to put in an email to a funder or an employer.\n\nIt shows your name, role, country, bio, skills, badges, public projects and — if you published one — a link to your CV.\n\nIt never shows your email address, your messages or anything you marked private.\n\nYou can copy the link from your own page.`,
      tags: ['public', 'profile', 'share', 'link', 'member page', 'external'],
    },
    {
      id: 'connection-count-privacy',
      title: 'Who can see how many connections I have?',
      content: `Your choice, in Settings under Preferences.\n\nEveryone — the count is on your public page for anyone, signed in or not. My connections — only members you are connected to. Only me — nobody else sees it.\n\nThis controls the visible count, not the connections themselves. Changing it does not disconnect anyone.`,
      tags: ['privacy', 'connections', 'count', 'visibility', 'preferences'],
    },
  ],
}
