import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import { Button } from './ui/Button'
import { ResponsiveImage } from './ui/ResponsiveImage'
import { Stepper } from './ui/Stepper'
import { useDeckFlip } from './ui/useDeckFlip'
import { HERO_IMAGES } from '../lib/hero-images'
import { markWelcomeSeen, useHasSeenWelcome } from '../lib/welcome-panel'

/**
 * The first thing a device ever sees.
 *
 * A title card on brand navy — the mark, large, behind "Welcome to KTIP" — that
 * dissolves into a three-slide introduction, and then the way in. The staging
 * of the slides is the signup deck's (one photo panel flipping across the stage
 * on every step, copy on whichever side it is not), because a reader who
 * carries on to sign up should recognise the room they are already in. The
 * shared motion is `useDeckFlip`, lifted out of AuthSplitShell for this.
 *
 * One element does the curtain work throughout: the iris ground. It is solid
 * from the first frame (under the title card), fades out to reveal the deck,
 * fades back in over the deck on the way out, and then opens from the centre.
 * The deck is unmounted before the hole exists, so nothing is ever seen
 * through it but the app.
 *
 * Cost: the app mounts and paints behind this as it always did — the panel is
 * a fixed layer over it, not a gate in front of it — so the home route, its
 * data and its chunks are all warm by the time the hole opens. The panel
 * itself is a handful of CSS animations on transform, opacity and filter;
 * nothing here is measured or laid out per frame except the deck flip, which
 * the signup page already runs.
 *
 * Shown once per device, and replayable from the home page's FAB tour action;
 * see lib/welcome-panel.ts for the gate.
 */

type Phase = 'title' | 'title-out' | 'reading' | 'exiting' | 'iris' | 'gone'

/** How long the title card holds before dissolving on its own. */
const TITLE_MS = 2600
/** The navy curtain fading out over the deck. Matches the fadeOut in index.css. */
const TITLE_OUT_MS = 720
/** Exit beat one: copy leaves, navy arrives. Matches the fadeIn on the ground. */
const EXIT_MS = 420
/** Exit beat two: `welcomeIris` in index.css. */
const IRIS_MS = 760
/** Between slides: the outgoing copy's `welcomeLineOut`. */
const SWAP_MS = 340

const SLIDES = [
  {
    eyebrow: msg`Welcome`,
    title: msg`One network for Caribbean innovation.`,
    body: msg`KTIP is the OECS platform where ideas, funding and the people behind them finally sit in one place — built for the region, in the region.`,
  },
  {
    eyebrow: msg`Who it's for`,
    title: msg`Students, researchers, founders, institutions.`,
    body: msg`Whether you are starting a first project or funding a tenth, KTIP connects you to the collaborators, programmes and reviewers who move it forward.`,
  },
  {
    eyebrow: msg`What's inside`,
    title: msg`Projects, grants, events, and everyone working on them.`,
    body: msg`Search the member directory, apply for funding, join events and forums, and work together in shared rooms — documents, whiteboards, code and video.`,
  },
]

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Where a fresh run starts: the title card, unless motion is unwelcome. */
const openingPhase = (): Phase => (prefersReducedMotion() ? 'reading' : 'title')

export function WelcomePanel() {
  const { t, i18n } = useLingui()
  const seen = useHasSeenWelcome()
  const [phase, setPhase] = useState<Phase>(openingPhase)
  /** 1-indexed, matching what useDeckFlip and Stepper are driven by. */
  const [step, setStep] = useState(1)
  /** Set while the outgoing slide plays its exit, so the copy is keyed out. */
  const [swapping, setSwapping] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Once Enter is pressed on the last slide the storage flag is already "seen"
  // — that is what dismiss writes first — so through the exit the panel is held
  // open by `phase` alone. Reading `seen` there would unmount it on the click.
  const exiting = phase === 'exiting' || phase === 'iris'
  const open = phase !== 'gone' && (exiting || !seen)

  const { panelRef, face } = useDeckFlip(step, SLIDES.length)
  const mirrored = face % 2 === 1
  const imageOnLeft = face % 2 === 0
  const slide = SLIDES[Math.min(face, SLIDES.length - 1)]
  const last = step === SLIDES.length
  const stepLabels = SLIDES.map((s) => i18n._(s.eyebrow))

  // The flag going back to unseen is a replay (the home page's "Page tour"
  // action). Phase and step outlive the flag on purpose — they are what hold
  // the panel through its exit — so a replay has to reset them, or the panel
  // would stay dismissed for the rest of the session no matter what storage
  // says, and would come back on its last slide if it did return.
  useEffect(() => {
    if (seen) return
    setPhase(openingPhase())
    setStep(1)
    setSwapping(false)
  }, [seen])

  useEffect(() => {
    if (!open) return

    // The page behind is real and scrollable; a wheel over an opaque cover that
    // moves the thing it is covering reads as a broken overlay.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // Photos are fetched a step ahead — and the first one during the title card
  // — so the swap at the flip's midpoint, the moment the card is edge-on, never
  // lands on a blank panel.
  useEffect(() => {
    if (!open) return
    for (const offset of [step - 1, step]) {
      const img = new Image()
      img.src = HERO_IMAGES[offset % HERO_IMAGES.length]
    }
  }, [open, step])

  const advance = useCallback((to: number) => {
    setSwapping(true)
    window.setTimeout(() => {
      setStep(to)
      setSwapping(false)
    }, SWAP_MS)
  }, [])

  const dismiss = useCallback(() => {
    markWelcomeSeen()
    setPhase('exiting')
  }, [])

  const next = useCallback(() => {
    if (last) dismiss()
    else advance(step + 1)
  }, [last, dismiss, advance, step])

  const leaveTitle = useCallback(() => {
    setPhase((p) => (p === 'title' ? 'title-out' : p))
  }, [])

  // Every timed phase, and the unmount. Each timer is also the backstop for its
  // animation: `animationend` does not fire at all when the reduced-motion
  // rules take the animations away, and can be missed in a backgrounded tab.
  useEffect(() => {
    const after: Partial<Record<Phase, [Phase, number]>> = {
      title: ['title-out', TITLE_MS],
      'title-out': ['reading', TITLE_OUT_MS],
      exiting: ['iris', EXIT_MS],
      iris: ['gone', IRIS_MS],
    }
    const hop = after[phase]
    if (!hop) return
    const [to, ms] = hop
    const timer = window.setTimeout(() => setPhase(to), ms)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Move focus to each new slide for keyboard and screen-reader users.
  useEffect(() => {
    if (phase !== 'reading' || swapping) return
    contentRef.current?.focus({ preventScroll: true })
  }, [step, phase, swapping])

  if (!open) return null

  const showTitle = phase === 'title' || phase === 'title-out'
  // Mounted a beat early, under the navy, so the first slide's photo is decoded
  // and its copy is mid-reveal as the curtain lifts; held through `exiting` so
  // the copy can play its blur-out; gone by `iris`, which is the point — the
  // hole must never have anything but the app behind it.
  const showDeck = phase === 'title-out' || phase === 'reading' || phase === 'exiting'
  /** Stagger slot for a line of copy. */
  const line = (order: number) => ({ animationDelay: `${order * 110}ms` })

  return (
    <div
      // z-max, and it has to be: this sits over the navbar, the FAB, toasts,
      // and the analytics consent sheet — which is z-toast and is showing on
      // this exact same first visit. Anything lower and the first screen a new
      // reader sees has a cookie banner poking through it.
      //
      // No background of its own. Every surface here belongs to a child that
      // is gone by the time the iris opens — the root must be see-through, or
      // the hole would open onto it instead of the page.
      className="welcome-panel fixed inset-0 z-max"
      data-phase={phase === 'reading' ? undefined : phase}
      role="dialog"
      aria-modal="true"
      aria-label={t`Welcome to KTIP`}
      onKeyDown={(e) => {
        if (showTitle) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') leaveTitle()
          return
        }
        if (phase !== 'reading' || swapping) return
        if (e.key === 'ArrowRight') next()
        if (e.key === 'ArrowLeft' && step > 1) advance(step - 1)
        if (e.key === 'Escape') dismiss()
      }}
    >
      {showDeck && (
        <div className="absolute inset-0 bg-ktip-cream p-3 md:p-4">
          {/* Stage: perspective lives here so the photo panel renders in 3D. */}
          <div className="relative h-full" style={{ perspective: '1200px' }}>
            {/* Photo panel — travels across the stage while flipping. Hidden on
                mobile, where there is no room for a split. */}
            <div
              ref={panelRef}
              className="absolute inset-y-0 left-0 z-10 hidden md:block w-[45%] rounded-2xl overflow-hidden shadow-hard"
              style={{ willChange: 'transform' }}
            >
              {/* Odd faces land at 180deg (mirrored) — undo it so the content
                  on the photo reads the right way round. */}
              <div className="absolute inset-0" style={{ transform: `scaleX(${mirrored ? -1 : 1})` }}>
                <ResponsiveImage
                  // Keyed per face so the push-in restarts with each photo.
                  key={face}
                  src={HERO_IMAGES[face % HERO_IMAGES.length]}
                  alt=""
                  sizes="(min-width: 768px) 45vw, 100vw"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="welcome-photo absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/85 via-brand-navy/20 to-brand-navy/45" />
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
                  <img src="/ktip-logo-128.webp" alt="KTiP" className="h-9 w-auto drop-shadow" />
                  <span className="font-display text-sm font-semibold tracking-[0.2em] text-brand-white/70">
                    {String(face + 1).padStart(2, '0')}
                    <span className="mx-1.5 text-brand-white/35">/</span>
                    {String(SLIDES.length).padStart(2, '0')}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-6 space-y-4">
                  <p className="font-display text-2xl font-semibold text-brand-white leading-snug">
                    {i18n._(slide.eyebrow)}
                  </p>
                  <Stepper variant="compact" onPhoto steps={stepLabels} currentStep={face} />
                </div>
              </div>
            </div>

            {/* Copy side — whichever side the photo is not; swaps at the flip's
                midpoint, the same way the signup deck does it. */}
            <div
              className={
                'relative h-full overflow-y-auto md:w-[55%] px-2 sm:px-6 ' +
                (imageOnLeft ? 'md:ml-auto md:pl-12 md:pr-6' : 'md:mr-auto md:pr-12 md:pl-6')
              }
            >
              <div
                // Keyed by step so every slide's copy re-mounts and replays its
                // reveal from the top rather than cross-fading in place.
                key={step}
                className="welcome-slide flex min-h-full flex-col justify-center py-6"
                data-leaving={swapping || undefined}
              >
                <div ref={contentRef} tabIndex={-1} className="w-full max-w-xl mx-auto outline-none">
                  <p
                    className="welcome-line text-xs font-semibold uppercase tracking-[0.3em] text-ktip-tropical-700"
                    style={line(0)}
                  >
                    {i18n._(slide.eyebrow)}
                  </p>

                  <h1
                    className="welcome-line mt-3 font-display text-display-sm sm:text-display md:text-display-lg font-extrabold text-ktip-sand-900 text-balance"
                    style={line(1)}
                  >
                    {i18n._(slide.title)}
                  </h1>

                  <p
                    className="welcome-line mt-5 max-w-[46ch] text-body-lg text-ktip-sand-600 leading-relaxed"
                    style={line(2)}
                  >
                    {i18n._(slide.body)}
                  </p>

                  {/* Progress on mobile, where the photo panel carrying it is
                      hidden. */}
                  <div className="welcome-line md:hidden mt-8" style={line(3)}>
                    <Stepper variant="compact" steps={stepLabels} currentStep={face} />
                  </div>

                  {/* Forward on the right, where a forward step belongs; the
                      way back and the way out sit to its left, quieter. */}
                  <div
                    className="welcome-line mt-10 flex items-center justify-end gap-3"
                    style={line(4)}
                  >
                    <Button variant="ghost" size="sm" onClick={dismiss}>
                      <Trans>Skip</Trans>
                    </Button>
                    {step > 1 && (
                      <Button
                        variant="secondary"
                        size="lg"
                        icon={<ArrowLeft size={16} />}
                        onClick={() => advance(step - 1)}
                        aria-label={t`Previous`}
                      />
                    )}
                    {/* autoFocus so a keyboard reader lands on the way forward
                        without a Tab. */}
                    <Button size="lg" autoFocus onClick={next}>
                      {last ? <Trans>Enter KTIP</Trans> : <Trans>Next</Trans>}
                      <ArrowRight size={16} />
                    </Button>
                  </div>

                  <p className="sr-only" aria-live="polite">
                    {t`Step ${step} of ${SLIDES.length}`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="absolute bottom-4 left-5 md:bottom-6 md:left-8 text-[11px] uppercase tracking-[0.2em] text-ktip-sand-500">
            <Trans>OECS · Knowledge, Technology & Innovation Platform</Trans>
          </p>
        </div>
      )}

      {/* The curtain and the iris, in one. Solid under the title card, lifted
          for the deck, lowered again over it, then opened. Sits above the deck
          and below the title card. */}
      <div className="welcome-panel-iris z-10" aria-hidden="true" />

      {showTitle && (
        <div
          // Any click, tap or key moves things along; nobody should have to
          // find the one right place to press on a title card.
          className="welcome-slide absolute inset-0 z-20 flex items-center justify-center overflow-hidden cursor-pointer"
          data-leaving={phase === 'title-out' || undefined}
          onClick={leaveTitle}
        >
          {/* The mark, large, behind the words. */}
          <img
            src="/ktip-logo.webp"
            alt=""
            decoding="async"
            // Centred by the class's own transform, not Tailwind's translate
            // utilities: those write the `translate` property, which would
            // stack with the keyframe's transform and push it off-centre.
            className="welcome-title-mark absolute left-1/2 top-1/2 w-[min(78vmin,42rem)] select-none pointer-events-none"
          />

          <div className="relative text-center px-6">
            <p
              className="welcome-line text-sm sm:text-base font-semibold uppercase tracking-[0.4em] text-brand-green"
              style={line(0)}
            >
              <Trans>Welcome to</Trans>
            </p>
            <p
              className="welcome-line mt-3 font-display font-extrabold text-brand-white leading-none tracking-tight text-[clamp(5rem,18vw,13rem)]"
              style={line(1)}
            >
              KTIP
            </p>
            <div className="mt-6 flex justify-center">
              <span className="welcome-rule block h-0.5 w-24 sm:w-32 bg-brand-green" style={line(2)} />
            </div>
            <p
              className="welcome-line mt-6 text-sm sm:text-base text-brand-white/70 tracking-wide"
              style={line(3)}
            >
              <Trans>The OECS Knowledge, Technology & Innovation Platform</Trans>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default WelcomePanel
