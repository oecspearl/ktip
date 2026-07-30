import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the event form — shared by /events/new and /events/:id/edit,
 * which render the same fields.
 */
export const eventFormTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="event-form"]',
    title: 'Publishing an event',
    description:
      'Title, summary, description and tags at the top; dates, capacity and options below.\n\nThe summary is what appears on the events grid and in the calendar day panel, so write it as the thing someone reads before deciding to come.\n\nAdmins get an extra Status field — draft events are visible only to administrators until published.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="event-form-type"]',
    title: 'Event type',
    description:
      'Hackathon, workshop, meetup, conference or demo day. This is the first filter on the events page and it decides which section your event groups under in grid view.\n\nPick the closest match rather than the most impressive one — people filter by what they are looking for.',
    position: 'right',
  },
  {
    target: '[data-tutorial="event-form-venue"]',
    title: 'Where it happens',
    description:
      'Tick “virtual” and the location field disappears; leave it off and you are asked for a physical address.\n\nStart date and time are required, end date and time optional — a multi-day event spans those dates across the calendar grid. Capacity is optional too; leave it empty for unlimited.',
    position: 'right',
  },
  {
    target: '[data-tutorial="event-form-challenge"]',
    title: 'Challenges and climate action',
    description:
      'A challenge event gives attendees a goal and a submission deadline. Ticking it here only turns the feature on — the objectives, constraints, deliverables and judging criteria are added from the event’s Challenge tab afterwards.\n\nUnder it, the climate-action flag puts the event in the region’s resilience agenda, where it can be filtered for on the events page.',
    position: 'right',
  },
  replayStep,
]
