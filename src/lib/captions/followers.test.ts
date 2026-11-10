import { describe, expect, it } from 'vitest'
import {
  NO_CAPTION_GRACE_MS,
  UNTRANSLATED_GRACE_MS,
  talkingWithoutCaptions,
  audienceFor,
  awaitsTranslation,
  captionStatus,
  subtitleNotice,
  decodeLangState,
  encodeLangState,
  followsSpeaker,
  isForeignMode,
  originalVolume,
  shouldNotice,
  showsLine,
  wantsAnySubtitles,
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

  it('counts another language by default but my own only when reading along', () => {
    const a = audienceFor(
      [
        person({ reads: 'fr', foreign: 'voice', along: false }),
        person({ reads: 'en', foreign: 'voice', along: false }),
        person({ reads: 'en', foreign: 'original', along: true }),
        person({ reads: 'es', foreign: 'original', along: false }),
      ],
      'en',
      true
    )
    expect(a.total).toBe(2)
    expect(a.byLang).toEqual({ fr: 1, en: 1 })
    expect(a.targets).toEqual(['fr'])
  })

  it('keeps transcribing but drops every target when the room has translation off', () => {
    const a = audienceFor([person({ reads: 'fr', subs: true })], 'en', false)
    expect(a.total).toBe(1)
    expect(a.targets).toEqual([])
  })
})

describe('shouldNotice', () => {
  const base = { foreign: 'voice' as const, myLang: 'fr' as const, translationAllowed: true }

  it('tells me when someone in another language is being translated for me', () => {
    expect(shouldNotice({ ...base, speakerLang: 'en' })).toBe(true)
    expect(shouldNotice({ ...base, foreign: 'subtitles', speakerLang: 'en' })).toBe(true)
  })

  it('says nothing for my own language, for the original, or with translation off', () => {
    expect(shouldNotice({ ...base, speakerLang: 'fr' })).toBe(false)
    expect(shouldNotice({ ...base, foreign: 'original', speakerLang: 'en' })).toBe(false)
    expect(shouldNotice({ ...base, speakerLang: 'en', translationAllowed: false })).toBe(false)
    expect(shouldNotice({ ...base, speakerLang: null })).toBe(false)
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

  it('round-trips the listening mode, and drops read-along without it', () => {
    const state = person({ foreign: 'subtitles', along: true })
    expect(decodeLangState(encodeLangState(state))).toEqual(state)
    const raw = new TextEncoder().encode(JSON.stringify({ v: 1, speaks: 'en', reads: 'fr', along: true, foreign: 'loud' }))
    expect(decodeLangState(raw)).toEqual({ speaks: 'en', reads: 'fr', subs: false, paused: false })
  })

  it('treats a missing flag as false', () => {
    const raw = new TextEncoder().encode(JSON.stringify({ v: 1, speaks: 'en', reads: 'fr' }))
    expect(decodeLangState(raw)).toEqual({ speaks: 'en', reads: 'fr', subs: false, paused: false })
  })

  it('carries the caption status, and drops one it does not know without failing the message', () => {
    const state = person({ cap: 'muted' })
    expect(decodeLangState(encodeLangState(state))).toEqual(state)
    const raw = new TextEncoder().encode(JSON.stringify({ v: 1, speaks: 'en', reads: 'fr', cap: 'singing' }))
    const decoded = decodeLangState(raw)
    expect(decoded).not.toBeNull()
    expect(decoded && 'cap' in decoded).toBe(false)
  })
})

describe('captionStatus', () => {
  const base = { canPublish: true, followed: true, paused: false, micOn: true, supported: true, running: true, failed: false }

  it('is live while transcribing for a follower', () => {
    expect(captionStatus(base)).toBe('live')
  })

  it('says muted when followed with the microphone off', () => {
    expect(captionStatus({ ...base, micOn: false, running: false })).toBe('muted')
  })

  it('says cannot for a browser that cannot transcribe, or a recogniser that gave up', () => {
    expect(captionStatus({ ...base, supported: false, running: false })).toBe('cannot')
    expect(captionStatus({ ...base, failed: true, running: false })).toBe('cannot')
  })

  it('reports a pause even before anyone follows', () => {
    expect(captionStatus({ ...base, followed: false, paused: true })).toBe('paused')
  })

  it('says nothing when nobody follows, for a listen-only member, or while starting', () => {
    expect(captionStatus({ ...base, followed: false })).toBeUndefined()
    expect(captionStatus({ ...base, canPublish: false })).toBeUndefined()
    expect(captionStatus({ ...base, running: false })).toBeUndefined()
  })
})

describe('subtitleNotice', () => {
  const p = (name: string, cap: CallLangState['cap'], speaking = false) => ({ name, cap, speaking })

  it('names a speaker who is talking but cannot be subtitled, even over video', () => {
    expect(subtitleNotice([p('Ana', 'live'), p('Kemar', 'cannot', true)], false)).toEqual({ kind: 'cannot', name: 'Kemar' })
    expect(subtitleNotice([p('Kemar', 'paused', true)], false)).toEqual({ kind: 'paused', name: 'Kemar' })
  })

  it('keeps the video clear of everything else', () => {
    expect(subtitleNotice([p('Delon', 'muted')], false)).toBeNull()
    expect(subtitleNotice([p('Delon', 'live')], false)).toBeNull()
  })

  it('in a band, waits while anyone is live', () => {
    expect(subtitleNotice([p('Delon', 'live'), p('Ana', 'muted')], true)).toEqual({ kind: 'waiting' })
  })

  it('in a band, says whose microphone is off', () => {
    expect(subtitleNotice([p('Delon', 'muted')], true)).toEqual({ kind: 'muted', name: 'Delon' })
    expect(subtitleNotice([p('Delon', 'muted'), p('Ana', 'muted')], true)).toEqual({ kind: 'all-muted' })
  })

  it('says nothing about people who have not reported a status', () => {
    expect(subtitleNotice([p('Delon', undefined, true)], true)).toBeNull()
  })
})

describe('modes', () => {
  it('wants subtitles for anything but the original, or when reading along', () => {
    expect(wantsAnySubtitles('voice', false)).toBe(true)
    expect(wantsAnySubtitles('subtitles', false)).toBe(true)
    expect(wantsAnySubtitles('original', false)).toBe(false)
    expect(wantsAnySubtitles('original', true)).toBe(true)
  })

  it('recognises only the three modes', () => {
    expect(isForeignMode('voice')).toBe(true)
    expect(isForeignMode('ask')).toBe(false)
  })

  it('shows my own language only when reading along, and another one unless I chose the original', () => {
    expect(showsLine('fr', 'fr', 'voice', false)).toBe(false)
    expect(showsLine('fr', 'fr', 'original', true)).toBe(true)
    expect(showsLine('en', 'fr', 'voice', false)).toBe(true)
    expect(showsLine('en', 'fr', 'original', true)).toBe(false)
  })
})

// Delon's case (2026-11-10): an English speaker, a French listener, nobody
// sets anything. The listener gets French subtitles and a French voice, and
// never the English, unless they ask for it.
describe('an English speaker and a French listener', () => {
  const fresh = person({ speaks: 'fr', reads: 'fr', subs: true, foreign: 'voice', along: false })

  it('translates into French from the start, with no question asked', () => {
    const audience = audienceFor([fresh], 'en', true)
    expect(audience.total).toBe(1)
    expect(audience.targets).toEqual(['fr'])
  })

  it('stops when the listener chooses the original', () => {
    expect(audienceFor([{ ...fresh, subs: false, foreign: 'original' }], 'en', true).total).toBe(0)
  })

  it('mutes the English for the listener while the speaker is being transcribed', () => {
    expect(
      originalVolume({ foreign: 'voice', translationAllowed: true, reads: 'fr', theirSpeaks: 'en', theirCap: 'live', untranslated: false })
    ).toEqual({ volume: 0, reason: 'translated' })
  })
})

describe('followsSpeaker', () => {
  it('follows another language by default, and my own only when reading along', () => {
    const fr = person({ reads: 'fr', speaks: 'fr', foreign: 'voice', along: false })
    expect(followsSpeaker(fr, 'en')).toBe(true)
    expect(followsSpeaker(fr, 'fr')).toBe(false)
    expect(followsSpeaker({ ...fr, along: true }, 'fr')).toBe(true)
  })

  it('follows an older client on its subs flag alone', () => {
    expect(followsSpeaker(person({ reads: 'en', subs: true }), 'en')).toBe(true)
    expect(followsSpeaker(person({ reads: 'fr', subs: false }), 'en')).toBe(false)
  })
})

describe('originalVolume', () => {
  const base = {
    foreign: 'voice' as const,
    translationAllowed: true,
    reads: 'fr' as const,
    theirSpeaks: 'en' as const,
    theirCap: 'live' as const,
    untranslated: false,
  }

  it('mutes only when every link works', () => {
    expect(originalVolume(base).volume).toBe(0)
  })

  it('plays their own voice for my language, an unknown one, or when I asked for it', () => {
    expect(originalVolume({ ...base, theirSpeaks: 'fr' })).toEqual({ volume: 1, reason: 'same-language' })
    expect(originalVolume({ ...base, theirSpeaks: undefined })).toEqual({ volume: 1, reason: 'unknown-language' })
    expect(originalVolume({ ...base, foreign: 'original' })).toEqual({ volume: 1, reason: 'wants-original' })
    expect(originalVolume({ ...base, foreign: 'subtitles' })).toEqual({ volume: 1, reason: 'subtitles-only' })
  })

  it('gives their voice back whenever translation cannot reach me', () => {
    expect(originalVolume({ ...base, translationAllowed: false }).reason).toBe('room-off')
    for (const cap of ['muted', 'paused', 'cannot', undefined] as const) {
      expect(originalVolume({ ...base, theirCap: cap })).toEqual({ volume: 1, reason: 'not-transcribed' })
    }
    expect(originalVolume({ ...base, untranslated: true })).toEqual({ volume: 1, reason: 'untranslated' })
  })
})

describe('talkingWithoutCaptions', () => {
  it('gives up on a recogniser that says it runs but sends nothing', () => {
    expect(talkingWithoutCaptions(1_000, undefined, 1_000 + NO_CAPTION_GRACE_MS - 1)).toBe(false)
    expect(talkingWithoutCaptions(1_000, undefined, 1_000 + NO_CAPTION_GRACE_MS + 1)).toBe(true)
    expect(talkingWithoutCaptions(1_000, 500, 1_000 + NO_CAPTION_GRACE_MS + 1)).toBe(true)
  })

  it('is satisfied by any line since they started, and by nobody talking', () => {
    expect(talkingWithoutCaptions(1_000, 1_000, 1_000 + NO_CAPTION_GRACE_MS * 2)).toBe(false)
    expect(talkingWithoutCaptions(undefined, undefined, 1_000_000)).toBe(false)
  })

  it('outranks an overdue translation in the reason it gives', () => {
    expect(
      originalVolume({
        foreign: 'voice',
        translationAllowed: true,
        reads: 'fr',
        theirSpeaks: 'en',
        theirCap: 'live',
        untranslated: true,
        noCaptions: true,
      })
    ).toEqual({ volume: 1, reason: 'no-captions' })
  })
})

describe('awaitsTranslation', () => {
  const line = { lang: 'en' as const, at: 1_000, translated: false, plain: false }

  it('is overdue once a line in another language waits past the grace period', () => {
    expect(awaitsTranslation(line, 'fr', 1_000 + UNTRANSLATED_GRACE_MS - 1)).toBe(false)
    expect(awaitsTranslation(line, 'fr', 1_000 + UNTRANSLATED_GRACE_MS + 1)).toBe(true)
  })

  it('never waits on my language, a translated line, a line kept plain, or no line', () => {
    const late = 1_000 + UNTRANSLATED_GRACE_MS * 2
    expect(awaitsTranslation(line, 'en', late)).toBe(false)
    expect(awaitsTranslation({ ...line, translated: true }, 'fr', late)).toBe(false)
    expect(awaitsTranslation({ ...line, plain: true }, 'fr', late)).toBe(false)
    expect(awaitsTranslation(undefined, 'fr', late)).toBe(false)
  })
})
