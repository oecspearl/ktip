import { describe, it, expect } from 'vitest'
import {
  cn,
  truncate,
  getInitials,
  isValidEmail,
  formatCurrency,
  parseHashtags,
  escapeIlike,
  sanitizeHTML,
} from './utils'

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

describe('sanitizeHTML', () => {
  it('escapes angle brackets', () => {
    expect(sanitizeHTML('<script>alert("xss")</script>')).not.toContain('<script>')
  })

  it('escapes quotes', () => {
    expect(sanitizeHTML('"hello"')).toBe('&quot;hello&quot;')
  })

  it('leaves plain text unchanged', () => {
    expect(sanitizeHTML('hello world')).toBe('hello world')
  })
})
