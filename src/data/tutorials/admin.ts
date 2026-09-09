import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of /admin.
 *
 * Operator-facing, so it is shorter and drier than the member tours, and no
 * step drives a click: nothing in an admin walkthrough should press a control
 * that changes a real record.
 */
export const adminTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'The admin console',
    description:
      'Platform-wide numbers, then everything you can administer, section by section.\n\nExport in the corner takes the whole analytics set — every chart on this page — as a file you can hand on.',
    position: 'center',
  },
  {
    target: '[data-tutorial="admin-sidebar"]',
    title: 'Every section',
    description:
      'Content first — Projects, Events, Grants, Forums, Resources, Achievements. Then people: Users, Roles & Permissions, Institutions, Chamber Review, Employers, Verification.\n\nThe safety group is Moderation and Grievances. Integrations, Partner API, Analytics, UAT Feedback and Errors are the operational end.\n\nThis rail is on every admin page, so it is always the way back out.',
    position: 'right',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="admin-attention"]',
    title: 'What is waiting on you',
    description:
      'Every queue you are allowed to work, counted, busiest first. Identity documents, reported content, grievances, grant applications at review, institutions and businesses awaiting verification, submitted resources and feedback.\n\nA tile is amber when there is work in it and grey with a tick when the queue is clear. Each one opens the queue it counts.\n\nYou only see the queues your role can action — a queue missing here belongs to another desk, not to nobody.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="admin-stats"]',
    title: 'What the numbers count',
    description:
      'Total Users is every account, including unverified and suspended ones. Events Hosted counts published and completed events, not drafts or cancellations. Active Grants excludes anything past its deadline or switched off; a grant with no deadline stays active. Grant Applications counts every application in any state. Discussions counts threads, not replies.\n\nThe second line is the part that moves: how many joined, were filed or were posted in the last 30 days, how many events are still to come, how many grants close within the month.\n\nA figure shown as an em dash could not be read — that is a failed query, not a zero, and it is worth reporting.\n\nThe Climate Action strip underneath is the same three content types filtered to the region’s resilience agenda — the flag members set when they publish.',
    position: 'bottom',
    secondaryTarget: '[data-tutorial="admin-climate"]',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="admin-charts"]',
    title: 'Analytics & Reports',
    description:
      'Every chart lives on one hub now: members by role and state, projects by category and phase, events by type, the grant pipeline, usage and the roadmap results framework — all as trends with one period picker and one country filter.\n\nThe pipeline chart is the one to watch during a funding round: it shows how many applications sit at each stage, so a queue building up at review is visible before anyone complains about it.\n\nAbove this, the platform calendar shows every scheduled event across the region in one month grid.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="admin-quick-actions"]',
    title: 'Shortcuts',
    description:
      'The four things admins do most often, plus section cards underneath for the busiest areas.\n\nEverything here is reachable from the rail as well — this is a shortcut, not a separate set of powers.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
