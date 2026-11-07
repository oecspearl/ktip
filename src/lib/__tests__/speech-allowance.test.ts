import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DAY_REQUESTS,
  DEFAULT_DAY_SECONDS,
  USER_DAY_SECONDS,
  billedSeconds,
  limitFromEnv,
  speechAllowanceVerdict,
  tokenSubject,
  whisperText,
} from '../../../api/_lib/speech-allowance'

const allowance = (over: Partial<Record<string, unknown>> = {}) => ({
  suspended: false,
  can_caption: true,
  user_day_seconds: 0,
  day_seconds: 0,
  day_requests: 0,
  ...over,
})

describe('speechAllowanceVerdict', () => {
  it('stops short of Groq free Whisper day: 7 of 8 hours, 1,800 of 2,000 requests', () => {
    expect(DEFAULT_DAY_SECONDS).toBe(25_200)
    expect(DEFAULT_DAY_REQUESTS).toBe(1_800)
    expect(USER_DAY_SECONDS).toBe(3_600)
  })

  it('allows a phrase under every cap', () => {
    expect(speechAllowanceVerdict(allowance())).toBe('ok')
  })

  it('refuses suspended members and people outside the room first', () => {
    expect(speechAllowanceVerdict(allowance({ suspended: true, can_caption: false }))).toBe('suspended')
    expect(speechAllowanceVerdict(allowance({ can_caption: false }))).toBe('not_in_room')
  })

  it('stops everyone at the organisation day caps', () => {
    expect(speechAllowanceVerdict(allowance({ day_seconds: 25_200 }))).toBe('day_cap')
    expect(speechAllowanceVerdict(allowance({ day_requests: 1_800 }))).toBe('day_cap')
  })

  it('stops one person at an hour a day', () => {
    expect(speechAllowanceVerdict(allowance({ user_day_seconds: 3_600 }))).toBe('user_day_cap')
  })

  it('honours raised caps from the env', () => {
    expect(
      speechAllowanceVerdict(allowance({ day_seconds: 30_000, day_requests: 1_900 }), {
        daySeconds: '50000',
        dayRequests: '5000',
      })
    ).toBe('ok')
  })

  it('refuses when the answer is missing or malformed', () => {
    expect(speechAllowanceVerdict(null)).toBe('day_cap')
    expect(speechAllowanceVerdict(allowance({ day_seconds: 'x' }))).toBe('day_cap')
  })
})

describe('limitFromEnv', () => {
  it('takes a positive number and ignores anything else', () => {
    expect(limitFromEnv('42', 7)).toBe(42)
    expect(limitFromEnv('0', 7)).toBe(7)
    expect(limitFromEnv('lots', 7)).toBe(7)
    expect(limitFromEnv(undefined, 7)).toBe(7)
  })
})

describe('billedSeconds', () => {
  it('bills at least ten seconds, as Groq does, and rounds up', () => {
    expect(billedSeconds(2.3)).toBe(10)
    expect(billedSeconds(11.2)).toBe(12)
    expect(billedSeconds(undefined)).toBe(10)
  })
})

describe('whisperText', () => {
  it('drops segments Whisper itself thinks were not speech', () => {
    expect(
      whisperText({
        text: 'ignored',
        segments: [
          { text: ' Good morning, team. ', no_speech_prob: 0.02 },
          { text: ' Thank you.', no_speech_prob: 0.91 },
        ],
      })
    ).toBe('Good morning, team.')
  })

  it('falls back to the plain text without segments', () => {
    expect(whisperText({ text: ' Bonjour ' })).toBe('Bonjour')
    expect(whisperText({})).toBe('')
  })
})

describe('tokenSubject', () => {
  const token = (claims: unknown) =>
    `Bearer x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`
  const id = '0b7a6f2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'

  it('reads the sub claim without verifying it', () => {
    expect(tokenSubject(token({ sub: id }))).toBe(id)
  })

  it('is null for anything that is not a token with a UUID subject', () => {
    expect(tokenSubject(null)).toBeNull()
    expect(tokenSubject('Bearer nonsense')).toBeNull()
    expect(tokenSubject(token({ sub: 'not-a-uuid' }))).toBeNull()
    expect(tokenSubject('Bearer x.%%%.sig')).toBeNull()
  })
})
