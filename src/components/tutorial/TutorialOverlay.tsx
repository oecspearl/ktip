import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Volume2, VolumeX, Repeat, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { useTTS } from '../../hooks/useTTS'
import type { TutorialPosition, TutorialStep } from './types'

interface TutorialOverlayProps {
  steps: TutorialStep[]
  /** Fired when the user reaches the end of the tour */
  onComplete: () => void
  /** Fired when the user bails out (Escape, X, Exit pill) */
  onExit: () => void
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

type Side = 'top' | 'bottom' | 'left' | 'right'
type TTSMode = 'off' | 'single' | 'auto'

/** Spotlight padding around the target rect. Generous, because steps frame
 *  whole sections rather than individual controls. */
const PAD = 12
/** Distance between the target and the tooltip card */
const GAP = 24
/** Keep-off-the-edge margin for the card */
const MARGIN = 20
/** A target still missing after this long is treated as stranded */
const STRANDED_MS = 1500
/** Comfort margin when scrolling a target into view */
const COMFORT = 96

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5)

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * First match with a non-zero rect. Plain `querySelector` is not enough: the
 * events page mounts one `data-tutorial` anchor per card, and the calendar /
 * grid views swap what is on screen — a 0×0 twin would pin the spotlight at
 * the viewport origin.
 */
function findVisible(selector: string): HTMLElement | null {
  let nodes: NodeListOf<HTMLElement>
  try {
    nodes = document.querySelectorAll<HTMLElement>(selector)
  } catch {
    return null
  }
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return node
  }
  return null
}

/** Nearest ancestor that actually scrolls (the day panel, not the window) */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function scrollIntoView(el: HTMLElement, mode: 'top' | 'center') {
  const container = scrollParentOf(el)
  if (container) {
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const offset = eRect.top - cRect.top + container.scrollTop
    const next =
      mode === 'top' ? offset - 16 : offset - Math.max(0, (container.clientHeight - eRect.height) / 2)
    container.scrollTo({ top: Math.max(0, next), behavior: 'smooth' })
  }

  // The page itself scrolls at document level, so bring the target (or its
  // scroll container) into the viewport too.
  const anchor = container ?? el
  // A fixed element (the FAB) is already in view by definition — scrolling
  // toward its "document position" just yanks the page for no reason.
  if (getComputedStyle(anchor).position === 'fixed') return
  const rect = anchor.getBoundingClientRect()
  if (rect.height > window.innerHeight) return
  const docTop = rect.top + window.scrollY
  const next =
    mode === 'top'
      ? docTop - COMFORT
      : docTop - Math.max(COMFORT, (window.innerHeight - rect.height) / 2)
  window.scrollTo({ top: Math.max(0, next), behavior: 'smooth' })
}

function computePlacement(
  target: Box | null,
  cardW: number,
  cardH: number,
  preferred?: TutorialPosition
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (!target || preferred === 'center') {
    return { top: Math.max(MARGIN, (vh - cardH) / 2), left: Math.max(MARGIN, (vw - cardW) / 2) }
  }

  const space: Record<Side, number> = {
    right: vw - (target.left + target.width) - GAP,
    left: target.left - GAP,
    bottom: vh - (target.top + target.height) - GAP,
    top: target.top - GAP,
  }
  const fits: Record<Side, boolean> = {
    right: space.right >= cardW + MARGIN,
    left: space.left >= cardW + MARGIN,
    bottom: space.bottom >= cardH + MARGIN,
    top: space.top >= cardH + MARGIN,
  }

  const order: Side[] = ['right', 'bottom', 'left', 'top']
  // 'center' already returned above, so anything left is a real side
  const wanted = preferred
  const fittedSide = wanted && fits[wanted] ? wanted : order.find((s) => fits[s])
  const side =
    fittedSide ?? (Object.keys(space) as Side[]).sort((a, b) => space[b] - space[a])[0]

  let top: number
  let left: number
  if (!fittedSide) {
    // Nothing fits beside the target — typical when a step frames a whole
    // section. Pin the card flush to the roomiest viewport edge instead of
    // centring it on the target, so the least content is covered.
    switch (side) {
      case 'right':
        left = vw - cardW - MARGIN
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'left':
        left = MARGIN
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'bottom':
        top = vh - cardH - MARGIN
        left = target.left + target.width / 2 - cardW / 2
        break
      default:
        top = MARGIN
        left = target.left + target.width / 2 - cardW / 2
        break
    }
  } else {
    switch (side) {
      case 'right':
        left = target.left + target.width + GAP
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'left':
        left = target.left - GAP - cardW
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'bottom':
        top = target.top + target.height + GAP
        left = target.left + target.width / 2 - cardW / 2
        break
      default:
        top = target.top - GAP - cardH
        left = target.left + target.width / 2 - cardW / 2
        break
    }
  }

  return {
    top: clamp(top, MARGIN, vh - cardH - MARGIN),
    left: clamp(left, MARGIN, vw - cardW - MARGIN),
  }
}

export function TutorialOverlay({ steps, onComplete, onExit }: TutorialOverlayProps) {
  const [index, setIndex] = useState(0)
  const [targetBox, setTargetBox] = useState<Box | null>(null)
  const [secondaryBox, setSecondaryBox] = useState<Box | null>(null)
  const [cardSize, setCardSize] = useState({ width: 360, height: 240 })
  const [awaitingAction, setAwaitingAction] = useState(false)
  const [ttsMode, setTtsMode] = useState<TTSMode>('off')

  const cardRef = useRef<HTMLDivElement>(null)
  const targetElRef = useRef<HTMLElement | null>(null)
  const advanceTimerRef = useRef<number | null>(null)

  const step = steps[index]
  const isLast = index === steps.length - 1
  const { supported: ttsSupported, speak, stop: stopSpeech } = useTTS()

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }

  const goTo = useCallback(
    (next: number) => {
      clearAdvanceTimer()
      stopSpeech()
      targetElRef.current = null
      setTargetBox(null)
      setSecondaryBox(null)
      setAwaitingAction(false)
      setIndex(next)
    },
    [stopSpeech]
  )

  const finish = useCallback(() => {
    clearAdvanceTimer()
    stopSpeech()
    onComplete()
  }, [onComplete, stopSpeech])

  const exit = useCallback(() => {
    clearAdvanceTimer()
    stopSpeech()
    onExit()
  }, [onExit, stopSpeech])

  const advance = useCallback(() => {
    if (index >= steps.length - 1) finish()
    else goTo(index + 1)
  }, [index, steps.length, finish, goTo])

  // --- Measurement -------------------------------------------------------
  // A rAF loop instead of a pile of scroll/resize/mutation listeners: the page
  // scrolls at document level, the day panel scrolls internally, cards animate
  // in via `stagger-children`, and the calendar slides on month change. One
  // loop tracks all of it, and state only updates when the rect actually moves.
  useEffect(() => {
    if (!step) return
    let raf = 0

    const resolve = (selector: string, cached: HTMLElement | null): HTMLElement | null => {
      if (cached && cached.isConnected) {
        const r = cached.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return cached
      }
      return findVisible(selector)
    }

    const tick = () => {
      const el = resolve(step.target, targetElRef.current)
      if (el !== targetElRef.current) targetElRef.current = el
      const next = el ? boxOf(el) : null
      setTargetBox((prev) => (sameBox(prev, next) ? prev : next))

      if (step.secondaryTarget) {
        const secondary = findVisible(step.secondaryTarget)
        const nextSecondary = secondary ? boxOf(secondary) : null
        setSecondaryBox((prev) => (sameBox(prev, nextSecondary) ? prev : nextSecondary))
      } else {
        setSecondaryBox(null)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [step])

  // Scroll the target into view once per step
  useEffect(() => {
    if (!step) return
    let cancelled = false
    const attempt = () => {
      if (cancelled) return
      const el = findVisible(step.target)
      if (el) scrollIntoView(el, step.scrollMode ?? 'center')
    }
    attempt()
    const retry = window.setTimeout(attempt, 350)
    return () => {
      cancelled = true
      window.clearTimeout(retry)
    }
  }, [step])

  // Stranded-step safety net — never leave the user on a black screen
  useEffect(() => {
    if (!step) return
    const timer = window.setTimeout(() => {
      if (!findVisible(step.target)) {
        console.warn(
          `[tutorial] step ${index + 1}/${steps.length} target not found, skipping: ${step.target}`
        )
        advance()
      }
    }, STRANDED_MS)
    return () => window.clearTimeout(timer)
  }, [step, index, steps.length, advance])

  // Card size drives placement; remeasure as content/viewport change
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setCardSize((prev) =>
        Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { width: r.width, height: r.height }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [index])

  // Interactive steps: wait for a real click on the target
  useEffect(() => {
    if (!step?.interactive) {
      setAwaitingAction(false)
      return
    }
    setAwaitingAction(true)
    if (!step.manualClick && !step.actionTarget) return

    const selector = step.actionTarget ?? step.target
    let attached: HTMLElement | null = null
    const onClick = () => {
      setAwaitingAction(false)
      clearAdvanceTimer()
      advanceTimerRef.current = window.setTimeout(advance, step.advanceDelay ?? 300)
    }
    // The element may not exist on the first frame (view swaps, animations)
    const poll = window.setInterval(() => {
      if (attached) return
      const el = findVisible(selector)
      if (el) {
        attached = el
        el.addEventListener('click', onClick, { once: true })
      }
    }, 100)

    return () => {
      window.clearInterval(poll)
      attached?.removeEventListener('click', onClick)
    }
  }, [step, advance])

  // Escape always gets you out
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        exit()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [exit])

  // Read-aloud. `auto` chains into the next step when the utterance ends.
  useEffect(() => {
    if (!step || ttsMode === 'off') return
    const text = `${step.title}. ${step.description}`
    speak(text, ttsMode === 'auto' && !step.interactive ? advance : undefined)
    // `advance` changes with the index, which is exactly when we want to respeak
  }, [step, ttsMode, speak, advance])

  useEffect(() => clearAdvanceTimer, [])

  if (!step) return null

  const handleRelayClick = () => {
    const el = targetElRef.current
    if (el) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }
    setAwaitingAction(false)
    clearAdvanceTimer()
    advanceTimerRef.current = window.setTimeout(advance, step.advanceDelay ?? 300)
  }

  const handleNext = () => {
    if (step.clickTarget) {
      const el = findVisible(step.clickTarget)
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      clearAdvanceTimer()
      advanceTimerRef.current = window.setTimeout(advance, step.clickTargetDelay ?? 150)
      return
    }
    advance()
  }

  const cycleTts = () => {
    setTtsMode((prev) => {
      if (prev === 'off') return 'single'
      if (prev === 'single') return 'auto'
      stopSpeech()
      return 'off'
    })
  }

  const cutouts = [targetBox, secondaryBox].filter((b): b is Box => b !== null)
  const placement = computePlacement(targetBox, cardSize.width, cardSize.height, step.position)
  // A centred card still gets its cutout — 'center' controls placement only
  const showSpotlight = targetBox !== null
  const relayActive = Boolean(
    step.interactive && !step.manualClick && !step.actionTarget && awaitingAction && targetBox
  )
  // Hint sits over whatever the user actually has to click
  const hintBox = step.actionTarget ? secondaryBox ?? targetBox : targetBox

  return createPortal(
    <div
      data-tutorial-overlay
      className="fixed inset-0 z-[10005] pointer-events-none animate-fade-in"
      role="dialog"
      aria-modal="false"
      aria-label="Guided tour"
    >
      {/* Scrim with a rounded cutout around the target */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <mask id="ktip-tutorial-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {showSpotlight &&
              cutouts.map((box, i) => (
                <rect
                  key={i}
                  x={box.left - PAD}
                  y={box.top - PAD}
                  width={box.width + PAD * 2}
                  height={box.height + PAD * 2}
                  rx={10}
                  fill="black"
                />
              ))}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.82)"
          mask="url(#ktip-tutorial-spotlight)"
        />
      </svg>

      {/* Ring(s) around the spotlit element */}
      {showSpotlight &&
        cutouts.map((box, i) => (
          <div
            key={i}
            className={cn(
              'absolute rounded-lg border-2 border-ktip-ocean-500 pointer-events-none',
              awaitingAction && 'animate-pulse'
            )}
            style={{
              top: box.top - PAD,
              left: box.left - PAD,
              width: box.width + PAD * 2,
              height: box.height + PAD * 2,
            }}
          />
        ))}

      {/* Click relay — catches the click and re-dispatches it on the real node */}
      {relayActive && targetBox && (
        <div
          className="absolute z-[10006] cursor-pointer pointer-events-auto"
          onClick={handleRelayClick}
          style={{
            top: targetBox.top - PAD,
            left: targetBox.left - PAD,
            width: targetBox.width + PAD * 2,
            height: targetBox.height + PAD * 2,
          }}
        />
      )}

      {/* Action hint pill */}
      {step.actionHint && awaitingAction && hintBox && (
        <div
          className="absolute z-[10007] -translate-x-1/2 animate-bounce pointer-events-none"
          style={{ top: hintBox.top - PAD - 40, left: hintBox.left + hintBox.width / 2 }}
        >
          <span className="inline-block whitespace-nowrap rounded-full bg-ktip-ocean-600 px-3 py-1.5 text-xs font-bold text-white shadow-hard">
            {step.actionHint}
          </span>
        </div>
      )}

      {/* Tooltip card */}
      <div
        ref={cardRef}
        className="absolute z-[10008] pointer-events-auto w-[calc(100vw-2.5rem)] max-w-md max-h-[80vh] overflow-y-auto bg-ktip-cream rounded-2xl border border-ktip-line shadow-hard p-5 animate-scale-in"
        style={{ top: placement.top, left: placement.left }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display font-bold text-lg text-ktip-sand-900 leading-snug">
            {step.title}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            {ttsSupported && (
              <button
                type="button"
                onClick={cycleTts}
                aria-label={
                  ttsMode === 'off'
                    ? 'Read this step aloud'
                    : ttsMode === 'single'
                      ? 'Read the whole tour aloud'
                      : 'Turn off read aloud'
                }
                title={
                  ttsMode === 'off'
                    ? 'Read aloud'
                    : ttsMode === 'single'
                      ? 'Read aloud: this step'
                      : 'Read aloud: whole tour'
                }
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  ttsMode === 'off'
                    ? 'text-ktip-sand-500 hover:bg-ktip-sand-100'
                    : 'text-ktip-ocean-600 bg-ktip-ocean-50 hover:bg-ktip-ocean-100'
                )}
              >
                {ttsMode === 'off' ? (
                  <VolumeX size={16} />
                ) : ttsMode === 'single' ? (
                  <Volume2 size={16} />
                ) : (
                  <Repeat size={16} />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={exit}
              aria-label="Close tour"
              className="p-1.5 rounded-lg text-ktip-sand-500 hover:bg-ktip-sand-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <p className="mt-2 text-sm text-ktip-sand-600 leading-relaxed whitespace-pre-line">
          {step.description}
        </p>

        {/* Progress dots — backward only: later steps rely on DOM state that
            earlier interactive steps create, so jumping ahead strands them. */}
        <div className="mt-4 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              disabled={i >= index}
              onClick={() => goTo(i)}
              aria-label={`Go to step ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                i === index ? 'w-5 bg-ktip-ocean-600' : 'w-1.5',
                i < index ? 'bg-ktip-ocean-300 hover:bg-ktip-ocean-500' : '',
                i > index ? 'bg-ktip-sand-300' : ''
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            {index + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronLeft size={14} />}
                onClick={() => goTo(index - 1)}
              >
                Back
              </Button>
            )}
            <Button size="sm" disabled={awaitingAction} onClick={handleNext}>
              {awaitingAction ? 'Waiting…' : isLast ? 'Finish' : 'Next'}
              {!awaitingAction && !isLast && <ChevronRight size={14} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Always-reachable exit, even if the card fails to render */}
      <button
        type="button"
        onClick={exit}
        className="fixed z-[10009] top-4 left-1/2 -translate-x-1/2 pointer-events-auto rounded-full bg-red-600 text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-hard hover:bg-red-700 transition-colors"
      >
        Exit tour
      </button>
    </div>,
    document.body
  )
}
