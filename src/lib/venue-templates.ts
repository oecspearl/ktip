/**
 * Whole-building templates for the venue editor.
 *
 * A room preset answers "what is a judging room"; a template answers "what
 * rooms does this kind of event need, and where do they go". Each one is a
 * named arrangement of the presets in venue-room-presets.ts on the default
 * grid — applying one is exactly the same code path as dropping the presets by
 * hand, so a templated venue is ordinary rows the moment it is saved.
 *
 * `suggestedFor` is an ordering hint in the picker, never a filter: a
 * conference host who wants the hackathon building may take it.
 *
 * The first template is the same six rooms as `STARTER_LAYOUT`, which in turn
 * mirrors SQL `seed_default_venue_rooms()` — that parity is asserted in
 * venue-templates.test.ts, so neither list can drift without a test going red.
 */

import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { STARTER_LAYOUT } from './venue-room-presets'

export interface TemplatePlacement {
  /** A VENUE_ROOM_PRESETS key. */
  preset: string
  /** Inclusive rect [x1, y1, x2, y2] on the default 28×18 grid. */
  rect: [number, number, number, number]
  /** Which level. Absent means the ground floor. */
  floor?: number
  /** Overrides the preset's name — a 'showcase' placed as "Main Stage". */
  name?: string
}

export interface VenueTemplate {
  id: string
  name: MessageDescriptor
  description: MessageDescriptor
  /** lucide-react icon name, resolved by the picker. */
  icon: string
  /** Event types this is put first for. An ordering hint, not a filter. */
  suggestedFor: string[]
  rooms: TemplatePlacement[]
}

export const VENUE_TEMPLATES: VenueTemplate[] = [
  {
    id: 'hackathon-hq',
    name: msg`Hackathon HQ`,
    description: msg`The classic build weekend: a main hall for announcements, a stage for demos, a help desk, and somewhere quiet to actually work.`,
    icon: 'Rocket',
    suggestedFor: ['hackathon', 'challenge'],
    rooms: STARTER_LAYOUT.map((entry) => ({ preset: entry.preset, rect: entry.rect })),
  },
  {
    id: 'conference-center',
    name: msg`Conference Center`,
    description: msg`A main stage the audience listens to, sponsor booths, two breakout rooms, a registration desk and a green room for speakers.`,
    icon: 'Mic',
    suggestedFor: ['conference'],
    rooms: [
      { preset: 'showcase', rect: [2, 2, 12, 8], name: 'Main Stage' },
      { preset: 'networking', rect: [14, 2, 20, 7] },
      { preset: 'registration', rect: [22, 2, 26, 5] },
      { preset: 'sponsor-booth', rect: [2, 10, 6, 13] },
      { preset: 'sponsor-booth', rect: [8, 10, 12, 13], name: 'Sponsor Booth B' },
      { preset: 'sponsor-booth', rect: [14, 10, 18, 13], name: 'Sponsor Booth C' },
      { preset: 'workshop', rect: [20, 8, 26, 11], name: 'Breakout A' },
      { preset: 'workshop', rect: [20, 13, 26, 16], name: 'Breakout B' },
      { preset: 'green-room', rect: [2, 15, 7, 17] },
    ],
  },
  {
    id: 'workshop-studio',
    name: msg`Workshop Studio`,
    description: msg`One taught room up front, a lounge to mingle in, a help desk, and a quiet room for exercises.`,
    icon: 'Wrench',
    suggestedFor: ['workshop', 'meetup'],
    rooms: [
      { preset: 'workshop', rect: [2, 2, 12, 9], name: 'Workshop Floor' },
      { preset: 'networking', rect: [14, 2, 20, 7] },
      { preset: 'help-desk', rect: [22, 2, 26, 6] },
      { preset: 'quiet-room', rect: [14, 10, 20, 14] },
      { preset: 'registration', rect: [22, 8, 26, 11] },
    ],
  },
  {
    id: 'expo-hall',
    name: msg`Expo Hall`,
    description: msg`A floor of sponsor booths around a central hall, with a demo stage and space to network between the aisles.`,
    icon: 'Store',
    suggestedFor: ['demo_day', 'conference'],
    rooms: [
      { preset: 'main-hall', rect: [2, 2, 10, 8], name: 'Expo Hall' },
      { preset: 'sponsor-booth', rect: [12, 2, 16, 5] },
      { preset: 'sponsor-booth', rect: [18, 2, 22, 5], name: 'Sponsor Booth B' },
      { preset: 'sponsor-booth', rect: [12, 7, 16, 10], name: 'Sponsor Booth C' },
      { preset: 'sponsor-booth', rect: [18, 7, 22, 10], name: 'Sponsor Booth D' },
      { preset: 'networking', rect: [2, 10, 10, 15] },
      { preset: 'showcase', rect: [12, 12, 22, 16], name: 'Demo Stage' },
    ],
  },
]

export function templateById(id: string): VenueTemplate | undefined {
  return VENUE_TEMPLATES.find((t) => t.id === id)
}

/**
 * Every template, the ones suggested for this event type first. Original order
 * is kept within each half, so the list is stable for any type.
 */
export function templatesForType(eventType: string | null | undefined): VenueTemplate[] {
  if (!eventType) return VENUE_TEMPLATES
  return [...VENUE_TEMPLATES].sort(
    (a, b) => Number(b.suggestedFor.includes(eventType)) - Number(a.suggestedFor.includes(eventType))
  )
}
