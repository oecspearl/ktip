import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { HERO_IMAGES } from '../../lib/hero-images'
import { ResponsiveImage } from '../ui/ResponsiveImage'
import { cn } from '../../lib/utils'
import { Stepper } from '../ui/Stepper'
import { useDeckFlip } from '../ui/useDeckFlip'

export interface AuthStep {
  title: string
  caption: string
}

/**
 * Progress for the signup/onboarding deck. The shared Stepper in `compact`
 * mode — bars only, no labels — because this sits over a photo and under a
 * caption, where the step's name is already spelled out in the copy beside it.
 */
function Dots({
  steps,
  active,
  onPhoto = false,
}: {
  steps: AuthStep[]
  /** 1-indexed, matching the `step` prop the shell is driven by */
  active: number
  onPhoto?: boolean
}) {
  return (
    <Stepper
      variant="compact"
      onPhoto={onPhoto}
      steps={steps.map((s) => s.title)}
      currentStep={Math.min(Math.max(active, 1), steps.length) - 1}
    />
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
            <ResponsiveImage
              src={hero}
              alt=""
              // The panel is hidden below md and 45% of the viewport above it.
              sizes="(min-width: 768px) 45vw, 100vw"
              loading="eager" fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/75 via-brand-navy/10 to-brand-navy/35" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
              {/* ktip-logo.webp already has an alpha channel, so the separate
                  "nobg" file this used to point at was both redundant and
                  missing — it 404'd here since the originals were removed. */}
              <img src="/ktip-logo-128.webp" alt="KTiP" className="h-9 w-auto drop-shadow" />
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
              <Dots steps={steps} active={face + 1} onPhoto />
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
                <Dots steps={steps} active={step} />
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
