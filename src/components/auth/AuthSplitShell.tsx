import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { HERO_IMAGES } from '../../lib/hero-images'
import { cn } from '../../lib/utils'

export interface AuthStep {
  title: string
  caption: string
}

// Deck-style flip: one card, cumulative rotation. Each step adds 180deg, so the
// card keeps spinning the same way while travelling to the opposite side of the
// stage. The face content swaps exactly when rotation crosses 90/270/... (card
// edge-on, swap invisible). Odd faces land at 180deg — mirrored — so the face
// content is counter-flipped with scaleX(-1).

// Panel is 45% of the stage; travelling the remaining 55% equals 55/45 of the
// panel's own width, which translateX(%) is relative to.
const X_MAX = (55 / 45) * 100

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

const faceFor = (rot: number, n: number) =>
  Math.max(0, Math.min(Math.floor((rot + 90) / 180), n - 1))

// Continuous horizontal position: within each half-turn the card slides from
// its current side to the opposite one, so x and rotation stay in lockstep.
const xFor = (rot: number, maxRot: number) => {
  const r = Math.max(0, Math.min(rot, maxRot))
  const seg = Math.min(Math.floor(r / 180), Math.ceil(maxRot / 180) - 1)
  const t = (r - seg * 180) / 180
  const from = seg % 2 === 0 ? 0 : X_MAX
  const to = (seg + 1) % 2 === 0 ? 0 : X_MAX
  return from + (to - from) * t
}

const applyTransform = (el: HTMLElement, rot: number, maxRot: number) => {
  el.style.transform = `translateX(${xFor(rot, maxRot)}%) rotateY(${rot}deg)`
}

function useDeckFlip(step: number, n: number) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [face, setFace] = useState(step - 1)
  const state = useRef({ rot: (step - 1) * 180, raf: 0 })
  const maxRot = (n - 1) * 180

  // Paint the initial position before first frame
  useLayoutEffect(() => {
    if (panelRef.current) applyTransform(panelRef.current, state.current.rot, maxRot)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = panelRef.current
    const s = state.current
    const target = (step - 1) * 180
    if (!el || s.rot === target) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !el.offsetParent) {
      // Instant swap: reduced motion, or panel hidden (mobile)
      s.rot = target
      applyTransform(el, target, maxRot)
      setFace(faceFor(target, n))
      return
    }

    cancelAnimationFrame(s.raf)
    const from = s.rot
    const halfTurns = Math.abs(target - from) / 180
    const dur = 450 + 200 * halfTurns
    const t0 = performance.now()

    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      const rot = from + (target - from) * easeInOut(p)
      s.rot = rot
      applyTransform(el, rot, maxRot)
      setFace(faceFor(rot, n))
      if (p < 1) s.raf = requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(s.raf)
  }, [step, n, maxRot])

  return { panelRef, face }
}

function Dots({ count, active, onPhoto = false }: { count: number; active: number; onPhoto?: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i + 1 === active
              ? onPhoto
                ? 'w-6 bg-brand-white'
                : 'w-6 bg-ktip-ocean-500'
              : onPhoto
                ? 'w-2 bg-brand-white/40'
                : 'w-2 bg-ktip-sand-300',
          )}
        />
      ))}
    </div>
  )
}

/**
 * Full-page split-screen wizard: hero image fills one side, form the other —
 * no backdrop, the split layout IS the page. On every step change the image
 * does a continuous 3D flip while travelling across the page to the opposite
 * side. Pages own all wizard state; this shell is purely presentational.
 */
export function AuthSplitShell({
  step,
  steps,
  heading,
  subheading,
  topLink,
  heroOffset = 0,
  children,
}: {
  step: number
  steps: AuthStep[]
  heading: ReactNode
  subheading?: ReactNode
  topLink?: ReactNode
  heroOffset?: number
  children: ReactNode
}) {
  const n = steps.length
  const { panelRef, face } = useDeckFlip(step, n)
  const mirrored = face % 2 === 1
  const imageOnLeft = face % 2 === 0
  const hero = HERO_IMAGES[(heroOffset + face) % HERO_IMAGES.length]
  const current = steps[Math.min(face, n - 1)]

  // Preload the target step's photo so the midpoint face swap never shows a blank panel
  useEffect(() => {
    const img = new Image()
    img.src = HERO_IMAGES[(heroOffset + step - 1) % HERO_IMAGES.length]
    const next = new Image()
    next.src = HERO_IMAGES[(heroOffset + step) % HERO_IMAGES.length]
  }, [step, heroOffset])

  // Move focus to the new step's content for keyboard/SR users (skip initial mount)
  const contentRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    contentRef.current?.focus({ preventScroll: true })
  }, [step])

  return (
    <div className="h-screen w-full overflow-hidden bg-ktip-cream p-3 md:p-4">
      {/* Stage: perspective lives here so the panel (its direct child) renders in 3D */}
      <div className="relative h-full" style={{ perspective: '1200px' }}>
        {/* Image panel — travels across the stage while flipping. Hidden on mobile. */}
        <div
          ref={panelRef}
          className="absolute inset-y-0 left-0 z-10 hidden md:block w-[45%] rounded-2xl overflow-hidden"
          style={{ willChange: 'transform' }}
        >
          {/* Odd faces land at 180deg (mirrored) — undo it so content reads correctly */}
          <div className="absolute inset-0" style={{ transform: `scaleX(${mirrored ? -1 : 1})` }}>
            <img
              src={hero}
              alt=""
              loading="eager" fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/75 via-brand-navy/10 to-brand-navy/35" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
              <img src="/ktip-logo-nobg.webp" alt="KTIP" className="h-9 w-auto drop-shadow" />
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-white/15 px-4 py-1.5 text-sm font-medium text-brand-white backdrop-blur-sm hover:bg-brand-white/25 transition-colors"
              >
                Back to website <ArrowRight size={14} />
              </Link>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-6 space-y-4">
              <p className="font-display text-2xl font-semibold text-brand-white leading-snug">
                {current?.caption}
              </p>
              <Dots count={n} active={face + 1} onPhoto />
            </div>
          </div>
        </div>

        {/* Form side — whichever side the image isn't; swaps at the flip midpoint.
            Centered when it fits; scrolls internally only as a small-screen fallback. */}
        <div
          className={cn(
            'relative h-full overflow-y-auto md:w-[55%] px-2 sm:px-6',
            imageOnLeft ? 'md:ml-auto md:pl-12 md:pr-6' : 'md:mr-auto md:pr-12 md:pl-6',
          )}
        >
          <div className="flex min-h-full flex-col justify-center py-4">
            <div className="w-full max-w-xl mx-auto">
              <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500 mb-1">
                Step {Math.min(step, n)} of {n} — {steps[Math.min(step, n) - 1]?.title}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ktip-sand-900">{heading}</h1>
              {subheading && <p className="text-ktip-sand-600 mt-1 text-sm">{subheading}</p>}
              {topLink && <div className="text-sm text-ktip-sand-600 mt-1">{topLink}</div>}
              <div className="md:hidden mt-3">
                <Dots count={n} active={step} />
              </div>
              <p className="sr-only" aria-live="polite">
                Step {Math.min(step, n)} of {n}: {steps[Math.min(step, n) - 1]?.title}
              </p>
              <div
                key={step}
                ref={contentRef}
                tabIndex={-1}
                className="animate-tab-enter motion-reduce:animate-none outline-none mt-4"
              >
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
