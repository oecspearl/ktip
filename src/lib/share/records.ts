/**
 * What the AI is allowed to know about a shared item.
 *
 * api/share.ts loads the row itself (as the caller, so row-level security has
 * already decided they may see it) and passes it through one of these
 * builders. Each one is an allow-list: the fields a member would expect to see
 * in a post about the item, written the way a person reads them ("4–6 December
 * 2026", "EC$50,000"), and nothing else — no contact emails, internal notes,
 * registration settings or moderation fields. The same object goes to the
 * number check, so every figure in it is a figure a draft may use.
 *
 * Pure and free of browser and Lingui imports so the edge function can load it.
 */

import type { ShareKind } from './draft-prompt'

/** The OECS sits in one time zone (UTC-4); dates read as they do on the islands. */
const TZ = 'America/St_Lucia'
const DESCRIPTION_CHARS = 1200

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Rich-text descriptions arrive as HTML or Markdown; the model needs prose. */
export function plainText(value: unknown, max = DESCRIPTION_CHARS): string | null {
  const s = str(value)
  if (!s) return null
  const text = s
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[*_#>`]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text
}

function parts(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return { day: p.day, month: p.month, year: p.year }
}

/** "15 January 2027", in OECS time. */
export function formatDay(iso: unknown): string | null {
  const s = str(iso)
  const p = s ? parts(s) : null
  return p ? `${p.day} ${p.month} ${p.year}` : null
}

/** "4–6 December 2026", "30 November – 2 December 2026", or one day. */
export function formatDayRange(start: unknown, end: unknown): string | null {
  const a = str(start) ? parts(str(start)!) : null
  if (!a) return null
  const b = str(end) ? parts(str(end)!) : null
  if (!b || (a.day === b.day && a.month === b.month && a.year === b.year)) return `${a.day} ${a.month} ${a.year}`
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`
  return `${a.day}–${b.day} ${a.month} ${a.year}`
}

const CURRENCY_PREFIX: Record<string, string> = { XCD: 'EC$', USD: 'US$', EUR: '€', GBP: '£' }

/** "EC$50,000". Unknown currencies keep their code: "BBD 50,000". */
export function formatMoney(amount: number, currency: unknown): string {
  const code = (str(currency) || 'XCD').toUpperCase()
  const n = Math.round(amount).toLocaleString('en-US')
  const prefix = CURRENCY_PREFIX[code]
  return prefix ? `${prefix}${n}` : `${code} ${n}`
}

export function formatAward(min: unknown, max: unknown, currency: unknown): string | null {
  const lo = num(min)
  const hi = num(max)
  if (lo && hi && lo !== hi) return `${formatMoney(lo, currency)} to ${formatMoney(hi, currency)}`
  if (hi) return `Up to ${formatMoney(hi, currency)}`
  if (lo) return `From ${formatMoney(lo, currency)}`
  return null
}

export function countryName(code: unknown): string | null {
  const c = str(code)
  if (!c) return null
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(c.toUpperCase()) ?? null
  } catch {
    return null
  }
}

const EVENT_TYPE: Record<string, string> = {
  hackathon: 'Hackathon',
  workshop: 'Workshop',
  meetup: 'Meetup',
  conference: 'Conference',
  demo_day: 'Demo day',
  challenge: 'Challenge',
}

const PROJECT_PHASE: Record<string, string> = {
  concept: 'Concept',
  prototype: 'Prototype',
  funding: 'Raising funding',
  launch: 'Launched',
}

const humanize = (v: unknown) => str(v)?.replace(/_/g, ' ') ?? null

/** Drops null, empty strings and empty arrays so the model never sees "null". */
function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
  )
}

export function eventRecord(row: Row): Record<string, unknown> {
  const location = str(row.location)
  const where = row.is_virtual
    ? location
      ? `Online, and in person at ${location}`
      : 'Online'
    : [location, countryName(row.country_code)].filter(Boolean).join(', ') || null
  return compact({
    type: EVENT_TYPE[String(row.event_type)] ?? 'Event',
    name: str(row.title),
    summary: plainText(row.summary, 300),
    about: plainText(row.description),
    dates: formatDayRange(row.start_date, row.end_date),
    where,
    capacity: num(row.capacity) ? `${num(row.capacity)} places` : null,
    submissions_close: row.has_challenge ? formatDay(row.submission_deadline) : null,
    topics: Array.isArray(row.tags) ? row.tags.filter((t) => typeof t === 'string').slice(0, 6) : null,
  })
}

export function grantRecord(row: Row): Record<string, unknown> {
  return compact({
    type: humanize(row.funding_type) ? `Funding (${humanize(row.funding_type)})` : 'Funding',
    name: str(row.title),
    summary: plainText(row.summary, 300),
    about: plainText(row.description),
    award: formatAward(row.amount_min, row.amount_max, row.currency),
    applications_close: formatDay(row.deadline),
    who_can_apply: plainText(row.eligibility, 500),
    focus_area: humanize(row.grant_type),
    topics: Array.isArray(row.tags) ? row.tags.filter((t) => typeof t === 'string').slice(0, 6) : null,
  })
}

export function projectRecord(row: Row): Record<string, unknown> {
  return compact({
    type: 'Project',
    name: str(row.title),
    summary: plainText(row.summary, 300),
    about: plainText(row.description),
    stage: PROJECT_PHASE[String(row.phase)] ?? null,
    category: humanize(row.category),
    team_size: num(row.member_count) && num(row.member_count)! > 1 ? num(row.member_count) : null,
    climate_action: row.is_climate_action ? 'Yes' : null,
    hashtags: Array.isArray(row.hashtags) ? row.hashtags.filter((t) => typeof t === 'string').slice(0, 6) : null,
  })
}

export function orgRecord(row: Row): Record<string, unknown> {
  return compact({
    type: 'Business',
    name: str(row.trading_name) || str(row.legal_name),
    sector: str(row.industry),
    based_in: [str(row.locality), countryName(row.country_code)].filter(Boolean).join(', ') || null,
    about: plainText(row.description),
    status: 'Verified by its business association on KTIP',
  })
}

/**
 * Whether an item may be shared at all. The share button hides on the same
 * rules; the server checks again because the button is only a hint.
 */
export function isShareable(kind: ShareKind, row: Row): boolean {
  switch (kind) {
    case 'event':
      return (
        (row.status === 'published' || row.status === 'completed') &&
        (row.moderation_status ?? 'active') === 'active'
      )
    case 'grant':
      return row.is_active === true && (row.moderation_status ?? 'active') === 'active'
    case 'project':
      return row.is_public === true && (row.status ?? 'active') === 'active'
    case 'org':
      return row.verification_status === 'verified'
  }
}

export const RECORD_BUILDERS: Record<ShareKind, (row: Row) => Record<string, unknown>> = {
  event: eventRecord,
  grant: grantRecord,
  project: projectRecord,
  org: orgRecord,
}
