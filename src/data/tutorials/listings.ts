import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Tours for the smaller listing pages.
 *
 * Grouped in one module because each is two or three steps over the same
 * archetype — hero, then the one region that needs explaining. Splitting them
 * into nine files would be nine imports and no more clarity.
 */

export const resourcesTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="resources-tabs"]',
    title: 'Two libraries, one page',
    description:
      'Resources is the knowledge base — guides, articles, case studies and templates written for Caribbean innovators.\n\nIntegrations is the other tab: tools and services KTIP connects to. The tab lives in the URL, so a link you share opens on the one you were looking at.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Filters"]',
    title: 'Narrowing the library',
    description:
      'Filter by resource type, search the text, and sort by newest or Top Picks.\n\nThe count updates as you filter, and the grid below groups by type when your results span several.',
    position: 'bottom',
    scrollMode: 'top',
  },
  replayStep,
]

export const leaderboardTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Rankings"]',
    title: 'How the ranking works',
    description:
      'Points come from activity that helps the community — publishing projects, running events, answering in forums, earning achievements.\n\nThe board is public on purpose: a rank is only worth chasing if it can be shown to someone. Students, members who opted out, and suspended accounts are excluded, and that is enforced in the database rather than here.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Filters"]',
    title: 'Slicing it',
    description:
      'Filter by country or by period to see who is most active in your own member state, or this month rather than all-time.\n\nYour own standing is pinned in its own row further down, so you never have to scroll for it.',
    position: 'bottom',
    scrollMode: 'top',
  },
  replayStep,
]

export const hackathonsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Live"]',
    title: 'Happening right now',
    description:
      'Hackathons currently running, with a door straight into the virtual venue — rooms, audio and whoever is online.\n\nThis section is empty between events, which is normal rather than broken.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Coming up"]',
    title: 'Next, and previously',
    description:
      'Upcoming hackathons you can register for, then a Past section underneath.\n\nPast events keep their pages — the brief, the schedule and the submissions stay readable, which is the easiest way to see what a KTIP hackathon actually involves before entering one.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]

export const helpTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Topics"]',
    title: 'Help by topic',
    description:
      'Every article grouped by category, with the search box up in the banner searching all of them at once.\n\nPicking a category never hides the other counts, so you can see where else your answer might be.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Contact"]',
    title: 'When the article does not cover it',
    description:
      'The contact block at the bottom reaches a person. The FAQ page is worth a look first — it answers the narrower questions that do not warrant a full article.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]

export const faqTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Feedback"]',
    title: 'Tell us what is missing',
    description:
      'The questions above are the ones we are asked most. If yours is not there, this is where to say so — feedback from this page is what decides which article gets written next.\n\nFor anything account-specific, the Help Center’s contact block is the better route.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]

export const achievementsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="achievements-gallery"]',
    title: 'Badges and points',
    description:
      'Every achievement KTIP awards, with the ones you have earned filled in and the rest showing what it takes.\n\nPoints from these feed your leaderboard rank, and earned badges show on your public profile — so a locked badge here is a to-do list rather than decoration.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]

export const invitationsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="invitations-list"]',
    title: 'Invitations',
    description:
      'Requests to join a project, collaborate on a document, or come to an event — anything someone has asked you to accept.\n\nAccepting adds you immediately; declining removes the invitation without notifying anyone beyond the sender. Invitations you have sent are listed here too, with whether they have been answered.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]

export const myApplicationsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Applications"]',
    title: 'Every application you have made',
    description:
      'Drafts, submitted applications and decided ones, with the grant and the date on each.\n\nA draft is exactly where you left it — opening it returns you to the step you stopped on. Submitted applications cannot be edited, but the copy of what you sent is always readable.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Sponsorships"]',
    title: 'Sponsorships',
    description:
      'Student applications need a sponsor to approve them before the funder sees them.\n\nIf you have been nominated as someone’s sponsor, their request appears in this section for you to approve or decline. Most members never see anything here.',
    position: 'bottom',
    scrollMode: 'top',
  },
  replayStep,
]

export const myGrievancesTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="grievances-list"]',
    title: 'Reports you have filed',
    description:
      'Each report with its category, the date, and where the safety team has got to with it.\n\nYou will not always be told the outcome. Some of what follows a report concerns the other person’s account and is not ours to share — “resolved” means the team has acted, not that nothing happened.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
