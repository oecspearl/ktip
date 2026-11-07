import { describe, it, expect } from 'vitest'
import { createUtteranceDetector, pickMimeType, rms, transcribeError } from './whisper-speech-core'
import { captionEngine } from './speech'

describe('captionEngine', () => {
  it('prefers the browser, which is instant, free and unlimited', () => {
    expect(captionEngine(true, true)).toBe('browser')
  })

  it('falls back to Whisper only where the browser cannot caption', () => {
    expect(captionEngine(false, true)).toBe('whisper')
  })

  it('is null when neither is available', () => {
    expect(captionEngine(false, false)).toBeNull()
  })
})

describe('createUtteranceDetector', () => {
  const options = { threshold: 0.02, silenceMs: 900, minMs: 600, softMs: 4_500, gapMs: 250, maxMs: 12_000 }
  const run = (frames: Array<[number, number]>) => {
    const detector = createUtteranceDetector(options)
    return frames.map(([level, at]) => detector.feed(level, at)).filter(Boolean)
  }

  it('starts on voice and ends after a pause', () => {
    expect(run([[0.001, 0], [0.1, 100], [0.1, 1_000], [0.001, 1_500], [0.001, 2_000]])).toEqual([
      'start',
      'end',
    ])
  })

  it('cancels a click too short to be a phrase', () => {
    expect(run([[0.1, 0], [0.001, 100], [0.001, 1_100]])).toEqual(['start', 'cancel'])
  })

  it('cuts a monologue with no gaps at the hard limit, and keeps recording', () => {
    const frames: Array<[number, number]> = []
    for (let t = 0; t <= 13_000; t += 500) frames.push([0.1, t])
    expect(run(frames).slice(0, 2)).toEqual(['start', 'split'])
  })

  it('after a few seconds, cuts at the next short gap between words', () => {
    const frames: Array<[number, number]> = []
    // Voice for 5 s, then a 300 ms gap between words, then more voice.
    for (let t = 0; t <= 5_000; t += 50) frames.push([0.1, t])
    for (let t = 5_050; t <= 5_350; t += 50) frames.push([0.001, t])
    for (let t = 5_400; t <= 6_000; t += 50) frames.push([0.1, t])
    expect(run(frames)).toEqual(['start', 'split'])
  })

  it('does not cut at a short gap early in a phrase', () => {
    const frames: Array<[number, number]> = []
    for (let t = 0; t <= 2_000; t += 50) frames.push([0.1, t])
    for (let t = 2_050; t <= 2_350; t += 50) frames.push([0.001, t])
    for (let t = 2_400; t <= 3_000; t += 50) frames.push([0.1, t])
    expect(run(frames)).toEqual(['start'])
  })

  it('a cut right before the speaker stops sends nothing more', () => {
    const frames: Array<[number, number]> = []
    for (let t = 0; t <= 5_000; t += 50) frames.push([0.1, t])
    for (let t = 5_050; t <= 7_000; t += 50) frames.push([0.001, t])
    expect(run(frames)).toEqual(['start', 'split', 'cancel'])
  })

  it('learns the room noise, so a steady hum is not a phrase', () => {
    const detector = createUtteranceDetector(options)
    // The hum is above the base threshold. Nothing yet, then a long hum.
    for (let t = 0; t < 5_000; t += 50) detector.feed(0.025, t)
    // Raising the floor ends any phrase the hum started; later hum stays quiet.
    const events: string[] = []
    for (let t = 5_000; t < 8_000; t += 50) {
      const event = detector.feed(0.025, t)
      if (event) events.push(event)
    }
    expect(events.filter((e) => e === 'start').length).toBeLessThanOrEqual(1)
  })
})

describe('rms', () => {
  it('is the root mean square, zero for silence', () => {
    expect(rms([])).toBe(0)
    expect(rms([0, 0, 0])).toBe(0)
    expect(rms([0.5, -0.5])).toBeCloseTo(0.5)
  })
})

describe('pickMimeType', () => {
  it('prefers WebM Opus, then Ogg Opus (Firefox)', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickMimeType((t) => t.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus')
    expect(pickMimeType(() => false)).toBeNull()
  })
})

describe('transcribeError', () => {
  it('maps the route answers, and only some stop captions', () => {
    expect(transcribeError(429, 'busy')).toEqual({ code: 'speech-busy', fatal: false })
    expect(transcribeError(429, 'user_day_cap')).toEqual({ code: 'speech-user-day-cap', fatal: true })
    expect(transcribeError(429, 'day_cap')).toEqual({ code: 'speech-day-cap', fatal: true })
    expect(transcribeError(403)).toEqual({ code: 'speech-not-allowed', fatal: true })
    expect(transcribeError(503)).toEqual({ code: 'speech-unavailable', fatal: true })
    expect(transcribeError(502)).toEqual({ code: 'speech-error', fatal: false })
  })
})
