import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserSpeechFailure, createSpeechRecognizer, speechLocale } from './speech'

describe('speechLocale', () => {
  it('turns a bare language into a full tag, which Edge needs', () => {
    expect(speechLocale('en', [])).toBe('en-US')
    expect(speechLocale('fr', [])).toBe('fr-FR')
    expect(speechLocale('es', [])).toBe('es-ES')
  })

  it("prefers the browser's own regional variant", () => {
    expect(speechLocale('en', ['fr-FR', 'en-GB', 'en'])).toBe('en-GB')
    expect(speechLocale('fr', ['fr-CA'])).toBe('fr-CA')
  })

  it('keeps a tag that already has a region, and falls back to English when empty', () => {
    expect(speechLocale('en-TT', ['en-GB'])).toBe('en-TT')
    expect(speechLocale('', [])).toBe('en-US')
  })
})

describe('browserSpeechFailure', () => {
  it('treats a network error before anything was heard as an unreachable service', () => {
    expect(browserSpeechFailure('network', false, 1)).toBe('unreachable')
  })

  it('treats one network error after captions worked as a blip', () => {
    expect(browserSpeechFailure('network', true, 1)).toBe('transient')
    expect(browserSpeechFailure('network', true, 2)).toBe('transient')
  })

  it('gives up after three network errors in a row', () => {
    expect(browserSpeechFailure('network', true, 3)).toBe('unreachable')
  })

  it('sends microphone problems to their own message', () => {
    expect(browserSpeechFailure('not-allowed', false, 0)).toBe('no-mic')
    expect(browserSpeechFailure('audio-capture', true, 0)).toBe('no-mic')
  })

  it('treats a service the browser refuses as unreachable', () => {
    expect(browserSpeechFailure('service-not-allowed', false, 0)).toBe('unreachable')
    expect(browserSpeechFailure('language-not-supported', true, 0)).toBe('unreachable')
  })
})

class FakeRecognition {
  static instances: FakeRecognition[] = []
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  starts = 0
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null
  constructor() {
    FakeRecognition.instances.push(this)
  }
  start() {
    this.starts++
  }
  stop() {}
  abort() {}
}

const result = (text: string) => ({
  resultIndex: 0,
  results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text } } },
})

describe('createSpeechRecognizer', () => {
  beforeEach(() => {
    FakeRecognition.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('hands the recogniser a full language tag', () => {
    vi.stubGlobal('navigator', { languages: [] })
    createSpeechRecognizer({ lang: 'fr', onSegment: () => {} }).start()
    expect(FakeRecognition.instances[0].lang).toBe('fr-FR')
  })

  it('stops for good when the speech service is out of reach, instead of retrying', () => {
    const onError = vi.fn()
    const recognizer = createSpeechRecognizer({ lang: 'en', onSegment: () => {}, onError })
    recognizer.start()
    const rec = FakeRecognition.instances[0]

    rec.onerror?.({ error: 'network' })
    rec.onend?.()
    vi.advanceTimersByTime(1_000)

    expect(onError).toHaveBeenCalledWith('network', 'unreachable')
    expect(rec.starts).toBe(1)
    expect(recognizer.isRunning()).toBe(false)
  })

  it('restarts after a network blip once captions have worked', () => {
    const onError = vi.fn()
    const onSegment = vi.fn()
    const recognizer = createSpeechRecognizer({ lang: 'en', onSegment, onError })
    recognizer.start()
    const rec = FakeRecognition.instances[0]

    rec.onresult?.(result('hello'))
    rec.onerror?.({ error: 'network' })
    rec.onend?.()
    vi.advanceTimersByTime(1_000)

    expect(onSegment).toHaveBeenCalledWith({ text: 'hello', final: true })
    expect(onError).toHaveBeenCalledWith('network', 'transient')
    expect(rec.starts).toBe(2)
    expect(recognizer.isRunning()).toBe(true)
  })

  it('still ignores the routine silence and abort errors', () => {
    const onError = vi.fn()
    const recognizer = createSpeechRecognizer({ lang: 'en', onSegment: () => {}, onError })
    recognizer.start()
    const rec = FakeRecognition.instances[0]

    rec.onerror?.({ error: 'no-speech' })
    rec.onend?.()
    vi.advanceTimersByTime(1_000)

    expect(onError).not.toHaveBeenCalled()
    expect(rec.starts).toBe(2)
  })
})
