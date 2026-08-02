/**
 * Ready-made rooms for the venue editor.
 *
 * A host setting up a hackathon at 1am should not have to invent what a judging
 * room's audio policy ought to be. Each preset is a whole room — purpose,
 * audio, capacity, who is allowed in, how tall the walls are — that the host
 * drops onto the grid and then edits if they disagree.
 *
 * The presets are the same vocabulary the database already speaks
 * (venue_rooms.kind, audio_mode, allowed_roles), so a dropped preset is an
 * ordinary room row the moment it is saved. Nothing here is a special case
 * downstream.
 */

import type { VenueAudioMode, VenueRole, VenueRoomKind } from '../types'
import { VENUE_PALETTE } from './venue-map'
import type { RoomSectionId } from './venue-room-sections'

export interface VenueRoomPreset {
  /** Slug seed. The editor appends -2, -3 … if the key is taken. */
  key: string
  name: string
  kind: VenueRoomKind
  description: string
  /** Why a host would place this one — shown under the name in the picker. */
  hint: string
  color: string
  audio_mode: VenueAudioMode
  capacity: number | null
  recording_enabled: boolean
  /** Empty = everyone in the venue. */
  allowed_roles: VenueRole[]
  wall_height: number
  /** Footprint dropped on the grid, in cells. */
  size: { w: number; h: number }
  /** lucide-react icon name, resolved by the picker. */
  icon: string
  /**
   * Panels this preset needs *beyond* what its kind gives it (091).
   *
   * Absent means "whatever the kind does", which is right for most of them.
   * It is set only where the preset and the kind genuinely disagree — a Quiet
   * Room is `breakout` and must not have a chat panel, a Registration Desk is
   * `help_desk` and is the one place check-in belongs. Storing it at placement
   * time is deliberate: the host picked this shape, not the kind's.
   */
  sections?: RoomSectionId[]
}

export const VENUE_ROOM_PRESETS: VenueRoomPreset[] = [
  {
    key: 'main-hall',
    name: 'Main Hall',
    kind: 'main_hall',
    description: 'Opening remarks, announcements and the closing ceremony.',
    hint: 'Everyone at once. Hosts hold the mic.',
    color: VENUE_PALETTE[0],
    audio_mode: 'moderated',
    capacity: null,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 1.4,
    size: { w: 8, h: 6 },
    icon: 'Landmark',
  },
  {
    key: 'networking',
    name: 'Networking Area',
    kind: 'networking',
    description: 'Open mics. See who is here and talk freely.',
    hint: 'The room people idle in between sessions.',
    color: VENUE_PALETTE[1],
    audio_mode: 'open',
    capacity: 40,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 1,
    size: { w: 8, h: 6 },
    icon: 'Users',
  },
  {
    key: 'workshop',
    name: 'Workshop Room',
    kind: 'workshop',
    description: 'Scheduled sessions from mentors and sponsors.',
    hint: 'A speaker up front, hands raised to talk.',
    color: VENUE_PALETTE[2],
    audio_mode: 'moderated',
    capacity: 60,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 1.1,
    size: { w: 6, h: 5 },
    icon: 'Wrench',
  },
  {
    key: 'help-desk',
    name: 'Help Desk',
    kind: 'help_desk',
    description: 'Stuck? A mentor is here.',
    hint: 'Small and always open. Put it near the entrance.',
    color: VENUE_PALETTE[3],
    audio_mode: 'open',
    capacity: 12,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 0.9,
    size: { w: 5, h: 4 },
    icon: 'LifeBuoy',
  },
  {
    key: 'showcase',
    name: 'Showcase Stage',
    kind: 'stage',
    description: 'Demos and pitches.',
    hint: 'Audience listens; presenters are granted the mic.',
    color: VENUE_PALETTE[4],
    audio_mode: 'listen_only',
    capacity: null,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 1.6,
    size: { w: 9, h: 6 },
    icon: 'Presentation',
    // A stage is for watching something, so the entries being demoed are the
    // content and the chat is the sideline.
    sections: [
      'sponsor_hero',
      'host_controls',
      'av_placeholder',
      'reactions',
      'showcase_gallery',
      'chat',
      'occupants',
      'hand_queue',
      'countdown',
    ],
  },
  {
    key: 'judging',
    name: 'Judging Room',
    kind: 'judging',
    description: 'Scoring and deliberation.',
    hint: 'Judges and organizers only — participants cannot enter.',
    color: VENUE_PALETTE[4],
    audio_mode: 'moderated',
    capacity: 15,
    recording_enabled: false,
    allowed_roles: ['judge', 'organizer'],
    wall_height: 1.2,
    size: { w: 5, h: 4 },
    icon: 'Gavel',
  },
  {
    key: 'mentor-lounge',
    name: 'Mentor Lounge',
    kind: 'help_desk',
    description: 'Where mentors regroup between sessions.',
    hint: 'Mentors, judges and organizers only.',
    color: VENUE_PALETTE[5],
    audio_mode: 'open',
    capacity: 20,
    recording_enabled: false,
    allowed_roles: ['mentor', 'judge', 'organizer'],
    wall_height: 1,
    size: { w: 5, h: 4 },
    icon: 'Coffee',
    // Where mentors regroup — so it shows them who still needs help rather
    // than showing them each other's availability twice.
    sections: [
      'host_controls',
      'av_placeholder',
      'chat',
      'occupants',
      'help_nudge',
      'mentors_on_duty',
    ],
  },
  {
    key: 'sponsor-booth',
    name: 'Sponsor Booth',
    kind: 'sponsor_booth',
    description: 'Meet the sponsor. Roles, prizes and questions.',
    hint: 'Add the sponsor name and link after placing it.',
    color: VENUE_PALETTE[6],
    audio_mode: 'open',
    capacity: 25,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 1.1,
    size: { w: 5, h: 4 },
    icon: 'Store',
  },
  {
    key: 'team-pod',
    name: 'Team Pod',
    kind: 'breakout',
    description: 'A small space for one team to work in.',
    hint: 'Drop several. Rename them per team.',
    color: VENUE_PALETTE[5],
    audio_mode: 'open',
    capacity: 8,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 0.8,
    size: { w: 4, h: 3 },
    icon: 'Rocket',
    sections: [
      'host_controls',
      'av_placeholder',
      'objectives',
      'chat',
      'occupants',
      'countdown',
    ],
  },
  {
    key: 'quiet-room',
    name: 'Quiet Room',
    kind: 'breakout',
    description: 'Heads-down focus. No audio.',
    hint: 'Nobody can speak here, on purpose.',
    color: VENUE_PALETTE[7],
    audio_mode: 'listen_only',
    capacity: null,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 0.8,
    size: { w: 6, h: 4 },
    icon: 'Moon',
    // No chat, on purpose. A quiet room with a conversation in it is a
    // breakout room that has been mislabelled.
    sections: ['focus_timer', 'occupants'],
  },
  {
    key: 'registration',
    name: 'Registration Desk',
    kind: 'help_desk',
    description: 'First stop. Check in and find your way around.',
    hint: 'Place it beside the entrance corner.',
    color: VENUE_PALETTE[3],
    audio_mode: 'open',
    capacity: 10,
    recording_enabled: false,
    allowed_roles: [],
    wall_height: 0.7,
    size: { w: 4, h: 3 },
    icon: 'DoorOpen',
    // First stop: check in, find out what to do, find out where to go.
    sections: [
      'check_in',
      'host_controls',
      'rules',
      'chat',
      'onboarding',
      'wayfinding',
      'announcements',
      'occupants',
    ],
  },
  {
    key: 'green-room',
    name: 'Green Room',
    kind: 'breakout',
    description: 'Speakers prepare here before going on stage.',
    hint: 'Organizers, mentors and judges only.',
    color: VENUE_PALETTE[1],
    audio_mode: 'open',
    capacity: 10,
    recording_enabled: false,
    allowed_roles: ['mentor', 'judge', 'organizer'],
    wall_height: 1,
    size: { w: 4, h: 4 },
    icon: 'Sparkles',
    // Backstage: who is on, how long is left, and a room log so a presenter
    // can catch up on what was announced while they were rehearsing.
    sections: [
      'host_controls',
      'av_placeholder',
      'chat',
      'occupants',
      'countdown',
      'activity_log',
    ],
  },
]

/**
 * The one-click building. Same six rooms as `seed_default_venue_rooms()` and in
 * the same places, so a host who seeds from the admin list and a host who
 * clicks "Use the starter layout" in the editor end up with an identical venue.
 */
export const STARTER_LAYOUT: Array<{
  preset: string
  /** Inclusive rect on the ground floor. */
  rect: [number, number, number, number]
}> = [
  { preset: 'main-hall', rect: [2, 2, 9, 7] },
  { preset: 'networking', rect: [12, 2, 19, 7] },
  { preset: 'workshop', rect: [21, 2, 26, 6] },
  { preset: 'help-desk', rect: [2, 10, 7, 14] },
  { preset: 'showcase', rect: [9, 10, 18, 15] },
  { preset: 'quiet-room', rect: [20, 10, 26, 14] },
]

export function presetByKey(key: string): VenueRoomPreset | undefined {
  return VENUE_ROOM_PRESETS.find((p) => p.key === key)
}

/** Slug from a room name — the host never types a key. */
export function roomKeyFrom(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'room'
  )
}

/** `key`, `key-2`, `key-3` … whichever is free. */
export function uniqueRoomKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let i = 2; i < 500; i++) {
    const candidate = `${base}-${i}`.slice(0, 40)
    if (!used.has(candidate)) return candidate
  }
  return `${base}-${Math.floor(Date.now() % 100000)}`.slice(0, 40)
}
