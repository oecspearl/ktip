import { describe, it, expect } from 'vitest'
import { lintPattern } from './lint'

describe('lintPattern — terms', () => {
  it('accepts an ordinary word', () => {
    expect(lintPattern('bogus', 'term').ok).toBe(true)
  })

  it('accepts a word with interior punctuation', () => {
    expect(lintPattern('batty boy', 'term').ok).toBe(true)
    expect(lintPattern('e.g', 'term').ok).toBe(true)
  })

  it('refuses a term wrapped in punctuation, which could never match', () => {
    // Postgres wraps terms in \m…\M, so a term whose first or last character is
    // not a word character is a rule that fires nowhere — silently.
    expect(lintPattern('!bad', 'term').ok).toBe(false)
    expect(lintPattern('c++', 'term').ok).toBe(false)
  })

  it('refuses an empty pattern', () => {
    expect(lintPattern('   ', 'term').ok).toBe(false)
  })
})

describe('lintPattern — regex', () => {
  it('accepts the patterns 065 already seeds', () => {
    expect(lintPattern('(\\+?\\d[\\d\\s().-]{7,}\\d)', 'regex').ok).toBe(true)
    expect(lintPattern('([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})', 'regex').ok).toBe(true)
  })

  it('refuses a nested quantifier before it can ever run', () => {
    // (a+)+b is the classic exponential shape. Caught statically rather than
    // by the timing check, because the adversarial sample is only 2KB and a
    // real composer holds far more.
    expect(lintPattern('(a+)+b', 'regex').ok).toBe(false)
    expect(lintPattern('(?:x*)*y', 'regex').ok).toBe(false)
  })

  it('refuses syntax the browser cannot run', () => {
    const result = lintPattern('[[:alpha:]]+', 'regex')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/browser can run/)
  })

  it('refuses an outright invalid expression', () => {
    expect(lintPattern('(unclosed', 'regex').ok).toBe(false)
  })
})
