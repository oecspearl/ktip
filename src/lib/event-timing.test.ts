import { describe, expect, it } from 'vitest'
import { eventPhase } from './event-timing'

const start = '2026-11-02T22:02:00Z'
const end = '2026-11-07T22:02:00Z'
const at = (iso: string) => Date.parse(iso)

describe('eventPhase', () => {
  it('is upcoming before the start', () => {
    expect(eventPhase({ start_date: start, end_date: end }, at('2026-11-01T00:00:00Z'))).toBe('upcoming')
  })

  it('is live between start and end, inclusive', () => {
    expect(eventPhase({ start_date: start, end_date: end }, at(start))).toBe('live')
    expect(eventPhase({ start_date: start, end_date: end }, at('2026-11-05T12:00:00Z'))).toBe('live')
    expect(eventPhase({ start_date: start, end_date: end }, at(end))).toBe('live')
  })

  it('is past after the end', () => {
    expect(eventPhase({ start_date: start, end_date: end }, at('2026-11-08T00:00:00Z'))).toBe('past')
  })

  it('gives an event with no end date a day-long window', () => {
    expect(eventPhase({ start_date: start, end_date: null }, at('2026-11-03T20:00:00Z'))).toBe('live')
    expect(eventPhase({ start_date: start }, at('2026-11-03T23:00:00Z'))).toBe('past')
  })
})
