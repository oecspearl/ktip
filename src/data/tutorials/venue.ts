import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of an event's virtual venue. */
export const venueTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="venue-floorplan"]',
    title: 'The floor',
    description:
      'Each tile is a room — a main stage, breakouts, a help desk, sponsor rooms. The count on a room is who is in it right now, updating live.\n\nClick one to walk in. You can leave and enter another at any time; nothing here is a commitment.\n\nAn empty venue means the organizer has not set the rooms up yet.',
    position: 'right',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="venue-presence"]',
    title: 'Who else is here',
    description:
      'Everyone currently in the venue but not yet inside a room — the lobby, in effect.\n\nPresence is shared: while you are on this page other attendees can see you here too. Closing the tab takes you off the list.',
    position: 'left',
    scrollMode: 'top',
  },
  replayStep,
]

export const venueRoomTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="room-chat"]',
    title: 'Talking in a room',
    description:
      'Chat is live for everyone in the room, and it is per-room — what is said in a breakout stays in that breakout.\n\nAudio, screen sharing and host controls are not here yet; the notice above the chat says so rather than leaving you looking for a mute button that does not exist.\n\nA closed room is read-only: you can see what was said but not post.',
    position: 'right',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="room-presence"]',
    title: 'Who is in the room',
    description:
      'Live, and it is the same list everyone else in the room is looking at.\n\nGo back to the floorplan to move to another room. Room hosts get moderation controls in the chat that other attendees do not see.',
    position: 'left',
    scrollMode: 'top',
  },
  replayStep,
]
