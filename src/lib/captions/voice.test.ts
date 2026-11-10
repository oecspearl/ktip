import { describe, expect, it } from 'vitest'
import { isSlowStart, isStale, pickVoice, SLOW_START_MS, STALE_MS, type VoiceLike } from './voice'

const v = (name: string, lang: string, localService: boolean): VoiceLike => ({ name, lang, localService })

const voices = [
  v('Microsoft Hortense - French (France)', 'fr-FR', true),
  v('Microsoft Denise Online (Natural) - French (France)', 'fr-FR', false),
  v('Microsoft David - English (United States)', 'en-US', true),
  v('Google español', 'es-ES', false),
]

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
