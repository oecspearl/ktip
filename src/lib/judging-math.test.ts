import { describe, expect, it } from 'vitest'
import {
  effectiveWeights,
  formatScore,
  formatZ,
  isComplete,
  isValidScore,
  judgeTotals,
  judgingProgress,
  rankEntries,
  weightedTotal,
  zScores,
  type ScoreRow,
  type WeightedCriterion,
} from './judging-math'

const criteria: WeightedCriterion[] = [
  { id: 'impact', weight: 3 },
  { id: 'tech', weight: 1 },
]

/** Every criterion for one judge on one entry. */
function scored(judgeId: string, entryId: string, impact: number, tech: number): ScoreRow[] {
  return [
    { judgeId, entryId, criterionId: 'impact', score: impact },
    { judgeId, entryId, criterionId: 'tech', score: tech },
  ]
}

describe('isValidScore', () => {
  it('takes whole numbers from 1 to 10 only', () => {
    expect([1, 5, 10].every(isValidScore)).toBe(true)
    expect([0, 11, 5.5, NaN, '7', null, undefined].some(isValidScore)).toBe(false)
  })
})

describe('effectiveWeights', () => {
  it('counts a missing weight as 1', () => {
    const w = effectiveWeights([
      { id: 'a', weight: null },
      { id: 'b', weight: 2 },
    ])
    expect(w.get('a')).toBe(1)
    expect(w.get('b')).toBe(2)
  })

  it('treats all-zero weights as equal rather than dividing by zero', () => {
    const w = effectiveWeights([
      { id: 'a', weight: 0 },
      { id: 'b', weight: 0 },
    ])
    expect([...w.values()]).toEqual([1, 1])
  })

  it('keeps a zero weight at zero when others carry weight', () => {
    const w = effectiveWeights([
      { id: 'a', weight: 0 },
      { id: 'b', weight: 4 },
    ])
    expect(w.get('a')).toBe(0)
    expect(weightedTotal([{ id: 'a', weight: 0 }, { id: 'b', weight: 4 }], { a: 1, b: 9 })).toBe(9)
  })
})

describe('weightedTotal', () => {
  it('weights each criterion by its share', () => {
    // (3 * 8 + 1 * 4) / 4 = 7
    expect(weightedTotal(criteria, { impact: 8, tech: 4 })).toBe(7)
  })

  it('totals what has been scored so far, for the live figure', () => {
    expect(weightedTotal(criteria, { impact: 6 })).toBe(6)
  })

  it('is null before anything is scored, and ignores junk', () => {
    expect(weightedTotal(criteria, {})).toBeNull()
    expect(weightedTotal(criteria, { impact: 12, tech: 0 })).toBeNull()
  })
})

describe('isComplete and judgingProgress', () => {
  it('needs every criterion', () => {
    expect(isComplete(criteria, { impact: 5 })).toBe(false)
    expect(isComplete(criteria, { impact: 5, tech: 5 })).toBe(true)
    expect(isComplete([], {})).toBe(false)
  })

  it('counts fully scored entries', () => {
    const progress = judgingProgress(criteria, [
      { id: 'e1', scores: { impact: 5, tech: 5 } },
      { id: 'e2', scores: { impact: 5 } },
      { id: 'e3', scores: {} },
    ])
    expect(progress).toEqual({ scored: 1, total: 3 })
  })
})

describe('zScores', () => {
  it('centres on zero with unit spread', () => {
    const z = zScores([2, 4, 6])
    expect(z[1]).toBeCloseTo(0)
    expect(z[0]).toBeCloseTo(-z[2])
    // population sd of 2,4,6 is sqrt(8/3)
    expect(z[2]).toBeCloseTo(2 / Math.sqrt(8 / 3))
  })

  it('returns zeros for a flat set or a single value', () => {
    expect(zScores([7, 7, 7])).toEqual([0, 0, 0])
    expect(zScores([9])).toEqual([0])
    expect(zScores([])).toEqual([])
  })
})

describe('judgeTotals', () => {
  it('leaves out a judge who has not finished an entry', () => {
    const rows: ScoreRow[] = [
      ...scored('j1', 'e1', 8, 4),
      { judgeId: 'j1', entryId: 'e2', criterionId: 'impact', score: 9 },
    ]
    const totals = judgeTotals(criteria, rows)
    expect(totals).toHaveLength(1)
    expect(totals[0]).toMatchObject({ judgeId: 'j1', entryId: 'e1', total: 7 })
  })

  it('ignores scores against criteria that are not in the brief', () => {
    const rows: ScoreRow[] = [
      ...scored('j1', 'e1', 8, 4),
      { judgeId: 'j1', entryId: 'e1', criterionId: 'deleted', score: 1 },
    ]
    expect(judgeTotals(criteria, rows)[0].total).toBe(7)
  })
})

describe('rankEntries', () => {
  it('averages weighted totals across judges', () => {
    const rows = [...scored('j1', 'e1', 8, 4), ...scored('j2', 'e1', 6, 6)]
    const [r] = rankEntries(['e1'], criteria, rows)
    expect(r.judges).toBe(2)
    expect(r.weighted).toBeCloseTo((7 + 6) / 2)
  })

  it('removes a harsh judge’s bias', () => {
    // j1 is harsh, j2 generous. Both agree e1 beats e2 beats e3. j1 also saw
    // e4, which j2 did not, and rated it their best.
    const rows = [
      ...scored('j1', 'e1', 4, 4),
      ...scored('j1', 'e2', 3, 3),
      ...scored('j1', 'e3', 2, 2),
      ...scored('j1', 'e4', 5, 5),
      ...scored('j2', 'e1', 10, 10),
      ...scored('j2', 'e2', 9, 9),
      ...scored('j2', 'e3', 8, 8),
    ]
    const ranked = rankEntries(['e1', 'e2', 'e3', 'e4'], criteria, rows)

    // On raw averages e4 ties last with e3, behind e1 (7.0) and e2 (6.0): the
    // harsh judge's favourite is buried. Normalised, it is that judge's top
    // pick and ranks first.
    const e4 = ranked.find((r) => r.entryId === 'e4')!
    const e3 = ranked.find((r) => r.entryId === 'e3')!
    expect(e4.weighted).toBe(5)
    expect(e3.weighted).toBe(5)
    expect(e4.normalised!).toBeGreaterThan(e3.normalised!)
    expect(ranked[0].entryId).toBe('e4')
    expect(ranked[0].place).toBe(1)
  })

  it('gives tied entries the same place and skips the next', () => {
    const rows = [
      ...scored('j1', 'a', 8, 8),
      ...scored('j1', 'b', 8, 8),
      ...scored('j1', 'c', 2, 2),
    ]
    const ranked = rankEntries(['a', 'b', 'c'], criteria, rows)
    expect(ranked.map((r) => r.place)).toEqual([1, 1, 3])
  })

  it('puts unscored entries last with no place', () => {
    const ranked = rankEntries(['x', 'e1'], criteria, scored('j1', 'e1', 5, 5))
    expect(ranked.map((r) => r.entryId)).toEqual(['e1', 'x'])
    expect(ranked[1]).toEqual({ entryId: 'x', judges: 0, weighted: null, normalised: null, place: null })
  })

  it('breaks a normalised tie on the weighted average', () => {
    // One judge each, one entry each: every z is 0, so weighted decides.
    const rows = [...scored('j1', 'low', 3, 3), ...scored('j2', 'high', 9, 9)]
    const ranked = rankEntries(['low', 'high'], criteria, rows)
    expect(ranked.map((r) => r.entryId)).toEqual(['high', 'low'])
    expect(ranked.map((r) => r.place)).toEqual([1, 2])
  })
})

describe('formatting', () => {
  it('prints a score and a signed z', () => {
    expect(formatScore(7.25)).toBe('7.3')
    expect(formatScore(null)).toBe('–')
    expect(formatZ(0.8412)).toBe('+0.84')
    expect(formatZ(-1.2)).toBe('-1.20')
    expect(formatZ(0.001)).toBe('0.00')
  })
})
