import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the public /events page.
 *
 * Deliberately few steps with large spotlights: each one frames a whole region
 * of the page and explains everything inside it, rather than walking control by
 * control. Five cards beats thirteen clicks.
 *
 * Ordering: step 1 drives the view toggle back to Calendar on Next, so a
 * visitor whose `events:view` preference is 'grid' can't strand step 3. Step 3
 * is the hand-off — the user clicks Grid themselves — and step 4 only exists in
 * grid view. Anything missing (no tags, one sort option, no results) is
 * auto-skipped by the engine.
 */
export const eventsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="events-hero"]',
    title: 'Welcome to Events',
    description:
      'Every KTIP workshop, webinar, conference, training and field activity across the region lives on this page — upcoming and past.\n\nYou can browse it two ways, filter it half a dozen ways, and add your own event with the Create Event button in this banner.\n\nThis tour takes about a minute. Leave any time with Escape or the red button at the top.',
    position: 'center',
    clickTarget: '[data-tutorial="events-view-calendar"]',
    clickTargetDelay: 250,
  },
  {
    target: '[data-tutorial="events-filters"]',
    title: 'One bar, every filter',
    description:
      'Everything here narrows the events below, and the filters stack — combine as many as you need.\n\n• Event type — workshops, conferences, webinars, training, meetings\n• Climate Action — only events tied to the region’s resilience agenda\n• Search — click the magnifier to open it, then type a title, topic or venue\n• Topic chips appear under the bar when the current events carry tags\n\nOnce anything is active, a Clear all filters link appears underneath to reset in one click.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="events-calendar-view"]',
    title: 'Calendar view',
    description:
      'The month grid shows what is happening on each day; multi-day events span across the dates they cover. Use the arrows to change month, or Today to jump back.\n\nClick any date and the panel on the right loads that day in full — start times, location or virtual link, and event type. Click an entry there for the whole event page.\n\nWhen you would rather browse than plan around dates, switch to Grid using the toggle up in the filter bar.',
    position: 'right',
    scrollMode: 'top',
    secondaryTarget: '[data-tutorial="events-view-toggle"]',
    interactive: true,
    actionTarget: '[data-tutorial="events-view-grid"]',
    actionHint: 'Click Grid',
    advanceDelay: 500,
  },
  {
    target: '[data-tutorial="events-results"]',
    title: 'Grid view',
    description:
      'The same events as cards — type, title, summary, date and location at a glance, plus badges for cancelled, past and climate-action events. The count above tells you how many matched your filters.\n\nUpcoming events are grouped by type — fold a section shut to get it out of the way. Everything that has already happened sits in a Past events section at the bottom, folded up until you want it.\n\nGrid view also unlocks a sort order back in the filter bar: what is coming up next, newest, or For You once you have set your interests in your profile.',
    position: 'top',
    scrollMode: 'top',
    secondaryTarget: '[data-tutorial="events-filters"]',
  },
  replayStep,
]
