import { normalizeForMatching } from './normalize'
import {
  EMPTY_SCAN,
  maxSeverity,
  SEVERITY_RANK,
  type ModerationCategory,
  type ModerationRule,
  type ScanMatch,
  type ScanResult,
  type Severity,
} from './types'

/**
 * The browser half of scan_content().
 *
 * Pure: no React, no Supabase, no DOM. Its whole job is to produce the same
 * verdict the Postgres trigger will, plus the character ranges the trigger has
 * no reason to compute and the strikethrough cannot work without.
 *
 * Where the two deliberately differ:
 *   * The SQL returns one entry per matching RULE (a boolean `~*` per rule).
 *     This returns every OCCURRENCE, with positions.
 *   * This adds an advisory de-obfuscation pass the SQL has no counterpart
 *     for. Those matches are tagged `via: 'normalized'` and may only warn.
 *
 * scan-parity.test.ts reads 065_moderation.sql and asserts the pieces that
 * must not drift — the escape class, the \m/\M wrapper, the severity ranking.
 */

/**
 * Byte-identical to the class inside scan_content()'s regexp_replace:
 *   regexp_replace(pattern, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g')
 * Kept as one literal so the parity test can compare them character by
 * character. Changing this without changing the SQL silently desynchronises
 * every term rule containing punctuation.
 */
export const SQL_ESCAPE_CLASS = /[.^$*+?()[\]{}|\\]/g

/**
 * Postgres \m and \M, not \b.
 *
 * \b matches a word-boundary transition in either direction; \m specifically
 * asserts start-of-word and \M end-of-word. They diverge whenever a term's
 * first or last character is not a word character — a moderator who writes the
 * term `!bad` gets a rule that can never fire server-side, and \b would have
 * fired client-side. Silent disagreement, exactly the class of bug the whole
 * parity discipline exists to prevent.
 *
 * The word class is [\p{L}\p{N}_] rather than \w because Postgres's
 * [[:alnum:]_] is locale-aware under UTF-8: \mété\M must not fire inside
 * "l'été", and a third of the member base writes in French or Spanish.
 */
const WORD = '[\\p{L}\\p{N}_]'
const START = `(?<!${WORD})(?=${WORD})`
const END = `(?<=${WORD})(?!${WORD})`

/** Whole-scan wall-clock budget. Checked between rules, not inside one. */
const DEFAULT_BUDGET_MS = 12

/** Above this, regex rules are skipped entirely — admin patterns are unbounded. */
const REGEX_MAX_CHARS = 20_000
/** Between this and REGEX_MAX_CHARS, regex rules run over overlapping windows. */
const REGEX_WINDOW_CHARS = 4_000
const REGEX_WINDOW_OVERLAP = 200

/** Engines degrade past ~1000 capture groups; a failed chunk costs 200 rules, not all. */
const TERM_CHUNK = 200

/** Obfuscated matches below this length are noise (`c4` → `ca`). */
const MIN_NORMALIZED_LENGTH = 4

export const escapeTerm = (pattern: string) => pattern.replace(SQL_ESCAPE_CLASS, '\\$&')

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

const compileCache = new Map<string, RegExp | null>()

/**
 * Constructs JS has no equivalent for, which must be REFUSED rather than
 * compiled. `[[:alpha:]]` throws under `u` but compiles happily without it —
 * as a character class containing `[`, `:`, `a`, `l`, `p`, `h` — and then
 * matches things nobody asked for. A rule that quietly means something else on
 * the client is worse than a rule the client admits it cannot run.
 */
const UNSUPPORTED_POSIX = /\[\[:|\\[mMyAZ]/

/**
 * Postgres accepts POSIX bracket expressions ([[:alpha:]]), \m/\M/\y, and far
 * looser brace handling than JS does under `u`. A rule that will not compile is
 * dropped and reported in `skipped` rather than silently ignored — the terms
 * tab surfaces the count so moderators know which of their rules only fire
 * after the fact.
 */
function compileRule(rule: ModerationRule): RegExp | null {
  const key = `${rule.kind} ${rule.pattern}`
  const cached = compileCache.get(key)
  if (cached !== undefined) return cached

  let re: RegExp | null = null
  if (rule.kind === 'regex') {
    if (UNSUPPORTED_POSIX.test(rule.pattern)) {
      compileCache.set(key, null)
      return null
    }
    try {
      re = new RegExp(rule.pattern, 'giu')
    } catch {
      // Unicode mode rejects identity escapes Postgres tolerates (\-, \@).
      // Retry without it before giving up — closer to POSIX either way.
      try {
        re = new RegExp(rule.pattern, 'gi')
      } catch {
        re = null
      }
    }
  } else {
    try {
      re = new RegExp(`${START}(?:${escapeTerm(rule.pattern)})${END}`, 'giu')
    } catch {
      re = null
    }
  }

  compileCache.set(key, re)
  return re
}

interface TermMatcher {
  re: RegExp
  /** rules[g] owns capture group g + 1. */
  rules: ModerationRule[]
}

/**
 * One combined alternation per chunk instead of 2000 exec loops per keystroke.
 * The index of the first defined capture group identifies the rule that hit.
 */
function buildTermMatchers(rules: ModerationRule[], skipped: string[]): TermMatcher[] {
  const usable: ModerationRule[] = []
  for (const rule of rules) {
    if (rule.kind !== 'term') continue
    if (compileRule(rule) === null) {
      skipped.push(rule.id)
      continue
    }
    usable.push(rule)
  }

  const matchers: TermMatcher[] = []
  for (let i = 0; i < usable.length; i += TERM_CHUNK) {
    const chunk = usable.slice(i, i + TERM_CHUNK)
    const body = chunk.map((r) => `(${escapeTerm(r.pattern)})`).join('|')
    try {
      matchers.push({ re: new RegExp(`${START}(?:${body})${END}`, 'giu'), rules: chunk })
    } catch {
      // Fall back to one matcher per rule rather than losing the whole chunk.
      for (const rule of chunk) {
        const re = compileRule(rule)
        if (re) matchers.push({ re, rules: [rule] })
        else skipped.push(rule.id)
      }
    }
  }

  return matchers
}

/**
 * Rebuilding 2000 alternations on every keystroke would undo the point of
 * building them. Keyed by the rules array identity, which react-query keeps
 * stable for the lifetime of the cache entry.
 */
const matcherCache = new WeakMap<ModerationRule[], { matchers: TermMatcher[]; skipped: string[] }>()

function termMatchersFor(rules: ModerationRule[]): { matchers: TermMatcher[]; skipped: string[] } {
  const cached = matcherCache.get(rules)
  if (cached) return cached
  const skipped: string[] = []
  const entry = { matchers: buildTermMatchers(rules, skipped), skipped }
  matcherCache.set(rules, entry)
  return entry
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * Never reuse a cached /g regex without resetting lastIndex. Two calls with the
 * same input must return the same result; without this they do not, and the
 * bug only shows up on the second keystroke.
 */
function execAll(
  re: RegExp,
  text: string,
  onMatch: (match: RegExpExecArray) => void,
  limit = 500
): void {
  re.lastIndex = 0
  let m: RegExpExecArray | null
  let found = 0
  while ((m = re.exec(text)) !== null) {
    onMatch(m)
    if (++found >= limit) break
    // A zero-length match would loop forever.
    if (m.index === re.lastIndex) re.lastIndex++
  }
  re.lastIndex = 0
}

function firstDefinedGroup(m: RegExpExecArray): number {
  for (let g = 1; g < m.length; g++) if (m[g] !== undefined) return g - 1
  return -1
}

export interface ScanOptions {
  budgetMs?: number
  /** Run the advisory de-obfuscation pass. Default true. */
  normalize?: boolean
}

export function scanText(
  text: string,
  rules: ModerationRule[],
  options: ScanOptions = {}
): ScanResult {
  if (!text || text.trim().length === 0 || rules.length === 0) return EMPTY_SCAN

  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS
  const deadline = now() + budgetMs
  const matches: ScanMatch[] = []
  let truncated = false

  // --- term rules, via combined alternations -------------------------------
  const terms = termMatchersFor(rules)
  const skipped = [...terms.skipped]

  for (const matcher of terms.matchers) {
    if (now() > deadline) {
      truncated = true
      break
    }
    execAll(matcher.re, text, (m) => {
      const g = firstDefinedGroup(m)
      if (g < 0) return
      const rule = matcher.rules[g]
      const value = m[g + 1]
      const start = m.index + m[0].indexOf(value)
      matches.push({
        start,
        end: start + value.length,
        severity: rule.severity,
        category: rule.category,
        ruleId: rule.id,
        via: 'raw',
      })
    })
  }

  // --- regex rules, one at a time ------------------------------------------
  const regexRules = rules.filter((r) => r.kind === 'regex')
  if (regexRules.length > 0) {
    if (text.length > REGEX_MAX_CHARS) {
      // An admin-authored pattern is unbounded, and a document this long is
      // where a merely-slow one becomes a frozen tab. The server still sees it.
      truncated = true
    } else {
      for (const rule of regexRules) {
        if (now() > deadline) {
          truncated = true
          break
        }
        const re = compileRule(rule)
        if (!re) {
          if (!skipped.includes(rule.id)) skipped.push(rule.id)
          continue
        }
        for (const [windowText, base] of windows(text)) {
          execAll(re, windowText, (m) => {
            if (!m[0]) return
            matches.push({
              start: base + m.index,
              end: base + m.index + m[0].length,
              severity: rule.severity,
              category: rule.category,
              ruleId: rule.id,
              via: 'raw',
            })
          })
        }
      }
    }
  }

  // --- advisory de-obfuscation pass ----------------------------------------
  if (options.normalize !== false && now() <= deadline) {
    collectNormalized(text, rules, matches)
  }

  return finalize(matches, skipped, truncated)
}

/**
 * Only medium/high term rules of four characters or more, because this pass
 * cannot block and a noisy warning is worse than none. `via: 'normalized'` is
 * what keeps it out of the blocking set.
 */
function collectNormalized(text: string, rules: ModerationRule[], out: ScanMatch[]): void {
  const candidates = rules.filter(
    (r) => r.kind === 'term' && r.severity !== 'low' && r.pattern.length >= MIN_NORMALIZED_LENGTH
  )
  if (candidates.length === 0) return

  const normalized = normalizeForMatching(text)
  if (normalized.text.length === 0) return
  // Nothing was obfuscated, so the raw pass already found everything.
  if (normalized.text === text.toLowerCase()) return

  const seen = new Set(out.map((m) => `${m.ruleId}:${m.start}`))

  for (const matcher of buildTermMatchers(candidates, [])) {
    execAll(matcher.re, normalized.text, (m) => {
      const g = firstDefinedGroup(m)
      if (g < 0) return
      const rule = matcher.rules[g]
      const value = m[g + 1]
      const ns = m.index + m[0].indexOf(value)
      const ne = ns + value.length
      if (ne <= ns) return
      const start = normalized.map[ns]
      const end = normalized.endMap[ne - 1]
      if (seen.has(`${rule.id}:${start}`)) return
      seen.add(`${rule.id}:${start}`)
      out.push({
        start,
        end,
        severity: rule.severity,
        category: rule.category,
        ruleId: rule.id,
        via: 'normalized',
      })
    })
  }
}

function finalize(matches: ScanMatch[], skipped: string[], truncated: boolean): ScanResult {
  if (matches.length === 0) {
    return { ...EMPTY_SCAN, skipped, truncated }
  }

  matches.sort((a, b) => a.start - b.start || a.end - b.end)

  let severity: Severity | null = null
  let advisorySeverity: Severity | null = null
  let worstCategory: ModerationCategory | null = null
  let worstRank = 0

  for (const m of matches) {
    advisorySeverity = maxSeverity(advisorySeverity, m.severity)
    if (m.via !== 'raw') continue
    severity = maxSeverity(severity, m.severity)
    if (SEVERITY_RANK[m.severity] > worstRank) {
      worstRank = SEVERITY_RANK[m.severity]
      worstCategory = m.category
    }
  }

  return { severity, advisorySeverity, matches, worstCategory, skipped, truncated }
}

/** [text, baseOffset] pairs. One window for short text, overlapping ones beyond 4k. */
function* windows(text: string): Generator<[string, number]> {
  if (text.length <= REGEX_WINDOW_CHARS) {
    yield [text, 0]
    return
  }
  const step = REGEX_WINDOW_CHARS - REGEX_WINDOW_OVERLAP
  for (let base = 0; base < text.length; base += step) {
    yield [text.slice(base, base + REGEX_WINDOW_CHARS), base]
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

// ---------------------------------------------------------------------------
// Rendering support
// ---------------------------------------------------------------------------

export interface MergedRange {
  start: number
  end: number
  severity: Severity
}

/** Overlapping and adjacent matches become one mark; the worst severity wins. */
export function mergeRanges(matches: ScanMatch[]): MergedRange[] {
  if (matches.length === 0) return []
  const sorted = [...matches].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: MergedRange[] = []

  for (const m of sorted) {
    const last = out[out.length - 1]
    if (last && m.start <= last.end) {
      last.end = Math.max(last.end, m.end)
      last.severity = maxSeverity(last.severity, m.severity) as Severity
    } else {
      out.push({ start: m.start, end: m.end, severity: m.severity })
    }
  }

  return out
}

/** Test seam — the caches are keyed by pattern and by array identity. */
export function __resetCaches(): void {
  compileCache.clear()
}

/**
 * Compile a regex exactly as the scanner would, for the admin-side linter.
 * Returns null for anything the browser cannot run, so the terms tab can say
 * so rather than saving a rule that silently never fires client-side.
 */
export function compileForLint(pattern: string): RegExp | null {
  return compileRule({
    id: '__lint__',
    pattern,
    kind: 'regex',
    severity: 'low',
    category: null,
  })
}