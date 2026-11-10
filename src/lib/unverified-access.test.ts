import { describe, expect, it } from 'vitest'
import {
  allowsUnverified,
  blocksUnverified,
  UNVERIFIED_NO,
  UNVERIFIED_OK,
  unverifiedRule,
} from './unverified-access'

describe('unverifiedRule', () => {
  it('is undefined when no route says anything', () => {
    expect(unverifiedRule([])).toBeUndefined()
    expect(unverifiedRule([{}, { handle: undefined }, { handle: { other: 1 } }])).toBeUndefined()
  })

  it('lets the deepest marked match decide', () => {
    expect(unverifiedRule([{ handle: UNVERIFIED_OK }, { handle: UNVERIFIED_NO }])).toBe(false)
    expect(unverifiedRule([{ handle: UNVERIFIED_NO }, { handle: UNVERIFIED_OK }])).toBe(true)
  })

  it('inherits from a marked parent when the leaf is silent', () => {
    expect(unverifiedRule([{ handle: UNVERIFIED_OK }, {}])).toBe(true)
  })
})

describe('allowsUnverified (members-only routes, default deny)', () => {
  it('denies an unmarked route', () => {
    expect(allowsUnverified([{}, {}])).toBe(false)
  })
  it('allows a marked route', () => {
    expect(allowsUnverified([{}, { handle: UNVERIFIED_OK }])).toBe(true)
  })
  it('denies a route marked closed', () => {
    expect(allowsUnverified([{ handle: UNVERIFIED_NO }])).toBe(false)
  })
})

describe('blocksUnverified (public routes, default allow)', () => {
  it('does not block an unmarked route', () => {
    expect(blocksUnverified([{}, {}])).toBe(false)
  })
  it('blocks a route marked closed', () => {
    expect(blocksUnverified([{}, { handle: UNVERIFIED_NO }])).toBe(true)
  })
  it('does not block a route marked open', () => {
    expect(blocksUnverified([{ handle: UNVERIFIED_OK }])).toBe(false)
  })
})
