/**
 * Judging arithmetic (migration 192).
 *
 * The database is the authority on published results: judging_ranking() in
 * 192 computes the same numbers in SQL. This module is the client's copy, used
 * for the judge's live total while they score and for the organiser's
 * per-judge breakdown. Keep the two in step; the rules are:
 *
 *   weight      event_criteria.weight, null counts as 1. If every weight is 0,
 *               they all count as 1.
 *   judge total sum(weight * score) / sum(weight). For results it only counts
 *               once the judge has scored every criterion for that entry.
 *   weighted    mean of the judge totals for an entry.
 *   z           (judge total - that judge's mean) / that judge's population
 *               standard deviation, or 0 when the deviation is 0. This is what
 *               stops one harsh judge sinking every entry they happened to see.
 *   normalised  mean of z for an entry. Rank is by normalised, then weighted.
 *
 * Pure, so it is tested without a database.
 */

export interface WeightedCriterion {
  id: string
  weight: number | null | undefined
}

/** criterion id → score, as a judge fills the form in. */
export type ScoreMap = Record<string, number | null | undefined>

export interface ScoreRow {
  judgeId: string
  entryId: string
  criterionId: string
  score: number
}

export interface JudgeTotal {
  judgeId: string
  entryId: string
  total: number
  z: number
}

export interface EntryResult {
  entryId: string
  /** Judges who scored every criterion. */
  judges: number
  weighted: number | null
  normalised: number | null
  /** 1 is best. Ties share a place. Null when nobody has scored it. */
  place: number | null
}

export const MIN_SCORE = 1
export const MAX_SCORE = 10

export function isValidScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_SCORE &&
    value <= MAX_SCORE
  )
}

/** Weight per criterion id, after the null and all-zero rules. */
export function effectiveWeights(criteria: WeightedCriterion[]): Map<string, number> {
  const raw = criteria.map((c) => {
    const w = typeof c.weight === 'number' && Number.isFinite(c.weight) ? c.weight : 1
    return [c.id, Math.max(0, w)] as const
  })
  const sum = raw.reduce((acc, [, w]) => acc + w, 0)
  return new Map(raw.map(([id, w]) => [id, sum > 0 ? w : 1]))
}

/**
 * One judge's weighted total for one entry, over the criteria they have scored
 * so far. Null when they have scored none. Scores outside 1 to 10 are ignored.
 */
export function weightedTotal(criteria: WeightedCriterion[], scores: ScoreMap): number | null {
  const weights = effectiveWeights(criteria)
  let num = 0
  let den = 0
  for (const [id, w] of weights) {
    const s = scores[id]
    if (!isValidScore(s)) continue
    num += w * s
    den += w
  }
  return den > 0 ? num / den : null
}

/** Every criterion has a valid score. An event with no criteria is never complete. */
export function isComplete(criteria: WeightedCriterion[], scores: ScoreMap): boolean {
  return criteria.length > 0 && criteria.every((c) => isValidScore(scores[c.id]))
}

/** "3 of 9 scored": entries where every criterion has a score. */
export function judgingProgress(
  criteria: WeightedCriterion[],
  entries: Array<{ id: string; scores: ScoreMap }>
): { scored: number; total: number } {
  return {
    scored: entries.filter((e) => isComplete(criteria, e.scores)).length,
    total: entries.length,
  }
}

/** Population z-scores. A flat set (or a single value) is all zeros. */
export function zScores(values: number[]): number[] {
  if (!values.length) return []
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const sd = Math.sqrt(variance)
  if (!(sd > 1e-12)) return values.map(() => 0)
  return values.map((v) => (v - mean) / sd)
}

/**
 * Each judge's complete totals, with a z-score against that judge's own
 * scoring. Partial score sets are left out, as they are in the SQL.
 */
export function judgeTotals(criteria: WeightedCriterion[], rows: ScoreRow[]): JudgeTotal[] {
  const known = new Set(criteria.map((c) => c.id))
  const byPair = new Map<string, { judgeId: string; entryId: string; scores: ScoreMap }>()

  for (const row of rows) {
    if (!known.has(row.criterionId)) continue
    const key = `${row.judgeId}\u0000${row.entryId}`
    let pair = byPair.get(key)
    if (!pair) {
      pair = { judgeId: row.judgeId, entryId: row.entryId, scores: {} }
      byPair.set(key, pair)
    }
    pair.scores[row.criterionId] = row.score
  }

  const complete = [...byPair.values()].filter((p) => isComplete(criteria, p.scores))
  const byJudge = new Map<string, Array<{ entryId: string; total: number }>>()
  for (const p of complete) {
    const total = weightedTotal(criteria, p.scores)
    if (total === null) continue
    const list = byJudge.get(p.judgeId) ?? []
    list.push({ entryId: p.entryId, total })
    byJudge.set(p.judgeId, list)
  }

  const out: JudgeTotal[] = []
  for (const [judgeId, list] of byJudge) {
    const z = zScores(list.map((x) => x.total))
    list.forEach((x, i) => out.push({ judgeId, entryId: x.entryId, total: x.total, z: z[i] }))
  }
  return out
}

/**
 * Weighted and normalised averages per entry, ranked. Entries nobody has fully
 * scored come last with null figures, in the order given.
 */
export function rankEntries(
  entryIds: string[],
  criteria: WeightedCriterion[],
  rows: ScoreRow[]
): EntryResult[] {
  const totals = judgeTotals(criteria, rows)
  const byEntry = new Map<string, JudgeTotal[]>()
  for (const t of totals) {
    const list = byEntry.get(t.entryId) ?? []
    list.push(t)
    byEntry.set(t.entryId, list)
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  const results: EntryResult[] = entryIds.map((entryId) => {
    const list = byEntry.get(entryId) ?? []
    return list.length
      ? {
          entryId,
          judges: list.length,
          weighted: mean(list.map((t) => t.total)),
          normalised: mean(list.map((t) => t.z)),
          place: null,
        }
      : { entryId, judges: 0, weighted: null, normalised: null, place: null }
  })

  const scored = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.judges > 0)
    .sort(
      (a, b) =>
        cmpDesc(a.r.normalised, b.r.normalised) || cmpDesc(a.r.weighted, b.r.weighted) || a.i - b.i
    )

  // Standard competition ranking (1, 2, 2, 4), as SQL rank() does.
  scored.forEach(({ r }, idx) => {
    const prev = scored[idx - 1]?.r
    r.place =
      prev && same(prev.normalised, r.normalised) && same(prev.weighted, r.weighted)
        ? prev.place
        : idx + 1
  })

  const unscored = results.filter((r) => r.judges === 0)
  return [...scored.map(({ r }) => r), ...unscored]
}

function cmpDesc(a: number | null, b: number | null): number {
  return (b ?? -Infinity) - (a ?? -Infinity)
}

function same(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) < 1e-9
}

/** One decimal place, for a score out of 10. */
export function formatScore(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '–'
}

/** A signed z, "+0.84" or "-1.20". */
export function formatZ(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–'
  const rounded = Math.abs(value) < 0.005 ? 0 : value
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`
}
