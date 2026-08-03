import { describe, it, expect } from 'vitest'
import { normalize, contentHash, localKey } from './hash'

// Built rather than typed. A literal NFD sequence is indistinguishable from its
// NFC twin in every editor and diff, so a pasted literal would make the very
// assertions that matter here silently vacuous.
const COMBINING_ACUTE = String.fromCharCode(0x0301)
const NBSP = String.fromCharCode(0x00a0)
const NFD_CAFE = 'cafe' + COMBINING_ACUTE
const NFC_CAFE = 'caf' + String.fromCharCode(0x00e9)

// These digests are the contract between the browser and api/translate.ts. If a
// change to normalize() moves any of them, every row already in the shared cache
// becomes unreachable and every visitor pays the provider again — so a failure
// here is a migration, not a test to update.

describe('normalize', () => {
  it('is idempotent', () => {
    const cases = [
      'Save changes',
      '  padded  ',
      'tabs\tand   spaces',
      'crlf\r\nline',
      NFD_CAFE,
      '<p>markup   spaced</p>',
    ]
    for (const c of cases) {
      for (const format of ['text', 'html'] as const) {
        expect(normalize(normalize(c, format), format)).toBe(normalize(c, format))
      }
    }
  })

  it('folds NFD onto NFC, so the same word from two keyboards is one cache row', () => {
    expect(NFD_CAFE).not.toBe(NFC_CAFE) // the premise: different bytes to start with
    expect(normalize(NFD_CAFE)).toBe(normalize(NFC_CAFE))
    expect(normalize(NFD_CAFE)).toBe(NFC_CAFE)
  })

  it('normalises CRLF and CR to LF', () => {
    expect(normalize('a\r\nb')).toBe(normalize('a\nb'))
    expect(normalize('a\rb')).toBe(normalize('a\nb'))
  })

  it('collapses horizontal whitespace in text but not in html', () => {
    expect(normalize('a    b', 'text')).toBe('a b')
    expect(normalize('a\t\tb', 'text')).toBe('a b')
    // Significant inside <pre>, and collapsing would change the bytes sent anyway.
    expect(normalize('<pre>a    b</pre>', 'html')).toBe('<pre>a    b</pre>')
  })

  it('trims in both formats', () => {
    expect(normalize('  hello  ', 'text')).toBe('hello')
    expect(normalize('\n<p>hi</p>\n', 'html')).toBe('<p>hi</p>')
  })

  it('does not collapse newlines — paragraph structure is meaning', () => {
    expect(normalize('a\n\nb')).toBe('a\n\nb')
  })

  it('leaves a non-breaking space alone', () => {
    // NBSP is not ASCII whitespace and is not collapsed, so French typography
    // (the narrow space before ':' and '?') survives into the cache key.
    const withNbsp = 'Enregistrer' + NBSP + ':'
    expect(normalize(withNbsp)).toBe(withNbsp)
  })
})

describe('contentHash', () => {
  it('is a lowercase 64-char hex digest', async () => {
    const h = await contentHash('Save changes')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('agrees across every input that normalize() calls equal', async () => {
    const pairs: [string, string][] = [
      ['Save changes', '  Save changes  '],
      ['a    b', 'a b'],
      [NFD_CAFE, NFC_CAFE],
      ['line\r\nbreak', 'line\nbreak'],
    ]
    for (const [a, b] of pairs) {
      expect(await contentHash(a)).toBe(await contentHash(b))
    }
  })

  it('separates text from html for identical bytes', async () => {
    const same = '<p>hello</p>'
    expect(await contentHash(same, 'text')).not.toBe(await contentHash(same, 'html'))
  })

  it('cannot be spoofed by a source string that starts with the format tag', async () => {
    // The U+001F separator is what makes this true: without it, hashing
    // "html" + "x" and "text" + ... could be made to collide by crafting input.
    expect(await contentHash('htmlx', 'text')).not.toBe(await contentHash('x', 'html'))
  })

  it('handles the awkward inputs without throwing', async () => {
    const inputs = ['🎉 party', 'ünïcödé', '한국어', 'a'.repeat(20_000), '<pre>  x  </pre>']
    for (const i of inputs) {
      await expect(contentHash(i)).resolves.toMatch(/^[0-9a-f]{64}$/)
      await expect(contentHash(i, 'html')).resolves.toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

describe('localKey', () => {
  it('is stable, synchronous, and namespaced by language and format', () => {
    expect(localKey('Save changes', 'text', 'fr')).toBe(localKey('Save changes', 'text', 'fr'))
    expect(localKey('Save changes', 'text', 'fr')).not.toBe(localKey('Save changes', 'text', 'es'))
    expect(localKey('Save changes', 'text', 'fr')).not.toBe(localKey('Save changes', 'html', 'fr'))
  })

  it('normalises first, so a padded string hits the same local entry', () => {
    expect(localKey('  Save changes  ', 'text', 'fr')).toBe(localKey('Save changes', 'text', 'fr'))
  })

  it('carries the length, so a collision has to match on two axes', () => {
    expect(localKey('Save changes', 'text', 'fr').endsWith(':12')).toBe(true)
  })
})
