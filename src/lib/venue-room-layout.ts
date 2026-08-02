/**
 * How a room is arranged (companion to venue-room-sections.ts).
 *
 * 091 made *what* a room contains data — an ordered list of sections, defaulted
 * per kind. This makes *where those sections sit* data too. Before it, every
 * room rendered into one hardcoded `1fr 20rem` grid, so a stage that is mostly
 * video and a help desk that is mostly people looked identical and differed
 * only by which cards fell into the same two columns.
 *
 * Three ideas, in the order they matter:
 *
 *   1. Each kind has a bento — a span per section on a 12-column grid.
 *   2. One cell is the HERO, the big one. Its default is per kind.
 *   3. The hero can be taken over: by the viewer (a pin, per device), by the
 *      host (a stored flag), or by whoever is presenting right now. Priority
 *      beats preference beats configuration beats the default — see resolveHero.
 *
 * Everything here is pure and stores nothing new. The host's choices ride in
 * venue_rooms.sections[].config, which 091 already round-trips as opaque jsonb,
 * so none of this needed a migration.
 *
 * ADDING A SECTION
 * ----------------
 * Nothing to do. An id with no span falls back by slot, which is why adding a
 * panel is still a registry entry plus a case in RoomSections and nothing else.
 * Give it a span here only when its default size is wrong.
 */

import {
  parseSections,
  sectionDef,
  sectionsForRoom,
  setSectionConfig,
  SECTIONS,
} from './venue-room-sections'
import type { VenueRole } from '../types'
import type { RoomSectionId, RoomSectionSetting } from './venue-room-sections'
import type { VenueRoom, VenueRoomKind } from '../types'

/**
 * How the cameras are arranged when the call lands.
 *
 * Not a cosmetic choice — it is the difference between one person talking to
 * two hundred and eight people talking to each other, and the room already
 * knows which it is. See docs/VIDEO-SETUP.md for how each maps onto LiveKit.
 */
export type RoomCameraMode =
  /** One presenter, big, with a strip of thumbnails. A talk. */
  | 'spotlight'
  /** Equal tiles, up to max_publishers. A panel of judges. */
  | 'grid'
  /** Small round tiles in a row. A group that is working, not watching. */
  | 'huddle'
  /** No call in this room at all. */
  | 'off'

export const ROOM_CAMERA_MODES: RoomCameraMode[] = ['spotlight', 'grid', 'huddle', 'off']

export const ROOM_CAMERA_LABELS: Record<RoomCameraMode, string> = {
  spotlight: 'Single presenter',
  grid: 'Everyone in a grid',
  huddle: 'Small huddle',
  off: 'No video in this room',
}

/**
 * The span vocabulary. Twelve columns, because eight-and-four is the shape of
 * "a thing to watch and a thing to read beside it" and no coarser grid can say
 * it. Rows are `auto-rows-[minmax(11rem,auto)]`, so row-span-2 is ~23rem.
 */
const SPAN = {
  hero: 'lg:col-span-8 lg:row-span-2',
  rail: 'lg:col-span-4 lg:row-span-2',
  wide: 'lg:col-span-12',
  band: 'lg:col-span-8',
  half: 'lg:col-span-6',
  third: 'lg:col-span-4',
  tile: 'lg:col-span-3',
} as const

export type RoomSpanKey = keyof typeof SPAN

export interface RoomLayoutDef {
  /** The big cell, when nobody has said otherwise. */
  hero: RoomSectionId
  /** The full-height column beside the hero. */
  rail: RoomSectionId
  camera: RoomCameraMode
  spans: Partial<Record<RoomSectionId, RoomSpanKey>>
  /** Ids placed first, in this order. Everything else keeps registry order. */
  order?: RoomSectionId[]
}

/**
 * A layout per kind, typed `Record<VenueRoomKind, …>` on purpose: the label and
 * icon maps in constants.ts are `Record<string, string>` and silently tolerate a
 * missing kind. A room with no layout would be a room with no shape.
 */
export const ROOM_LAYOUTS: Record<VenueRoomKind, RoomLayoutDef> = {
  // A keynote hall. The call is the room; everything else is a margin note.
  main_hall: {
    hero: 'av_placeholder',
    rail: 'chat',
    camera: 'spotlight',
    order: ['sponsor_hero', 'check_in', 'host_controls', 'av_placeholder', 'chat', 'reactions'],
    spans: {
      sponsor_hero: 'wide',
      check_in: 'wide',
      host_controls: 'wide',
      reactions: 'band',
      challenge_brief: 'half',
      announcements: 'third',
      wayfinding: 'third',
      occupants: 'third',
      countdown: 'tile',
      capacity: 'tile',
      venue_headcount: 'tile',
    },
  },

  // A stage is a main hall that ends in submissions, so the gallery is a full
  // width band under the call rather than a column beside it.
  stage: {
    hero: 'av_placeholder',
    rail: 'chat',
    camera: 'spotlight',
    order: ['host_controls', 'av_placeholder', 'chat', 'reactions', 'showcase_gallery'],
    spans: {
      host_controls: 'wide',
      reactions: 'band',
      hand_queue: 'third',
      showcase_gallery: 'wide',
      occupants: 'third',
      countdown: 'tile',
      capacity: 'tile',
    },
  },

  // Someone is teaching. The brief for what is being built sits directly under
  // the facilitator, and the files they are working from are next to it.
  workshop: {
    hero: 'av_placeholder',
    rail: 'chat',
    camera: 'spotlight',
    order: ['host_controls', 'av_placeholder', 'chat', 'objectives'],
    spans: {
      host_controls: 'wide',
      objectives: 'band',
      resources: 'third',
      hand_queue: 'third',
      occupants: 'third',
      faq: 'half',
      rules: 'half',
    },
  },

  // Several judges on camera at once, and never one of them made large.
  judging: {
    hero: 'av_placeholder',
    rail: 'judges_present',
    camera: 'grid',
    order: ['host_controls', 'av_placeholder', 'judges_present', 'challenge_brief'],
    spans: {
      host_controls: 'wide',
      challenge_brief: 'half',
      chat: 'half',
      showcase_gallery: 'wide',
      occupants: 'third',
      countdown: 'tile',
    },
  },

  // The sponsor's banner across the top, their rep on camera, their links where
  // a click is one movement away from the person talking.
  sponsor_booth: {
    hero: 'av_placeholder',
    rail: 'sponsor_links',
    camera: 'spotlight',
    order: ['sponsor_hero', 'av_placeholder', 'sponsor_links', 'chat'],
    spans: {
      sponsor_hero: 'wide',
      host_controls: 'wide',
      chat: 'band',
      occupants: 'third',
      faq: 'half',
    },
  },

  // Nobody presents at a mixer. Cameras are a strip, and finding people is the
  // job — so the hero is the conversation and the rail is who is looking.
  networking: {
    hero: 'chat',
    rail: 'looking_for_team',
    camera: 'huddle',
    order: ['host_controls', 'av_placeholder', 'chat', 'looking_for_team', 'skill_finder'],
    spans: {
      host_controls: 'wide',
      av_placeholder: 'wide',
      skill_finder: 'third',
      occupants: 'third',
      wayfinding: 'third',
      venue_headcount: 'tile',
    },
  },

  // The question goes in the chat; the answer is whichever mentor is free. So
  // the mentors are the rail, and who is stuck sits under them.
  help_desk: {
    hero: 'chat',
    rail: 'mentors_on_duty',
    camera: 'huddle',
    order: ['host_controls', 'av_placeholder', 'chat', 'mentors_on_duty', 'help_nudge'],
    spans: {
      host_controls: 'wide',
      av_placeholder: 'band',
      help_nudge: 'third',
      wayfinding: 'third',
      occupants: 'third',
      faq: 'half',
      rules: 'half',
    },
  },

  // A team space is a desk, not a broadcast. Cameras stay a strip along the
  // top, the timer and the objective are small and always visible.
  team: {
    hero: 'chat',
    rail: 'occupants',
    camera: 'huddle',
    order: ['av_placeholder', 'chat', 'occupants', 'objectives'],
    spans: {
      host_controls: 'wide',
      av_placeholder: 'wide',
      objectives: 'half',
      resources: 'half',
      focus_timer: 'tile',
      countdown: 'tile',
      capacity: 'tile',
    },
  },

  // The overflow room: a handful of people, a purpose written at the top.
  breakout: {
    hero: 'chat',
    rail: 'occupants',
    camera: 'huddle',
    order: ['host_controls', 'av_placeholder', 'chat', 'occupants'],
    spans: {
      host_controls: 'wide',
      av_placeholder: 'band',
      objectives: 'half',
      rules: 'half',
      focus_timer: 'tile',
      wayfinding: 'third',
    },
  },
}

export function layoutFor(kind: VenueRoomKind): RoomLayoutDef {
  return ROOM_LAYOUTS[kind] || ROOM_LAYOUTS.breakout
}

/**
 * Sections big enough to be the big one.
 *
 * A countdown promoted to a 23rem hero is four digits and a lot of cream. The
 * kind's own hero and rail are always eligible on top of this list, because a
 * layout that names a section as its hero has already made the argument.
 */
const HERO_ELIGIBLE: RoomSectionId[] = [
  'av_placeholder',
  'chat',
  'announcement_feed',
  'showcase_gallery',
  'challenge_brief',
  'occupants',
  'resources',
]

export function heroChoices(kind: VenueRoomKind, visible: RoomSectionId[]): RoomSectionId[] {
  const layout = layoutFor(kind)
  const allowed = new Set<RoomSectionId>([...HERO_ELIGIBLE, layout.hero, layout.rail])
  return visible.filter((id) => allowed.has(id))
}

export function canBeHero(kind: VenueRoomKind, id: RoomSectionId): boolean {
  const layout = layoutFor(kind)
  return HERO_ELIGIBLE.includes(id) || id === layout.hero || id === layout.rail
}

/** A section with no span of its own: wide-ish in the main column, a card beside it. */
function fallbackSpan(id: RoomSectionId): RoomSpanKey {
  return sectionDef(id)?.slot === 'aside' ? 'third' : 'half'
}

function baseSpan(layout: RoomLayoutDef, id: RoomSectionId): RoomSpanKey {
  if (id === layout.hero) return 'hero'
  if (id === layout.rail) return 'rail'
  return layout.spans[id] ?? fallbackSpan(id)
}

/**
 * The span for one section, given who currently holds the hero.
 *
 * Promotion is a *swap*, not an insertion: whatever was the hero takes the
 * promoted section's old cell. Anything else and pinning chat to the big slot
 * would leave the video with nowhere to go and push a 12-column row out of
 * shape for every section after it.
 */
export function spanKeyFor(
  kind: VenueRoomKind,
  id: RoomSectionId,
  activeHero: RoomSectionId
): RoomSpanKey {
  const layout = layoutFor(kind)
  if (id === activeHero) return 'hero'
  if (id === layout.hero && activeHero !== layout.hero) return baseSpan(layout, activeHero)
  return baseSpan(layout, id)
}

export function spanClass(key: RoomSpanKey): string {
  return SPAN[key]
}

/** True when a cell is tall enough that the panel inside should fill it. */
export function spanFills(key: RoomSpanKey): boolean {
  return key === 'hero' || key === 'rail'
}

/**
 * Layout order, then registry order.
 *
 * The grid is `grid-flow-dense`, so this is not what decides where a card lands
 * on a wide screen — but it is exactly what decides the stacking order on a
 * phone, where there is one column and the first card is the whole first
 * screen.
 */
export function orderSectionIds(kind: VenueRoomKind, ids: RoomSectionId[]): RoomSectionId[] {
  const first = layoutFor(kind).order || []
  const rank = (id: RoomSectionId) => {
    const i = first.indexOf(id)
    return i === -1 ? first.length + SECTIONS.findIndex((s) => s.id === id) : i
  }
  return [...ids].sort((a, b) => rank(a) - rank(b))
}

// ---------------------------------------------------------------------------
// who holds the hero
// ---------------------------------------------------------------------------

/** The viewer's own choice, remembered per room on this device only. */
export interface HeroPin {
  id: RoomSectionId
  /** When they clicked. Compared against a live presentation, not a clock. */
  at: number
}

export interface ResolveHeroArgs {
  /** Ids sectionsForRoom actually returned, in the order they will render. */
  visible: RoomSectionId[]
  kind: VenueRoomKind
  /** config.hero === true on a stored section, if the host set one. */
  hostHero?: RoomSectionId | null
  /** When the current presentation started, or null when nobody is presenting. */
  presentingSince?: number | null
  pin?: HeroPin | null
}

/**
 * Which section is the big one right now.
 *
 * Precedence, highest first:
 *
 *   1. The viewer's pin, if they set it *after* the current presentation began.
 *      An explicit click during a talk is still their call; a pin left over
 *      from before it is not, or the host's screen share would never be seen.
 *   2. Whoever is presenting — the call takes the room.
 *   3. The host's stored choice for this room.
 *   4. The kind's default.
 *
 * Every candidate must be in `visible`. A section that has since been switched
 * off must fall through to the next rule rather than leave the hero empty.
 */
export function resolveHero({
  visible,
  kind,
  hostHero,
  presentingSince,
  pin,
}: ResolveHeroArgs): RoomSectionId {
  const layout = layoutFor(kind)
  const has = (id: RoomSectionId | null | undefined): id is RoomSectionId =>
    !!id && visible.includes(id)

  if (pin && has(pin.id) && pin.at >= (presentingSince ?? 0)) return pin.id
  if (presentingSince != null && has('av_placeholder')) return 'av_placeholder'
  if (has(hostHero)) return hostHero
  if (has(layout.hero)) return layout.hero
  if (has(layout.rail)) return layout.rail
  return visible[0] ?? layout.hero
}

type SectionsRoom = Pick<VenueRoom, 'kind'> & { sections?: unknown }

function configFor(room: SectionsRoom, id: RoomSectionId): Record<string, unknown> {
  return parseSections(room.sections).find((s) => s.id === id)?.config ?? {}
}

/** The host's big-panel choice, if they made one. */
export function hostHeroOf(room: SectionsRoom): RoomSectionId | null {
  const stored = parseSections(room.sections).find((s) => s.config?.hero === true)
  if (!stored) return null
  return sectionDef(stored.id) ? (stored.id as RoomSectionId) : null
}

/**
 * Make one section the host's big panel, and no other.
 *
 * Exclusive by construction rather than by convention — two sections both
 * claiming the hero would resolve by list order, which is a coin flip the host
 * did not know they were tossing. Passing an id that is already the hero clears
 * it, so the same control turns the choice off again.
 */
export function setHeroSection(room: SectionsRoom, id: RoomSectionId): RoomSectionSetting[] {
  const next = hostHeroOf(room) === id ? null : id

  const target = { ...configFor(room, id) }
  if (next === id) target.hero = true
  else delete target.hero

  // setSectionConfig materialises the whole list the way a tick does, so the
  // clear-everything-else pass below sees every section, not only stored ones.
  return setSectionConfig(room, id, target).map((s) => (s.id === next ? s : withoutHero(s)))
}

function withoutHero(section: RoomSectionSetting): RoomSectionSetting {
  if (!section.config || !('hero' in section.config)) return section
  const { hero: _hero, ...rest } = section.config
  return Object.keys(rest).length ? { ...section, config: rest } : { id: section.id }
}

// ---------------------------------------------------------------------------
// cameras
// ---------------------------------------------------------------------------

export function isCameraMode(value: unknown): value is RoomCameraMode {
  return typeof value === 'string' && (ROOM_CAMERA_MODES as string[]).includes(value)
}

/**
 * How this room's call is arranged.
 *
 * A live presentation forces spotlight whatever the host picked: the point of
 * presenting is that one person is large, and a grid during a talk is nine
 * equal tiles of which eight are listening.
 */
export function cameraModeFor(room: SectionsRoom, opts?: { presenting?: boolean }): RoomCameraMode {
  if (opts?.presenting) return 'spotlight'
  const stored = configFor(room, 'av_placeholder').mode
  if (isCameraMode(stored)) return stored
  return layoutFor(room.kind).camera
}

/**
 * Whether this room needs the `room:{id}` broadcast channel for its stage.
 *
 * roomUsesSignals answers the same question for reactions and raised hands.
 * Presenting is the third rider, and it applies to any room that actually has a
 * call — so a quiet room whose camera mode is 'off' still opens no channel,
 * which was the whole point of asking before subscribing.
 */
export function roomUsesStage(room: SectionsRoom, viewerRole: VenueRole | null | undefined): boolean {
  return (
    sectionsForRoom(room, viewerRole).some((s) => s.def.id === 'av_placeholder') &&
    cameraModeFor(room) !== 'off'
  )
}

export function setCameraMode(room: SectionsRoom, mode: RoomCameraMode): RoomSectionSetting[] {
  return setSectionConfig(room, 'av_placeholder', {
    ...configFor(room, 'av_placeholder'),
    mode,
  })
}

// ---------------------------------------------------------------------------
// the viewer's pin
// ---------------------------------------------------------------------------

/**
 * Kept in localStorage, not in the database.
 *
 * "I want chat bigger" is a preference of one person on one screen, and writing
 * it to venue_rooms would make it everybody's. The cost, stated plainly: it does
 * not follow you to your phone. That is the right trade for a choice you can
 * remake in one click.
 */
export const heroPinKey = (roomId: string) => `ktip.venue.hero.${roomId}`

export function readHeroPin(roomId: string): HeroPin | null {
  try {
    const raw = window.localStorage.getItem(heroPinKey(roomId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const id = typeof parsed?.id === 'string' ? parsed.id : ''
    const at = Number(parsed?.at)
    if (!id || !sectionDef(id) || !Number.isFinite(at)) return null
    return { id: id as RoomSectionId, at }
  } catch {
    // Private mode, a quota error, or junk from an older build. A layout is not
    // worth throwing over — fall back to the kind's default.
    return null
  }
}

export function writeHeroPin(roomId: string, pin: HeroPin | null): void {
  try {
    if (pin) window.localStorage.setItem(heroPinKey(roomId), JSON.stringify(pin))
    else window.localStorage.removeItem(heroPinKey(roomId))
  } catch {
    // Same reasoning: the pin is a nicety, and it already applied in memory.
  }
}
