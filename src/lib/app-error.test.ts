import { describe, expect, it } from 'vitest'
import { AppError, SAFE_MESSAGES, isAppError, isErrorCode, safeMessageFor } from './app-error'

describe('safeMessageFor', () => {
  it('returns the registered constant for a known code', () => {
    expect(safeMessageFor('ROUTE_IMPORT_FAILED')).toBe(
      'ROUTE_IMPORT_FAILED: Application route bundle failed to load',
    )
  })

  it('redacts unknown codes and non-strings', () => {
    expect(safeMessageFor('NOT_A_CODE')).toBe('[redacted]')
    expect(safeMessageFor(undefined)).toBe('[redacted]')
    expect(safeMessageFor(42)).toBe('[redacted]')
  })

  it('never returns caller data, only registry constants', () => {
    const registered = Object.entries(SAFE_MESSAGES).map(([code, text]) => `${code}: ${text}`)
    for (const code of Object.keys(SAFE_MESSAGES)) {
      expect(registered).toContain(safeMessageFor(code))
    }
  })
})

describe('isErrorCode', () => {
  it('accepts registered codes only', () => {
    expect(isErrorCode('DATA_API_UNAVAILABLE')).toBe(true)
    expect(isErrorCode('toString')).toBe(false)
    expect(isErrorCode(null)).toBe(false)
  })
})

describe('AppError', () => {
  it('takes its message from the registry, not from the cause', () => {
    const cause = new Error('user@example.com failed to save proposal 41')
    const error = new AppError({
      code: 'COLLABORATION_SAVE_FAILED',
      area: 'collaboration',
      operation: 'save-changes',
      cause,
    })

    expect(error.message).toBe('COLLABORATION_SAVE_FAILED: Collaboration changes could not be saved')
    expect(error.message).not.toContain('user@example.com')
    expect(error.cause).toBe(cause)
    expect(isAppError(error)).toBe(true)
  })

  it('exposes only scrub-safe tags', () => {
    const error = new AppError({
      code: 'AUTH_SESSION_REFRESH_FAILED',
      area: 'authentication',
      operation: 'refresh-session',
    })

    expect(error.tags).toEqual({
      area: 'authentication',
      operation: 'refresh-session',
      error_code: 'AUTH_SESSION_REFRESH_FAILED',
    })
  })
})
