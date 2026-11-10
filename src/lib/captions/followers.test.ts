import { describe, expect, it } from 'vitest'
import {
  audienceFor,
  decodeLangState,
  encodeLangState,
  isFollowChoice,
  shouldOffer,
  wantsSubtitles,
  type CallLangState,
} from './followers'

const person = (over: Partial<CallLangState>): CallLangState => ({
  speaks: 'en',
  reads: 'en',
  subs: false,
  paused: false,
  ...over,
})

describe('audienceFor', () => {
  it('is empty when nobody has subtitles on', () => {
    const a = audienceFor([person({ reads: 'fr' }), person({ reads: 'es' })], 'en', true)
    expect(a).toEqual({ total: 0, byLang: {}, targets: [] })
  })

  it('counts same-language readers but never translates into the speaker’s own language', () => {
    const a = audienceFor(
      [person({ reads: 'en', subs: true }), person({ reads: 'fr', subs: true }), person({ reads: 'fr', subs: true })],
      'en',
      true
    )
    expect(a.total).toBe(3)
    expect(a.byLang).toEqual({ en: 1, fr: 2 })
    expect(a.targets).toEqual(['fr'])
  })

  it('translates only into languages someone actually reads', () => {
    const a = audienceFor([person({ reads: 'es', subs: true })], 'fr', true)
    expect(a.targets).toEqual(['es'])
  })

  it('keeps transcribing but drops every target when the room has translation off', () => {
    const a = audienceFor([person({ reads: 'fr', subs: true })], 'en', false)
    expect(a.total).toBe(1)
    expect(a.targets).toEqual([])
  })
})

describe('shouldOffer', () => {
  const base = { choice: 'ask' as const, myLang: 'fr' as const, translationAllowed: true }

  it('offers when the speaker uses another language and I have not answered', () => {
    expect(shouldOffer({ ...base, speakerLang: 'en' })).toBe(true)
  })

  it('never offers for my own language', () => {
    expect(shouldOffer({ ...base, speakerLang: 'fr' })).toBe(false)
  })

  it('does not ask again once answered, either way', () => {
    for (const choice of ['captions', 'voice', 'off'] as const) {
      expect(shouldOffer({ ...base, choice, speakerLang: 'en' })).toBe(false)
    }
  })

  it('stays quiet in a room with translation off, or before the speaker’s language is known', () => {
    expect(shouldOffer({ ...base, speakerLang: 'en', translationAllowed: false })).toBe(false)
    expect(shouldOffer({ ...base, speakerLang: null })).toBe(false)
  })
})

describe('language messages', () => {
  it('round-trips', () => {
    const state = person({ speaks: 'fr', reads: 'es', subs: true, paused: true })
    expect(decodeLangState(encodeLangState(state))).toEqual(state)
  })

  it('rejects other versions, unknown languages and junk', () => {
    const enc = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
    expect(decodeLangState(enc({ v: 2, speaks: 'en', reads: 'en' }))).toBeNull()
    expect(decodeLangState(enc({ v: 1, speaks: 'de', reads: 'en' }))).toBeNull()
    expect(decodeLangState(new TextEncoder().encode('not json'))).toBeNull()
  })

  it('treats a missing flag as false', () => {
    const raw = new TextEncoder().encode(JSON.stringify({ v: 1, speaks: 'en', reads: 'fr' }))
    expect(decodeLangState(raw)).toEqual({ speaks: 'en', reads: 'fr', subs: false, paused: false })
  })
})

describe('choices', () => {
  it('turns subtitles on for either yes', () => {
    expect(wantsSubtitles('captions')).toBe(true)
    expect(wantsSubtitles('voice')).toBe(true)
    expect(wantsSubtitles('ask')).toBe(false)
    expect(wantsSubtitles('off')).toBe(false)
  })

  it('recognises only the four answers', () => {
    expect(isFollowChoice('voice')).toBe(true)
    expect(isFollowChoice('yes')).toBe(false)
  })
})

// Delon's case (2026-11-10): he speaks English with the site in English; a
// listener has the site in French. Nobody sets anything but the listener's
// answer to the offer.
describe('an English speaker and a French listener', () => {
  const listener = (choice: Parameters<typeof wantsSubtitles>[0]) =>
    person({ speaks: 'fr', reads: 'fr', subs: wantsSubtitles(choice) })

  it('offers the French listener the choice when the speaker starts talking', () => {
    expect(shouldOffer({ choice: 'ask', myLang: 'fr', speakerLang: 'en', translationAllowed: true })).toBe(true)
  })

  it('transcribes nothing while the listener has not answered or kept the original', () => {
    expect(audienceFor([listener('ask')], 'en', true).total).toBe(0)
    expect(audienceFor([listener('off')], 'en', true).total).toBe(0)
  })

  it('translates into French once the listener picks subtitles and voice', () => {
    const audience = audienceFor([listener('voice')], 'en', true)
    expect(audience.total).toBe(1)
    expect(audience.targets).toEqual(['fr'])
  })
})
