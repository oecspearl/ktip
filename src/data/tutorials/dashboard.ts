import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

// Per-tab tours live in dashboard-tabs.ts and reuse this page's two anchors.

/**
 * Guided tour of /dashboard.
 *
 * Frames the shell — hero, rail, panel — and leaves each tab's own detail to
 * that tab. The rail is role-aware, so the copy describes the groups rather
 * than naming every tab: an investor and a lecturer see different rails.
 */
export const dashboardTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'Your dashboard',
    description:
      'The one personal page. Your name, your roles and your connection count sit up here — click the connection chip to jump straight to the people you know.\n\nEverything that used to live on a separate profile page is now a tab below.',
    position: 'center',
  },
  {
    target: '[data-tutorial="dashboard-tabs"]',
    title: 'The tab column',
    description:
      'Overview is the summary. Under it: My CV, Progress, Achievements, and then the things you own — Projects, Events, Connections and Submissions.\n\nThe rail is built from your roles, so it is not the same for everyone. An investor gets Funding, a mentor gets Mentees, faculty and researchers get Research. Business and Admin are links out to their own pages rather than panels here.\n\nOn a narrow screen the column becomes a scrolling row above the panel.',
    position: 'right',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="dashboard-panel"]',
    title: 'The panel',
    description:
      'Whichever tab is selected renders here, and the page keeps its shell — so moving between your CV, your projects and your submissions never costs you the rail.\n\nOverview pulls the useful parts of the others together: recent network activity, what you have submitted, and what is next on your calendar.',
    position: 'left',
    scrollMode: 'top',
  },
  replayStep,
]
