export interface FAQItem {
  id: string
  question: string
  answer: string
  category: string
}

export const FAQ_CATEGORIES = [
  'Getting Started',
  'Projects & Teams',
  'Community',
  'Messaging',
  'Grants & Funding',
  'Account & Verification',
] as const

export const FAQS: FAQItem[] = [
  {
    id: 'what-is-ktip',
    question: 'What is KTIP?',
    answer:
      'The OECS Knowledge and Technology Innovation Platform (KTIP) connects students, entrepreneurs, mentors, and investors across the Eastern Caribbean to share projects, find funding, and collaborate on innovation.',
    category: 'Getting Started',
  },
  {
    id: 'who-can-join',
    question: 'Who can join the platform?',
    answer:
      'Anyone in the OECS innovation ecosystem — students, mentors, entrepreneurs, investors, private-sector partners, and OECS staff. Pick your roles during signup; they shape what you see across the platform.',
    category: 'Getting Started',
  },
  {
    id: 'create-project',
    question: 'How do I create a project?',
    answer:
      'Go to Projects and click "Create Project". Give it a title, description, category, and phase (concept, prototype, funding, or launch). You can keep it private until you are ready to share it publicly.',
    category: 'Projects & Teams',
  },
  {
    id: 'invite-team',
    question: 'How do I add team members to my project?',
    answer:
      'Open your project page and use the Team widget in the sidebar. Click "Manage Team", search for members by name, and invite them as editors (can update the project) or viewers. They accept the invitation from their notifications or the project page.',
    category: 'Projects & Teams',
  },
  {
    id: 'follow-project',
    question: 'What does following a project do?',
    answer:
      'Following a project bookmarks it and signals interest to its owner. Use the Follow button on any project page next to Like and Share.',
    category: 'Projects & Teams',
  },
  {
    id: 'connections',
    question: 'How do connections work?',
    answer:
      'Send a connection request from someone\'s profile or the Member Directory. Once they accept, you appear in each other\'s Connections list. You can remove a connection at any time from your profile\'s Connections tab.',
    category: 'Community',
  },
  {
    id: 'badges',
    question: 'How do I earn achievement badges?',
    answer:
      'Badges are awarded automatically for what you do — creating projects, connecting with people, posting in the forums, getting verified, turning up to events, applying for grants, and more. Nothing needs to be claimed: the system checks as you go and awards anything you have already qualified for, including things you did before a badge existed. See everything you have and everything still open under Achievements.',
    category: 'Community',
  },
  {
    id: 'points-and-levels',
    question: 'What are points and levels?',
    answer:
      'Every achievement is worth points depending on how rare it is, from 10 for a common one up to 200 for a legendary. Your level comes from how many achievements you have earned rather than how many points — someone who has done a bit of everything ranks higher than someone with one big win. Levels run from Newcomer to KTIP Champion.',
    category: 'Community',
  },
  {
    id: 'leaderboard-privacy',
    question: 'Can I keep my points off the leaderboard?',
    answer:
      'Yes. In Settings under Preferences, switch off "Show me on the leaderboard". You keep earning achievements and can still see your own rank — nobody else can. Students are never shown on the public leaderboard regardless of this setting.',
    category: 'Community',
  },
  {
    id: 'group-chat',
    question: 'Can I message more than one person at once?',
    answer:
      'Yes. In Messages, click "New" and select several people to create a named group chat. Group admins can rename the group and add or remove members; anyone can leave.',
    category: 'Messaging',
  },
  {
    id: 'apply-grant',
    question: 'How do I apply for a grant?',
    answer:
      'Browse Grants, open one that fits your project, and click apply. Track the status of your submissions under "My Applications" — statuses move from pending to under review to approved or rejected.',
    category: 'Grants & Funding',
  },
  {
    id: 'get-verified',
    question: 'How do I get a verified badge?',
    answer:
      'Go to Settings → Verification and upload an identity document (national ID, passport, or business registration). An OECS administrator reviews it, and once approved your profile shows a verified checkmark. Documents are stored privately and only visible to administrators.',
    category: 'Account & Verification',
  },
  {
    id: 'notification-settings',
    question: 'How do I control which notifications I get?',
    answer:
      'Go to Settings → Preferences. You can switch categories (messages, events, projects, forums, collaboration, connections) on or off — switched-off categories stop generating notifications entirely.',
    category: 'Account & Verification',
  },
  {
    id: 'report-user',
    question: 'How do I report inappropriate behaviour?',
    answer:
      'Use the "Report" button on the user\'s profile. Your report goes to the OECS moderation team through the grievance system, and you can track it under "My Reports". For general platform feedback, use the Feedback button instead.',
    category: 'Community',
  },
]

export function searchFAQs(query: string): FAQItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return FAQS
  return FAQS.filter(
    (f) =>
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
  )
}
