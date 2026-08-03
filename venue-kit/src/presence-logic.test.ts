import { describe, expect, it } from 'vitest'
import {
  mergeRoster,
  occupancyByRoom,
  occupantsInRoom,
  presenceToOccupants,
  resolveAvailability,
  shouldHeartbeat,
  sortOccupants,
  strongerAvailability,
  type RawPresenceState,
} from './presence-logic'
import type { VenueMember, VenueOccupant } from './types'

const NOW = 1_700_000_000_000

function member(overrides: Partial<VenueMember> = {}): VenueMember {
  return {
    id: 'm1',
    event_id: 'e1',
    user_id: 'u1',
    role: 'participant',
    availability: 'working',
    status_note: null,
    current_room_id: null,
    last_seen_at: new Date(NOW - 10_000).toISOString(),
    meta: null,
    user: { display_name: 'Ada', avatar_url: null },
    ...overrides,
  }
}

describe('strongerAvailability', () => {
  it('busy outranks everything a second tab might claim', () => {
    expect(strongerAvailability('busy', 'working')).toBe('busy')
    expect(strongerAvailability('away', 'busy')).toBe('busy')
    expect(strongerAvailability('help_wanted', 'working')).toBe('help_wanted')
  })
})

describe('presenceToOccupants', () => {
  it('collapses two tabs into one person, strongest availability wins', () => {
    const state: RawPresenceState = {
      u1: [
        { user_id: 'u1', availability: 'working', room_id: 'r1', v: 1 },
        { user_id: 'u1', availability: 'busy', room_id: 'r2', v: 1 },
      ],
    }
    const out = presenceToOccupants(state)
    expect(out).toHaveLength(1)
    expect(out[0].availability).toBe('busy')
    // The most recent tab's room wins — a person stands in one place.
    expect(out[0].room_id).toBe('r2')
  })

  it('drops malformed entries instead of rendering ghosts', () => {
    const state = { junk: [{ presence_ref: 'x' }] } as RawPresenceState
    expect(presenceToOccupants(state)).toHaveLength(0)
  })
})

describe('mergeRoster', () => {
  it('live presence always wins over the mirror', () => {
    const live: VenueOccupant[] = [
      {
        user_id: 'u1',
        display_name: 'Ada Live',
        avatar_url: null,
        role: 'participant',
        availability: 'help_wanted',
        status_note: null,
        room_id: 'r1',
        pos: null,
        is_live: true,
      },
    ]
    const out = mergeRoster(live, [member({ availability: 'away' })], NOW)
    expect(out).toHaveLength(1)
    expect(out[0].availability).toBe('help_wanted')
    expect(out[0].is_live).toBe(true)
  })

  it('a fresh mirror row fills in for a member with no live entry', () => {
    const out = mergeRoster([], [member({ current_room_id: 'r1' })], NOW)
    expect(out[0].availability).toBe('working')
    expect(out[0].room_id).toBe('r1')
    expect(out[0].is_live).toBe(false)
  })

  it('a stale mirror row renders offline with no room — an old "working" is a lie', () => {
    const stale = member({
      last_seen_at: new Date(NOW - 10 * 60 * 1000).toISOString(),
      current_room_id: 'r1',
      status_note: 'here!',
    })
    const out = mergeRoster([], [stale], NOW)
    expect(out[0].availability).toBe('offline')
    expect(out[0].room_id).toBeNull()
    expect(out[0].status_note).toBeNull()
  })
})

describe('room queries', () => {
  const occupants = mergeRoster(
    [],
    [
      member({ user_id: 'u1', current_room_id: 'r1' }),
      member({ user_id: 'u2', id: 'm2', current_room_id: 'r1', availability: 'help_wanted' }),
      member({ user_id: 'u3', id: 'm3', current_room_id: null }),
      member({
        user_id: 'u4',
        id: 'm4',
        current_room_id: 'r1',
        last_seen_at: new Date(NOW - 10 * 60 * 1000).toISOString(),
      }),
    ],
    NOW
  )

  it('counts only reachable people, never the offline', () => {
    expect(occupancyByRoom(occupants)).toEqual({ r1: 2 })
    expect(occupantsInRoom(occupants, 'r1')).toHaveLength(2)
  })

  it('sorts needs-help first — surfacing the stuck is the point of the venue', () => {
    expect(sortOccupants(occupantsInRoom(occupants, 'r1'))[0].availability).toBe('help_wanted')
  })
})

describe('resolveAvailability', () => {
  const base = { lastInteractionMs: NOW - 10 * 60 * 1000, nowMs: NOW }

  it('hidden + idle auto-aways the default', () => {
    expect(resolveAvailability({ manual: null, hidden: true, ...base })).toBe('away')
  })

  it('a manual busy is sticky through hiding — they chose the stronger signal', () => {
    expect(resolveAvailability({ manual: 'busy', hidden: true, ...base })).toBe('busy')
    expect(resolveAvailability({ manual: 'help_wanted', hidden: true, ...base })).toBe(
      'help_wanted'
    )
  })

  it('visible or recently active stays working', () => {
    expect(
      resolveAvailability({ manual: null, hidden: false, lastInteractionMs: NOW, nowMs: NOW })
    ).toBe('working')
  })
})

describe('shouldHeartbeat', () => {
  it('a change always writes; otherwise the throttle holds', () => {
    expect(shouldHeartbeat({ lastWriteMs: NOW - 1000, nowMs: NOW, changed: true })).toBe(true)
    expect(shouldHeartbeat({ lastWriteMs: NOW - 1000, nowMs: NOW, changed: false })).toBe(false)
    expect(shouldHeartbeat({ lastWriteMs: NOW - 50_000, nowMs: NOW, changed: false })).toBe(true)
    expect(shouldHeartbeat({ lastWriteMs: null, nowMs: NOW, changed: false })).toBe(true)
  })
})
