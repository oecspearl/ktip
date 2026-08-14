import { afterAll, describe, expect, it } from 'vitest'
import { i18n } from '@lingui/core'
import { generateMessageId } from '@lingui/message-utils/generateMessageId'
import { backupCodeSchema, otpCodeSchema } from '../validation'

const firstMessage = (result: ReturnType<typeof otpCodeSchema.safeParse>) =>
  result.success ? undefined : result.error.issues[0]?.message

describe('otpCodeSchema', () => {
  it('accepts exactly six digits', () => {
    expect(otpCodeSchema.safeParse('123456').success).toBe(true)
  })

  it('rejects a short code', () => {
    const result = otpCodeSchema.safeParse('12345')
    expect(result.success).toBe(false)
    expect(firstMessage(result)).toMatch(/6 digits/i)
  })

  it('rejects an empty code with its own message', () => {
    const result = otpCodeSchema.safeParse('')
    expect(result.success).toBe(false)
    expect(firstMessage(result)).toMatch(/enter the code/i)
  })

  it('ignores separators the mail client may have inserted', () => {
    expect(otpCodeSchema.safeParse('123 456').success).toBe(true)
  })
})

describe('backupCodeSchema', () => {
  it('accepts a formatted code', () => {
    expect(backupCodeSchema.safeParse('ABCDE-12345').success).toBe(true)
  })

  it('accepts it unformatted and lower-case — these are retyped from paper', () => {
    expect(backupCodeSchema.safeParse('abcde12345').success).toBe(true)
  })

  it('rejects the wrong length', () => {
    const result = backupCodeSchema.safeParse('ABCDE1234')
    expect(result.success).toBe(false)
    expect(firstMessage(result)).toMatch(/10 characters/i)
  })

  it('names the likely misreading when the code contains I, L, O or U', () => {
    const result = backupCodeSchema.safeParse('ABCDEI2345')
    expect(result.success).toBe(false)
    expect(firstMessage(result)).toMatch(/mistyped/i)
  })
})

describe('localisation of the schema messages', () => {
  const originalLocale = i18n.locale
  afterAll(() => {
    if (originalLocale) i18n.activate(originalLocale)
  })

  // The regression test for the trap documented at the top of validation.ts:
  // a message passed as a schema-BUILDER argument (`.length(6, '…')`) is
  // evaluated once at import time and is frozen in English forever. Putting the
  // check inside superRefine is what makes it resolve at parse time, in the
  // reader's language. This test fails the moment somebody "simplifies" it back.
  it('resolves at parse time, not at import time', () => {
    // Catalogs are keyed by a content hash, not by the source string — see the
    // note in lingui.config.ts about explicitIdAsDefault. Hard-coding the hash
    // here would rot the moment the copy is edited.
    const id = generateMessageId('The code is 6 digits')
    i18n.load('xx', { [id]: 'TRANSLATED_OTP' })
    i18n.activate('xx')

    expect(firstMessage(otpCodeSchema.safeParse('12345'))).toBe('TRANSLATED_OTP')
  })
})
