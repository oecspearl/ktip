/**
 * Whole-building templates for the venue editor and the create-event form.
 *
 * A room preset answers "what is a judging room"; a template answers "what
 * rooms does this kind of event need, and where do they go". Templates come in
 * two shapes:
 *
 *  - Fixed: `rooms` places presets on exact rects of the default grid. The
 *    original four single-floor templates are these, and applying one is the
 *    same code path as dropping the presets by hand.
 *  - Laid out: `floors` lists each floor's rooms by preset and size only. The
 *    building is laid out when it is applied (venue-building.ts, using
 *    venue-layout.ts), with a random seed, so the same template gives a
 *    different tidy floorplan every time and stairs always line up.
 *
 * Either way the result is ordinary room rows the moment it is saved.
 *
 * `suggestedFor` is an ordering hint in the picker, never a filter: a
 * conference host who wants the hackathon building may take it.
 *
 * The `hackathon-hq` template is the same six rooms as `STARTER_LAYOUT`, which
 * in turn mirrors SQL `seed_default_venue_rooms()`. That parity is asserted in
 * venue-templates.test.ts, so neither list can drift without a test going red.
 */

import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { STARTER_LAYOUT } from './venue-room-presets'
import type { FurniturePreset } from './venue-furniture'
import type { RoomSectionId } from './venue-room-sections'

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

/** One room of a laid-out template: what it is and how big, not where. */
export interface TemplateRoom {
  /** A VENUE_ROOM_PRESETS key. */
  preset: string
  /** Footprint in cells. The layout may turn the room 90 degrees to fit. */
  w: number
  h: number
  /** Overrides the preset's name. Stored as typed, like a preset name. */
  name?: string
  /** Overrides the preset's description, for a room renamed into a new job. */
  description?: MessageDescriptor
  /** Overrides the preset's furniture. */
  furniture?: FurniturePreset
  /** Panels added on top of the ones the preset already brings. */
  addSections?: RoomSectionId[]
}

export interface TemplateFloor {
  /** Floor name as stored on the map, like the seed script's floors. */
  name: string
  rooms: TemplateRoom[]
}

export interface VenueTemplate {
  id: string
  name: MessageDescriptor
  description: MessageDescriptor
  /** lucide-react icon name, resolved by the picker. */
  icon: string
  /** Event types this is put first for. An ordering hint, not a filter. */
  suggestedFor: string[]
  /** Fixed placements. Empty for a laid-out template. */
  rooms: TemplatePlacement[]
  /**
   * A laid-out building, floor by floor. When present, `rooms` is empty and
   * the building replaces whatever the venue had when it is applied.
   */
  floors?: TemplateFloor[]
}

// ---------------------------------------------------------------------------
// Laid-out buildings
// ---------------------------------------------------------------------------

const teamRooms = (from: number, count: number, w = 6, h = 5): TemplateRoom[] =>
  Array.from({ length: count }, (_, i) => ({
    preset: 'homebase',
    w,
    h,
    name: `Team room ${from + i}`,
  }))

const SUBMISSION_DESK: TemplateRoom = {
  preset: 'help-desk',
  w: 6,
  h: 5,
  name: 'Submission Desk',
  description: msg`Hand in your project before the deadline.`,
  addSections: ['submission_desk'],
}

const QUEST_BOARD: TemplateRoom = {
  preset: 'quest-board',
  w: 5,
  h: 6,
  addSections: ['quest_board'],
}

/**
 * The five-floor hackathon from scripts/seed-hackathon-venue.mjs, room for
 * room. A few rooms are a cell smaller than the seed's, so every floor fits on
 * the first layout attempt for any seed (venue-building.test.ts sweeps seeds).
 */
const HACKATHON_TOWER: TemplateFloor[] = [
  {
    name: 'Ground · Arrivals',
    rooms: [
      { preset: 'registration', w: 6, h: 4 },
      { preset: 'main-hall', w: 9, h: 8 },
      { preset: 'networking', w: 8, h: 7, name: 'Networking Lounge' },
      { preset: 'help-desk', w: 6, h: 5 },
      {
        preset: 'networking',
        w: 5,
        h: 5,
        name: 'Team Finder',
        description: msg`Teams with open places, and people looking for one.`,
        furniture: 'booth',
      },
      { preset: 'sponsor-booth', w: 5, h: 3 },
      { preset: 'quiet-room', w: 8, h: 4 },
    ],
  },
  {
    name: 'Level 1 · Homebase wing A',
    rooms: [
      ...teamRooms(1, 6, 5, 5),
      {
        preset: 'networking',
        w: 4,
        h: 10,
        name: 'Collab Commons',
        description: msg`What teams offer and need, and the bridges open between them.`,
        addSections: ['collab_commons'],
      },
    ],
  },
  {
    name: 'Level 2 · Homebase wing B',
    rooms: [
      { preset: 'workshop', w: 7, h: 6 },
      { preset: 'hardware-bench', w: 6, h: 5 },
      { preset: 'library', w: 6, h: 5 },
      ...teamRooms(7, 3, 5, 5),
      { preset: 'mentor-lounge', w: 5, h: 4 },
    ],
  },
  {
    name: 'Level 3 · Demos',
    rooms: [
      // The Spectator Gallery folded into this room (2026-11-10): People's
      // Choice is already on the stage, and a second room showing the same
      // demos only split the audience in two.
      { preset: 'showcase', w: 11, h: 7 },
      SUBMISSION_DESK,
      QUEST_BOARD,
    ],
  },
  {
    name: 'Level 4 · Judging and HQ',
    rooms: [
      { preset: 'judging', w: 8, h: 7 },
      {
        preset: 'judging',
        w: 6,
        h: 5,
        name: 'Deliberation Room',
        description: msg`Where the judges agree the results.`,
      },
      { preset: 'organiser-hq', w: 8, h: 7, addSections: ['organiser_ops'] },
      { preset: 'green-room', w: 7, h: 5 },
    ],
  },
]

const COMPACT_HACKATHON: TemplateFloor[] = [
  {
    name: 'Ground · Arrivals and stage',
    rooms: [
      { preset: 'registration', w: 5, h: 3 },
      { preset: 'main-hall', w: 9, h: 6 },
      { preset: 'showcase', w: 9, h: 6 },
      { preset: 'help-desk', w: 5, h: 4 },
      { preset: 'networking', w: 7, h: 5, name: 'Networking Lounge' },
    ],
  },
  {
    name: 'Level 1 · Build floor',
    rooms: [
      ...teamRooms(1, 6, 5, 4),
      { preset: 'workshop', w: 6, h: 5 },
      { preset: 'mentor-lounge', w: 5, h: 4 },
      { preset: 'judging', w: 5, h: 4 },
      { ...QUEST_BOARD, w: 4, h: 4 },
    ],
  },
]

const CAMPUS: TemplateFloor[] = [
  {
    name: 'Ground · Welcome',
    rooms: [
      { preset: 'registration', w: 5, h: 3 },
      { preset: 'main-hall', w: 10, h: 7, name: 'Auditorium' },
      { preset: 'networking', w: 7, h: 5, name: 'Café' },
      { preset: 'help-desk', w: 5, h: 4 },
      { preset: 'sponsor-booth', w: 5, h: 3, name: 'Sponsor Booth A' },
      { preset: 'sponsor-booth', w: 5, h: 3, name: 'Sponsor Booth B' },
    ],
  },
  {
    name: 'Level 1 · Classrooms',
    rooms: [
      { preset: 'workshop', w: 7, h: 5, name: 'Classroom A' },
      { preset: 'workshop', w: 7, h: 5, name: 'Classroom B' },
      { preset: 'workshop', w: 7, h: 5, name: 'Classroom C' },
      { preset: 'library', w: 6, h: 5 },
      { preset: 'quiet-room', w: 6, h: 4 },
    ],
  },
  {
    name: 'Level 2 · Studios',
    rooms: [
      { preset: 'team-pod', w: 5, h: 4, name: 'Studio 1' },
      { preset: 'team-pod', w: 5, h: 4, name: 'Studio 2' },
      { preset: 'team-pod', w: 5, h: 4, name: 'Studio 3' },
      { preset: 'team-pod', w: 5, h: 4, name: 'Studio 4' },
      { preset: 'hardware-bench', w: 6, h: 5, name: 'Maker Lab' },
      { preset: 'mentor-lounge', w: 5, h: 4 },
      { preset: 'green-room', w: 4, h: 4 },
    ],
  },
]

const BIG_HALL: TemplateFloor[] = [
  {
    name: 'Ground floor',
    rooms: [
      { preset: 'main-hall', w: 20, h: 9 },
      { preset: 'registration', w: 5, h: 3 },
      { preset: 'help-desk', w: 5, h: 3 },
      { preset: 'networking', w: 6, h: 3, name: 'Coffee Corner' },
    ],
  },
]

// ---------------------------------------------------------------------------
// The gallery
// ---------------------------------------------------------------------------

export const VENUE_TEMPLATES: VenueTemplate[] = [
  {
    id: 'hackathon-tower',
    name: msg`Hackathon Tower`,
    description: msg`Arrivals on the ground floor, two Homebase floors for up to nine teams, then demos, then judging and organiser HQ at the top.`,
    icon: 'Building2',
    suggestedFor: ['hackathon', 'challenge'],
    rooms: [],
    floors: HACKATHON_TOWER,
  },
  {
    id: 'hackathon-compact',
    name: msg`Compact Hackathon`,
    description: msg`Talks and demos downstairs. Upstairs, six team rooms, a workshop, mentors and judging.`,
    icon: 'Layers',
    suggestedFor: ['hackathon', 'challenge'],
    rooms: [],
    floors: COMPACT_HACKATHON,
  },
  {
    id: 'campus',
    name: msg`Campus`,
    description: msg`An auditorium and sponsors on the ground floor, classrooms above, and team studios with a maker lab at the top.`,
    icon: 'GraduationCap',
    suggestedFor: ['conference'],
    rooms: [],
    floors: CAMPUS,
  },
  {
    id: 'big-hall',
    name: msg`Big Hall`,
    description: msg`One large room for everyone, with a registration desk, a help desk and a coffee corner.`,
    icon: 'Warehouse',
    suggestedFor: ['meetup', 'demo_day'],
    rooms: [],
    floors: BIG_HALL,
  },
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

/** True for a template laid out at apply time rather than placed on fixed rects. */
export function isLaidOut(template: VenueTemplate): boolean {
  return !!template.floors?.length
}

/** How many floors and rooms a template builds, for the card under its name. */
export function templateSize(template: VenueTemplate): { floors: number; rooms: number } {
  if (template.floors?.length) {
    return {
      floors: template.floors.length,
      rooms: template.floors.reduce((n, f) => n + f.rooms.length, 0),
    }
  }
  return {
    floors: Math.max(1, ...template.rooms.map((r) => (r.floor ?? 0) + 1)),
    rooms: template.rooms.length,
  }
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
