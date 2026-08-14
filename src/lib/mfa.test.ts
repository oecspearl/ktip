import { describe, expect, it } from 'vitest'
import {
  BACKUP_CODE_ALPHABET,
  backupCodesFileContents,
  formatBackupCode,
  formatSecret,
  isPlausibleBackupCode,
  normaliseBackupCode,
  qrCodeSrc,
  sanitiseOtp,
} from './mfa'

describe('qrCodeSrc', () => {
  // auth-js has returned both shapes across versions, and the enrolment screen
  // is unusable if we guess wrong — this is the whole reason the helper exists.
  it('prefixes a bare SVG document', () => {
    expect(qrCodeSrc('<svg viewBox="0 0 1 1"></svg>')).toBe(
      `data:image/svg+xml;utf-8,${encodeURIComponent('<svg viewBox="0 0 1 1"></svg>')}`,
    )
  })

  it('leaves an already-complete data URI alone', () => {
    const uri = 'data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E'
    expect(qrCodeSrc(uri)).toBe(uri)
  })

  it('returns null for nothing, so the caller renders a placeholder', () => {
    expect(qrCodeSrc(null)).toBeNull()
    expect(qrCodeSrc('   ')).toBeNull()
  })
})

describe('formatSecret', () => {
  it('groups in fours — an unbroken string gets transcribed wrong', () => {
    expect(formatSecret('abcdefghijklmnop')).toBe('ABCD EFGH IJKL MNOP')
  })

  it('handles a trailing partial group', () => {
    expect(formatSecret('ABCDE')).toBe('ABCD E')
  })

  it('is empty for nothing rather than throwing', () => {
    expect(formatSecret(undefined)).toBe('')
  })
})

describe('recovery codes', () => {
  it('excludes I, L, O and U from the alphabet', () => {
    // Crockford base32. Mirrors issue_mfa_backup_codes() in migration 118 — if
    // the two ever disagree, codes that cannot be typed start being issued.
    for (const char of ['I', 'L', 'O', 'U']) {
      expect(BACKUP_CODE_ALPHABET).not.toContain(char)
    }
    expect(BACKUP_CODE_ALPHABET).toHaveLength(32)
  })

  it('normalises the way the SQL side does', () => {
    expect(normaliseBackupCode('abcde-12345')).toBe('ABCDE12345')
    expect(normaliseBackupCode(' ab cd e123 45 ')).toBe('ABCDE12345')
  })

  it('formats with a separator at the halfway point', () => {
    expect(formatBackupCode('ABCDE12345')).toBe('ABCDE-12345')
  })

  it('leaves a wrong-length value unformatted rather than lying about it', () => {
    expect(formatBackupCode('ABC')).toBe('ABC')
  })

  it('rejects the wrong length and the letters we never issue', () => {
    expect(isPlausibleBackupCode('ABCDE-12345')).toBe(true)
    expect(isPlausibleBackupCode('ABCDE1234')).toBe(false)
    // A misread 1 as I, which is exactly what the alphabet is chosen to prevent.
    expect(isPlausibleBackupCode('ABCDEI2345')).toBe(false)
  })
})

describe('sanitiseOtp', () => {
  it('keeps digits only and caps at the length', () => {
    expect(sanitiseOtp('Your code is 123 456')).toBe('123456')
    expect(sanitiseOtp('1234567')).toBe('123456')
  })

  it('honours a custom length', () => {
    expect(sanitiseOtp('12345678', 8)).toBe('12345678')
  })
})

describe('backupCodesFileContents', () => {
  it('writes every code in display form', () => {
    const contents = backupCodesFileContents(['ABCDE12345', 'FGHJK67890'], 'a@example.com')
    expect(contents).toContain('ABCDE-12345')
    expect(contents).toContain('FGHJK-67890')
    expect(contents).toContain('a@example.com')
  })

  it('omits the account line when there is no address', () => {
    expect(backupCodesFileContents(['ABCDE12345'])).not.toContain('Account:')
  })
})
