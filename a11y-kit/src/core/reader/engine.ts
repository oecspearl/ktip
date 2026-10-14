import { BASE_RATE } from '../speech/speak'
import { chunkText, pickVoice, resolveSpeechLang, toSpokenText } from '../speech/voices'
import { blockText, collectReadableBlocks } from './blocks'

export type ReaderStatus = 'idle' | 'playing' | 'paused'
export type ReaderProblem = 'unsupported' | 'no-voice' | 'empty'

export interface ReaderState {
  status: ReaderStatus
  /** Zero-based block being read */
  index: number
  total: number
  problem: ReaderProblem | null
  /** Language of the block that had no voice, for the message */
  lang: string
}

interface Item {
  el: HTMLElement | null
  text: string
  lang: string
}

export interface ReaderOptions {
  root: () => ParentNode | null
  rate: () => number
  voiceURI: (lang: string) => string | undefined
  reducedMotion: () => boolean
  visible?: (el: Element) => boolean
  /** Injected in tests */
  synth?: Pick<SpeechSynthesis, 'speak' | 'cancel' | 'getVoices'>
  Utterance?: typeof SpeechSynthesisUtterance
}

export interface PageReader {
  getState(): ReaderState
  subscribe(listener: () => void): () => void
  readPage(): void
  /** Start from the block that holds el */
  readFrom(el: Element): void
  readText(text: string, lang?: string): void
  toggle(): void
  pause(): void
  resume(): void
  next(): void
  prev(): void
  stop(): void
}

const HIGHLIGHT = 'a11y-reading'

/** The block being read is highlighted with the CSS Highlight API where it exists, else an attribute. */
function highlight(el: HTMLElement | null) {
  const registry = (globalThis.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (r: Range) => unknown }).Highlight
  document.querySelectorAll('[data-a11y-reading]').forEach((n) => n.removeAttribute('data-a11y-reading'))
  registry?.delete(HIGHLIGHT)
  if (!el) return
  if (registry && HighlightCtor) {
    const range = document.createRange()
    range.selectNodeContents(el)
    registry.set(HIGHLIGHT, new HighlightCtor(range))
  } else {
    el.setAttribute('data-a11y-reading', '')
  }
}

/**
 * Reads the page aloud block by block, highlighting as it goes.
 *
 * Pausing cancels and remembers the place rather than calling
 * speechSynthesis.pause(), which Chrome on Android ignores and which leaves
 * Chrome on desktop stuck after a while. Every utterance carries a token, so
 * the end event of one that was cancelled can never advance the reader.
 */
export function createReader(opts: ReaderOptions): PageReader {
  const synth = opts.synth ?? window.speechSynthesis
  const Utterance = opts.Utterance ?? SpeechSynthesisUtterance
  let state: ReaderState = { status: 'idle', index: 0, total: 0, problem: null, lang: '' }
  let items: Item[] = []
  let chunks: string[] = []
  let chunkAt = 0
  let token = 0
  const listeners = new Set<() => void>()

  const set = (patch: Partial<ReaderState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  const collect = (): Item[] =>
    collectReadableBlocks(opts.root(), opts.visible).map((el) => ({ el, text: blockText(el), lang: resolveSpeechLang(el) }))

  const finish = () => {
    token++
    highlight(null)
    chunkAt = 0
    set({ status: 'idle', index: 0 })
  }

  const show = (el: HTMLElement | null) => {
    highlight(el)
    if (!el) return
    const box = el.getBoundingClientRect()
    if (box.top < 80 || box.bottom > window.innerHeight - 80) {
      el.scrollIntoView?.({ block: 'center', behavior: opts.reducedMotion() ? 'auto' : 'smooth' })
    }
  }

  const speakCurrent = () => {
    const item = items[state.index]
    if (!item) return finish()
    if (chunkAt === 0) {
      chunks = chunkText(toSpokenText(item.text), item.lang)
      show(item.el)
    }
    const voices = synth.getVoices()
    const voice = pickVoice(voices, item.lang, opts.voiceURI(item.lang))
    // No voice for this language. Reading French in an English voice is
    // worse than saying so. (An empty list means voices are still loading:
    // the browser's default for the language is the best available then.)
    if (!voice && voices.length > 0) {
      finish()
      set({ problem: 'no-voice', lang: item.lang })
      return
    }
    const mine = ++token
    const u = new Utterance(chunks[chunkAt] ?? '')
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? item.lang
    u.rate = BASE_RATE * opts.rate()
    u.onend = () => {
      if (mine !== token) return
      chunkAt++
      if (chunkAt < chunks.length) return speakCurrent()
      chunkAt = 0
      if (state.index + 1 >= items.length) return finish()
      set({ index: state.index + 1 })
      speakCurrent()
    }
    u.onerror = (e) => {
      if (mine !== token || e.error === 'interrupted' || e.error === 'canceled') return
      finish()
    }
    synth.speak(u)
  }

  const start = (index: number) => {
    token++
    synth.cancel()
    chunkAt = 0
    if (!items.length) {
      finish()
      set({ problem: 'empty' })
      return
    }
    set({ status: 'playing', index: Math.max(0, Math.min(index, items.length - 1)), total: items.length, problem: null })
    speakCurrent()
  }

  const reader: PageReader = {
    getState: () => state,
    subscribe(l) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    readPage() {
      items = collect()
      start(0)
    },
    readFrom(el) {
      items = collect()
      const i = items.findIndex((it) => it.el === el || (it.el && (it.el.contains(el) || el.contains(it.el))))
      start(i < 0 ? 0 : i)
    },
    readText(text, lang) {
      items = [{ el: null, text, lang: lang ?? document.documentElement.lang ?? 'en' }]
      start(0)
    },
    toggle() {
      if (state.status === 'playing') reader.pause()
      else if (state.status === 'paused') reader.resume()
      else reader.readPage()
    },
    pause() {
      if (state.status !== 'playing') return
      token++
      synth.cancel()
      set({ status: 'paused' })
    },
    resume() {
      if (state.status !== 'paused') return
      set({ status: 'playing' })
      speakCurrent()
    },
    next() {
      if (state.status !== 'idle' && state.index + 1 < items.length) start(state.index + 1)
    },
    prev() {
      if (state.status !== 'idle') start(state.index - 1)
    },
    stop() {
      synth.cancel()
      finish()
    },
  }
  return reader
}
