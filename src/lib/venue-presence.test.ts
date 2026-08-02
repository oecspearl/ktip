import { describe, it, expect } from 'vitest'
import {
  clusterForRoom,
  mergeRoster,
  occupancyByRoom,
  occupantsInRoom,
  occupantsUnassigned,
  presenceToOccupants,
  resolveAvailability,
  shouldHeartbeat,
  sortOccupants,
  strongerAvailability,
  type RawPresenceState,
} from './venue-presence'
import type { EventVenueMember, VenueAvailability, VenueOccupant } from '../types'

const NOW = Date.parse('2026-08-02T12:00:00.000Z')

function payload(over: Partial<Record<string, any>> = {}) {
  return {
    user_id: 'u1',
    display_name: 'Ada',
    avatar_url: null,
    role: 'participant',
    availability: 'working',
    status_note: null,
    room_id: 'r1',
    team_id: null,
    pos: null,
    v: 1,
    presence_ref: 'ref-1',
    ...over,
  }
}

function state(entries: Record<string, any[]>): RawPresenceState {
  return entries as RawPresenceState
}

function member(over: Partial<EventVenueMember> = {}): EventVenueMember {
  return {
    id: 'm1',
    event_id: 'e1',
    user_id: 'u9',
    role: 'participant',
    availability: 'working',
    status_note: null,
    current_room_id: 'r1',
    skills: [],
    looking_for_team: true,
    is_discoverable: true,
    meta: {},
    first_entered_at: '2026-08-02T09:00:00.000Z',
    last_seen_at: '2026-08-02T11:59:30.000Z',
    created_at: '2026-08-02T09:00:00.000Z',
    updated_at: '2026-08-02T11:59:30.000Z',
    ...over,
  }
}

function occ(over: Partial<VenueOccupant> = {}): VenueOccupant {
  return {
    user_id: 'u1',
    display_name: 'Ada',
    avatar_url: null,
    role: 'participant',
    availability: 'working',
    status_note: null,
    room_id: 'r1',
    team_id: null,
    pos: null,
    is_live: true,
    ...over,
  }
}

describe('strongerAvailability', () => {
  // An explicit "do not disturb" is the one status a second tab must never undo.
  it('lets busy win over everything else', () => {
    const others: VenueAvailability[] = ['working', 'away', 'help_wanted', 'offline']
    for (const other of others) {
      expect(strongerAvailability('busy', other)).toBe('busy')
      expect(strongerAvailability(other, 'busy')).toBe('busy')
    }
  })

  // An unanswered ask for help is the reason the venue surfaces status at all.
  it('ranks help_wanted above working and away', () => {
    expect(strongerAvailability('help_wanted', 'working')).toBe('help_wanted')
    expect(strongerAvailability('away', 'help_wanted')).toBe('help_wanted')
  })
})

describe('presenceToOccupants', () => {
  it('returns one entry per tracked member', () => {
    const result = presenceToOccupants(state({ k1: [payload()] }))
    expect(result).toHaveLength(1)
    expect(result[0].user_id).toBe('u1')
    expect(result[0].is_live).toBe(true)
  })

  // Two browser tabs are one person. Counting them twice would inflate every
  // occupancy badge on the floorplan.
  it('deduplicates a member with several tabs open', () => {
    const result = presenceToOccupants(
      state({
        k1: [payload({ presence_ref: 'a' })],
        k2: [payload({ presence_ref: 'b' })],
      })
    )
    expect(result).toHaveLength(1)
  })

  it('keeps the strongest availability across a member’s tabs', () => {
    const result = presenceToOccupants(
      state({
        k1: [payload({ availability: 'away' })],
        k2: [payload({ availability: 'busy' })],
      })
    )
    expect(result[0].availability).toBe('busy')
  })

  // "Which room am I in" has no meaningful union, so the most recent entry wins.
  it('takes the room from the last tracked entry', () => {
    const result = presenceToOccupants(
      state({
        k1: [payload({ room_id: 'r1' })],
        k2: [payload({ room_id: 'r2' })],
      })
    )
    expect(result[0].room_id).toBe('r2')
  })

  // A malformed payload from an older client must not take the floorplan down.
  it('skips entries with no user_id', () => {
    const result = presenceToOccupants(
      state({ k1: [{ presence_ref: 'x' }, payload()] })
    )
    expect(result).toHaveLength(1)
  })

  it('tolerates an empty or missing state object', () => {
    expect(presenceToOccupants(state({}))).toEqual([])
    expect(presenceToOccupants(undefined as any)).toEqual([])
  })
})

describe('mergeRoster', () => {
  // The DB row is a 45s-throttled mirror; the live channel is the truth.
  it('never lets a DB row override a live presence entry', () => {
    const live = [occ({ user_id: 'u9', availability: 'busy', room_id: 'r2' })]
    const merged = mergeRoster(live, [member({ user_id: 'u9', availability: 'working' })], NOW)
    expect(merged).toHaveLength(1)
    expect(merged[0].availability).toBe('busy')
    expect(merged[0].room_id).toBe('r2')
  })

  // This is what paints the floorplan before the channel has synced.
  it('includes recently-seen members who have no presence entry', () => {
    const merged = mergeRoster([], [member({ user_id: 'u9' })], NOW)
    expect(merged[0].availability).toBe('working')
    expect(merged[0].is_live).toBe(false)
  })

  // A two-hour-old "working" is a lie, and showing it makes the venue look busy
  // when it is empty.
  it('renders a stale mirrored row as offline with no room', () => {
    const merged = mergeRoster(
      [],
      [member({ user_id: 'u9', last_seen_at: '2026-08-02T09:00:00.000Z' })],
      NOW
    )
    expect(merged[0].availability).toBe('offline')
    expect(merged[0].room_id).toBe(null)
  })

  it('treats an unparseable last_seen_at as stale', () => {
    const merged = mergeRoster([], [member({ user_id: 'u9', last_seen_at: 'nonsense' })], NOW)
    expect(merged[0].availability).toBe('offline')
  })

  it('reads the display name off the joined profile', () => {
    const merged = mergeRoster(
      [],
      [member({ user_id: 'u9', user: { display_name: 'Grace', avatar_url: 'a.png' } as any })],
      NOW
    )
    expect(merged[0].display_name).toBe('Grace')
    expect(merged[0].avatar_url).toBe('a.png')
  })
})

describe('occupancyByRoom', () => {
  it('counts live members per room', () => {
    const counts = occupancyByRoom([
      occ({ user_id: 'a', room_id: 'r1' }),
      occ({ user_id: 'b', room_id: 'r1' }),
      occ({ user_id: 'c', room_id: 'r2' }),
    ])
    expect(counts).toEqual({ r1: 2, r2: 1 })
  })

  // An occupancy badge answers "who could I talk to right now", so someone who
  // left their tab open overnight must not be counted.
  it('excludes offline members and members in no room', () => {
    const counts = occupancyByRoom([
      occ({ user_id: 'a', room_id: 'r1', availability: 'offline' }),
      occ({ user_id: 'b', room_id: null }),
    ])
    expect(counts).toEqual({})
  })
})

describe('occupantsInRoom / occupantsUnassigned', () => {
  it('filters to one room and drops offline members', () => {
    const list = occupantsInRoom(
      [
        occ({ user_id: 'a', room_id: 'r1' }),
        occ({ user_id: 'b', room_id: 'r2' }),
        occ({ user_id: 'c', room_id: 'r1', availability: 'offline' }),
      ],
      'r1'
    )
    expect(list.map((o) => o.user_id)).toEqual(['a'])
  })

  it('returns venue members who are not in any room', () => {
    const list = occupantsUnassigned([
      occ({ user_id: 'a', room_id: null }),
      occ({ user_id: 'b', room_id: 'r1' }),
    ])
    expect(list.map((o) => o.user_id)).toEqual(['a'])
  })
})

describe('sortOccupants', () => {
  // Needs-help sorts first on purpose: a mentor scanning the room should see the
  // person who asked before the forty people who did not.
  it('puts help_wanted first and offline last', () => {
    const sorted = sortOccupants([
      occ({ user_id: 'a', availability: 'away', display_name: 'A' }),
      occ({ user_id: 'b', availability: 'offline', display_name: 'B' }),
      occ({ user_id: 'c', availability: 'help_wanted', display_name: 'C' }),
      occ({ user_id: 'd', availability: 'working', display_name: 'D' }),
    ])
    expect(sorted.map((o) => o.availability)).toEqual([
      'help_wanted',
      'working',
      'away',
      'offline',
    ])
  })

  it('breaks ties on display name', () => {
    const sorted = sortOccupants([
      occ({ user_id: 'a', display_name: 'Zoe' }),
      occ({ user_id: 'b', display_name: 'Ana' }),
    ])
    expect(sorted.map((o) => o.display_name)).toEqual(['Ana', 'Zoe'])
  })

  it('does not mutate its input', () => {
    const input = [occ({ user_id: 'a', availability: 'away' }), occ({ user_id: 'b' })]
    sortOccupants(input)
    expect(input[0].user_id).toBe('a')
  })
})

describe('clusterForRoom', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    occ({ user_id: `u${i}`, display_name: `M${i}`, room_id: 'r1' })
  )

  // A floorplan zone is ~120px wide; forty avatars in it is a smear.
  it('caps the drawn avatars and reports the overflow', () => {
    const cluster = clusterForRoom(many, 'r1', 4)
    expect(cluster.shown).toHaveLength(4)
    expect(cluster.overflow).toBe(6)
    expect(cluster.total).toBe(10)
  })

  it('reports zero overflow when everyone fits', () => {
    const cluster = clusterForRoom(many.slice(0, 3), 'r1', 4)
    expect(cluster.shown).toHaveLength(3)
    expect(cluster.overflow).toBe(0)
  })

  it('returns an empty cluster for an empty room', () => {
    const cluster = clusterForRoom(many, 'r-empty', 4)
    expect(cluster.total).toBe(0)
    expect(cluster.overflow).toBe(0)
  })
})

describe('resolveAvailability', () => {
  it('reports working by default', () => {
    expect(
      resolveAvailability({ manual: null, hidden: false, lastInteractionMs: NOW, nowMs: NOW })
    ).toBe('working')
  })

  // A venue full of forgotten tabs must not read as a venue full of workers.
  it('flips to away once a hidden tab has been idle past the threshold', () => {
    expect(
      resolveAvailability({
        manual: null,
        hidden: true,
        lastInteractionMs: NOW - 10 * 60 * 1000,
        nowMs: NOW,
      })
    ).toBe('away')
  })

  it('stays working when the tab is hidden but the member is still active', () => {
    expect(
      resolveAvailability({
        manual: null,
        hidden: true,
        lastInteractionMs: NOW - 1000,
        nowMs: NOW,
      })
    ).toBe('working')
  })

  // The whole point of the manual override: someone who chose the stronger
  // signal must not have it quietly softened by the idle timer.
  it('never downgrades a manual busy to away', () => {
    expect(
      resolveAvailability({
        manual: 'busy',
        hidden: true,
        lastInteractionMs: NOW - 60 * 60 * 1000,
        nowMs: NOW,
      })
    ).toBe('busy')
  })

  it('keeps a manual help_wanted while the member is idle', () => {
    expect(
      resolveAvailability({
        manual: 'help_wanted',
        hidden: true,
        lastInteractionMs: NOW - 60 * 60 * 1000,
        nowMs: NOW,
      })
    ).toBe('help_wanted')
  })

  // Manual 'working' is the one manual value the idle timer may override — it
  // is the default, so choosing it is not a statement about being reachable.
  it('lets an idle hidden tab override a manual working', () => {
    expect(
      resolveAvailability({
        manual: 'working',
        hidden: true,
        lastInteractionMs: NOW - 10 * 60 * 1000,
        nowMs: NOW,
      })
    ).toBe('away')
  })
})

describe('shouldHeartbeat', () => {
  it('always writes on the first call', () => {
    expect(shouldHeartbeat({ lastWriteMs: null, nowMs: NOW, changed: false })).toBe(true)
  })

  // A status change has to land immediately or a teammate sees the old dot.
  it('always writes when something changed', () => {
    expect(shouldHeartbeat({ lastWriteMs: NOW - 1000, nowMs: NOW, changed: true })).toBe(true)
  })

  // Without the throttle, 100 participants would each write a row every tick.
  it('suppresses an unchanged write inside the throttle window', () => {
    expect(shouldHeartbeat({ lastWriteMs: NOW - 1000, nowMs: NOW, changed: false })).toBe(false)
  })

  it('writes again once the throttle window has passed', () => {
    expect(
      shouldHeartbeat({ lastWriteMs: NOW - 60 * 1000, nowMs: NOW, changed: false })
    ).toBe(true)
  })
})
