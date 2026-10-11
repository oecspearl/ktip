import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalize, parseVoiceCommand } from '../core/voice/grammar'
import { accessibleName, matchByLabel } from '../core/voice/targets'
import { acquireMic, listen, micHolder } from '../core/speech/recognizer'

const routes = [
  { path: '/', label: 'Home' },
  { path: '/projects', label: 'Projects' },
  { path: '/events', label: 'Events' },
  { path: '/grants', label: 'Funding', voice: ['grants', 'funding opportunities'] },
  { path: '/forums', label: 'Forums' },
]
const routesFr = [
  { path: '/projects', label: 'Projets' },
  { path: '/events', label: 'Événements' },
  { path: '/grants', label: 'Financement' },
]
const routesEs = [
  { path: '/projects', label: 'Proyectos' },
  { path: '/events', label: 'Eventos' },
  { path: '/grants', label: 'Financiación' },
]
const en = (s: string, numbersVisible = false) => parseVoiceCommand(s, 'en', { routes, numbersVisible })

describe('normalize', () => {
  it('drops case, accents and punctuation', () => {
    expect(normalize('  Événements, s’il vous plaît!  ')).toBe("evenements s'il vous plait")
  })
})

describe('English commands', () => {
  it('navigates by page name, synonyms and near misses', () => {
    expect(en('go to events')).toMatchObject({ kind: 'navigate', path: '/events' })
    expect(en('take me to the grants')).toMatchObject({ kind: 'navigate', path: '/grants' })
    expect(en('Projects page please')).toMatchObject({ kind: 'navigate', path: '/projects' })
    expect(en('forums')).toMatchObject({ kind: 'navigate', path: '/forums' })
    expect(en('go to forum')).toMatchObject({ kind: 'navigate', path: '/forums' })
    expect(en('go to evnets')).toMatchObject({ kind: 'navigate', path: '/events' })
  })

  it('opens a page when it names one, else clicks', () => {
    expect(en('open projects')).toMatchObject({ kind: 'navigate', path: '/projects' })
    expect(en('open the filters')).toEqual({ kind: 'click', label: 'filters' })
  })

  it('reads fixed commands', () => {
    expect(en('scroll down')).toEqual({ kind: 'scroll', dir: 'down' })
    expect(en('go to top')).toEqual({ kind: 'scroll', dir: 'top' })
    expect(en('go back')).toEqual({ kind: 'back' })
    expect(en('read this page')).toEqual({ kind: 'read', what: 'page' })
    expect(en('read selection')).toEqual({ kind: 'read', what: 'selection' })
    expect(en('stop reading')).toEqual({ kind: 'stop' })
    expect(en('make text bigger')).toEqual({ kind: 'textSize', dir: 'up' })
    expect(en('next heading')).toEqual({ kind: 'heading', dir: 'next' })
    expect(en('what can I say')).toEqual({ kind: 'help' })
    expect(en('stop listening')).toEqual({ kind: 'sleep' })
    expect(en('accessibility settings')).toEqual({ kind: 'panel' })
  })

  it('handles search, click and numbers', () => {
    expect(en('search for climate mentors')).toEqual({ kind: 'search', query: 'climate mentors' })
    expect(en('click sign up')).toEqual({ kind: 'click', label: 'sign up' })
    expect(en('show numbers')).toEqual({ kind: 'numbers', show: true })
    expect(en('click 7')).toEqual({ kind: 'clickNumber', n: 7 })
    expect(en('click seven')).toEqual({ kind: 'clickNumber', n: 7 })
  })

  it('takes a bare number only while numbers are showing', () => {
    expect(en('seven')).toBeNull()
    expect(en('seven', true)).toEqual({ kind: 'clickNumber', n: 7 })
    expect(en('12', true)).toEqual({ kind: 'clickNumber', n: 12 })
  })

  it('returns null for chatter', () => {
    expect(en('the weather is nice today')).toBeNull()
    expect(en('')).toBeNull()
  })
})

describe('French commands', () => {
  const fr = (s: string, v = false) => parseVoiceCommand(s, 'fr', { routes: routesFr, numbersVisible: v })
  it('works with or without accents', () => {
    expect(fr('aller aux événements')).toMatchObject({ kind: 'navigate', path: '/events' })
    expect(fr('va a evenements')).toMatchObject({ kind: 'navigate', path: '/events' })
    expect(fr('ouvre projets')).toMatchObject({ kind: 'navigate', path: '/projects' })
    expect(fr('défiler vers le bas')).toEqual({ kind: 'scroll', dir: 'down' })
    expect(fr('lire la page')).toEqual({ kind: 'read', what: 'page' })
    expect(fr('arrête')).toEqual({ kind: 'stop' })
    expect(fr('rechercher mentors')).toEqual({ kind: 'search', query: 'mentors' })
    expect(fr('clique sur inscription')).toEqual({ kind: 'click', label: 'inscription' })
    expect(fr('afficher les numéros')).toEqual({ kind: 'numbers', show: true })
    expect(fr('numéro trois')).toEqual({ kind: 'clickNumber', n: 3 })
    expect(fr('dix sept', true)).toEqual({ kind: 'clickNumber', n: 17 })
    expect(fr("s'il te plaît retour")).toEqual({ kind: 'back' })
  })
})

describe('Spanish commands', () => {
  const es = (s: string, v = false) => parseVoiceCommand(s, 'es-419', { routes: routesEs, numbersVisible: v })
  it('works with regional tags and accents', () => {
    expect(es('ir a eventos')).toMatchObject({ kind: 'navigate', path: '/events' })
    expect(es('abre financiacion')).toMatchObject({ kind: 'navigate', path: '/grants' })
    expect(es('bajar')).toEqual({ kind: 'scroll', dir: 'down' })
    expect(es('leer la página')).toEqual({ kind: 'read', what: 'page' })
    expect(es('para')).toEqual({ kind: 'stop' })
    expect(es('buscar mentores')).toEqual({ kind: 'search', query: 'mentores' })
    expect(es('haz clic en registrarse')).toEqual({ kind: 'click', label: 'registrarse' })
    expect(es('clic en cinco')).toEqual({ kind: 'clickNumber', n: 5 })
    expect(es('texto más grande por favor')).toEqual({ kind: 'textSize', dir: 'up' })
  })
})

describe('targets', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })
  it('names elements the way a screen reader would', () => {
    document.body.innerHTML = `
      <button aria-label="Close dialog">×</button>
      <label for="q">Search projects</label><input id="q">
      <a href="/x"><img alt="KTIP home"></a>
      <button>Sign up</button>
      <button>Sign up for events</button>`
    const [close, , input, link, a, b] = Array.from(document.body.querySelectorAll('button, label, input, a'))
    expect(accessibleName(close)).toBe('Close dialog')
    expect(accessibleName(input)).toBe('Search projects')
    expect(accessibleName(link)).toBe('KTIP home')
    const buttons = [a, b] as HTMLElement[]
    // Exact beats starts-with, so "sign up" picks one, not both
    expect(matchByLabel('sign up', buttons)).toEqual([a])
    expect(matchByLabel('sign', buttons)).toEqual([a, b])
  })
})

describe('microphone lock', () => {
  it('gives the mic to the higher priority and tells the one it displaced', () => {
    const preempted = vi.fn()
    const releaseVoice = acquireMic('voice', 0, preempted)
    expect(releaseVoice).not.toBeNull()
    expect(acquireMic('other', 0)).toBeNull()
    const releaseCaptions = acquireMic('captions', 10)
    expect(preempted).toHaveBeenCalledTimes(1)
    expect(micHolder()).toBe('captions')
    expect(acquireMic('voice', 0)).toBeNull()
    releaseVoice!() // a stale release must not free the captions' hold
    expect(micHolder()).toBe('captions')
    releaseCaptions!()
    expect(micHolder()).toBeNull()
  })
})

describe('listen', () => {
  it('reports final text, and restarts continuous sessions the engine ends', () => {
    vi.useFakeTimers()
    const made: FakeRecognition[] = []
    class FakeRecognition extends EventTarget {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      started = 0
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      constructor() {
        super()
        made.push(this)
      }
      start() {
        this.started++
      }
      stop() {
        this.onend?.()
      }
      abort() {}
    }
    const texts: [string, boolean][] = []
    const ended = vi.fn()
    const l = listen(
      { lang: 'en', continuous: true, onText: (t, f) => texts.push([t, f]), onEnd: ended },
      FakeRecognition as never
    )!
    made[0].onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: ' go to events ' } } } })
    expect(texts).toEqual([['go to events', true]])
    made[0].onend?.() // the engine stopping itself after silence
    vi.advanceTimersByTime(300)
    expect(made).toHaveLength(2)
    expect(ended).not.toHaveBeenCalled()
    l.stop()
    expect(ended).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
