import { describe, expect, it } from 'vitest'
import { createCaptionChunker, DEFAULT_CHUNKER } from './chunker'
import { captionRuns } from './runs'
import { readVariants } from './caption-translate'

/** Feed a growing transcript, one word every `stepMs`, and collect what is sent. */
function speak(sentence: string, stepMs = 300) {
  const chunker = createCaptionChunker()
  const all = sentence.split(' ')
  const sent: string[] = []
  let now = 0
  for (let n = 1; n <= all.length; n++) {
    const piece = chunker.interim(all.slice(0, n).join(' '), now)
    if (piece) sent.push(piece)
    now += stepMs
  }
  const rest = chunker.final(sentence)
  return { sent, rest }
}

describe('createCaptionChunker', () => {
  it('sends settled words while the speaker is still talking', () => {
    const sentence =
      'so what we want to do next week is test the prototype with three farmers in Saint Lucia and then report back'
    const { sent, rest } = speak(sentence)
    expect(sent.length).toBeGreaterThan(1)
    // Nothing lost, nothing sent twice.
    expect([...sent, rest].join(' ')).toBe(sentence)
  })

  it('never sends the newest words, which the recogniser may still change', () => {
    const chunker = createCaptionChunker()
    let piece: string | null = null
    for (let t = 0; t <= 10_000; t += 500) piece = chunker.interim('one two three four five', t) ?? piece
    expect(piece).toBe('one two three')
  })

  it('waits for words to settle: a guess being rewritten is not sent', () => {
    const chunker = createCaptionChunker()
    // Every word changes on every update, so nothing ever settles.
    for (let t = 0; t < 6_000; t += 100) {
      const text = Array.from({ length: 12 }, (_, i) => `w${i}-${t}`).join(' ')
      expect(chunker.interim(text, t)).toBeNull()
    }
  })

  it('a short phrase goes out whole as the final, unsplit', () => {
    const { sent, rest } = speak('good morning everyone', 200)
    expect(sent).toEqual([])
    expect(rest).toBe('good morning everyone')
  })

  it('the final returns only the words not already sent', () => {
    const chunker = createCaptionChunker({ ...DEFAULT_CHUNKER, fullWords: 3 })
    chunker.interim('alpha beta gamma delta epsilon', 0)
    expect(chunker.interim('alpha beta gamma delta epsilon', 1_000)).toBe('alpha beta gamma')
    expect(chunker.unsent('alpha beta gamma delta epsilon zeta')).toBe('delta epsilon zeta')
    expect(chunker.final('alpha beta gamma delta epsilon zeta')).toBe('delta epsilon zeta')
    // And starts over for the next phrase.
    expect(chunker.unsent('new phrase')).toBe('new phrase')
  })

  it('copes with the recogniser shortening text it already sent', () => {
    const chunker = createCaptionChunker({ ...DEFAULT_CHUNKER, fullWords: 3 })
    chunker.interim('alpha beta gamma delta epsilon', 0)
    chunker.interim('alpha beta gamma delta epsilon', 1_000)
    expect(chunker.final('alpha beta')).toBe('')
  })
})

describe('captionRuns', () => {
  const piece = (id: string, name: string, at: number, lang = 'en') => ({ id, name, lang, at })

  it('joins consecutive pieces from one speaker into one line', () => {
    const runs = captionRuns([piece('a', 'Ana', 0), piece('b', 'Ana', 2_000), piece('c', 'Ben', 3_000)])
    expect(runs.map((run) => [run.key, run.pieces.map((p) => p.id)])).toEqual([
      ['a', ['a', 'b']],
      ['c', ['c']],
    ])
  })

  it('starts a new line after a pause, or when the language changes', () => {
    const runs = captionRuns([piece('a', 'Ana', 0), piece('b', 'Ana', 9_000), piece('c', 'Ana', 9_500, 'fr')])
    expect(runs).toHaveLength(3)
  })
})

describe('readVariants', () => {
  it('keeps only other UI languages with text', () => {
    expect(readVariants({ fr: ' bonjour ', es: '', de: 'hallo', en: 'hello' }, 'en')).toEqual({ fr: 'bonjour' })
    expect(readVariants(null, 'en')).toEqual({})
  })
})
