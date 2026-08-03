import { describe, it, expect } from 'vitest'
import { shouldTranslate, MAX_TRANSLATABLE } from './should-translate'

// The false positives are the expensive class: each one is a wasted provider
// call and, worse, a corrupted identifier rendered into the page. The false
// negatives below are the ones that would quietly leave the site half-English.

describe('shouldTranslate — rejects tokens that merely look like strings', () => {
  it.each([
    ['', 'empty'],
    [' ', 'whitespace'],
    ['a', 'single character'],
    ['7', 'single digit'],
    ['—', 'punctuation only'],
    ['🎉', 'emoji only'],
    ['🎉🎉🎉', 'emoji run'],
    ['1,234.56', 'formatted number'],
    ['$1,234.56', 'currency'],
    ['12:30', 'clock time'],
    ['2026-08-02', 'ISO date'],
    ['2026-08-02T14:30:00Z', 'ISO timestamp'],
    ['#0ea5e9', 'hex colour'],
    ['0ea5e9', 'bare hex'],
    ['b7f3c2a1-4d5e-4f6a-8b9c-0d1e2f3a4b5c', 'UUID'],
    ['https://oecsinnovation.org', 'absolute URL'],
    ['www.oecsinnovation.org', 'bare host'],
    ['mailto:admin@oecsinnovation.org', 'mailto'],
    ['/events/create', 'route path'],
    ['admin@oecsinnovation.org', 'email address'],
    ['@delon', 'handle'],
    ['#innovation', 'hashtag'],
    ['grant-application-wizard', 'kebab slug'],
    ['event_page_sections', 'snake slug'],
    ['profiles.display_name', 'dotted path'],
    ['KTIP', 'proper noun'],
    ['OECS', 'proper noun'],
    ['Virtual Campus', 'multi-word proper noun'],
    ['a=>b', 'arrow'],
    ['Record<string,string>', 'generic type'],
    ['{count}', 'bare interpolation slot'],
    ['```js', 'fence opener'],
  ])('rejects %j (%s)', (input) => {
    expect(shouldTranslate(input)).toBe(false)
  })

  // The code rule is deliberately narrow: a SINGLE token carrying code
  // punctuation. Widening it to "contains code punctuation anywhere" would take
  // "Note: press the <b>bold</b> button" and "Rate = amount / total" with it,
  // and those are copy. A stray line of spaced-out source therefore gets
  // translated — a few wasted characters, which is the cheaper side to err on.
  it('does not catch multi-word code, and that is the intended boundary', () => {
    expect(shouldTranslate('const x = 1;')).toBe(true)
  })

  it('rejects null and undefined without throwing', () => {
    expect(shouldTranslate(null)).toBe(false)
    expect(shouldTranslate(undefined)).toBe(false)
  })

  it('rejects a body longer than the cache column allows', () => {
    expect(shouldTranslate('a'.repeat(MAX_TRANSLATABLE + 1))).toBe(false)
    // …and accepts one exactly at the limit, so the boundary is not off by one
    // from the CHECK constraint on translations.source_text.
    expect(shouldTranslate('a'.repeat(MAX_TRANSLATABLE))).toBe(true)
  })
})

describe('shouldTranslate — accepts real copy', () => {
  it.each([
    'OK',
    'No',
    'Yes',
    'Save changes',
    'Close menu',
    'Hackathons, workshops, meetups and conferences',
    'Solar irrigation for smallholder farms',
    'Ministry of Education',
    'A stale session may be blocking sign-in. Clear it and try again.',
    'Password must be at least 6 characters',
    // A sentence containing a URL is still a sentence — only a bare URL is a token.
    'Read the terms at https://oecsinnovation.org/terms before continuing',
    // Contains a colon and digits but is unmistakably prose.
    'Note: 3 documents are still required',
  ])('accepts %j', (input) => {
    expect(shouldTranslate(input)).toBe(true)
  })

  it('trims before measuring, so padding never rescues a token', () => {
    expect(shouldTranslate('  KTIP  ')).toBe(false)
    expect(shouldTranslate('  Save changes  ')).toBe(true)
  })
})

describe('shouldTranslate — html format', () => {
  // The token rules would reject almost every HTML fragment: angle brackets trip
  // the code-punctuation rule on every single rich-text field.
  it('accepts markup that the text rules would reject', () => {
    expect(shouldTranslate('<p>Irrigation</p>', 'html')).toBe(true)
    expect(shouldTranslate('<p>Irrigation</p>', 'text')).toBe(false)
  })

  it('still rejects the universal cases', () => {
    expect(shouldTranslate('https://oecsinnovation.org', 'html')).toBe(false)
    expect(shouldTranslate('🎉', 'html')).toBe(false)
    expect(shouldTranslate('KTIP', 'html')).toBe(false)
  })
})
