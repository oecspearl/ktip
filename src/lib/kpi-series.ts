/**
 * The shape get_kpi_series() returns (migration 143), and the pivot that turns
 * it into rows an area chart can draw.
 *
 * The RPC returns one row per (bucket, segment) — long format, because that is
 * what SQL produces naturally and what a table view wants. Recharts wants one
 * row per bucket with a column per segment. The pivot lives here, as a pure
 * function, so it is tested without a chart or a query client in the way.
 */

export type SeriesGrain = 'day' | 'week' | 'month'

export const SERIES_METRICS = [
  'registrations',
  'registrations_by_country',
  'active_users',
  'daily_active',
  'projects',
  'events',
  'event_registrations',
  'grant_applications',
  'forum_posts',
  'connections',
  'content_reports',
  'resources_published',
  'page_views',
] as const

export type SeriesMetric = (typeof SERIES_METRICS)[number]

export interface SeriesPoint {
  /** ISO date of the bucket start. */
  bucket: string
  /** The series within the metric: a role tier, a country, or 'all'. */
  segment: string
  value: number
}

export interface PivotedSeries {
  /** One row per bucket; `label` is the x-axis text, then one column per segment. */
  rows: Array<Record<string, string | number>>
  /** Segments in first-seen order, which the RPC keeps stable. */
  segments: string[]
}

// en-GB for day-before-month, which is how dates are written across the OECS.
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "Aug 26" for a month bucket, "3 Aug" for a day or week bucket. */
export function bucketLabel(bucket: string, grain: SeriesGrain): string {
  const date = new Date(`${bucket}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return bucket
  return grain === 'month' ? MONTH.format(date) : DAY.format(date)
}

export function pivotSeries(points: ReadonlyArray<SeriesPoint>, grain: SeriesGrain): PivotedSeries {
  const segments: string[] = []
  const byBucket = new Map<string, Record<string, string | number>>()

  for (const point of points) {
    if (!segments.includes(point.segment)) segments.push(point.segment)
    let row = byBucket.get(point.bucket)
    if (!row) {
      row = { bucket: point.bucket, label: bucketLabel(point.bucket, grain) }
      byBucket.set(point.bucket, row)
    }
    row[point.segment] = point.value
  }

  // A segment absent from a bucket is zero for a count series: the RPC
  // zero-fills through a cross join, so a hole here is a genuine gap in the
  // RPC's output and reads better as 0 than as a broken line.
  const rows = [...byBucket.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)))
  for (const row of rows) for (const segment of segments) if (!(segment in row)) row[segment] = 0

  return { rows, segments }
}

/** The sum across segments per bucket — a stacked chart's total line. */
export function totalsOf(pivot: PivotedSeries): number[] {
  return pivot.rows.map((row) =>
    pivot.segments.reduce((sum, segment) => sum + Number(row[segment] ?? 0), 0),
  )
}
