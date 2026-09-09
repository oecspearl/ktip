import { describe, expect, it } from 'vitest'
import {
  emailDomain,
  isFreeMailDomain,
  normaliseEmail,
  normaliseTrustedDomain,
  parseRosterInput,
} from './email-domain'

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  Jane.Doe@OECS.int ')).toBe('jane.doe@oecs.int')
  })
  it('rejects things that are not addresses', () => {
    expect(normaliseEmail('jane')).toBeNull()
    expect(normaliseEmail('jane@')).toBeNull()
    expect(normaliseEmail('jane@oecs')).toBeNull()
    expect(normaliseEmail('a b@oecs.int')).toBeNull()
  })
})

describe('emailDomain', () => {
  it('returns the lowercased domain part', () => {
    expect(emailDomain('Student@DSC.edu.dm')).toBe('dsc.edu.dm')
  })
  it('is null for an invalid address', () => {
    expect(emailDomain('nope')).toBeNull()
  })
})

describe('normaliseTrustedDomain', () => {
  it('accepts a bare domain, tolerating a leading @', () => {
    expect(normaliseTrustedDomain(' @OECS.int ')).toBe('oecs.int')
    expect(normaliseTrustedDomain('gov.lc')).toBe('gov.lc')
  })
  it('refuses free-mail providers, matching the database CHECK', () => {
    expect(normaliseTrustedDomain('gmail.com')).toBeNull()
    expect(normaliseTrustedDomain('Outlook.com')).toBeNull()
    expect(isFreeMailDomain('YAHOO.COM')).toBe(true)
  })
  it('refuses strings that are not domains', () => {
    expect(normaliseTrustedDomain('jane@oecs.int')).toBeNull()
    expect(normaliseTrustedDomain('oecs')).toBeNull()
    expect(normaliseTrustedDomain('')).toBeNull()
  })
})

describe('parseRosterInput', () => {
  it('splits on newlines, commas and semicolons and dedupes', () => {
    const { emails, skipped } = parseRosterInput(
      'a@dsc.edu.dm\nB@dsc.edu.dm, a@dsc.edu.dm; c@dsc.edu.dm'
    )
    expect(emails).toEqual(['a@dsc.edu.dm', 'b@dsc.edu.dm', 'c@dsc.edu.dm'])
    expect(skipped).toBe(0)
  })
  it('counts cells that are not addresses, and strips CSV quotes', () => {
    const { emails, skipped } = parseRosterInput('"a@dsc.edu.dm"\nJane Doe\n2024\n')
    expect(emails).toEqual(['a@dsc.edu.dm'])
    expect(skipped).toBe(2)
  })
})
