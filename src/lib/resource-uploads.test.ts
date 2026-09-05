import { describe, it, expect } from 'vitest'
import { buildResourceStoragePath, normalizeResourcePaths } from './resource-uploads'

describe('buildResourceStoragePath', () => {
  const authorId = '11111111-2222-3333-4444-555555555555'

  it('puts the author id in the first segment', () => {
    // Migration 135's storage policies test (storage.foldername(name))[1]
    // against auth.uid(), so this is not cosmetic — get it wrong and every
    // upload is refused.
    const path = buildResourceStoragePath({ authorId, fileName: 'guide.pdf' })
    expect(path.split('/')[0]).toBe(authorId)
  })

  it('keeps the extension so the bucket MIME check still passes', () => {
    const path = buildResourceStoragePath({ authorId, fileName: 'guide.pdf' })
    expect(path.endsWith('.pdf')).toBe(true)
  })

  it('replaces characters that are awkward in an object key', () => {
    const path = buildResourceStoragePath({
      authorId,
      fileName: 'OECS Report (final) #2.pdf',
    })
    const name = path.split('/')[1]
    expect(name).toMatch(/^\d+_OECS_Report__final___2\.pdf$/)
  })

  it('does not let a crafted name climb out of the author folder', () => {
    // Dots survive (an extension needs them) — separators do not. Traversal
    // needs a slash, so the property that matters is that the key still has
    // exactly two segments and the second one contains no path separator.
    const path = buildResourceStoragePath({ authorId, fileName: '../../etc/passwd' })
    const segments = path.split('/')
    expect(segments).toHaveLength(2)
    expect(segments[0]).toBe(authorId)
    expect(segments[1]).not.toMatch(/[/\\]/)
  })

  it('caps a very long name at 120 characters', () => {
    const path = buildResourceStoragePath({ authorId, fileName: `${'a'.repeat(400)}.pdf` })
    expect(path.split('/')[1].split('_').slice(1).join('_')).toHaveLength(120)
  })

  it('gives two uploads of the same name different keys', async () => {
    const first = buildResourceStoragePath({ authorId, fileName: 'guide.pdf' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = buildResourceStoragePath({ authorId, fileName: 'guide.pdf' })
    expect(first).not.toBe(second)
  })
})

describe('normalizeResourcePaths', () => {
  it('keeps a plain list unchanged', () => {
    expect(normalizeResourcePaths(['a/b.pdf', 'a/c.docx'])).toEqual(['a/b.pdf', 'a/c.docx'])
  })

  it('drops nulls, undefined and blanks', () => {
    expect(normalizeResourcePaths(['a/b.pdf', null, undefined, '', '  '])).toEqual(['a/b.pdf'])
  })

  it('trims and deduplicates', () => {
    expect(normalizeResourcePaths(['a/b.pdf', ' a/b.pdf ', 'a/b.pdf'])).toEqual(['a/b.pdf'])
  })

  it('returns an empty array for an empty input', () => {
    expect(normalizeResourcePaths([])).toEqual([])
  })
})
