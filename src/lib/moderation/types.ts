/**
 * Shared vocabulary for the client-side content filter.
 *
 * Everything here mirrors something in 065_moderation.sql. When the SQL moves,
 * these move — scan-parity.test.ts reads the migration directly and fails if
 * the two drift.
 */

export type Severity = 'low' | 'medium' | 'high'

export type RuleKind = 'term' | 'regex'

/** The six categories in the moderation_terms / content_reports CHECK. */
export type ModerationCategory =
  | 'hate_harassment'
  | 'bullying'
  | 'nsfw'
  | 'spam_scam'
  | 'grooming_risk'
  | 'pii_leak'

/** One row of get_client_moderation_rules(). Deliberately five columns. */
export interface ModerationRule {
  id: string
  pattern: string
  kind: RuleKind
  severity: Severity
  category: ModerationCategory | null
}

export interface ScanMatch {
  /** Inclusive start index into the ORIGINAL string. */
  start: number
  /** Exclusive end index into the ORIGINAL string. */
  end: number
  severity: Severity
  category: ModerationCategory | null
  ruleId: string
  /**
   * 'raw' matched the text as written, so the server will match it too — this
   * is what may block. 'normalized' matched only after de-obfuscation, which
   * scan_content() does not do, so it may only ever warn.
   */
  via: 'raw' | 'normalized'
}

export interface ScanResult {
  /** Max severity across RAW matches only. The SQL-parity value. */
  severity: Severity | null
  /** Max severity including normalized matches. Never used to block. */
  advisorySeverity: Severity | null
  /** Sorted by start. Overlaps are NOT merged — the renderer merges. */
  matches: ScanMatch[]
  /** Category of the highest-severity raw rule; mirrors SQL matches[0].category. */
  worstCategory: ModerationCategory | null
  /** Rule ids whose pattern does not compile in JS; server-enforced only. */
  skipped: string[]
  /** True when the time budget ran out before every rule was tried. */
  truncated: boolean
}

/** Where the text is being written. Drives the category → block policy. */
export type ModerationSurface =
  | 'project'
  | 'project_comment'
  | 'event'
  | 'event_solution'
  | 'grant'
  | 'grant_application'
  | 'resource'
  | 'profile'
  | 'resume'
  | 'forum_post'
  | 'forum_reply'
  | 'message'
  | 'venue_room_message'

export const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 }

export function maxSeverity(a: Severity | null, b: Severity | null): Severity | null {
  if (!a) return b
  if (!b) return a
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b
}

export const EMPTY_SCAN: ScanResult = {
  severity: null,
  advisorySeverity: null,
  matches: [],
  worstCategory: null,
  skipped: [],
  truncated: false,
}
