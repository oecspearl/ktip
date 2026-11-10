import { describe, expect, it } from 'vitest'
import { targetLanguages } from '../../../api/captions/translate'

describe('caption translation targets', () => {
  it('translates into every other language for an older client that names none', () => {
    expect(targetLanguages(undefined, 'en')).toEqual(['fr', 'es'])
  })

  it('keeps only the languages asked for', () => {
    expect(targetLanguages(['es'], 'en')).toEqual(['es'])
  })

  it('never translates into the speaker’s own language, or into one it does not know', () => {
    expect(targetLanguages(['en', 'de', 'fr'], 'en')).toEqual(['fr'])
  })

  it('translates nothing when the list is empty', () => {
    expect(targetLanguages([], 'fr')).toEqual([])
  })
})
