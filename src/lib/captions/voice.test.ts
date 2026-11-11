import { describe, expect, it } from 'vitest'
import { isSlowStart, isStale, pickVoice, pickVoiceFor, voiceGender, SLOW_START_MS, STALE_MS, type VoiceLike } from './voice'

const v = (name: string, lang: string, localService: boolean): VoiceLike => ({ name, lang, localService })

const voices = [
  v('Microsoft Hortense - French (France)', 'fr-FR', true),
  v('Microsoft Denise Online (Natural) - French (France)', 'fr-FR', false),
  v('Microsoft David - English (United States)', 'en-US', true),
  v('Google español', 'es-ES', false),
]

describe('pickVoiceFor', () => {
  const french = [
    v('Microsoft Hortense - French (France)', 'fr-FR', true),
    v('Microsoft Paul - French (France)', 'fr-FR', true),
    v('Microsoft Denise Online (Natural) - French (France)', 'fr-FR', false),
    v('Microsoft Henri Online (Natural) - French (France)', 'fr-FR', false),
  ]

  it('reads a man in a man voice and a woman in a woman voice', () => {
    expect(pickVoiceFor(french, 'fr', new Set(), 'man').voice?.name).toContain('Henri')
    expect(pickVoiceFor(french, 'fr', new Set(), 'man').pitch).toBe(1)
    expect(pickVoiceFor(french, 'fr', new Set(), 'woman').voice?.name).toContain('Denise')
  })

  it('pitches a minor a little higher in a voice of their gender', () => {
    const boy = pickVoiceFor(french, 'fr', new Set(), 'boy')
    expect(boy.voice?.name).toContain('Henri')
    expect(boy.pitch).toBeGreaterThan(1)
  })

  it('lowers the only voice when no man voice is installed', () => {
    const only = [v('Google français', 'fr-FR', false)]
    const man = pickVoiceFor(only, 'fr', new Set(), 'man')
    expect(man.voice?.name).toBe('Google français')
    expect(man.pitch).toBe(0.7)
    expect(pickVoiceFor(only, 'fr', new Set(), 'woman').pitch).toBe(1)
  })

  it('leaves the default alone for someone who has not said', () => {
    const plain = pickVoiceFor(french, 'fr', new Set(), undefined)
    expect(plain.voice?.name).toContain('Denise')
    expect(plain.pitch).toBe(1)
  })

  it('reads the gender off a voice name, women first', () => {
    expect(voiceGender('Google UK English Female')).toBe('woman')
    expect(voiceGender('Google UK English Male')).toBe('man')
    expect(voiceGender('Microsoft David - English (United States)')).toBe('man')
    expect(voiceGender('fr-fr-x-vlf-local')).toBeUndefined()
  })
})

describe('pickVoice', () => {
  it('prefers a free neural voice', () => {
    expect(pickVoice(voices, 'fr', new Set())?.name).toContain('Denise')
  })

  it('falls back to a local voice once the neural one has proved slow', () => {
    const slow = new Set(['Microsoft Denise Online (Natural) - French (France)'])
    expect(pickVoice(voices, 'fr', slow)?.name).toContain('Hortense')
  })

  it('takes whatever the browser has when there is no local voice', () => {
    expect(pickVoice(voices, 'es', new Set(['Google español']))?.name).toBe('Google español')
  })

  it('returns nothing for a language with no voice', () => {
    expect(pickVoice([voices[2]], 'fr', new Set())).toBeUndefined()
  })
})

describe('timing', () => {
  it('marks only network voices slow', () => {
    expect(isSlowStart(voices[1], SLOW_START_MS + 1)).toBe(true)
    expect(isSlowStart(voices[1], SLOW_START_MS)).toBe(false)
    expect(isSlowStart(voices[0], 5_000)).toBe(false)
  })

  it('drops lines that fell too far behind', () => {
    expect(isStale(0, STALE_MS + 1)).toBe(true)
    expect(isStale(0, STALE_MS)).toBe(false)
  })
})
