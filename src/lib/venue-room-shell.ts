import type { VenueRoomKind } from '../types'
import type { RoomSectionId } from './venue-room-sections'

/**
 * Where each panel of a room goes. One shape for every room, 2026-11-10.
 *
 * The old layout was a twelve-column bento whose spans changed per kind, so
 * chat was the hero in one room, a rail in the next and a half-width card in a
 * third. Now every room reads the same way:
 *
 *   band    full width, top: sponsor banner, check-in, host controls
 *   call    the call, which grows into a presentation when anyone shares
 *   tool    the one thing this room is for: the Homebase workspace, the
 *           scorecard, the coffee tables
 *   shelf   everything else, in a grid under the tool
 *   dock    a column on the right: Chat, People and one tab that belongs to
 *           this kind of room (raised hands, mentors on duty, the judges)
 *
 * On a phone the dock comes straight after the tool, so chat is never at the
 * bottom of a long page.
 *
 * Pure: the room page and its tests read the same plan.
 */

export interface RoomShellPlan {
  band: RoomSectionId[]
  call: RoomSectionId | null
  tool: RoomSectionId | null
  shelf: RoomSectionId[]
  dock: RoomSectionId[]
}

const BAND: RoomSectionId[] = ['sponsor_hero', 'on_next', 'host_controls']
const DOCK_BASE: RoomSectionId[] = ['chat', 'occupants']

/** The one dock tab each kind of room adds, first visible one wins. */
const ROOM_TAB: Record<VenueRoomKind, RoomSectionId[]> = {
  main_hall: ['qa', 'hand_queue', 'announcements'],
  stage: ['qa', 'hand_queue', 'announcements'],
  workshop: ['hand_queue', 'resources'],
  judging: ['judges_present'],
  sponsor_booth: ['sponsor_links'],
  // The design keeps Networking's dock to Chat and People: who is looking for
  // a team sits on the shelf, next to the skills in the room.
  networking: [],
  help_desk: ['mentors_on_duty'],
  team: ['announcements'],
  breakout: ['ops_alerts', 'announcements'],
}

/** What this kind of room is for, first visible one wins. */
const TOOL: Record<VenueRoomKind, RoomSectionId[]> = {
  main_hall: ['submission_desk', 'challenge_brief'],
  stage: ['showcase_gallery', 'peoples_choice', 'results_board'],
  workshop: ['objectives', 'challenge_brief', 'resources'],
  judging: ['judging_console', 'results_board'],
  sponsor_booth: ['booking_slots', 'resources', 'faq'],
  networking: ['coffee_tables', 'team_finder', 'collab_commons'],
  help_desk: ['check_in', 'help_queue', 'help_nudge', 'submission_desk', 'faq'],
  team: ['team_workspace', 'submission_desk'],
  breakout: ['organiser_ops', 'caption_test', 'quest_board', 'collab_commons', 'kit', 'library', 'booking_slots', 'focus_timer', 'objectives'],
}

/**
 * Plan a room from the sections it shows, in the order they resolved.
 * Every visible section lands in exactly one place.
 */
export function planRoomShell(kind: VenueRoomKind, visible: RoomSectionId[]): RoomShellPlan {
  const shown = new Set(visible)
  const taken = new Set<RoomSectionId>()
  const take = (id: RoomSectionId | undefined | null) => {
    if (!id || !shown.has(id) || taken.has(id)) return null
    taken.add(id)
    return id
  }

  const band = BAND.map(take).filter((id): id is RoomSectionId => !!id)
  const call = take('av_placeholder')
  // Chat, then the room's own tab, then People: the order of the design.
  const [chat, people] = DOCK_BASE.map(take)
  const dock = [
    chat,
    take((ROOM_TAB[kind] ?? []).find((id) => shown.has(id) && !taken.has(id))),
    people,
  ].filter((id): id is RoomSectionId => !!id)
  const tool = take((TOOL[kind] ?? []).find((id) => shown.has(id) && !taken.has(id)))
  const shelf = visible.filter((id) => !taken.has(id))

  return { band, call, tool, shelf, dock }
}
