import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the home page.
 *
 * This is the only tour most visitors will ever see, so it does double duty:
 * it explains the hero, and it hands over the two things that unlock the rest
 * of the app — the navbar search and the bento grid of sections.
 *
 * The hero strip auto-rotates every 6s. Nothing here fights it: the overlay
 * tracks rects on a rAF loop, so the spotlight follows the cards as they slide.
 */
export const discoverTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'Welcome to KTIP',
    description:
      'The Knowledge, Technology and Innovation Platform for the OECS — one place for the region’s projects, events, funding, and the people behind them.\n\nThis banner is live: it cycles through what is actually open right now. View Details takes you straight to whatever is on screen.\n\nThe tour takes about a minute. Leave any time with Escape or the red button at the top.',
    position: 'center',
  },
  {
    target: '[data-tutorial="discover-modes"]',
    title: 'Three things to browse',
    description:
      'Switch the banner between Grants, Projects and Events — funding you can apply for, work the community is building, and what is coming up on the calendar.\n\nThe cards underneath are the top six of whichever you pick. Click one to bring it up top, or use the arrows that appear when you hover. Hovering also pauses the rotation, so nothing slides away mid-read.',
    position: 'top',
    secondaryTarget: '[data-tutorial="discover-cards"]',
  },
  {
    target: '[data-tutorial="nav-search"]',
    title: 'Search finds anything',
    description:
      'Click the magnifier — or press Ctrl+K (Cmd+K on Mac) — and search the whole platform: pages, features, projects, events, people.\n\nResults that are a feature rather than a page can be expanded to show you how to do the thing instead of navigating you somewhere. Turn on the brain icon for AI-guided navigation when you are not sure what something is called here.',
    position: 'bottom',
  },
  {
    target: '[data-spy="Platform"]',
    title: 'Everything else lives here',
    description:
      'Seven sections, and this grid is the map: Projects and Events to browse or publish, Grants for funding, Forums for discussion, Directory to find members, Messages to reach them, Resources for guides and case studies.\n\nScroll on past this and you will find the partners behind KTIP and the platform’s live totals.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
