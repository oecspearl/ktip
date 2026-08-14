import { describe, it, expect, beforeEach } from 'vitest'
import { scanText, mergeRanges, escapeTerm, __resetCaches } from './scan'
import { normalizeForMatching } from './normalize'
import { blocksOn, isBlocking } from './policy'
import type { ModerationRule } from './types'

let seq = 0
const rule = (over: Partial<ModerationRule> & { pattern: string }): ModerationRule => ({
  id: `r${++seq}`,
  kind: 'term',
  severity: 'medium',
  category: 'hate_harassment',
  ...over,
})

beforeEach(() => {
  __resetCaches()
})

describe('word boundaries', () => {
  const rules = [rule({ pattern: 'ass', severity: 'low' })]

  it.each(['class', 'bypass', 'assassin', 'passing', 'massive'])('does not match inside %s', (t) => {
    expect(scanText(t, rules).severity).toBeNull()
  })

  it.each(['ass', 'ASS', 'an ass.', 'bad-ass', '(ass)', 'ass!'])('matches %s', (t) => {
    expect(scanText(t, rules).severity).toBe('low')
  })

  it('does not fire inside an accented French word', () => {
    // Postgres [[:alnum:]] is locale-aware under UTF-8, so \meté\M must not
    // match inside l'été. JS \w would have; [\p{L}\p{N}_] does not.
    expect(scanText("l'été a été chaud", [rule({ pattern: 'été' })]).severity).toBe('medium')
    expect(scanText('cet étérnel projet', [rule({ pattern: 'été' })]).severity).toBeNull()
  })
})

describe('term patterns are literal, not regex', () => {
  it('does not treat . as any-character', () => {
    const rules = [rule({ pattern: 'a.b' })]
    expect(scanText('axb', rules).severity).toBeNull()
    expect(scanText('say a.b now', rules).severity).toBe('medium')
  })

  it('escapes exactly the character set the SQL escapes', () => {
    expect(escapeTerm('a.b*c+d?e(f)g[h]i{j}k|l\\m^n$o')).toBe(
      'a\\.b\\*c\\+d\\?e\\(f\\)g\\[h\\]i\\{j\\}k\\|l\\\\m\\^n\\$o'
    )
  })

  it('a term ending in punctuation can never match, matching \\M', () => {
    // Postgres \M asserts end-of-word: the last character of the match must be
    // a word character. \b would have matched here, and that divergence is the
    // whole reason the lookarounds are spelled out rather than using \b.
    expect(scanText('I love c++ and rust', [rule({ pattern: 'c++' })]).severity).toBeNull()
  })

  it('a term starting with punctuation can never match, matching \\m', () => {
    expect(scanText('that is !bad news', [rule({ pattern: '!bad' })]).severity).toBeNull()
  })
})

describe('ranges', () => {
  it('reports exact character offsets', () => {
    const res = scanText('hello ass world', [rule({ pattern: 'ass' })])
    expect(res.matches.map((m) => [m.start, m.end])).toEqual([[6, 9]])
  })

  it('returns every occurrence, not just the first', () => {
    const res = scanText('ass and ass again', [rule({ pattern: 'ass' })])
    expect(res.matches.filter((m) => m.via === 'raw')).toHaveLength(2)
  })

  it('reports the right rule when several are combined into one alternation', () => {
    const a = rule({ pattern: 'alpha', severity: 'low' })
    const b = rule({ pattern: 'bravo', severity: 'high' })
    const res = scanText('bravo then alpha', [a, b])
    const raw = res.matches.filter((m) => m.via === 'raw')
    expect(raw.map((m) => m.ruleId)).toEqual([b.id, a.id])
    expect(raw.map((m) => m.severity)).toEqual(['high', 'low'])
  })
})

describe('severity', () => {
  const rules = [
    rule({ pattern: 'mild', severity: 'low', category: 'spam_scam' }),
    rule({ pattern: 'severe', severity: 'high', category: 'grooming_risk' }),
  ]

  it('takes the maximum across matched rules', () => {
    expect(scanText('mild', rules).severity).toBe('low')
    expect(scanText('mild and severe', rules).severity).toBe('high')
  })

  it('names the category of the highest-severity rule', () => {
    expect(scanText('mild and severe', rules).worstCategory).toBe('grooming_risk')
  })

  it('advisorySeverity is never below severity', () => {
    const res = scanText('mild and severe', rules)
    expect(res.advisorySeverity).toBe('high')
  })

  it('returns nothing for empty or whitespace-only text', () => {
    expect(scanText('', rules).severity).toBeNull()
    expect(scanText('   \n  ', rules).severity).toBeNull()
  })
})

describe('regex rules', () => {
  const phone = rule({
    pattern: '(\\+?\\d[\\d\\s().-]{7,}\\d)',
    kind: 'regex',
    severity: 'medium',
    category: 'pii_leak',
  })
  const email = rule({
    pattern: '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})',
    kind: 'regex',
    severity: 'low',
    category: 'pii_leak',
  })

  it('matches the 065 phone pattern', () => {
    expect(scanText('call +1 758 555 1234 today', [phone]).severity).toBe('medium')
  })

  it('matches the 065 email pattern', () => {
    const res = scanText('write to a@b.co please', [email])
    expect(res.severity).toBe('low')
    expect(res.matches[0].end - res.matches[0].start).toBe('a@b.co'.length)
  })

  it('skips a pattern JS cannot express and does not throw', () => {
    const posix = rule({ pattern: '[[:alpha:]]+', kind: 'regex' })
    const res = scanText('anything at all', [posix])
    expect(res.skipped).toEqual([posix.id])
    expect(res.severity).toBeNull()
  })

  it('skips Postgres-only word-boundary escapes rather than mis-compiling them', () => {
    const pg = rule({ pattern: '\\mbad\\M', kind: 'regex' })
    expect(scanText('bad', [pg]).skipped).toEqual([pg.id])
  })
})

describe('determinism', () => {
  it('two identical calls return identical results', () => {
    // Cached /g regexes carry lastIndex between calls. Without an explicit
    // reset the second keystroke silently finds fewer matches than the first.
    const rules = [rule({ pattern: 'ass' })]
    const first = scanText('ass and ass', rules)
    const second = scanText('ass and ass', rules)
    expect(second).toEqual(first)
  })
})

describe('budget', () => {
  it('stops and flags truncation rather than blocking the thread', () => {
    const many: ModerationRule[] = Array.from({ length: 4000 }, (_, i) =>
      rule({ pattern: `needle${i}`, kind: 'regex' })
    )
    const res = scanText('a'.repeat(5000), many, { budgetMs: 0, normalize: false })
    expect(res.truncated).toBe(true)
  })
})

describe('normalization', () => {
  const rules = [rule({ pattern: 'bogus', severity: 'high' })]

  it('finds a separator-obfuscated term and strikes the whole run', () => {
    const res = scanText('that is b.o.g.u.s really', rules)
    const hit = res.matches.find((m) => m.via === 'normalized')
    expect(hit).toBeDefined()
    expect('that is b.o.g.u.s really'.slice(hit!.start, hit!.end)).toBe('b.o.g.u.s')
  })

  it('grades obfuscated hits as advisory only, so they never block', () => {
    const res = scanText('b.o.g.u.s', rules)
    expect(res.severity).toBeNull()
    expect(res.advisorySeverity).toBe('high')
    expect(isBlocking(res, 'message')).toBe(false)
  })

  it('does not fold short technical identifiers into matches', () => {
    // 4 → a makes C4 read as "ca". The four-character floor is what keeps a
    // research abstract usable. It does NOT save every identifier — H1N1 folds
    // to "hini", which is long enough to match a rule of that name — so the
    // real protection is that a normalized hit is advisory and cannot block.
    const short = [rule({ pattern: 'ca', severity: 'high' })]
    expect(scanText('samples of C4 collected', short).advisorySeverity).toBeNull()
  })

  it('maps ranges back across a lengthening fold', () => {
    const n = normalizeForMatching('Straße')
    expect(n.text).toBe('strasse')
    expect(n.endMap[n.endMap.length - 1]).toBe('Straße'.length)
  })

  it('leaves ordinary sentence punctuation alone', () => {
    expect(normalizeForMatching('Hi. Are you there?').text).toBe('hi. are you there?')
  })
})

describe('mergeRanges', () => {
  it('merges overlaps and keeps the worst severity', () => {
    const merged = mergeRanges([
      { start: 0, end: 5, severity: 'low', category: null, ruleId: 'a', via: 'raw' },
      { start: 3, end: 9, severity: 'high', category: null, ruleId: 'b', via: 'raw' },
      { start: 20, end: 24, severity: 'low', category: null, ruleId: 'c', via: 'raw' },
    ])
    expect(merged).toEqual([
      { start: 0, end: 9, severity: 'high' },
      { start: 20, end: 24, severity: 'low' },
    ])
  })
})

describe('category policy', () => {
  it('blocks abuse everywhere', () => {
    expect(blocksOn('hate_harassment', 'project')).toBe(true)
    expect(blocksOn('nsfw', 'message')).toBe(true)
  })

  it('lets a phone number through a form but not a private message', () => {
    // A phone-shaped string in a grant budget is a number. The same string in
    // a DM to a minor is the thing the filter exists for.
    expect(blocksOn('pii_leak', 'grant_application')).toBe(false)
    expect(blocksOn('pii_leak', 'message')).toBe(true)
    expect(blocksOn('spam_scam', 'venue_room_message')).toBe(true)
  })

  it('treats an uncategorised rule as blocking', () => {
    expect(blocksOn(null, 'project')).toBe(true)
  })

  it('does not block on a low-severity match', () => {
    const res = scanText('mild', [rule({ pattern: 'mild', severity: 'low' })])
    expect(res.severity).toBe('low')
    expect(isBlocking(res, 'project')).toBe(false)
  })
})
