import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cn,
  truncate,
  getInitials,
  isValidEmail,
  formatCurrency,
  parseHashtags,
  escapeIlike,
  copyToClipboard,
} from './utils'

describe('copyToClipboard', () => {
  const original = navigator.clipboard
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true })
    vi.restoreAllMocks()
  })

  it('uses the Clipboard API when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await expect(copyToClipboard('https://example.test/e')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.test/e')
  })

  it('falls back to the copy command when the Clipboard API refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    await expect(copyToClipboard('x')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when there is no Clipboard API at all', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const exec = vi.fn().mockReturnValue(false)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(copyToClipboard('x')).resolves.toBe(false)
  })
})

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('deduplicates tailwind classes', () => {
    expect(cn('text-red-500', 'text-ktip-ocean-500')).toBe('text-ktip-ocean-500')
  })

  // Without extendTailwindMerge these all emit BOTH classes and CSS source
  // order picks the winner, so a component's `className` override silently
  // stops working. Each case names a token namespace added to @theme.
  it.each([
    ['text-sm text-body', 'text-body'],
    ['text-body text-caption', 'text-caption'],
    ['text-2xl text-display', 'text-display'],
    ['p-6 p-card-pad', 'p-card-pad'],
    ['gap-2 gap-card-gap', 'gap-card-gap'],
    ['size-4 size-icon-md', 'size-icon-md'],
    ['min-h-40 min-h-tile-min', 'min-h-tile-min'],
    ['rounded-xl rounded-surface', 'rounded-surface'],
    ['max-w-4xl max-w-page', 'max-w-page'],
    ['z-50 z-modal', 'z-modal'],
    ['z-modal z-toast', 'z-toast'],
  ])('resolves %s to %s', (input, expected) => {
    expect(cn(input)).toBe(expected)
  })

  it('still distinguishes a text size from a text colour', () => {
    // The failure mode this guards: tailwind-merge treating `text-body` as a
    // colour would make it cancel the colour instead of the size.
    expect(cn('text-body', 'text-ktip-ocean-500')).toBe('text-body text-ktip-ocean-500')
  })
})

describe('truncate', () => {
  it('returns text unchanged if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates and adds ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })
})

describe('getInitials', () => {
  it('returns first letters of each word', () => {
    expect(getInitials('John Doe')).toBe('JD')
  })

  it('limits to 2 characters', () => {
    expect(getInitials('John Michael Doe')).toBe('JM')
  })

  it('handles single name', () => {
    expect(getInitials('John')).toBe('J')
  })

  it('returns uppercase', () => {
    expect(getInitials('john doe')).toBe('JD')
  })
})

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co')).toBe(true)
  })

  it('rejects invalid emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('@domain.com')).toBe(false)
    expect(isValidEmail('user@')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00')
  })

  it('formats other currencies', () => {
    expect(formatCurrency(1000, 'EUR')).toContain('1,000.00')
  })

  it('handles decimals', () => {
    expect(formatCurrency(99.5)).toBe('$99.50')
  })
})

describe('parseHashtags', () => {
  it('extracts hashtags from text', () => {
    expect(parseHashtags('Hello #world #test')).toEqual(['world', 'test'])
  })

  it('returns empty array when no hashtags', () => {
    expect(parseHashtags('no hashtags here')).toEqual([])
  })

  it('handles text with only hashtags', () => {
    expect(parseHashtags('#one #two')).toEqual(['one', 'two'])
  })
})

describe('escapeIlike', () => {
  it('escapes percent signs', () => {
    expect(escapeIlike('100%')).toBe('100\\%')
  })

  it('escapes underscores', () => {
    expect(escapeIlike('my_var')).toBe('my\\_var')
  })

  it('escapes backslashes', () => {
    expect(escapeIlike('path\\to')).toBe('path\\\\to')
  })

  it('removes dangerous characters', () => {
    expect(escapeIlike('test()')).toBe('test')
  })

  it('passes through normal text', () => {
    expect(escapeIlike('hello world')).toBe('hello world')
  })
})
