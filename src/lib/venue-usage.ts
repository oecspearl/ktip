/**
 * Usage per team and per member, shaped for the Organiser Ops panel.
 *
 * The server returns one flat list (venue_usage_breakdown, migration 193):
 * a row per team, member and kind. Everything the panel shows is built from
 * that list here, in pure functions, so the grouping, sorting and CSV agree
 * with each other and can be tested without a database.
 */

/**
 * `1.4 MB`. The same shape as chat-attachments' formatFileSize, restated here
 * because that module imports the Supabase client and this one must stay pure.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  const gb = mb / 1024
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`
}

export const USAGE_KINDS = [
  'translate_chars',
  'caption_chars',
  'call_seconds',
  'screen_share_seconds',
  'help_request',
  'file_bytes',
  'tts_chars',
  'speech_seconds',
] as const

export type UsageKind = (typeof USAGE_KINDS)[number]

export function isUsageKind(value: unknown): value is UsageKind {
  return typeof value === 'string' && (USAGE_KINDS as readonly string[]).includes(value)
}

/** Always shown, even at zero. The Azure Speech kinds appear only once used. */
export const CORE_KINDS: UsageKind[] = [
  'translate_chars',
  'caption_chars',
  'call_seconds',
  'screen_share_seconds',
  'help_request',
  'file_bytes',
]

/** One row from venue_usage_breakdown(). numeric arrives as a string or number. */
export interface UsageRow {
  team_id: string | null
  team_name: string | null
  user_id: string | null
  display_name: string | null
  kind: string
  amount: number | string
  entries?: number | string
}

export type UsageTotals = Partial<Record<UsageKind, number>>

export interface MemberUsage {
  userId: string | null
  name: string | null
  totals: UsageTotals
}

export interface TeamUsage {
  /** null is everyone who was on no team when the usage happened. */
  teamId: string | null
  name: string | null
  totals: UsageTotals
  members: MemberUsage[]
}

function add(totals: UsageTotals, kind: UsageKind, amount: number) {
  totals[kind] = (totals[kind] ?? 0) + amount
}

/** Fold the flat rows into teams, each holding its members. Unknown kinds are dropped. */
export function groupUsage(rows: readonly UsageRow[]): TeamUsage[] {
  const teams = new Map<string, TeamUsage>()
  const members = new Map<string, MemberUsage>()

  for (const row of rows) {
    if (!isUsageKind(row.kind)) continue
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue

    const teamKey = row.team_id ?? ''
    let team = teams.get(teamKey)
    if (!team) {
      team = { teamId: row.team_id, name: row.team_name, totals: {}, members: [] }
      teams.set(teamKey, team)
    }
    if (!team.name && row.team_name) team.name = row.team_name
    add(team.totals, row.kind, amount)

    const memberKey = `${teamKey}|${row.user_id ?? ''}`
    let member = members.get(memberKey)
    if (!member) {
      member = { userId: row.user_id, name: row.display_name, totals: {} }
      members.set(memberKey, member)
      team.members.push(member)
    }
    if (!member.name && row.display_name) member.name = row.display_name
    add(member.totals, row.kind, amount)
  }

  return [...teams.values()]
}

/** Which columns to show: the core kinds, plus any other kind with usage. */
export function visibleKinds(teams: readonly TeamUsage[]): UsageKind[] {
  const used = new Set<UsageKind>()
  for (const team of teams) {
    for (const kind of USAGE_KINDS) if ((team.totals[kind] ?? 0) > 0) used.add(kind)
  }
  return USAGE_KINDS.filter((kind) => CORE_KINDS.includes(kind) || used.has(kind))
}

export type SortColumn = 'name' | UsageKind
export type SortDirection = 'asc' | 'desc'

function compareBy<T extends { name: string | null; totals: UsageTotals }>(
  column: SortColumn,
  direction: SortDirection
) {
  const sign = direction === 'asc' ? 1 : -1
  return (a: T, b: T) => {
    if (column === 'name') {
      // Unnamed (no team, or a deleted account) always sinks to the bottom.
      if (!a.name && b.name) return 1
      if (a.name && !b.name) return -1
      return sign * (a.name ?? '').localeCompare(b.name ?? '')
    }
    const diff = (a.totals[column] ?? 0) - (b.totals[column] ?? 0)
    if (diff !== 0) return sign * diff
    return (a.name ?? '').localeCompare(b.name ?? '')
  }
}

/** Teams sorted, and each team's members sorted the same way. Returns new arrays. */
export function sortUsage(
  teams: readonly TeamUsage[],
  column: SortColumn,
  direction: SortDirection
): TeamUsage[] {
  const cmp = compareBy<TeamUsage>(column, direction)
  const memberCmp = compareBy<MemberUsage>(column, direction)
  return [...teams]
    .map((team) => ({ ...team, members: [...team.members].sort(memberCmp) }))
    .sort(cmp)
}

/** Sum of every team, for the table's footer. */
export function grandTotals(teams: readonly TeamUsage[]): UsageTotals {
  const totals: UsageTotals = {}
  for (const team of teams) {
    for (const kind of USAGE_KINDS) {
      const value = team.totals[kind]
      if (value) add(totals, kind, value)
    }
  }
  return totals
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export type UsageUnit = 'chars' | 'minutes' | 'count' | 'bytes'

export function unitOf(kind: UsageKind): UsageUnit {
  switch (kind) {
    case 'call_seconds':
    case 'screen_share_seconds':
    case 'speech_seconds':
      return 'minutes'
    case 'help_request':
      return 'count'
    case 'file_bytes':
      return 'bytes'
    default:
      return 'chars'
  }
}

/** A cell's text. Seconds show as whole minutes, with "<1" for a short blip. */
export function formatUsage(kind: UsageKind, amount: number | undefined, locale?: string): string {
  const value = amount ?? 0
  if (value <= 0) return '0'
  const number = new Intl.NumberFormat(locale)
  switch (unitOf(kind)) {
    case 'minutes':
      return value < 60 ? '<1' : number.format(Math.round(value / 60))
    case 'bytes':
      return formatBytes(value)
    default:
      return number.format(Math.round(value))
  }
}

/** The value a CSV cell carries: minutes for time, raw numbers otherwise. */
export function csvValue(kind: UsageKind, amount: number | undefined): string {
  const value = amount ?? 0
  if (unitOf(kind) === 'minutes') return (Math.round((value / 60) * 10) / 10).toString()
  return Math.round(value).toString()
}

/**
 * A spreadsheet treats a cell starting with = + - or @ as a formula. Team
 * names are typed by attendees, so one called "=HYPERLINK(...)" must arrive
 * as text.
 */
export function safeCsvText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/**
 * One CSV row per member, team first. The caller supplies the translated
 * header labels and the words for "no team" and "unknown member".
 */
export function usageCsvRows(
  teams: readonly TeamUsage[],
  kinds: readonly UsageKind[],
  labels: { noTeam: string; unknownMember: string }
): string[][] {
  const rows: string[][] = []
  for (const team of teams) {
    const teamName = safeCsvText(team.name ?? labels.noTeam)
    for (const member of team.members) {
      rows.push([
        teamName,
        safeCsvText(member.name ?? labels.unknownMember),
        ...kinds.map((kind) => csvValue(kind, member.totals[kind])),
      ])
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export type UsageRange = 'today' | 'event' | 'month'

/**
 * The [from, to) window for a range, as ISO strings (null = open).
 *
 * today  since local midnight, because "today" means the organiser's day.
 * event  since the event's start date. Open-ended, so late usage still shows.
 * month  since the 1st in UTC, the same month the free-tier meters count.
 */
export function rangeBounds(
  range: UsageRange,
  eventStart: string | null | undefined,
  now: Date = new Date()
): { from: string | null; to: string | null } {
  switch (range) {
    case 'today': {
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { from: midnight.toISOString(), to: null }
    }
    case 'month': {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      return { from: first.toISOString(), to: null }
    }
    case 'event': {
      const start = eventStart ? new Date(eventStart) : null
      return { from: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null, to: null }
    }
  }
}
