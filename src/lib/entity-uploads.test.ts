import { describe, it, expect } from 'vitest'
import { normalizeStoragePaths } from './entity-uploads'

describe('normalizeStoragePaths', () => {
  it('keeps a plain list unchanged', () => {
    expect(normalizeStoragePaths(['a/b.pdf', 'a/c.docx'])).toEqual(['a/b.pdf', 'a/c.docx'])
  })

  it('drops nulls and undefined', () => {
    expect(normalizeStoragePaths(['a/b.pdf', null, undefined, 'a/c.pdf'])).toEqual([
      'a/b.pdf',
      'a/c.pdf',
    ])
  })

  it('drops empty and whitespace-only entries', () => {
    expect(normalizeStoragePaths(['', '   ', 'a/b.pdf'])).toEqual(['a/b.pdf'])
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeStoragePaths(['  a/b.pdf  '])).toEqual(['a/b.pdf'])
  })

  it('deduplicates, including after trimming', () => {
    expect(normalizeStoragePaths(['a/b.pdf', 'a/b.pdf', ' a/b.pdf'])).toEqual(['a/b.pdf'])
  })

  it('returns an empty array for an empty input', () => {
    expect(normalizeStoragePaths([])).toEqual([])
  })

  it('returns an empty array when everything is unusable', () => {
    expect(normalizeStoragePaths([null, undefined, '', '  '])).toEqual([])
  })

  // Paths are case-sensitive object keys; two casings are two different objects.
  it('does not fold case', () => {
    expect(normalizeStoragePaths(['a/B.pdf', 'a/b.pdf'])).toHaveLength(2)
  })

  it('ignores non-string values defensively', () => {
    expect(normalizeStoragePaths([42 as any, {} as any, 'a/b.pdf'])).toEqual(['a/b.pdf'])
  })
})
