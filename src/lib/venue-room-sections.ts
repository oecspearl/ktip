/**
 * What a room is made of (migration 091).
 *
 * Before this, every room rendered the same three things and `kind` only chose
 * an icon. A room is now an ordered list of *sections*, and `kind` chooses the
 * default list — so a sponsor booth leads with the sponsor, a help desk leads
 * with the mentors who are actually on duty, and a judging room does not offer
 * either.
 *
 * Everything here is pure. The room page, the editor's panel picker and the
 * tests all read the same registry, which is the only way "what the host ticked"
 * and "what the attendee sees" can be guaranteed to agree.
 *
 * ADDING A SECTION
 * ----------------
 * Add an entry to SECTIONS, then a case in RoomSections.tsx. No migration: the
 * stored value is a list of ids, and an id this build does not know is dropped
 * rather than rendered, so an older client meeting a newer room degrades to
 * fewer panels instead of crashing.
 */

import type { VenueRole, VenueRoom, VenueRoomKind } from '../types'

export type RoomSectionId =
  // main column
  | 'sponsor_hero'
  | 'check_in'
  | 'host_controls'
  | 'av_placeholder'
  | 'reactions'
  | 'focus_timer'
  | 'objectives'
  | 'challenge_brief'
  | 'showcase_gallery'
  | 'resources'
  | 'chat'
  | 'announcement_feed'
  | 'faq'
  | 'rules'
  // aside
  | 'occupants'
  | 'hand_queue'
  | 'looking_for_team'
  | 'skill_finder'
  | 'mentors_on_duty'
  | 'judges_present'
  | 'help_nudge'
  | 'countdown'
  | 'capacity'
  | 'announcements'
  | 'activity_log'
  | 'sponsor_links'
  | 'onboarding'
  | 'wayfinding'
  | 'venue_headcount'

export type RoomSectionSlot = 'main' | 'aside'

export interface RoomSectionDef {
  id: RoomSectionId
  /** Name in the host's panel picker. */
  label: string
  /** One line under it, saying why a host would want it. */
  blurb: string
  slot: RoomSectionSlot
  /**
   * Roles that may see the section. Absent means everyone in the venue.
   *
   * This is presentation, not security: a section that must not be *readable*
   * by a role belongs behind RLS or behind venue_rooms.allowed_roles, not here.
   */
  roles?: VenueRole[]
  /** Kinds whose default list includes this. 'all' is every kind. */
  defaultFor: VenueRoomKind[] | 'all'
  /** Position within the slot. Lower first; also the picker's order. */
  order: number
}

/** One section as stored on the room. */
export interface RoomSectionSetting {
  id: string
  /** Absent counts as true. Present-and-false is how a default is switched off. */
  enabled?: boolean
  order?: number
  config?: Record<string, unknown>
}

/** A section that survived parsing, role-gating and ordering. */
export interface ResolvedRoomSection {
  def: RoomSectionDef
  config: Record<string, unknown>
}

/** Most panels a room may carry. Matches the CHECK in 091. */
export const MAX_ROOM_SECTIONS = 40

export const SECTIONS: RoomSectionDef[] = [
  // ---- main column -------------------------------------------------------
  {
    id: 'sponsor_hero',
    label: 'Sponsor banner',
    blurb: 'Logo and link for whoever is hosting the room. Hides itself when there is no sponsor.',
    slot: 'main',
    // On every kind because it self-hides: a workshop run by a sponsor should
    // say so without the host having to find this list.
    defaultFor: 'all',
    order: 10,
  },
  {
    id: 'check_in',
    label: 'Check in',
    blurb: 'Lets a registered attendee mark themselves present. Hides once they have.',
    slot: 'main',
    defaultFor: [],
    order: 15,
  },
  {
    id: 'host_controls',
    label: 'Host controls',
    blurb: 'Announce to the room, or close it. Only organizers ever see this.',
    slot: 'main',
    roles: ['organizer'],
    defaultFor: 'all',
    order: 18,
  },
  {
    id: 'av_placeholder',
    label: 'Audio & video',
    blurb: 'The call. Until LiveKit lands it says so, rather than looking broken.',
    slot: 'main',
    defaultFor: 'all',
    order: 20,
  },
  {
    id: 'reactions',
    label: 'Reactions',
    blurb: 'A row of emoji everyone in the room sees. Nothing is stored.',
    slot: 'main',
    defaultFor: ['main_hall', 'stage'],
    order: 22,
  },
  {
    id: 'focus_timer',
    label: 'Focus timer',
    blurb: 'A private countdown for a heads-down room. Nobody else sees it.',
    slot: 'main',
    defaultFor: [],
    order: 24,
  },
  {
    id: 'objectives',
    label: 'What this room is for',
    blurb: 'Your own text. Falls back to the room description if you write none.',
    slot: 'main',
    defaultFor: ['workshop', 'breakout', 'team'],
    order: 26,
  },
  {
    id: 'challenge_brief',
    label: 'The challenge',
    blurb: 'Objectives, constraints, deliverables and judging weights. Hidden if the event has no brief.',
    slot: 'main',
    defaultFor: ['main_hall', 'judging'],
    order: 30,
  },
  {
    id: 'showcase_gallery',
    label: 'Entries',
    blurb: 'What has been submitted, and the form to submit. Who sees whose entry is decided by RLS.',
    slot: 'main',
    defaultFor: ['stage'],
    order: 40,
  },
  {
    id: 'resources',
    label: 'Files',
    blurb: 'Everything attached to the event. Who may open what is unchanged.',
    slot: 'main',
    defaultFor: ['workshop'],
    order: 45,
  },
  {
    id: 'chat',
    label: 'Chat',
    blurb: 'Everyone in the room can post.',
    slot: 'main',
    defaultFor: 'all',
    order: 50,
  },
  {
    id: 'announcement_feed',
    label: 'Announcements only',
    blurb: 'The same chat, but only organizers may post. Use instead of Chat, not alongside it.',
    slot: 'main',
    defaultFor: [],
    order: 60,
  },
  {
    id: 'faq',
    label: 'Common questions',
    blurb: 'The event page’s FAQ, repeated here. Hidden if there is none.',
    slot: 'main',
    defaultFor: ['help_desk'],
    order: 70,
  },
  {
    id: 'rules',
    label: 'House rules',
    blurb: 'Your own text — conduct, ground rules, what this room is not for.',
    slot: 'main',
    defaultFor: [],
    order: 80,
  },

  // ---- aside -------------------------------------------------------------
  {
    id: 'occupants',
    label: 'In this room',
    blurb: 'Who is here right now, with their status.',
    slot: 'aside',
    defaultFor: 'all',
    order: 10,
  },
  {
    id: 'hand_queue',
    label: 'Hands up',
    blurb: 'Who wants to speak, in order. Clears itself; nothing is stored.',
    slot: 'aside',
    defaultFor: ['workshop', 'stage'],
    order: 15,
  },
  {
    id: 'looking_for_team',
    label: 'Looking for a team',
    blurb: 'Everyone at the event who ticked it, with their skills. Not just this room.',
    slot: 'aside',
    defaultFor: ['networking'],
    order: 20,
  },
  {
    id: 'skill_finder',
    label: 'Find someone',
    blurb: 'Search everyone at the event by skill or name.',
    slot: 'aside',
    defaultFor: ['networking'],
    order: 25,
  },
  {
    id: 'mentors_on_duty',
    label: 'Mentors on duty',
    blurb: 'Mentors across the venue, free ones first.',
    slot: 'aside',
    defaultFor: ['help_desk'],
    order: 30,
  },
  {
    id: 'judges_present',
    label: 'Judges',
    blurb: 'Judges across the venue and whether they are free.',
    slot: 'aside',
    defaultFor: ['judging'],
    order: 40,
  },
  {
    id: 'help_nudge',
    label: 'Needs help',
    blurb: 'Anyone at the event whose status is “needs help”, and where they are.',
    slot: 'aside',
    defaultFor: ['help_desk'],
    order: 45,
  },
  {
    id: 'countdown',
    label: 'Deadline',
    blurb: 'Time left to submit. Hidden if the event has no submission deadline.',
    slot: 'aside',
    defaultFor: ['main_hall', 'stage', 'judging', 'team'],
    order: 50,
  },
  {
    id: 'capacity',
    label: 'Capacity',
    blurb: 'How full the room is. Hidden if it has no limit.',
    slot: 'aside',
    defaultFor: [],
    order: 55,
  },
  {
    id: 'announcements',
    label: 'Event announcements',
    blurb: 'The organizer updates published for this event.',
    slot: 'aside',
    defaultFor: ['main_hall'],
    order: 60,
  },
  {
    id: 'activity_log',
    label: 'Room log',
    blurb: 'Just the announcements posted in this room, out of the chat scrollback.',
    slot: 'aside',
    defaultFor: [],
    order: 65,
  },
  {
    id: 'sponsor_links',
    label: 'Sponsor links',
    blurb: 'Buttons the sponsor wants clicked — careers, docs, a demo. Added below.',
    slot: 'aside',
    defaultFor: ['sponsor_booth'],
    order: 70,
  },
  {
    id: 'onboarding',
    label: 'Getting started',
    blurb: 'A short checklist for a new arrival. Disappears once they finish it.',
    slot: 'aside',
    defaultFor: [],
    order: 75,
  },
  {
    id: 'wayfinding',
    label: 'Elsewhere in the venue',
    blurb: 'The other rooms, busiest first, with the way back to the map.',
    slot: 'aside',
    defaultFor: ['main_hall', 'help_desk'],
    order: 80,
  },
  {
    id: 'venue_headcount',
    label: 'In the venue',
    blurb: 'How many people are at the event and what they are doing.',
    slot: 'aside',
    defaultFor: [],
    order: 85,
  },
]

const BY_ID = new Map<string, RoomSectionDef>(SECTIONS.map((s) => [s.id, s]))

export function sectionDef(id: string): RoomSectionDef | undefined {
  return BY_ID.get(id)
}

/** The ids a room of this kind shows when the host has chosen nothing. */
export function defaultSectionIds(kind: VenueRoomKind): RoomSectionId[] {
  return SECTIONS.filter((s) => s.defaultFor === 'all' || s.defaultFor.includes(kind))
    .slice()
    .sort(bySlotThenOrder)
    .map((s) => s.id)
}

/**
 * Sections as stored in jsonb.
 *
 * Anything malformed is dropped rather than thrown, for the same reason
 * parseCells drops a bad pair: one junk entry must not blank a room. An unknown
 * id is *kept* here and dropped at resolve time — parsing has no opinion about
 * what this build can render, and keeping it means a round trip through an old
 * client does not silently delete a panel it had never heard of.
 */
export function parseSections(raw: unknown): RoomSectionSetting[] {
  if (!Array.isArray(raw)) return []
  const out: RoomSectionSetting[] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)

    const order = Number(row.order)
    out.push({
      id,
      enabled: row.enabled === false ? false : true,
      ...(Number.isFinite(order) ? { order } : {}),
      ...(row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? { config: row.config as Record<string, unknown> }
        : {}),
    })
    if (out.length >= MAX_ROOM_SECTIONS) break
  }
  return out
}

/**
 * What this room actually renders, for this viewer.
 *
 * An empty stored list is not "no panels" — it is "never configured", which is
 * the state every room created before 091 is in. It resolves to the kind
 * default so those rooms improve without a backfill.
 */
export function sectionsForRoom(
  room: Pick<VenueRoom, 'kind'> & { sections?: unknown },
  viewerRole: VenueRole | null | undefined
): ResolvedRoomSection[] {
  const stored = parseSections(room.sections)
  const chosen = stored.length
    ? stored
    : defaultSectionIds(room.kind).map((id) => ({ id }) as RoomSectionSetting)

  return chosen
    .filter((s) => s.enabled !== false)
    .map((s) => ({ setting: s, def: BY_ID.get(s.id) }))
    .filter((row): row is { setting: RoomSectionSetting; def: RoomSectionDef } => !!row.def)
    .filter(({ def }) => canSeeSection(def, viewerRole))
    .sort(
      (a, b) =>
        slotRank(a.def.slot) - slotRank(b.def.slot) ||
        (a.setting.order ?? a.def.order) - (b.setting.order ?? b.def.order) ||
        a.def.order - b.def.order
    )
    .map(({ setting, def }) => ({ def, config: setting.config ?? {} }))
}

export function canSeeSection(def: RoomSectionDef, viewerRole: VenueRole | null | undefined): boolean {
  if (!def.roles || !def.roles.length) return true
  return !!viewerRole && def.roles.includes(viewerRole)
}

/**
 * Whether this room needs the `room:{id}` broadcast channel at all.
 *
 * Only reactions and the hand queue ride it, and most rooms have neither. A
 * second private channel opened on every room entry is a subscription, an auth
 * round trip and a rejoin on every reconnect for nothing — so the page asks
 * this first and passes `enabled: false` when the answer is no.
 */
export function roomUsesSignals(
  room: Pick<VenueRoom, 'kind'> & { sections?: unknown },
  viewerRole: VenueRole | null | undefined
): boolean {
  return sectionsForRoom(room, viewerRole).some(
    (s) => s.def.id === 'reactions' || s.def.id === 'hand_queue'
  )
}

export function sectionsInSlot(
  sections: ResolvedRoomSection[],
  slot: RoomSectionSlot
): ResolvedRoomSection[] {
  return sections.filter((s) => s.def.slot === slot)
}

/**
 * The host's tick-list for one room: every section, in picker order, with
 * whether it is currently on.
 *
 * Reads the same resolution the attendee gets, so an untouched room shows its
 * kind defaults already ticked rather than an empty list the host has to guess
 * at.
 */
export function sectionChoices(
  room: Pick<VenueRoom, 'kind'> & { sections?: unknown }
): Array<{ def: RoomSectionDef; enabled: boolean }> {
  const on = new Set(sectionsForRoom(room, 'organizer').map((s) => s.def.id))
  return SECTIONS.slice()
    .sort(bySlotThenOrder)
    .map((def) => ({ def, enabled: on.has(def.id) }))
}

/**
 * Turn a tick into a stored list.
 *
 * The result is always explicit and complete — the moment a host disagrees with
 * one default, the whole set is written down. A partial list would mean a later
 * change to a kind's defaults silently rearranging a room somebody had already
 * arranged by hand.
 */
export function toggleSection(
  room: Pick<VenueRoom, 'kind'> & { sections?: unknown },
  id: RoomSectionId,
  enabled: boolean
): RoomSectionSetting[] {
  const stored = parseSections(room.sections)
  const configs = new Map(stored.map((s) => [s.id, s.config]))
  const on = new Set(sectionsForRoom(room, 'organizer').map((s) => s.def.id))

  if (enabled) on.add(id)
  else on.delete(id)

  return SECTIONS.slice()
    .sort(bySlotThenOrder)
    .filter((def) => on.has(def.id))
    .map((def) => {
      const config = configs.get(def.id)
      return { id: def.id, ...(config ? { config } : {}) }
    })
}

/** Write one section's config, materialising the list the same way a tick does. */
export function setSectionConfig(
  room: Pick<VenueRoom, 'kind'> & { sections?: unknown },
  id: RoomSectionId,
  config: Record<string, unknown>
): RoomSectionSetting[] {
  const base = toggleSection(room, id, true)
  return base.map((s) => (s.id === id ? { ...s, config } : s))
}

// ---------------------------------------------------------------------------
// sponsor links — the one section whose content lives in its own config
// ---------------------------------------------------------------------------

export interface SponsorLink {
  label: string
  url: string
}

/** Most buttons a booth may show. Past this it is a nav bar, not a call to action. */
export const MAX_SPONSOR_LINKS = 6

/**
 * Sponsor links off a section config.
 *
 * Only http(s) survives. A `javascript:` or `data:` href in a host-authored
 * field is the classic way a link list becomes an XSS, and the room page
 * renders these straight into an anchor.
 */
export function parseSponsorLinks(config: Record<string, unknown> | undefined): SponsorLink[] {
  const raw = config?.links
  if (!Array.isArray(raw)) return []
  const out: SponsorLink[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    if (!isSafeHref(url)) continue
    const label = typeof row.label === 'string' ? row.label.trim() : ''
    out.push({ label: label.slice(0, 60) || hostOf(url), url })
    if (out.length >= MAX_SPONSOR_LINKS) break
  }
  return out
}

export function isSafeHref(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}

// ---------------------------------------------------------------------------

function slotRank(slot: RoomSectionSlot): number {
  return slot === 'main' ? 0 : 1
}

function bySlotThenOrder(a: RoomSectionDef, b: RoomSectionDef): number {
  return slotRank(a.slot) - slotRank(b.slot) || a.order - b.order
}
