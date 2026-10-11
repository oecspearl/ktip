import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { announce } from '../core/announce'
import { createReader, type PageReader } from '../core/reader/engine'
import { langPrefix, resolveSpeechLang } from '../core/speech/voices'
import { prefersReducedMotionNow, type A11yStore } from '../core/store'
import { useA11yContext } from './context'
import { useA11ySettings } from './hooks'

/** One reader per page load, shared by the bar, its shortcut and voice commands. */
let shared: PageReader | null = null
function getReader(store: A11yStore, main: string): PageReader {
  if (!shared) {
    shared = createReader({
      root: () => document.querySelector(main),
      rate: () => store.getSettings().ttsRate,
      voiceURI: (lang) => store.getState().device.ttsVoice[langPrefix(lang)],
      reducedMotion: () => prefersReducedMotionNow(store),
    })
  }
  return shared
}

const CLICK_MODE = 'a11y-click-read'
const BLOCK = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, dt, dd, td, th, summary, [data-read-block]'

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true" focusable="false">
    <path d={d} fill="currentColor" />
  </svg>
)
const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  stop: 'M6 6h12v12H6z',
  prev: 'M6 6h2v12H6zm3.5 6L18 18V6z',
  next: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
  // A pointer arrow: 'click here to read'
  click: 'M5 3l14 8-6.2 1.6 3.6 7.2-2.6 1.3-3.6-7.2L6 18.5z',
  quote: 'M7 7h4v4l-2 6H6l2-6H7zm7 0h4v4l-2 6h-3l2-6h-1z',
  close: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z',
}

export interface ReaderBarProps {
  onClose: () => void
  /** Increments each time the read shortcut or voice command fires */
  toggleSignal: number
}

/**
 * The read-aloud toolbar. Fixed to the bottom left, clear of a floating
 * button in the other corner. One tab stop; the arrow keys move between
 * buttons, per the ARIA toolbar pattern.
 */
export function ReaderBar({ onClose, toggleSignal }: ReaderBarProps) {
  const { store, messages: m, options } = useA11yContext()
  const { ttsRate } = useA11ySettings(store)
  const reader = getReader(store, options.targets.main)
  const state = useSyncExternalStore(reader.subscribe, reader.getState, reader.getState)
  const [clickMode, setClickMode] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // The shortcut and voice command toggle reading; the first signal starts it.
  // No 'already handled' ref: under StrictMode the unmount below stops the
  // reader between the two mounts, and the second toggle has to restart it
  useEffect(() => {
    if (toggleSignal > 0) reader.toggle()
  }, [toggleSignal, reader])

  // Progress for screen readers, and the reasons reading cannot start
  useEffect(() => {
    if (state.status === 'playing' && state.total > 1) announce(m.readingProgress(state.index + 1, state.total))
  }, [state.status, state.index, state.total, m])
  useEffect(() => {
    if (state.problem === 'no-voice') announce(m.noVoice(languageName(state.lang)), 'assertive')
    if (state.problem === 'empty') announce(m.nothingToRead)
  }, [state.problem, state.lang, m])

  // A new page is a new text: stop, and drop the highlight
  useEffect(() => {
    const nav = options.navigation
    if (!nav) return
    let last = nav.location.get().split('#')[0]
    return nav.location.subscribe(() => {
      const now = nav.location.get().split('#')[0]
      if (now !== last) reader.stop()
      last = now
    })
  }, [options.navigation, reader])

  useEffect(() => () => reader.stop(), [reader])

  // Click to read: the next click on any paragraph reads from there instead
  // of following it. Escape leaves the mode
  useEffect(() => {
    if (!clickMode) return
    const root = document.documentElement
    root.classList.add(CLICK_MODE)
    const onClick = (e: MouseEvent) => {
      const main = document.querySelector(options.targets.main)
      const block = (e.target as Element | null)?.closest(BLOCK)
      if (!main || !block || !main.contains(block)) return
      e.preventDefault()
      e.stopPropagation()
      reader.readFrom(block)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setClickMode(false)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey)
    return () => {
      root.classList.remove(CLICK_MODE)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [clickMode, reader, options.targets.main])

  const readSelection = () => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text) return
    const anchor = sel?.anchorNode?.parentElement ?? null
    reader.readText(text, resolveSpeechLang(anchor))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(barRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let next: number | null = null
    if (e.key in moves && i >= 0) next = (i + moves[e.key] + buttons.length) % buttons.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = buttons.length - 1
    if (next === null) return
    e.preventDefault()
    buttons.forEach((b, j) => (b.tabIndex = j === next ? 0 : -1))
    buttons[next].focus()
  }

  const playing = state.status === 'playing'
  const idle = state.status === 'idle'
  const button = (label: string, icon: keyof typeof ICONS, onClick: () => void, extra: { pressed?: boolean; disabled?: boolean; first?: boolean } = {}): ReactNode => (
    <button
      type="button"
      className="ak-reader-btn"
      aria-label={label}
      title={label}
      aria-pressed={extra.pressed}
      disabled={extra.disabled}
      tabIndex={extra.first ? 0 : -1}
      onClick={onClick}
    >
      <Icon d={ICONS[icon]} />
    </button>
  )

  const rates = [0.75, 1, 1.25, 1.5]
  const problem =
    state.problem === 'no-voice'
      ? m.noVoice(languageName(state.lang))
      : state.problem === 'empty'
        ? m.nothingToRead
        : null

  return (
    <div className="ak-reader" data-click-mode={clickMode || undefined}>
      <div ref={barRef} role="toolbar" aria-label={m.readerTitle} className="ak-reader-bar" onKeyDown={onKeyDown}>
        {button(playing ? m.pause : state.status === 'paused' ? m.resume : m.readPage, playing ? 'pause' : 'play', () => reader.toggle(), { first: true })}
        {button(m.prevBlock, 'prev', () => reader.prev(), { disabled: idle })}
        {button(m.nextBlock, 'next', () => reader.next(), { disabled: idle })}
        {button(m.stop, 'stop', () => reader.stop(), { disabled: idle })}
        <span className="ak-reader-sep" aria-hidden="true" />
        {button(m.clickToRead, 'click', () => setClickMode((v) => !v), { pressed: clickMode })}
        {button(m.readSelection, 'quote', readSelection)}
        <span className="ak-reader-sep" aria-hidden="true" />
        <button
          type="button"
          className="ak-reader-btn ak-reader-rate"
          aria-label={m.readingSpeedIs(`${ttsRate}×`)}
          title={m.readingSpeed}
          tabIndex={-1}
          onClick={() => {
            const at = rates.indexOf(ttsRate)
            store.patch({ ttsRate: rates[(at + 1) % rates.length] ?? 1 })
          }}
        >
          {ttsRate}×
        </button>
        {button(m.closeReader, 'close', () => {
          reader.stop()
          onClose()
        })}
      </div>
      {(problem || clickMode || !idle) && (
        <p className="ak-reader-status" role="status">
          {problem ??
            (clickMode
              ? m.clickToReadOn
              : state.total > 1
                ? m.readingProgress(state.index + 1, state.total)
                : m.readingNow)}
        </p>
      )}
    </div>
  )
}

function languageName(lang: string): string {
  try {
    const name = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' }).of(langPrefix(lang))
    return name ?? lang
  } catch {
    return lang
  }
}
