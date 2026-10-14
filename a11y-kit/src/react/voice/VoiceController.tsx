import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { announce } from '../../core/announce'
import { openAccessibilityPanel, request } from '../../core/events'
import { focusElement, stepHeading } from '../../core/focus'
import { acquireMic, continuousSupported, listen, type Listener, type RecognitionError } from '../../core/speech/recognizer'
import { prefersReducedMotionNow } from '../../core/store'
import { parseVoiceCommand, type VoiceCommand } from '../../core/voice/grammar'
import { activate, collectClickables, inViewport, matchByLabel } from '../../core/voice/targets'
import { useA11yContext } from '../context'
import { useA11ySettings } from '../hooks'
import { BROWSER_NAVIGATION } from '../options'
import { VoiceHelpDialog } from './VoiceDialogs'

/** Continuous listening turns itself off after this long without a command. */
const IDLE_MS = 5 * 60 * 1000
const MAX_NUMBERS = 99

type Phase = 'idle' | 'listening'

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"
    />
  </svg>
)

/**
 * Listens, understands, acts. Push-to-talk by default: one command per
 * press of the microphone or Alt+Shift+V. "All the time" keeps listening,
 * but pauses while the page is being read aloud (it would hear itself),
 * when the tab is hidden, after five idle minutes, and whenever the host
 * says always-on listening is unsafe (a live call, where other people speak).
 */
export function VoiceController({ listenSignal }: { listenSignal: number }) {
  const { store, messages: m, options } = useA11yContext()
  const { voiceMode } = useA11ySettings(store)
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState(m.voiceIdle)
  const [helpOpen, setHelpOpen] = useState(false)
  const [numbered, setNumbered] = useState<HTMLElement[] | null>(null)

  const listenerRef = useRef<Listener | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const idleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wantContinuous = useRef(false)
  const numberedRef = useRef(numbered)
  numberedRef.current = numbered
  const live = useRef({ store, m, options })
  live.current = { store, m, options }

  const lang = () => document.documentElement.lang || 'en'
  const say = (text: string, polite = true) => {
    setStatus(text)
    announce(text, polite ? 'polite' : 'assertive')
  }

  const stopListening = useCallback((keepMode = false) => {
    listenerRef.current?.stop()
    listenerRef.current = null
    releaseRef.current?.()
    releaseRef.current = null
    if (!keepMode) wantContinuous.current = false
    setPhase('idle')
  }, [])

  // ---- Acting on a command -----------------------------------------------------------
  const run = useCallback(
    (cmd: VoiceCommand) => {
      const { store: s, m: msg, options: o } = live.current
      const nav = o.navigation ?? BROWSER_NAVIGATION
      const smooth = !prefersReducedMotionNow(s)
      switch (cmd.kind) {
        case 'navigate':
          say(msg.voiceGoing(cmd.label))
          setNumbered(null)
          return nav.navigate(cmd.path)
        case 'back':
          return history.back()
        case 'forward':
          return history.forward()
        case 'scroll': {
          const by = window.innerHeight * 0.8
          const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
          if (cmd.dir === 'down') window.scrollBy({ top: by, behavior })
          if (cmd.dir === 'up') window.scrollBy({ top: -by, behavior })
          if (cmd.dir === 'top') window.scrollTo({ top: 0, behavior })
          if (cmd.dir === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior })
          return
        }
        case 'read':
          return request('read', cmd.what === 'selection' ? 'selection' : 'start')
        case 'stop':
        case 'pause':
        case 'resume':
          return request('read', cmd.kind)
        case 'search':
          if (o.onSearch) o.onSearch(cmd.query)
          return
        case 'click': {
          const matches = matchByLabel(cmd.label, collectClickables())
          if (matches.length === 1) {
            setNumbered(null)
            return activate(matches[0])
          }
          if (matches.length === 0) return say(msg.voiceNoMatch(cmd.label))
          setNumbered(matches.filter(inViewport).slice(0, MAX_NUMBERS))
          return say(msg.voiceSayNumber)
        }
        case 'numbers':
          if (!cmd.show) return setNumbered(null)
          setNumbered(collectClickables().filter(inViewport).slice(0, MAX_NUMBERS))
          return say(msg.voiceNumbersShown)
        case 'clickNumber': {
          const list = numberedRef.current
          if (!list) {
            setNumbered(collectClickables().filter(inViewport).slice(0, MAX_NUMBERS))
            return say(msg.voiceNumbersShown)
          }
          const el = list[cmd.n - 1]
          if (!el) return say(msg.voiceNumberMissing(cmd.n))
          setNumbered(null)
          return activate(el)
        }
        case 'textSize': {
          const r = s.config.ranges.fontScale
          const now = s.getSettings().fontScale
          s.patch({ fontScale: cmd.dir === 'reset' ? 1 : now + (cmd.dir === 'up' ? 2 : -2) * r.step })
          return say(msg.textSizeIs(`${Math.round(s.getSettings().fontScale * 100)}%`))
        }
        case 'heading': {
          const main = document.querySelector(o.targets.main) ?? document
          const h = stepHeading(cmd.dir === 'next' ? 1 : -1, main)
          if (h) focusElement(h, { smooth })
          else say(msg.noMoreHeadings)
          return
        }
        case 'focus': {
          const all = collectClickables()
          const at = all.indexOf(document.activeElement as HTMLElement)
          const next = all[(at + (cmd.dir === 'next' ? 1 : -1) + all.length) % all.length]
          if (next) focusElement(next, { smooth })
          return
        }
        case 'activate': {
          const el = document.activeElement as HTMLElement | null
          if (el && el !== document.body) activate(el)
          return
        }
        case 'help':
          return setHelpOpen(true)
        case 'panel':
          return openAccessibilityPanel()
        case 'sleep':
          stopListening()
          return say(msg.voiceIdle)
      }
    },
    [stopListening]
  )

  // ---- Listening ---------------------------------------------------------------------
  const start = useCallback(
    (continuous: boolean) => {
      const { m: msg, options: o } = live.current
      if (listenerRef.current) return
      if (continuous && o.voiceRestricted?.()) {
        continuous = false
        say(msg.voiceInCall)
      }
      const release = acquireMic('voice', 0, () => {
        // Captions took the microphone
        stopListening()
        say(msg.voiceMicBusy)
      })
      if (!release) return say(msg.voiceMicBusy)
      releaseRef.current = release
      wantContinuous.current = continuous

      const onError = (e: RecognitionError) => {
        if (e === 'no-speech') return say(msg.voiceNoSpeech)
        stopListening()
        say(e === 'not-allowed' ? msg.voiceMicBlocked : msg.voiceUnavailable, false)
      }
      const listener = listen({
        lang: lang(),
        continuous,
        onText: (text, final) => {
          setStatus(msg.voiceHeard(text))
          if (!final) return
          clearTimeout(idleRef.current)
          if (continuous) {
            idleRef.current = setTimeout(() => {
              stopListening()
              say(msg.voiceIdleOff)
            }, IDLE_MS)
          }
          const cmd = parseVoiceCommand(text, lang(), {
            routes: live.current.options.routes,
            numbersVisible: !!numberedRef.current,
          })
          if (cmd) run(cmd)
          else say(msg.voiceNotUnderstood(text))
        },
        onError,
        onEnd: () => {
          listenerRef.current = null
          releaseRef.current?.()
          releaseRef.current = null
          setPhase('idle')
        },
      })
      if (!listener) {
        release()
        releaseRef.current = null
        return say(msg.voiceUnavailable, false)
      }
      listenerRef.current = listener
      setPhase('listening')
      setStatus(msg.voiceListening)
      if (continuous) {
        idleRef.current = setTimeout(() => {
          stopListening()
          say(msg.voiceIdleOff)
        }, IDLE_MS)
      }
    },
    [run, stopListening]
  )

  const continuous = voiceMode === 'continuous' && continuousSupported()

  // Alt+Shift+V and the microphone: listen once, or start and stop always-on
  useEffect(() => {
    if (listenSignal === 0) return
    if (listenerRef.current) stopListening()
    else start(continuous)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenSignal])

  // Always-on starts by itself, and steps aside while the page reads aloud
  // (it would take its own voice for commands) and while the tab is hidden
  useEffect(() => {
    if (!continuous) return
    start(true)
    const tick = setInterval(() => {
      const speaking = typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking
      if (speaking && listenerRef.current) stopListening(true)
      else if (!speaking && !listenerRef.current && wantContinuous.current && !document.hidden) start(true)
    }, 500)
    const onVisibility = () => {
      if (document.hidden) stopListening(true)
      else if (wantContinuous.current) start(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisibility)
      stopListening()
    }
  }, [continuous, start, stopListening])

  // New page, new things to click
  useEffect(() => {
    const nav = options.navigation
    if (!nav) return
    return nav.location.subscribe(() => setNumbered(null))
  }, [options.navigation])

  useEffect(
    () => () => {
      clearTimeout(idleRef.current)
      stopListening()
    },
    [stopListening]
  )

  const listening = phase === 'listening'
  return (
    <>
      <div className="ak-voice" data-a11y-voice-ui data-listening={listening || undefined}>
        <button
          type="button"
          className="ak-voice-mic"
          aria-pressed={listening}
          aria-label={listening ? m.voiceStopListening : m.voiceListen}
          title={listening ? m.voiceStopListening : m.voiceListen}
          onClick={() => (listening ? stopListening() : start(continuous))}
        >
          <MicIcon />
        </button>
        <p className="ak-voice-status" aria-live="off">
          {status}
        </p>
        <button type="button" className="ak-link-btn" onClick={() => setHelpOpen(true)}>
          {m.voiceShowHelp}
        </button>
        <button
          type="button"
          className="ak-icon-btn ak-voice-off"
          aria-label={m.voiceTurnOff}
          title={m.voiceTurnOff}
          onClick={() => store.patch({ voiceNav: false })}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {numbered && <NumberOverlay targets={numbered} />}
      {helpOpen && <VoiceHelpDialog lang={lang()} onClose={() => setHelpOpen(false)} />}
    </>
  )
}

/**
 * A number on each target, kept in place as the page scrolls. Visual only:
 * hidden from screen readers, which have their own ways to reach a control.
 */
function NumberOverlay({ targets }: { targets: HTMLElement[] }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTick((t) => t + 1))
    }
    window.addEventListener('scroll', update, { passive: true, capture: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
    }
  }, [])
  return createPortal(
    <div className="ak-numbers" aria-hidden="true" data-a11y-voice-ui>
      {targets.map((el, i) => {
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > window.innerHeight) return null
        return (
          <span key={i} className="ak-number" style={{ top: Math.max(0, r.top - 6), left: Math.max(0, r.left - 6) }}>
            {i + 1}
          </span>
        )
      })}
    </div>,
    document.body
  )
}
