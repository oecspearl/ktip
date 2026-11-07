import { describe, it, expect } from 'vitest'
import { callLink, callRefusal, isCallId, parseVideoCallInfo } from './video-calls'

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6e7f8a9b0c'

describe('isCallId', () => {
  it('accepts a UUID and nothing else', () => {
    expect(isCallId(ID)).toBe(true)
    expect(isCallId(ID.toUpperCase())).toBe(true)
    expect(isCallId('ktip-swift-coral-12')).toBe(false)
    expect(isCallId('')).toBe(false)
    expect(isCallId(null)).toBe(false)
    expect(isCallId(undefined)).toBe(false)
  })
})

describe('callLink', () => {
  it('points at the video page with the call id', () => {
    expect(callLink('https://ktip.example', ID)).toBe(`https://ktip.example/collaborate/video?call=${ID}`)
  })

  it('does not double a trailing slash on the origin', () => {
    expect(callLink('https://ktip.example/', ID)).toBe(`https://ktip.example/collaborate/video?call=${ID}`)
  })
})

describe('parseVideoCallInfo', () => {
  it('reads what video_call_info() returns', () => {
    expect(
      parseVideoCallInfo({
        id: ID,
        title: 'Standup',
        host_name: 'Ana',
        is_host: true,
        locked: false,
        ended: false,
        created_at: '2026-11-06T12:00:00Z',
      })
    ).toEqual({
      id: ID,
      title: 'Standup',
      hostName: 'Ana',
      isHost: true,
      locked: false,
      ended: false,
      createdAt: '2026-11-06T12:00:00Z',
    })
  })

  it('treats missing or blank text as null and anything not true as false', () => {
    const info = parseVideoCallInfo({ id: ID, title: '  ', is_host: 'yes', locked: 1 })
    expect(info?.title).toBeNull()
    expect(info?.hostName).toBeNull()
    expect(info?.isHost).toBe(false)
    expect(info?.locked).toBe(false)
  })

  it('returns null for anything without a call id', () => {
    expect(parseVideoCallInfo(null)).toBeNull()
    expect(parseVideoCallInfo('x')).toBeNull()
    expect(parseVideoCallInfo({ id: 'nope' })).toBeNull()
  })
})

describe('callRefusal', () => {
  it('maps each message 202 raises to a reason', () => {
    const cases: Array<[string, ReturnType<typeof callRefusal>]> = [
      ['video calls are not open to student accounts', 'student'],
      ['your account is suspended', 'suspended'],
      ['call not found', 'not_found'],
      ['this call has ended', 'ended'],
      ['this call is locked', 'locked'],
      ['you have started too many calls today', 'too_many'],
      ['only the person who started this call can change it', 'not_host'],
      ['not authenticated', 'not_signed_in'],
      ['Unauthorized', 'not_signed_in'],
      ['Server configuration error', 'unknown'],
    ]
    for (const [message, reason] of cases) {
      expect(callRefusal(new Error(message)), message).toBe(reason)
    }
  })

  it('copes with a non-Error', () => {
    expect(callRefusal(undefined)).toBe('unknown')
    expect(callRefusal('this call has ended')).toBe('ended')
  })
})
