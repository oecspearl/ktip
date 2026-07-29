import type { SiteEntry } from './site-map'

/**
 * Local (offline, instant) matching for the navbar search panel.
 *
 * Pure functions only — no React, no network — so they can be unit tested and
 * reused by anything that needs to rank site entries.
 */

/** What kind of thing a row points at. Drives the panel's grouping. */
export type SearchKind =
  | 'place'
  | 'help'
  | 'project'
  | 'event'
  | 'grant'
  | 'post'
  | 'resource'
  | 'member'

/** One row in the panel. Site entries and database records both normalise to this. */
export interface SearchRow {
  /** Unique within the panel: site entry id, or `<kind>:<record id>`. */
  id: string
  kind: SearchKind
  title: string
  description: string
  category: string
  href?: string
  /** lucide-react icon name, resolved by the panel. */
  icon?: string
  /** Expanding the row shows these steps instead of navigating. */
  howTo?: string[]
}

export interface SearchGroup {
  kind: SearchKind
  label: string
  rows: SearchRow[]
}

export const GROUP_LABELS: Record<SearchKind, string> = {
  place: 'Places & Actions',
  help: 'Help',
  project: 'Projects',
  event: 'Events',
  grant: 'Grants',
  post: 'Forum Posts',
  resource: 'Resources',
  member: 'Members',
}

/** Panel section order. */
export const GROUP_ORDER: SearchKind[] = [
  'place',
  'help',
  'project',
  'event',
  'grant',
  'post',
  'resource',
  'member',
]

// --- Fuzzy scoring ----------------------------------------------------------
// Higher is better; 0 means no match, so the entry is dropped.

/**
 * Score one entry against a query. Each haystack has a weight, and the match
 * quality multiplies it: exact (x10) > prefix (x6) > substring (x3) >
 * subsequence (x1, so "new proj" still finds "Create a new project").
 */
export function scoreMatch(query: string, entry: SiteEntry): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1 // empty query: keep everything, original order

  const haystacks: Array<[string, number]> = [
    [entry.title.toLowerCase(), 10],
    [entry.category.toLowerCase(), 5],
    [entry.keywords.join(' ').toLowerCase(), 4],
    [entry.description.toLowerCase(), 2],
  ]

  let best = 0
  for (const [text, weight] of haystacks) {
    if (!text) continue
    if (text === q) {
      best = Math.max(best, weight * 10)
    } else if (text.startsWith(q)) {
      best = Math.max(best, weight * 6)
    } else if (text.includes(q)) {
      best = Math.max(best, weight * 3)
    } else if (wordPrefixMatch(text, q)) {
      // "new proj" -> "Create a new project": every query word prefixes a word
      best = Math.max(best, weight * 2)
    } else if (isSubsequence(text, q)) {
      best = Math.max(best, weight)
    }
  }
  return best
}

/** Every whitespace-separated query term prefixes some word in `text`. */
function wordPrefixMatch(text: string, query: string): boolean {
  const terms = query.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return false
  const words = text.split(/[^a-z0-9]+/i).filter(Boolean)
  return terms.every((term) => words.some((word) => word.startsWith(term)))
}

/** Characters of `query` appear in `text` in order (not necessarily adjacent). */
function isSubsequence(text: string, query: string): boolean {
  let i = 0
  for (const ch of text) {
    if (ch === query[i]) i++
    if (i === query.length) return true
  }
  return i === query.length
}

/** Rank entries by score, dropping non-matches. Stable for equal scores. */
export function localSearch(query: string, entries: SiteEntry[]): SiteEntry[] {
  return entries
    .map((entry, index) => ({ entry, score: scoreMatch(query, entry), index }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.entry)
}

// --- Access filtering -------------------------------------------------------

export interface Viewer {
  signedIn: boolean
  isOecs: boolean
}

/** Hide entries the current viewer cannot reach. */
export function filterByAccess(entries: SiteEntry[], viewer: Viewer): SiteEntry[] {
  return entries.filter((entry) => {
    switch (entry.access) {
      case 'guest':
        return !viewer.signedIn
      case 'auth':
        return viewer.signedIn
      case 'oecs':
        return viewer.isOecs
      default:
        return true
    }
  })
}

// --- Conversion -------------------------------------------------------------

/** Turn a site entry into a panel row. */
export function toRow(entry: SiteEntry, kind: SearchKind = 'place'): SearchRow {
  return {
    id: entry.id,
    kind,
    title: entry.title,
    description: entry.description,
    category: entry.category,
    href: entry.href,
    icon: entry.icon,
    howTo: entry.howTo,
  }
}

/**
 * Re-order rows to match the id order the AI returned. Ids the AI did not
 * mention keep their local order and follow the ranked ones, so a bad AI
 * response can only degrade to the local ranking, never lose results.
 */
export function applyAiRanking(rows: SearchRow[], ids: string[]): SearchRow[] {
  if (ids.length === 0) return rows
  const rank = new Map(ids.map((id, i) => [id, i]))
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra === undefined && rb === undefined) return 0
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    return ra - rb
  })
}

/** Bundle rows into ordered, non-empty groups. */
export function groupRows(rows: SearchRow[]): SearchGroup[] {
  return GROUP_ORDER.map((kind) => ({
    kind,
    label: GROUP_LABELS[kind],
    rows: rows.filter((row) => row.kind === kind),
  })).filter((group) => group.rows.length > 0)
}
