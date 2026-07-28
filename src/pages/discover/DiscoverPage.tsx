import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'
import { FlipWatermark } from '../../components/ui/FlipWatermark'
import { PreRegistrationModal } from '../../components/PreRegistrationModal'
import { useAuth } from '../../contexts/AuthContext'
import { analytics } from '../../hooks/useAnalytics'
import { useProjects } from '../../hooks/useProjects'
import { useEvents } from '../../hooks/useEvents'
import { useGrants } from '../../hooks/useGrants'
import type { Grant } from '../../types'
import {
  FolderKanban,
  Calendar,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'

type Mode = 'grants' | 'projects' | 'events'

const MODES: { id: Mode; label: string; icon: LucideIcon; href: string }[] = [
  { id: 'grants', label: 'Grants', icon: DollarSign, href: '/grants' },
  { id: 'projects', label: 'Projects', icon: FolderKanban, href: '/projects' },
  { id: 'events', label: 'Events', icon: Calendar, href: '/events' },
]

interface HeroItem {
  id: string
  title: string
  meta: string
  description: string
  href: string
  image: string | null
}

const FALLBACK_IMAGE = '/ktiphero.png'

// Pool of stock hero images assigned to items that have no image of their own.
// The pick is a stable hash of the item id so each card keeps its image across
// renders instead of reshuffling.
const HERO_IMAGES = [
  '/hero/hero-1.jpg',
  '/hero/hero-2.jpg',
  '/hero/hero-3.jpg',
  '/hero/hero-4.jpg',
  '/hero/hero-5.jpg',
  '/hero/hero-6.jpg',
]

const heroImageFor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HERO_IMAGES[h % HERO_IMAGES.length]
}
const MAX_ITEMS = 6
const VISIBLE_COUNT = 5

interface Feature {
  title: string
  category: string
  description: string
  href: string
  image: string
  gradient: string
  span: string
}

const FEATURES: Feature[] = [
  {
    title: 'Projects',
    category: 'Collaboration',
    description: 'Launch and collaborate on innovative projects with creators across the Caribbean.',
    href: '/projects',
    image: '/hero/hero-1.jpg',
    gradient: 'from-ktip-ocean-700 via-ktip-ocean-600/70 to-ktip-ocean-500/10',
    span: 'md:col-span-2 md:row-span-2',
  },
  {
    title: 'Events',
    category: 'Community',
    description: 'Discover workshops, hackathons, and networking events happening near you.',
    href: '/events',
    image: '/hero/hero-2.jpg',
    gradient: 'from-ktip-tropical-700 via-ktip-tropical-600/70 to-ktip-tropical-500/10',
    span: 'md:col-span-2',
  },
  {
    title: 'Grants',
    category: 'Funding',
    description: 'Find funding opportunities and grants to turn your ideas into reality.',
    href: '/grants',
    image: '/hero/hero-3.jpg',
    gradient: 'from-purple-800 via-purple-600/70 to-purple-500/10',
    span: '',
  },
  {
    title: 'Forums',
    category: 'Discussion',
    description: 'Join discussions, share knowledge, and engage with the community.',
    href: '/forums',
    image: '/hero/hero-4.jpg',
    gradient: 'from-pink-700 via-pink-500/70 to-pink-400/10',
    span: '',
  },
  {
    title: 'Messages',
    category: 'Communication',
    description: 'Connect directly with mentors, investors, and fellow innovators.',
    href: '/messages',
    image: '/hero/hero-5.jpg',
    gradient: 'from-indigo-800 via-indigo-600/70 to-indigo-500/10',
    span: '',
  },
  {
    title: 'Resources',
    category: 'Knowledge',
    description: 'Access articles, guides, case studies, and tools for Caribbean innovation.',
    href: '/resources',
    image: '/hero/hero-6.jpg',
    gradient: 'from-orange-700 via-orange-500/70 to-orange-400/10',
    span: 'md:col-span-2',
  },
  {
    title: 'Directory',
    category: 'Network',
    description: 'Browse the member directory and connect with innovators across the Caribbean.',
    href: '/directory',
    image: '/ktiphero.png',
    gradient: 'from-teal-700 via-teal-600/70 to-teal-500/10',
    span: '',
  },
]

function grantAmount(g: Grant): string {
  if (g.amount_max) return `Up to ${g.currency || 'USD'} ${g.amount_max.toLocaleString()}`
  if (g.amount_min) return `From ${g.currency || 'USD'} ${g.amount_min.toLocaleString()}`
  return g.grant_type || 'Funding'
}

export default function DiscoverPage() {
  usePageTitle('Discover')
  const auth = useAuth()

  // Pre-registration modal — auto-open for unauthenticated visitors (once per session)
  const [preregOpen, setPreregOpen] = useState(false)

  useEffect(() => {
    if (!auth.user && !sessionStorage.getItem('ktip_prereg_dismissed')) {
      const timer = setTimeout(() => {
        setPreregOpen(true)
        analytics.funnel('prereg', 'modal_auto_opened')
      }, 2000)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePreregClose = () => {
    setPreregOpen(false)
    sessionStorage.setItem('ktip_prereg_dismissed', '1')
  }

  // --- Mode toggle + live data ---
  const [mode, setMode] = useState<Mode>('grants')
  const { grants } = useGrants({ active: true })
  const { projects } = useProjects()
  const { events } = useEvents({ upcoming: true })

  const items = useMemo<HeroItem[]>(() => {
    if (mode === 'grants') {
      return (grants || []).slice(0, MAX_ITEMS).map((g) => ({
        id: g.id,
        title: g.title,
        meta: grantAmount(g),
        description: g.summary || g.description || 'Funding opportunity for Caribbean innovators.',
        href: `/grants/${g.id}`,
        image: heroImageFor(g.id),
      }))
    }
    if (mode === 'projects') {
      return (projects || []).slice(0, MAX_ITEMS).map((p) => ({
        id: p.id,
        title: p.title,
        meta: (p.category as string) || 'Project',
        description: p.summary || p.description || 'An innovation project from the OECS community.',
        href: `/projects/${p.id}`,
        image: p.image_url || heroImageFor(p.id),
      }))
    }
    return (events || []).slice(0, MAX_ITEMS).map((e) => ({
      id: e.id,
      title: e.title,
      meta: `${format(new Date(e.start_date), 'MMM d, yyyy')}${e.location ? ` · ${e.location}` : ''}`,
      description: e.summary || e.description || 'An upcoming event for the OECS community.',
      href: `/events/${e.id}`,
      image: e.image_url || heroImageFor(e.id),
    }))
  }, [mode, grants, projects, events])

  const activeMode = MODES.find((m) => m.id === mode)!
  const modeIndex = MODES.indexOf(activeMode)

  // --- Selection + auto-rotate ---
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const count = items.length
  const next = useCallback(() => {
    if (count > 1) setIndex((i) => (i + 1) % count)
  }, [count])
  const prev = useCallback(() => {
    if (count > 1) setIndex((i) => (i - 1 + count) % count)
  }, [count])

  useEffect(() => {
    if (paused || count < 2) return
    const interval = setInterval(next, 6000)
    return () => clearInterval(interval)
  }, [paused, next, count])

  // Clamp selection when the list shrinks or mode changes
  useEffect(() => {
    setIndex((i) => (count === 0 ? 0 : Math.min(i, count - 1)))
  }, [count])

  // --- Ring carousel ---
  // The strip is a circular track (items rendered three times when it wraps).
  // On selection the track rotates RIGHT until the selected card slides off
  // the right edge of the strip; only then does the hero swap animation start.
  const ring = count > 1
  const slots = Math.min(VISIBLE_COUNT, Math.max(count, 1))
  const trackItems = ring ? [...items, ...items, ...items] : items
  const [pos, setPos] = useState(0) // track position of the first visible card
  const [trackAnimating, setTrackAnimating] = useState(false)
  const [trackTransition, setTrackTransition] = useState(false)
  const [cardW, setCardW] = useState(128)
  const GAP = 12 // matches gap-3
  const step = cardW + GAP

  // Track position that puts the active card one step PAST the last visible
  // slot — i.e. slid off the right edge of the clipped strip.
  // pos DECREASES so the whole strip slides to the RIGHT — the selected card
  // travels rightward until it exits, wrapping circularly (the track
  // is tripled; we silently re-center into the middle copy between moves).
  const targetPos = (() => {
    if (!ring) return 0
    const base = pos < count ? pos + count : pos
    const cur = base % count
    const target = (index - slots + count) % count
    return base - ((cur - target + count) % count)
  })()

  useEffect(() => {
    if (!ring || trackAnimating) return
    // Re-center into the middle copy (no animation) so there's always room
    // to slide right without running off the tripled track
    if (pos < count || pos >= 2 * count) {
      setTrackTransition(false)
      setPos(count + (pos % count))
      return
    }
    if (targetPos === pos) return
    setTrackTransition(true)
    setTrackAnimating(true)
    setPos(targetPos)
  }, [targetPos, pos, ring, count, trackAnimating])

  // Keep the measured card width in sync (w-28 → sm:w-32 breakpoint)
  const cardRefs = useRef(new Map<number, HTMLElement>())
  useEffect(() => {
    const el = cardRefs.current.get(0)
    if (!el) return
    setCardW(el.offsetWidth)
    const ro = new ResizeObserver(() => setCardW(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [count, mode])

  // Keyboard arrows navigate the cards
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [next, prev])

  const switchMode = (m: Mode) => {
    setMode(m)
    setIndex(0)
  }

  const active: HeroItem | null = count > 0 ? items[index] : null

  // Hero image swap: once the carousel finishes sliding the active card off
  // the right edge of the strip, a ghost mounted exactly where that card
  // stopped (just right of the strip, over the hero) expands in place until it
  // fills the hero, then fades away to reveal the (already swapped) dimmed
  // base image. No extra slide — the carousel rotation IS the slide, so the
  // two can never drift out of sync.
  const heroSrc = active?.image || FALLBACK_IMAGE
  const [shownSrc, setShownSrc] = useState(heroSrc)
  const [anim, setAnim] = useState<{
    src: string
    phase: 'start' | 'expand' | 'fade'
    from: { x: number; y: number; w: number; h: number }
    sec: { w: number; h: number }
  } | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const rotatePending = ring && (targetPos !== pos || trackAnimating)

  useEffect(() => {
    if (heroSrc === shownSrc || anim?.src === heroSrc || rotatePending) return
    const sec = sectionRef.current
    if (!sec) {
      setShownSrc(heroSrc)
      return
    }
    const s = sec.getBoundingClientRect()
    // The active card has slid one step past the right edge — expand from
    // that off-strip rect
    const el = cardRefs.current.get(pos + slots)
    // Fallback origin when the card isn't mounted: small box near the strip
    let from = { x: s.width * 0.1, y: s.height * 0.7, w: 128, h: 200 }
    if (el) {
      const r = el.getBoundingClientRect()
      from = { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }
    }
    setAnim({ src: heroSrc, phase: 'start', from, sec: { w: s.width, h: s.height } })
  }, [heroSrc, shownSrc, anim, index, count, rotatePending, pos, slots])

  // Two frames after mounting the ghost at the card's rect, start the expand
  useEffect(() => {
    if (anim?.phase !== 'start') return
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setAnim((a) => (a && a.phase === 'start' ? { ...a, phase: 'expand' } : a)),
      ),
    )
    return () => cancelAnimationFrame(raf)
  }, [anim])

  const ghostStyle = (): CSSProperties => {
    if (!anim) return {}
    const { from, sec, phase } = anim
    if (phase === 'start')
      return {
        left: from.x,
        top: from.y,
        width: from.w,
        height: from.h,
        borderRadius: 6,
        transition: 'none',
      }
    return {
      left: 0,
      top: 0,
      width: sec.w,
      height: sec.h,
      borderRadius: 0,
      opacity: phase === 'fade' ? 0 : 1,
      transition:
        phase === 'fade'
          ? 'opacity 0.4s ease'
          : 'left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), width 0.6s cubic-bezier(0.22, 1, 0.36, 1), height 0.6s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
    }
  }
  return (
    <>
      <section ref={sectionRef} className="sticky top-0 min-h-screen bg-gray-900 overflow-hidden">
        {/* Full-bleed hero image — follows the selected item */}
        <img
          src={shownSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover animate-fade-in"
          loading="eager"
        />
        {/* Frosted blur over the left side, fading out toward the right */}
        <div className="absolute inset-y-0 left-0 w-full md:w-[80%] backdrop-blur-2xl bg-black/10 [mask-image:linear-gradient(to_right,black_55%,transparent_100%)]" />
        {/* Neutral dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/40 to-black/30" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Ghost card: expands from where the card slid off the strip to fill the hero, then fades */}
        {anim && (
          <div
            className="absolute overflow-hidden shadow-2xl pointer-events-none"
            style={ghostStyle()}
            onTransitionEnd={(e) => {
              if (!anim) return
              if (anim.phase === 'expand' && e.propertyName === 'width') {
                setShownSrc(anim.src)
                setAnim({ ...anim, phase: 'fade' })
              } else if (anim.phase === 'fade' && e.propertyName === 'opacity') {
                setAnim(null)
              }
            }}
          >
            <img src={anim.src} alt="" className="w-full h-full object-cover" />
          </div>
        )}


        {/* Content — pt clears the fixed transparent navbar */}
        <div className="relative container mx-auto px-6 md:px-12 flex flex-col min-h-screen pt-28 md:pt-32 pb-8 md:pb-10">
          {/* Counter */}
          <div className="flex items-center justify-end">
            {count > 0 && (
              <p className="text-xs font-mono text-white/60 tabular-nums">
                {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </p>
            )}
          </div>

          {/* Active item content — right side */}
          <div className="flex-1 flex flex-col justify-center items-start md:items-end">
            {active ? (
              <div
                key={`content-${mode}-${active.id}`}
                className="max-w-2xl animate-slide-up text-left md:text-right"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-3 text-white/60">
                  {activeMode.label} &middot; {active.meta}
                </p>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-extrabold text-white leading-[1.08] tracking-tight">
                  {active.title}
                </h1>
                <p className="mt-5 text-base md:text-lg text-white/80 max-w-xl leading-relaxed line-clamp-3 md:ml-auto">
                  {active.description}
                </p>

                <div className="mt-8 flex items-center gap-4 md:justify-end">
                  <Link
                    to={active.href}
                    className="group inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-white text-gray-900 text-sm font-medium tracking-wide hover:bg-white/90 transition-colors"
                  >
                    View Details
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                  {!auth.user && (
                    <button
                      onClick={() => {
                        setPreregOpen(true)
                        analytics.click('hero_prereg_cta', 'Pre-Register Now')
                        analytics.funnel('prereg', 'modal_cta_opened')
                      }}
                      className="px-7 py-3 rounded-lg border border-white/40 text-white text-sm font-medium tracking-wide hover:bg-white/10 transition-colors"
                    >
                      Pre-Register
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl animate-fade-in text-left md:text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-3 text-white/60">
                  {activeMode.label}
                </p>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-extrabold text-white leading-[1.08] tracking-tight">
                  Innovate. Collaborate.
                </h1>
                <p className="mt-5 text-base md:text-lg text-white/80 max-w-xl leading-relaxed md:ml-auto">
                  Nothing to show here yet — explore the platform to see what&apos;s happening
                  across the Caribbean.
                </p>
                <div className="mt-8 md:flex md:justify-end">
                  <Link
                    to={activeMode.href}
                    className="group inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-white text-gray-900 text-sm font-medium tracking-wide hover:bg-white/90 transition-colors"
                  >
                    Browse {activeMode.label}
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Bottom-left: mode toggle + mini cards */}
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              {/* Slide toggle */}
              <div className="relative inline-flex bg-white/10 backdrop-blur-sm p-1 mb-4 rounded-lg">
                <div
                  className="absolute top-1 bottom-1 w-[calc((100%-0.5rem)/3)] bg-white rounded-md transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(${modeIndex * 100}%)` }}
                />
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => switchMode(m.id)}
                    className={`relative z-10 flex items-center gap-2 px-5 py-2 text-sm font-medium transition-colors duration-300 ${
                      mode === m.id ? 'text-gray-900' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <m.icon size={15} />
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Portrait mini cards — click selects, hover shows arrows and pauses rotation */}
              <div
                className="relative group/cards"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
              >
                <div
                  ref={viewportRef}
                  className="pt-1.5 pb-1 max-w-full"
                  // Clip the strip on the left/top/bottom but let it overflow
                  // one card-slot to the right, so the exiting card stays
                  // visible as it slides off before expanding into the hero
                  style={
                    count > 0
                      ? { width: slots * step - GAP, clipPath: `inset(0px ${-step}px 0px 0px)` }
                      : undefined
                  }
                >
                <div
                  className="flex items-end gap-3"
                  style={{
                    transform: `translateX(${-pos * step}px)`,
                    transition: trackTransition
                      ? 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)'
                      : 'none',
                  }}
                  onTransitionEnd={(e) => {
                    if (e.propertyName !== 'transform' || e.target !== e.currentTarget) return
                    setTrackAnimating(false)
                  }}
                >
                {trackItems.map((item, t) => {
                  const itemIdx = t % Math.max(count, 1)
                  const isActive = itemIdx === index
                  // The card parked one step past the right edge (the one the
                  // ghost expanded from) stays hidden once its slide is done,
                  // so it doesn't linger over the hero after the ghost fades
                  const offStage =
                    ring && t === pos + slots && !rotatePending && (!anim || anim.phase === 'fade')
                  return (
                    <button
                      key={`${t}-${item.id}`}
                      ref={(el) => {
                        if (el) cardRefs.current.set(t, el)
                        else cardRefs.current.delete(t)
                      }}
                      style={{
                        opacity: offStage ? 0 : 1,
                        pointerEvents: offStage ? 'none' : undefined,
                      }}
                      onClick={() => setIndex(itemIdx)}
                      className={`group text-left shrink-0 w-28 sm:w-32 rounded-lg overflow-hidden transition-all duration-300 ${
                        isActive
                          ? 'bg-white shadow-hard -translate-y-1'
                          : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                      }`}
                    >
                      <div
                        className={`h-28 sm:h-36 overflow-hidden flex items-center justify-center ${
                          isActive ? 'bg-ktip-sand-50' : ''
                        }`}
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <activeMode.icon
                            size={30}
                            className={isActive ? 'text-ktip-ocean-600' : 'text-white/80'}
                          />
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <p
                          className={`text-sm font-display font-semibold line-clamp-2 ${
                            isActive ? 'text-ktip-sand-900' : 'text-white'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p
                          className={`text-[10px] mt-0.5 uppercase tracking-wider truncate ${
                            isActive ? 'text-ktip-sand-500' : 'text-white/50'
                          }`}
                        >
                          {item.meta}
                        </p>
                      </div>
                    </button>
                  )
                })}
                  {count === 0 &&
                    Array.from({ length: VISIBLE_COUNT }, (_, i) => (
                      <div
                        key={i}
                        className="shrink-0 w-28 sm:w-32 rounded-lg overflow-hidden bg-white/10 backdrop-blur-sm animate-pulse"
                      >
                        <div className="h-28 sm:h-36 flex items-center justify-center">
                          <activeMode.icon size={30} className="text-white/30" />
                        </div>
                        <div className="px-3 py-2.5 space-y-2">
                          <div className="h-3 w-4/5 bg-white/20" />
                          <div className="h-2 w-3/5 bg-white/10" />
                        </div>
                      </div>
                    ))}
                </div>
                </div>

                {/* Hover arrows over the card strip */}
                {count > 1 && (
                  <>
                    <button
                      onClick={prev}
                      aria-label="Previous"
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white text-gray-900 shadow-hard flex items-center justify-center opacity-0 group-hover/cards:opacity-100 transition-opacity duration-200"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={next}
                      aria-label="Next"
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-9 h-9 rounded-full bg-white text-gray-900 shadow-hard flex items-center justify-center opacity-0 group-hover/cards:opacity-100 transition-opacity duration-200"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento feature grid */}
      <section className="relative z-10 bg-ktip-sand-50 py-20 md:py-28 overflow-x-clip">
        {/* Watermark straddles the hero/bento boundary: top 25% floats over the
            dark hero (light tint), the rest sits on the light section (dark tint) */}
        <FlipWatermark
          className="-top-[0.25em] right-0 md:-right-4"
          charClassName="text-transparent bg-clip-text bg-[linear-gradient(to_bottom,rgba(255,255,255,0.16)_25%,rgba(28,25,23,0.1)_25%)]"
        />

        <div className="relative container mx-auto px-6 md:px-12">
          <div className="mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-ktip-sand-500 mb-3">
              The Platform
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-extrabold text-ktip-sand-900 tracking-tight">
              Everything you need to innovate
            </h2>
            <p className="mt-3 text-ktip-sand-600 max-w-xl">
              Discover tools and resources designed to empower Caribbean innovation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:auto-rows-[minmax(10.5rem,auto)]">
            {FEATURES.map((f) => (
              <Link
                key={f.title}
                to={f.href}
                className={`group relative rounded-2xl p-6 flex flex-col justify-between gap-6 overflow-hidden shadow-medium hover:shadow-hard hover:-translate-y-0.5 transition-all duration-300 ${f.span}`}
              >
                {/* Photo + brand color wash (solid at top-left, photo shows through bottom-right) */}
                <img
                  src={f.image}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient}`} />

                <div className="relative">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/75 mb-2">
                    {f.category}
                  </p>
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-white/85 leading-relaxed line-clamp-2 max-w-xs [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
                    {f.description}
                  </p>
                </div>

                <span className="relative self-start inline-flex items-center gap-1.5 bg-white text-gray-900 rounded-lg px-4 py-2 text-xs font-semibold shadow-md group-hover:gap-2.5 transition-all">
                  Explore <ArrowRight size={13} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <PreRegistrationModal open={preregOpen} onClose={handlePreregClose} />
    </>
  )
}
