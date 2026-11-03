import { describe, expect, it } from 'vitest'
import { EMPTY_COFFEE, minutesLeft, parseCoffeeState } from './coffee-tables'

describe('parseCoffeeState', () => {
  it('reads the server answer', () => {
    const state = parseCoffeeState({
      can_join: true,
      is_host: false,
      waiting: 2,
      in_queue: true,
      my_table: null,
      tables: [
        {
          id: 't1',
          ends_at: '2026-11-03T10:10:00Z',
          people: [
            { user_id: 'u1', name: 'Ana', avatar_url: null, team: 'Reef' },
            { user_id: 'u2', name: null, avatar_url: 'x.png', team: null },
          ],
        },
      ],
    })
    expect(state.canJoin).toBe(true)
    expect(state.waiting).toBe(2)
    expect(state.inQueue).toBe(true)
    expect(state.myTableId).toBeNull()
    expect(state.tables[0].people.map((p) => p.user_id)).toEqual(['u1', 'u2'])
    expect(state.tables[0].people[0].team).toBe('Reef')
  })

  it('treats junk as an empty room', () => {
    expect(parseCoffeeState(null)).toEqual(EMPTY_COFFEE)
    expect(parseCoffeeState('nope')).toEqual(EMPTY_COFFEE)
    expect(parseCoffeeState({ waiting: -4, tables: [{ nope: 1 }, null] })).toEqual({ ...EMPTY_COFFEE })
  })

  it('keeps the caller’s table id', () => {
    expect(parseCoffeeState({ my_table: 't9' }).myTableId).toBe('t9')
  })
})

describe('minutesLeft', () => {
  const at = Date.parse('2026-11-03T10:00:00Z')
  it('rounds up', () => {
    expect(minutesLeft('2026-11-03T10:09:01Z', at)).toBe(10)
    expect(minutesLeft('2026-11-03T10:00:30Z', at)).toBe(1)
  })
  it('is zero once over or unreadable', () => {
    expect(minutesLeft('2026-11-03T09:59:00Z', at)).toBe(0)
    expect(minutesLeft('', at)).toBe(0)
  })
})
