import type { Tutorial } from '../../components/tutorial/types'
import { eventsTutorialSteps } from './events'

export const TUTORIAL_IDS = {
  EVENTS: 'events',
} as const

export type TutorialId = (typeof TUTORIAL_IDS)[keyof typeof TUTORIAL_IDS]

export const tutorials: Record<TutorialId, Tutorial> = {
  [TUTORIAL_IDS.EVENTS]: {
    id: TUTORIAL_IDS.EVENTS,
    name: 'Events',
    description: 'Find, filter and create events across the region.',
    steps: eventsTutorialSteps,
  },
}

export function getTutorialById(id: string): Tutorial | undefined {
  return tutorials[id as TutorialId]
}

/**
 * Exact pathname → tutorial id. The FAB uses this to decide whether the
 * current page has a tour; add an entry when a new page gets one.
 */
const ROUTE_TUTORIALS: Record<string, TutorialId> = {
  '/events': TUTORIAL_IDS.EVENTS,
}

export function tutorialIdForPath(pathname: string): TutorialId | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return ROUTE_TUTORIALS[normalized] ?? null
}
