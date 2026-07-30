import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of a single event page.
 *
 * Several targets only exist for some events — the venue door, the schedule,
 * the speakers list. Nothing here guards against that: the engine skips a step
 * whose target never appears, so an event with no venue simply gets a shorter
 * tour.
 */
export const eventDetailTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Key details"]',
    title: 'The essentials first',
    description:
      'Date, time, location or virtual link, event type, and whether it has already happened. Cancelled and past events keep their page — they just say so.\n\nEverything below expands on this; this block is the part worth screenshotting.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="event-registration"]',
    title: 'Registering',
    description:
      'RSVP is one click. Some events ask a few questions first — dietary needs, an affiliation, a track choice — and those open a short form instead.\n\nEither way a copy of what you sent is saved under Submissions in your dashboard, and you can cancel from right here if your plans change.',
    position: 'left',
  },
  {
    target: '[data-tutorial="event-venue-door"]',
    title: 'The live venue',
    description:
      'Some events run a virtual venue: rooms you can walk between, open audio, and a live list of who is in each one.\n\nRegistered attendees go straight in. The door only appears on events that have one, and it sits above the brief on purpose — during a live event it is the only thing anyone is looking for.',
    position: 'bottom',
  },
  {
    target: '[data-spy="About"]',
    title: 'The rest of the page',
    description:
      'The full description sits here, and under it — when the organizer has added them — the schedule, the speaker list, and updates posted as the date approaches.\n\nThe rail on the right of the screen jumps between those sections, so a long agenda never means a long scroll.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
