import { describe, expect, it } from 'vitest'
import { fromB64, secondsLeft, toB64 } from './homebase-sync'

describe('base64 for document updates', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64])
    expect(Array.from(fromB64(toB64(bytes)))).toEqual(Array.from(bytes))
  })

  it('handles an update bigger than one chunk', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256)
    expect(fromB64(toB64(bytes))).toEqual(bytes)
  })

  it('handles an empty update', () => {
    expect(fromB64(toB64(new Uint8Array()))).toEqual(new Uint8Array())
  })
})

describe('secondsLeft', () => {
  const now = Date.parse('2026-11-07T14:00:00Z')

  it('counts down from the shared start time', () => {
    expect(secondsLeft({ left_s: 1500, started_at: '2026-11-07T13:59:00Z' }, now)).toBe(1440)
  })

  it('holds still while paused', () => {
    expect(secondsLeft({ left_s: 600, started_at: null }, now)).toBe(600)
  })

  it('never goes below zero', () => {
    expect(secondsLeft({ left_s: 60, started_at: '2026-11-07T13:00:00Z' }, now)).toBe(0)
  })

  it('falls back to the full duration and to zero', () => {
    expect(secondsLeft({ duration_s: 900 }, now)).toBe(900)
    expect(secondsLeft({}, now)).toBe(0)
  })

  it('ignores a broken start time', () => {
    expect(secondsLeft({ left_s: 300, started_at: 'not a date' }, now)).toBe(300)
  })
})
