/**
 * A number the admin console is prepared to stand behind, or an honest account
 * of why there isn't one.
 *
 * The dashboard had one failure mode running through every tile and chart: a
 * query that was refused, or an RPC that no longer existed, arrived at the UI
 * as `null` and was rendered as `0` or as "No data available". A broken
 * permission and a genuinely empty platform looked identical — and the empty
 * reading is the one a reader believes, because it is the one that looks like
 * an answer.
 *
 * src/lib/member-kpis.ts already argued this for the member dashboard:
 *
 *   > `null` means "no readable value" and the tile is dropped. Returning 0 is
 *   > a claim — that the member really has none — so only return it when the
 *   > count is trustworthy.
 *
 * This is the same rule with the reason attached, because on the admin side the
 * reader can usually act on it: `unavailable` is somebody's bug and should be
 * reported, `not-instrumented` is a roadmap item and should not.
 */
export type Measured =
  /** A real reading. `0` here means zero, and is safe to publish. */
  | { state: 'ok'; value: number }
  /** The query ran and failed, or was refused. Never render this as a number. */
  | { state: 'unavailable'; reason: string }
  /** Nothing collects this yet — a Phase 2/3 KPI showing on a Phase 1 board. */
  | { state: 'not-instrumented' }

export const ok = (value: number): Measured => ({ state: 'ok', value })
export const unavailable = (reason: string): Measured => ({ state: 'unavailable', reason })
export const notInstrumented = (): Measured => ({ state: 'not-instrumented' })

/**
 * A count from a PostgREST `head: true` query.
 *
 * `count` is legitimately `null` on a failed request AND on some successful
 * ones, so the error is what decides — reading `count || 0` is exactly the bug
 * this module exists to stop.
 */
export function measuredCount(
  result: { count: number | null; error: unknown },
  reason: string
): Measured {
  if (result.error) return unavailable(reason)
  if (typeof result.count !== 'number') return unavailable(reason)
  return ok(result.count)
}

/** The number if it is real, otherwise null — for a tile that renders an em dash. */
export function valueOf(measured: Measured | undefined): number | null {
  return measured?.state === 'ok' ? measured.value : null
}

/** True when there is something to explain rather than something to show. */
export function isMissing(measured: Measured | undefined): boolean {
  return !measured || measured.state !== 'ok'
}

/**
 * A list, or the reason there isn't one.
 *
 * Charts need the same distinction tiles do: an empty array is a truthful
 * "nothing matched", and it must not be how a dead RPC renders.
 */
export type MeasuredList<T> =
  | { state: 'ok'; items: T[] }
  | { state: 'unavailable'; reason: string }

export const okList = <T,>(items: T[]): MeasuredList<T> => ({ state: 'ok', items })
export const unavailableList = <T,>(reason: string): MeasuredList<T> => ({
  state: 'unavailable',
  reason,
})

/** Items when readable, `[]` otherwise — for callers that only need to iterate. */
export function itemsOf<T>(list: MeasuredList<T> | undefined): T[] {
  return list?.state === 'ok' ? list.items : []
}
