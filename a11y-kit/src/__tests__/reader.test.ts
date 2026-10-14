import { afterEach, describe, expect, it } from 'vitest'
import { chunkText, pickVoice, scoreVoice, toSpokenText } from '../core/speech/voices'
import { blockText, collectReadableBlocks } from '../core/reader/blocks'
import { createReader } from '../core/reader/engine'

const voice = (name: string, lang: string, isDefault = false) => ({
  name,
  lang,
  default: isDefault,
  voiceURI: `${name}|${lang}`,
  localService: true,
})

describe('voices', () => {
  const installed = [
    voice('Microsoft David', 'en-US', true),
    voice('Microsoft Sonia Online (Natural)', 'en-GB'),
    voice('Google français', 'fr-FR'),
    voice('Microsoft Pablo', 'es-ES'),
    voice('Google español de Estados Unidos', 'es-US'),
  ]

  it('never offers a voice in another language', () => {
    expect(scoreVoice(installed[2], 'en')).toBe(-Infinity)
    expect(pickVoice(installed, 'de')).toBeNull()
  })

  it('prefers the natural and cloud voices, and the regional variant', () => {
    expect(pickVoice(installed, 'en')?.name).toBe('Microsoft Sonia Online (Natural)')
    expect(pickVoice(installed, 'fr')?.name).toBe('Google français')
    expect(pickVoice(installed, 'es')?.lang).toBe('es-US')
  })

  it("respects the member's own choice when it speaks the language", () => {
    expect(pickVoice(installed, 'en', 'Microsoft David|en-US')?.name).toBe('Microsoft David')
    expect(pickVoice(installed, 'en', 'Google français|fr-FR')?.name).toBe('Microsoft Sonia Online (Natural)')
  })

  it('cleans text written for the eye', () => {
    expect(toSpokenText('• One\n• Two — and three')).toBe('One. Two, and three')
  })

  it('splits long text at sentences, and long sentences at commas', () => {
    const long = 'First sentence here. ' + 'Second, with a clause, '.repeat(20) + 'end.'
    const chunks = chunkText(long, 'en', 120)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every((c) => c.length <= 120)).toBe(true)
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long.trim().replace(/\s+/g, ' '))
  })
})

describe('blocks', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reads the innermost blocks in order and skips hidden and nav content', () => {
    document.body.innerHTML = `
      <main>
        <nav><p>Menu</p></nav>
        <h1>Title</h1>
        <ul><li><p>Item one</p></li><li>Item two</li></ul>
        <p aria-hidden="true">Decoration</p>
        <p>Photo <img alt="a beach at sunset"> here <span class="sr-only">screen reader only</span></p>
        <p>Photo a beach at sunset here</p>
        <p>Later</p>
      </main>`
    const blocks = collectReadableBlocks(document.querySelector('main'), () => true)
    // The repeat straight after its twin is dropped (a visible caption and its
    // copy, say); text that recurs later is read again
    expect(blocks.map(blockText)).toEqual(['Title', 'Item one', 'Item two', 'Photo a beach at sunset here', 'Later'])
  })
})

describe('reader engine', () => {
  function fakeSynth(voices: ReturnType<typeof voice>[] = [voice('Google UK English', 'en-GB')]) {
    const spoken: { text: string; u: { onend: (() => void) | null } }[] = []
    let cancels = 0
    class Utterance {
      text: string
      voice: unknown = null
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: ((e: { error: string }) => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    }
    const synth = {
      speak: (u: Utterance) => spoken.push({ text: u.text, u }),
      cancel: () => void cancels++,
      getVoices: () => voices,
    }
    return { synth, Utterance, spoken, cancels: () => cancels }
  }

  function setup(html = '<main><p>One.</p><p>Two.</p><p>Three.</p></main>', voices?: ReturnType<typeof voice>[]) {
    document.body.innerHTML = html
    document.documentElement.lang = 'en'
    const f = fakeSynth(voices)
    const reader = createReader({
      root: () => document.querySelector('main'),
      rate: () => 1,
      voiceURI: () => undefined,
      reducedMotion: () => true,
      visible: () => true,
      synth: f.synth as never,
      Utterance: f.Utterance as never,
    })
    return { reader, ...f }
  }
  const end = (f: { spoken: { u: { onend: (() => void) | null } }[] }) => f.spoken[f.spoken.length - 1].u.onend?.()

  it('reads block after block, then stops', () => {
    const f = setup()
    f.reader.readPage()
    expect(f.reader.getState()).toMatchObject({ status: 'playing', index: 0, total: 3 })
    end(f)
    end(f)
    expect(f.spoken.map((s) => s.text)).toEqual(['One.', 'Two.', 'Three.'])
    end(f)
    expect(f.reader.getState().status).toBe('idle')
  })

  it('pauses and resumes in place, and ignores the cancelled utterance ending', () => {
    const f = setup()
    f.reader.readPage()
    end(f)
    const second = f.spoken[1].u
    f.reader.pause()
    expect(f.reader.getState().status).toBe('paused')
    second.onend?.() // fires after cancel in real browsers; must not advance
    expect(f.reader.getState().index).toBe(1)
    f.reader.resume()
    expect(f.spoken[f.spoken.length - 1].text).toBe('Two.')
  })

  it('skips forward and back', () => {
    const f = setup()
    f.reader.readPage()
    f.reader.next()
    f.reader.next()
    expect(f.reader.getState().index).toBe(2)
    f.reader.prev()
    expect(f.reader.getState().index).toBe(1)
  })

  it('says so when no voice speaks the language, instead of reading it in English', () => {
    const f = setup('<main><p lang="fr">Bonjour.</p></main>')
    f.reader.readPage()
    expect(f.spoken).toHaveLength(0)
    expect(f.reader.getState()).toMatchObject({ status: 'idle', problem: 'no-voice', lang: 'fr' })
  })

  it('reports an empty page', () => {
    const f = setup('<main></main>')
    f.reader.readPage()
    expect(f.reader.getState().problem).toBe('empty')
  })
})
