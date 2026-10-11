import { describe, expect, it } from 'vitest'
import appSource from '../App.tsx?raw'
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

  // Alt+Shift+1 to 9; the service checks its own chords against what browsers keep
  it('digits are 1 to 9', () => {
    for (const r of ROUTE_DEFS) if (r.digit) expect(r.digit >= 1 && r.digit <= 9, r.id).toBe(true)
  })
})
