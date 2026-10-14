import { describe, expect, it } from 'vitest'
import appSource from '../App.tsx?raw'
import { DEFAULT_CHORDS, RESERVED_CHORDS, routeChord, sameChord } from '@a11y-kit'
import { ROUTE_DEFS } from './routes'

describe('accessibility routes', () => {
  it('every path is a real route', () => {
    for (const r of ROUTE_DEFS) {
      expect(appSource, r.path).toContain(`path: '${r.path}'`)
    }
  })

  it('digits and sequences are unique', () => {
    const digits = ROUTE_DEFS.flatMap((r) => (r.digit ? [r.digit] : []))
    const seqs = ROUTE_DEFS.flatMap((r) => (r.seq ? [r.seq] : []))
    expect(new Set(digits).size).toBe(digits.length)
    expect(new Set(seqs).size).toBe(seqs.length)
  })

  it('no chord, page or action, is one the browser or OS owns', () => {
    const chords = [...Object.values(DEFAULT_CHORDS), ...ROUTE_DEFS.flatMap((r) => (r.digit ? [routeChord(r.digit)] : []))]
    for (const { chord, owner } of RESERVED_CHORDS) {
      expect(chords.some((c) => sameChord(c, chord)), owner).toBe(false)
    }
    // And no two actions share a chord
    expect(new Set(chords.map((c) => JSON.stringify(c))).size).toBe(chords.length)
  })
})
