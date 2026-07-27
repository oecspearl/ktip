import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'
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
const MAX_ITEMS = 6
const VISIBLE_COUNT = 4

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
        image: null,
      }))
    }
    if (mode === 'projects') {
      return (projects || []).slice(0, MAX_ITEMS).map((p) => ({
        id: p.id,
        title: p.title,
        meta: (p.category as string) || 'Project',
        description: p.summary || p.description || 'An innovation project from the OECS community.',
        href: `/projects/${p.id}`,
        image: p.image_url,
      }))
    }
    return (events || []).slice(0, MAX_ITEMS).map((e) => ({
      id: e.id,
      title: e.title,
      meta: `${format(new Date(e.start_date), 'MMM d, yyyy')}${e.location ? ` · ${e.location}` : ''}`,
      description: e.summary || e.description || 'An upcoming event for the OECS community.',
      href: `/events/${e.id}`,
      image: e.image_url,
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
    const interval = setInterval(next, 5000)
    return () => clearInterval(interval)
  }, [paused, next, count])

  // Clamp selection when the list shrinks or mode changes
  useEffect(() => {
    setIndex((i) => (count === 0 ? 0 : Math.min(i, count - 1)))
  }, [count])

  const switchMode = (m: Mode) => {
    setMode(m)
    setIndex(0)
  }

  const active: HeroItem | null = count > 0 ? items[index] : null
  const visible =
    count > 0
      ? Array.from({ length: Math.min(VISIBLE_COUNT, count) }, (_, i) => {
          const idx = (index + i) % count
          return { item: items[idx], idx }
        })
      : []

  return (
    <>
      <section
        className="relative min-h-screen bg-gray-900 overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Full-bleed hero image — follows the selected item */}
        <img
          key={`${mode}-${active?.id ?? 'fallback'}`}
          src={active?.image || FALLBACK_IMAGE}
          alt=""
          className="absolute inset-0 w-full h-full object-cover animate-fade-in"
          loading="eager"
        />
        {/* Frosted blur over the left side, fading out toward the right */}
        <div className="absolute inset-y-0 left-0 w-full md:w-[65%] backdrop-blur-xl bg-black/10 [mask-image:linear-gradient(to_right,black_40%,transparent_100%)]" />
        {/* Neutral dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/40 to-black/30" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Content — pt clears the fixed transparent navbar */}
        <div className="relative container mx-auto px-6 md:px-12 flex flex-col min-h-screen pt-28 md:pt-32 pb-8 md:pb-10">
          {/* Eyebrow */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60 animate-fade-in">
              OECS &middot; Innovate &middot; Collaborate &middot; Transform
            </p>
            {count > 0 && (
              <p className="text-xs font-mono text-white/60 tabular-nums">
                {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </p>
            )}
          </div>

          {/* Active item content — right side */}
          <div className="flex-1 flex flex-col justify-center items-start md:items-end">
            {active ? (
              <div key={`content-${mode}-${active.id}`} className="max-w-2xl animate-slide-up">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-3 text-white/60">
                  {activeMode.label} &middot; {active.meta}
                </p>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-extrabold text-white leading-[1.08] tracking-tight">
                  {active.title}
                </h1>
                <p className="mt-5 text-base md:text-lg text-white/80 max-w-xl leading-relaxed line-clamp-3">
                  {active.description}
                </p>

                <div className="mt-8 flex items-center gap-4">
                  <Link
                    to={active.href}
                    className="group inline-flex items-center gap-2 px-7 py-3 bg-white text-gray-900 text-sm font-medium tracking-wide hover:bg-white/90 transition-colors"
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
                      className="px-7 py-3 border border-white/40 text-white text-sm font-medium tracking-wide hover:bg-white/10 transition-colors"
                    >
                      Pre-Register
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl animate-fade-in">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-3 text-white/60">
                  {activeMode.label}
                </p>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-extrabold text-white leading-[1.08] tracking-tight">
                  Innovate. Collaborate.
                </h1>
                <p className="mt-5 text-base md:text-lg text-white/80 max-w-xl leading-relaxed">
                  Nothing to show here yet — explore the platform to see what&apos;s happening
                  across the Caribbean.
                </p>
                <div className="mt-8">
                  <Link
                    to={activeMode.href}
                    className="group inline-flex items-center gap-2 px-7 py-3 bg-white text-gray-900 text-sm font-medium tracking-wide hover:bg-white/90 transition-colors"
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
              <div className="relative inline-flex bg-white/10 backdrop-blur-sm p-1 mb-4">
                <div
                  className="absolute top-1 bottom-1 w-[calc((100%-0.5rem)/3)] bg-white transition-transform duration-300 ease-out"
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

              {/* Portrait mini cards — click selects */}
              <div className="flex items-end gap-3 overflow-x-auto scrollbar-hide pb-1">
                {visible.map(({ item, idx }) => {
                  const isActive = idx === index
                  return (
                    <button
                      key={item.id}
                      onClick={() => setIndex(idx)}
                      className={`group text-left shrink-0 w-28 sm:w-32 transition-all duration-300 ${
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
                      className="shrink-0 w-28 sm:w-32 bg-white/10 backdrop-blur-sm animate-pulse"
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

            {/* Prev / next controls */}
            {count > 1 && (
              <div className="hidden sm:flex flex-col gap-px mb-1 shrink-0">
                <button
                  onClick={prev}
                  aria-label="Previous"
                  className="w-9 h-9 bg-white/10 backdrop-blur-sm hover:bg-white text-white hover:text-gray-900 flex items-center justify-center transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={next}
                  aria-label="Next"
                  className="w-9 h-9 bg-white/10 backdrop-blur-sm hover:bg-white text-white hover:text-gray-900 flex items-center justify-center transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <PreRegistrationModal open={preregOpen} onClose={handlePreregClose} />
    </>
  )
}
