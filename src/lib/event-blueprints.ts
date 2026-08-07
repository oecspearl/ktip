/**
 * What each kind of event actually asks for.
 *
 * The create form used to ask a meetup and a hackathon exactly the same seven
 * questions, then branch on two hard-coded booleans (`eventType === 'challenge'`
 * and `=== 'hackathon'`) buried in the JSX. Adding a field for one type meant
 * hunting for every place the type was compared to a string.
 *
 * A blueprint is that comparison, done once. The form reads flags off it and
 * never looks at the type itself; so does the Step 2 page. Labels, icons and
 * colours are NOT repeated here — they already live in constants.ts and
 * category-icons.ts, keyed by the same six strings.
 */
import type { EventType } from '../types'

/** Whether a field is shown, and whether it has to be filled in. */
export type FieldRule = 'required' | 'optional' | 'hidden'

export interface EventBlueprint {
  type: EventType
  /** One line on the type picker card — what you get by choosing this */
  tagline: string
  /** `virtual-only` hides the toggle and forces is_virtual */
  format: 'choice' | 'virtual-only'
  /** Only consulted when format is 'choice' */
  defaultVirtual: boolean
  /** The free-text venue line. Only ever shown for an in-person event. */
  location: FieldRule
  endDate: FieldRule
  capacity: FieldRule
  /** What the capacity field is called for this type — "seats" is not "entrants" */
  capacityLabel: string
  capacityHelp: string
  registrationCloses: boolean
  teamSize: boolean
  submissionDeadline: boolean
  /**
   * Whether "register as a viewer" is a coherent thing to offer. A workshop
   * seat or a meetup is attended, not watched; a hackathon, a conference and a
   * demo day all have an audience that is not competing. This only makes the
   * choice *possible* — the organizer still has to switch spectators on.
   */
  allowViewers: boolean
  /** Seeds the DetailsEditor with the rows this type nearly always needs */
  detailPresets: string[]
  /** Columns forced on at insert, because the type implies them */
  onCreate: { has_venue?: boolean; has_challenge?: boolean; spectators_enabled?: boolean }
  /** null means creating it is the whole job — no second screen */
  setup: null | {
    /** Goes on the submit button ("Next: …") and in the stepper */
    label: string
    blurb: string
    /** Which editors the Step 2 page renders, in this order */
    sections: SetupSection[]
    /**
     * Stepper label for the non-venue editors when 'venue' is also in
     * sections — the venue gets a step of its own, and this names the one
     * after it ("The brief" for a hackathon, "The programme" for a
     * conference). Ignored when sections has no venue.
     */
    programmeLabel?: string
  }
}

/**
 * A section on the Step 2 page. Each one maps to an editor that already
 * exists — this is wiring, not new UI.
 */
export type SetupSection =
  | 'speakers'
  | 'schedule'
  | 'challenge'
  | 'judging'
  | 'pages'
  | 'venue'

/** Shared by every type that runs on a clock in a room. */
const IN_PERSON_DEFAULTS = {
  format: 'choice',
  defaultVirtual: false,
  location: 'required',
} as const

export const EVENT_BLUEPRINTS: Record<EventType, EventBlueprint> = {
  hackathon: {
    type: 'hackathon',
    tagline: 'A build sprint in a venue you lay out yourself, with a brief and judging.',
    format: 'choice',
    // The venue system this type switches on is the virtual one, so a
    // hackathon starts virtual unless the host says otherwise.
    defaultVirtual: true,
    location: 'required',
    endDate: 'required',
    capacity: 'optional',
    capacityLabel: 'Participant cap (Optional)',
    capacityHelp: 'Leave empty for unlimited participants',
    registrationCloses: true,
    teamSize: true,
    submissionDeadline: true,
    allowViewers: true,
    detailPresets: [],
    // has_challenge as well as has_venue: a hackathon has a brief and takes
    // submissions. Without it the criteria and solutions tables — which are
    // already built — stay unreachable for the one type that needs them most.
    //
    // spectators_enabled because a hackathon is the type people watch. It was
    // the one flag join_venue() consulted that nothing ever switched on, so
    // the spectator branch had never once been reached.
    onCreate: { has_venue: true, has_challenge: true, spectators_enabled: true },
    setup: {
      label: 'design the rooms',
      blurb:
        'Lay out the rooms your hackathon needs, then write the brief teams are building against.',
      sections: ['venue', 'challenge'],
      programmeLabel: 'The brief',
    },
  },

  workshop: {
    type: 'workshop',
    ...IN_PERSON_DEFAULTS,
    tagline: 'A taught session with a facilitator, a run sheet and a fixed number of seats.',
    endDate: 'required',
    // A workshop with unlimited seats is a webinar. Making this required is
    // the one place the form is stricter than the database.
    capacity: 'required',
    capacityLabel: 'Seats',
    capacityHelp: 'How many people can attend. Workshops are seat-limited by nature.',
    registrationCloses: true,
    teamSize: false,
    submissionDeadline: false,
    // A seat is a seat. There is nothing to spectate at a taught session.
    allowViewers: false,
    detailPresets: ['Prerequisites', 'What to bring'],
    onCreate: {},
    setup: {
      label: 'add the facilitator',
      blurb: 'Who is running it, and how the session breaks down hour by hour.',
      sections: ['speakers', 'schedule'],
    },
  },

  meetup: {
    type: 'meetup',
    ...IN_PERSON_DEFAULTS,
    tagline: 'People in a room at a time. Nothing to configure afterwards.',
    endDate: 'optional',
    capacity: 'optional',
    capacityLabel: 'Capacity (Optional)',
    capacityHelp: 'Leave empty for unlimited capacity',
    registrationCloses: false,
    teamSize: false,
    submissionDeadline: false,
    allowViewers: false,
    detailPresets: [],
    onCreate: {},
    // The only type with no second screen. A meetup that needed one would be
    // a workshop.
    setup: null,
  },

  conference: {
    type: 'conference',
    tagline: 'A multi-day programme with speakers, an agenda and sponsors.',
    format: 'choice',
    // Same reasoning as hackathon: the venue system this type switches on is
    // the virtual one, so a conference starts virtual unless the host says
    // otherwise.
    defaultVirtual: true,
    location: 'required',
    endDate: 'required',
    capacity: 'optional',
    capacityLabel: 'Capacity (Optional)',
    capacityHelp: 'Leave empty for unlimited capacity',
    registrationCloses: true,
    teamSize: false,
    submissionDeadline: false,
    allowViewers: true,
    detailPresets: [],
    // has_venue: a virtual conference runs on the same venue engine as a
    // hackathon — stage, sponsor booths, breakouts (its own default layout,
    // not team pods). spectators_enabled because allowViewers is already true
    // and the 096 join flow maps viewer RSVPs to venue spectators.
    onCreate: { has_venue: true, spectators_enabled: true },
    setup: {
      label: 'design the venue',
      blurb:
        'Lay out the stage, booths and breakout rooms, then add the speakers and the programme.',
      sections: ['venue', 'speakers', 'schedule', 'pages'],
      programmeLabel: 'The programme',
    },
  },

  demo_day: {
    type: 'demo_day',
    ...IN_PERSON_DEFAULTS,
    tagline: 'Teams pitch in turn and are scored against criteria you set.',
    endDate: 'required',
    capacity: 'optional',
    capacityLabel: 'Audience cap (Optional)',
    capacityHelp: 'Leave empty for unlimited audience',
    registrationCloses: true,
    teamSize: true,
    submissionDeadline: true,
    // The cap is already called "Audience cap" — watching is the point.
    allowViewers: true,
    detailPresets: ['Pitch length'],
    // Judging criteria live on event_criteria, which is gated behind
    // has_challenge. A demo day is nothing but judging, so it gets the flag.
    onCreate: { has_challenge: true },
    setup: {
      label: 'set the line-up',
      blurb: 'Who pitches when, and what the judges are scoring against.',
      sections: ['schedule', 'judging'],
    },
  },

  challenge: {
    type: 'challenge',
    tagline: 'An open brief anyone can enter and submit against before a deadline.',
    // Nobody attends a challenge — they enter one. There is no room, so there
    // is no in-person option and nothing to ask about a venue.
    format: 'virtual-only',
    defaultVirtual: true,
    location: 'hidden',
    endDate: 'hidden',
    capacity: 'hidden',
    capacityLabel: '',
    capacityHelp: '',
    // The submission deadline is what closes a challenge; a second date that
    // shuts registration earlier would just be confusing.
    registrationCloses: false,
    teamSize: true,
    submissionDeadline: true,
    // Nobody attends a challenge, so there is nothing to watch either.
    allowViewers: false,
    detailPresets: [],
    onCreate: { has_challenge: true },
    setup: {
      label: 'write the brief',
      blurb:
        'Objectives, constraints, deliverables and the criteria entries are judged against.',
      sections: ['challenge'],
    },
  },
}

/** The order the type picker shows. Most-configured first. */
export const EVENT_TYPE_ORDER: EventType[] = [
  'hackathon',
  'challenge',
  'workshop',
  'conference',
  'demo_day',
  'meetup',
]

/**
 * Falls back to meetup — the plainest type — for a row written before this
 * file existed or by something other than the form.
 */
export function blueprintFor(eventType: string | null | undefined): EventBlueprint {
  return EVENT_BLUEPRINTS[eventType as EventType] ?? EVENT_BLUEPRINTS.meetup
}

/** Whether this type has a Step 2 at all. */
export function hasSetupStep(eventType: string | null | undefined): boolean {
  return blueprintFor(eventType).setup !== null
}

/**
 * The stepper labels for a type. One entry means no stepper is drawn — a
 * single-step flow is just a form.
 *
 * A type whose setup includes the venue gets a step per half — the building,
 * then the programme/brief — and every multi-step flow ends on the event
 * management workspace, where the event is actually run from.
 */
export function setupSteps(eventType: string | null | undefined): string[] {
  const { setup } = blueprintFor(eventType)
  if (!setup) return ['Event details']

  // The label is written for a button ("Next: design the rooms"), so it needs
  // a capital to stand on its own in the stepper.
  const capitalized = setup.label.charAt(0).toUpperCase() + setup.label.slice(1)
  const hasVenue = setup.sections.includes('venue')
  const rest = setup.sections.filter((s) => s !== 'venue')

  const steps = ['Event details']
  if (hasVenue) steps.push(capitalized)
  if (rest.length) steps.push(hasVenue ? (setup.programmeLabel ?? 'The programme') : capitalized)
  steps.push('Event management')
  return steps
}
