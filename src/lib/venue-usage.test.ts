import { describe, it, expect } from 'vitest'
import {
  CORE_KINDS,
  formatUsage,
  grandTotals,
  groupUsage,
  rangeBounds,
  safeCsvText,
  sortUsage,
  usageCsvRows,
  visibleKinds,
  type UsageRow,
} from './venue-usage'

const rows: UsageRow[] = [
  { team_id: 't1', team_name: 'Alpha', user_id: 'u1', display_name: 'Ana', kind: 'call_seconds', amount: '600' },
  { team_id: 't1', team_name: 'Alpha', user_id: 'u1', display_name: 'Ana', kind: 'translate_chars', amount: 120 },
  { team_id: 't1', team_name: 'Alpha', user_id: 'u2', display_name: 'Ben', kind: 'call_seconds', amount: 300 },
  { team_id: 't2', team_name: 'Bravo', user_id: 'u3', display_name: 'Cy', kind: 'call_seconds', amount: 1200 },
  { team_id: null, team_name: null, user_id: 'u4', display_name: 'Dee', kind: 'help_request', amount: 2 },
  { team_id: 't2', team_name: 'Bravo', user_id: 'u3', display_name: 'Cy', kind: 'not_a_kind', amount: 99 },
]

describe('groupUsage', () => {
  it('folds rows into teams holding their members', () => {
    const teams = groupUsage(rows)
    const alpha = teams.find((t) => t.teamId === 't1')!
    expect(alpha.totals.call_seconds).toBe(900)
    expect(alpha.totals.translate_chars).toBe(120)
    expect(alpha.members.map((m) => m.name)).toEqual(['Ana', 'Ben'])
    expect(alpha.members[0].totals).toEqual({ call_seconds: 600, translate_chars: 120 })
  })

  it('keeps people with no team in their own bucket', () => {
    const none = groupUsage(rows).find((t) => t.teamId === null)!
    expect(none.name).toBeNull()
    expect(none.totals.help_request).toBe(2)
  })

  it('drops kinds this build does not know and non-positive amounts', () => {
    const bravo = groupUsage([...rows, { ...rows[0], team_id: 't2', amount: 0 }]).find(
      (t) => t.teamId === 't2'
    )!
    expect(Object.keys(bravo.totals)).toEqual(['call_seconds'])
  })

  it('is empty for no rows', () => {
    expect(groupUsage([])).toEqual([])
  })
})

describe('visibleKinds', () => {
  it('always shows the core kinds and adds Azure Speech kinds only once used', () => {
    expect(visibleKinds([])).toEqual(CORE_KINDS)
    const teams = groupUsage([
      { team_id: 't1', team_name: 'A', user_id: 'u', display_name: 'U', kind: 'tts_chars', amount: 5 },
    ])
    expect(visibleKinds(teams)).toContain('tts_chars')
    expect(visibleKinds(teams)).not.toContain('speech_seconds')
  })
})

describe('sortUsage', () => {
  const teams = groupUsage(rows)

  it('sorts by name with the no-team bucket last', () => {
    expect(sortUsage(teams, 'name', 'asc').map((t) => t.name)).toEqual(['Alpha', 'Bravo', null])
    expect(sortUsage(teams, 'name', 'desc').map((t) => t.name)).toEqual(['Bravo', 'Alpha', null])
  })

  it('sorts teams and their members by a kind', () => {
    const sorted = sortUsage(teams, 'call_seconds', 'desc')
    expect(sorted.map((t) => t.name)).toEqual(['Bravo', 'Alpha', null])
    expect(sorted[1].members.map((m) => m.name)).toEqual(['Ana', 'Ben'])
    const asc = sortUsage(teams, 'call_seconds', 'asc')
    expect(asc[2].name).toBe('Bravo')
  })

  it('does not reorder the input', () => {
    const before = teams.map((t) => t.teamId)
    sortUsage(teams, 'call_seconds', 'asc')
    expect(teams.map((t) => t.teamId)).toEqual(before)
  })
})

describe('grandTotals', () => {
  it('sums every team', () => {
    expect(grandTotals(groupUsage(rows))).toEqual({
      call_seconds: 2100,
      translate_chars: 120,
      help_request: 2,
    })
  })
})

describe('formatUsage', () => {
  it('shows time as whole minutes, with <1 for a blip', () => {
    expect(formatUsage('call_seconds', 0, 'en')).toBe('0')
    expect(formatUsage('call_seconds', 20, 'en')).toBe('<1')
    expect(formatUsage('call_seconds', 150, 'en')).toBe('3')
  })

  it('shows bytes as a file size and characters as a number', () => {
    expect(formatUsage('file_bytes', 2048, 'en')).toBe('2.0 KB')
    expect(formatUsage('translate_chars', 12345, 'en')).toBe('12,345')
  })
})

describe('CSV', () => {
  it('writes one row per member, with minutes for time', () => {
    const csv = usageCsvRows(sortUsage(groupUsage(rows), 'name', 'asc'), ['call_seconds', 'help_request'], {
      noTeam: 'No team',
      unknownMember: 'Unknown',
    })
    expect(csv).toEqual([
      ['Alpha', 'Ana', '10', '0'],
      ['Alpha', 'Ben', '5', '0'],
      ['Bravo', 'Cy', '20', '0'],
      ['No team', 'Dee', '0', '2'],
    ])
  })

  it('defuses spreadsheet formulas in names', () => {
    expect(safeCsvText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(safeCsvText('@team')).toBe(`'@team`)
    expect(safeCsvText('Team Alpha')).toBe('Team Alpha')
  })
})

describe('rangeBounds', () => {
  const now = new Date('2026-11-15T15:30:00Z')

  it('starts this month on the 1st in UTC', () => {
    expect(rangeBounds('month', null, now)).toEqual({ from: '2026-11-01T00:00:00.000Z', to: null })
  })

  it('starts today at local midnight', () => {
    const { from } = rangeBounds('today', null, now)
    const midnight = new Date(from!)
    expect(midnight.getHours()).toBe(0)
    expect(midnight.getMinutes()).toBe(0)
    expect(midnight.getDate()).toBe(now.getDate())
  })

  it('starts the event at its start date, or is open without one', () => {
    expect(rangeBounds('event', '2026-11-10', now).from).toBe('2026-11-10T00:00:00.000Z')
    expect(rangeBounds('event', null, now).from).toBeNull()
    expect(rangeBounds('event', 'not a date', now).from).toBeNull()
  })
})
