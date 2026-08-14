import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAccessibilityPrefs } from '../../hooks/useAccessibilityPrefs'
import { useViewportScale } from '../../hooks/useViewportScale'
import { FlipWatermark } from '../../components/ui/FlipWatermark'
import { ResponsiveImage } from '../../components/ui/ResponsiveImage'
import { useMobileLite } from '../../hooks/useMediaQuery'
import { FALLBACK_IMAGE, HERO_WASH, grantImageFor, heroImageFor } from '../../lib/hero-images'
import { eventHeroDetails, grantHeroDetails, projectHeroDetails } from '../../lib/hero-details'
import { useProjects } from '../../hooks/useProjects'
import { useEvents } from '../../hooks/useEvents'
import { useGrants } from '../../hooks/useGrants'
import { usePlatformStats, type PlatformStats } from '../../hooks/usePlatformStats'
import type { DetailEntry, Grant } from '../../types'
import { DetailsList } from '../../components/shared/DetailsList'
import { entityPath } from '../../lib/slug'
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

const MODES: { id: Mode; label: MessageDescriptor; icon: LucideIcon; href: string }[] = [
  { id: 'grants', label: msg`Grants`, icon: DollarSign, href: '/grants' },
  { id: 'projects', label: msg`Projects`, icon: FolderKanban, href: '/projects' },
  { id: 'events', label: msg`Events`, icon: Calendar, href: '/events' },
]

interface HeroItem {
  id: string
  title: string
  meta: string
  description: string
  details?: DetailEntry[]
  href: string
  image: string | null
}

const MAX_ITEMS = 6
const VISIBLE_COUNT = 5

// Below ~1100px there is no honest way to keep five cards at design proportions,
// so the strip drops slots rather than shrinking the cards out of ratio. Every
// real desktop (1280 and up) still gets the full five.
const visibleCountFor = (w: number) => (w < 900 ? 3 : w < 1100 ? 4 : VISIBLE_COUNT)

function useVisibleCount() {
  const [n, setN] = useState(() =>
    typeof window === 'undefined' ? VISIBLE_COUNT : visibleCountFor(window.innerWidth),
  )
  useEffect(() => {
    const onResize = () => setN(visibleCountFor(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return n
}

/**
 * The hero's motion is inline styles and Tailwind `transition-*`, neither of
 * which the global `prefers-reduced-motion` block in index.css touches — that
 * one only disables keyframe animations. So it is checked here by hand.
 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

/**
 * Hero ratio map — how the hero translates across screens.
 *
 *   SIZE     one multiplier drives a base font-size; every length inside the
 *            hero is `em`, so type, cards, gaps and padding move as one piece.
 *   POSITION viewport percentages. A percentage is already a ratio, so the
 *            gutters hold at any width without JS or breakpoints. A centred
 *            max-width column cannot: it scales with the viewport while the
 *            viewport does not, so its leftover gutters grow as a fraction of
 *            the screen — 14% of width here, 17% on a 1366px laptop.
 *
 * `design` is the viewport this was authored against: a 2560×1600 panel at 125%
 * OS scaling. Height is part of it because the hero is locked to 100svh, so a
 * wide-but-short window has to scale down or its content overruns the bottom.
 */
const HERO = {
  design: { width: 2000, height: 1150 },
  /**
   * Deliberate uplift over the authored size. This used to be capped by the
   * tallest item's content — past ~1.05 a three-line title plus a details list
   * overran the text column and clipped. FIT below now measures that case and
   * shrinks only the column, so this can be tuned for how big the hero should
   * READ on a typical item rather than for the worst one.
   */
  zoom: 1.15,
  /** Side inset, both edges, every breakpoint */
  gutter: '5%',
  // max sits above `zoom` — otherwise the reference display clamps itself.
  // min floors NARROW screens, where the width term collapses: a phone divides
  // 375 by the authored width and lands near 0.2.
  //
  // heightMin is deliberately lower and applies to the height term only. A 14"
  // laptop at Windows' default 150% is a 1280x610 viewport, whose height term
  // wants 0.61; held at 0.70 by the width floor, every geometric length in the
  // hero rendered ~15% larger than the space it had, and the text column was
  // squeezed until its headline and CTA clipped. Reading type does not suffer
  // for the lower floor — `textFloor` below governs that separately.
  scale: { min: 0.7, heightMin: 0.58, max: 1.25 },
  /**
   * A SECOND floor, for reading type only.
   *
   * `scale.min` governs the whole hero — geometry included — so raising it to
   * fix small text would blow the 4em headline and the card strip off a phone.
   * The small copy is the only part that was actually failing: at scale 0.7 the
   * eyebrow and the card meta land near 8px, which is not text any more.
   *
   * 0.83 is the scale a 1440x900 laptop computes (1440/1739 vs 900/1000), so
   * every screen below that renders the small copy at the size it has on that
   * laptop, and screens above it still scale up normally. One number to tune:
   * raise it to pin to a bigger machine, lower it to let type shrink again.
   */
  textFloor: 0.83,
}

/**
 * Second, independent multiplier for the hero's text column only (eyebrow,
 * headline, description, details list, CTA). HERO.scale answers "how big is
 * this display"; this answers "how much text does THIS item have" — a grant
 * with a three-line title and a full details list runs ~40% taller than a
 * short project, and no single authored size serves both. Measured at runtime
 * rather than authored, because the column's natural height is not knowable
 * from the viewport.
 *
 * `min` bounds the shrink: past it the column clips again, which is the lesser
 * evil against 8px type.
 */
const FIT = { min: 0.6, max: 1 }

/**
 * The band where the text column scrolls instead of clipping — a phone held
 * sideways. Same query as the `landscape-short` variant in index.css, which is
 * what puts `overflow-y: auto` on the box; this is the JS half, because the fit
 * pass has to know that overflow is now REACHABLE.
 *
 * Both floors below exist for the same reason. Shrinking type and shedding
 * lines are how the column pays for space it does not have — worth it when the
 * alternative is content clipped away for good, a bad trade when the reader can
 * simply scroll to it. So in this band the column stops shrinking at a size
 * that is still readable on the machine that is short of room, sheds at most
 * one level of copy, and lets the rest run past the fold.
 */
const SCROLLS_QUERY = '(orientation: landscape) and (max-height: 32rem)'
const SCROLLING_FIT_MIN = 0.8
const SCROLLING_DENSITY_MAX = 1

/**
 * What the column gives up once shrinking has run out, in order.
 *
 * `fit` alone cannot always win, and the reason is structural rather than a
 * matter of tuning. Every reading string on the right — eyebrow, description,
 * details, CTA label — is pinned to an absolute floor so it can never render
 * smaller than the mini-card titles opposite it. Those heights therefore do NOT
 * respond to `fit`, and on a 610px-tall laptop they are over half the column.
 * `prev * (avail / needed)` assumes height is proportional to font-size, so it
 * converges on FIT.min and leaves the rest overflowing, centred, clipped at
 * both ends: the headline's top slid under the navbar and the CTA fell off the
 * bottom entirely.
 *
 * So past the floor the column sheds LINES instead of points. Dropping the
 * third line of a description costs a clause; shrinking the type another 15%
 * costs legibility on the exact machine that is short of room. Each level is
 * strictly smaller than the last, which is what makes the escalation terminate.
 *
 * Written out as whole class strings because Tailwind reads source text — a
 * computed `line-clamp-${n}` generates nothing.
 */
const DENSITY = [
  { desc: 'line-clamp-3', title: '', details: 3 },
  { desc: 'line-clamp-2', title: '', details: 2 },
  { desc: 'line-clamp-1', title: 'line-clamp-3', details: 1 },
]

/**
 * Motion budget for the card → hero handoff.
 *
 * Everything leaves at high velocity and settles slowly (`expOut` / `easeOutCubic`)
 * rather than easing in from rest — a click has to look answered inside the first
 * frame or the whole sequence reads as lag, no matter how short it is.
 *
 * The expand animates ONLY `transform` (a uniform scale, so nothing distorts) and
 * a short `border-radius`. Nothing here may animate a layout property: the ghost
 * is a full-viewport element carrying a filtered photo, and relaying it out per
 * frame is what made this stutter.
 */
const MOTION = {
  /**
   * Ghost card → full hero.
   *
   * The curve is eased at BOTH ends and weighted toward the finish, which looks
   * backwards for a "snappy" interaction but is what makes a large zoom read as
   * smooth. Scale interpolates linearly while the apparent speed of a zoom goes
   * with its RATIO: across this ~14× jump, 0.1→0.5 is a five-fold visual change
   * and 0.6→1.0 is barely two-fold. A front-loaded curve therefore explodes and
   * then crawls. Perceptually uniform growth wants scale ∝ k^(1−t), which in
   * linear terms is an ease-IN: ~18% of the distance at a quarter of the time,
   * ~48% at half. Pure exponential zoom also arrives at full speed and never
   * settles, so the curve below is that ideal time-warped to land softly — it
   * tracks it to within 1% at every quarter. The result is gentle at both ends
   * and near-constant in apparent rate through the middle.
   *
   * None of this costs responsiveness: the click is already answered by the
   * strip slide and the origin card fading out, both of which start on it.
   */
  expand: 700,
  expandEase: 'cubic-bezier(0.35, 0.1, 0.7, 0.95)',
  /** Corner rounding is paint-bound, so it finishes early while the ghost is small. */
  radius: 300,
  /**
   * The hero's frost and washes settling onto the expanding photo. Timed to
   * finish just inside `expand`, so the transform lands on a ghost that already
   * matches the base and the handover is a straight cut rather than a crossfade.
   */
  overlay: 340,
  overlayDelay: 300,
  /** Origin card handing itself off to the ghost — outlasts the ghost's slow start. */
  cardOut: 240,
  /** Strip slide: base + per-slot, capped. */
  slideBase: 0.36,
  slidePerStep: 0.07,
  slideMax: 0.62,
  slideEase: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /**
   * Fraction of the slide after which the pending card is promoted and the expand
   * begins. The slide's tail covers little distance, so waiting for its
   * `transitionend` would spend a third of the interaction on nothing.
   */
  promoteAt: 0.55,
} as const

interface Feature {
  title: MessageDescriptor
  category: MessageDescriptor
  description: MessageDescriptor
  href: string
  image: string
  gradient: string
  span: string
}

const FEATURES: Feature[] = [
  {
    title: msg`Projects`,
    category: msg`Collaboration`,
    description: msg`Launch and collaborate on innovative projects with creators across the Caribbean.`,
    href: '/projects',
    image: '/hero/hero-1.webp',
    gradient: 'from-[#041E42] via-[#163A63]/70 to-[#2A5788]/10',
    span: 'md:col-span-2 md:row-span-2',
  },
  {
    title: msg`Events`,
    category: msg`Community`,
    description: msg`Discover workshops, hackathons, and networking events happening near you.`,
    href: '/events',
    image: '/hero/hero-2.webp',
    gradient: 'from-[#2C4100] via-[#5E8A00]/70 to-[#97D700]/10',
    span: 'md:col-span-2',
  },
  {
    title: msg`Grants`,
    category: msg`Funding`,
    description: msg`Find funding opportunities and grants to turn your ideas into reality.`,
    href: '/grants',
    image: '/hero/hero-3.webp',
    gradient: 'from-[#020F21] via-[#041E42]/70 to-[#4F7AAE]/10',
    span: '',
  },
  {
    title: msg`Forums`,
    category: msg`Discussion`,
    description: msg`Join discussions, share knowledge, and engage with the community.`,
    href: '/forums',
    image: '/hero/hero-4.webp',
    gradient: 'from-[#806000] via-[#B38500]/70 to-[#FFC72C]/10',
    span: '',
  },
  {
    title: msg`Messages`,
    category: msg`Communication`,
    description: msg`Connect directly with mentors, investors, and fellow innovators.`,
    href: '/messages',
    image: '/hero/hero-5.webp',
    gradient: 'from-[#163A63] via-[#2A5788]/70 to-[#7AB000]/10',
    span: '',
  },
  {
    title: msg`Resources`,
    category: msg`Knowledge`,
    description: msg`Access articles, guides, case studies, and tools for Caribbean innovation.`,
    href: '/resources',
    image: '/hero/hero-6.webp',
    gradient: 'from-[#4D3900] via-[#E6AC09]/70 to-[#FFD75C]/10',
    span: 'md:col-span-2',
  },
  {
    title: msg`Directory`,
    category: msg`Network`,
    description: msg`Browse the member directory and connect with innovators across the Caribbean.`,
    href: '/directory',
    image: '/ktiphero.webp',
    gradient: 'from-[#446400] via-[#7AB000]/70 to-[#AEE12B]/10',
    span: '',
  },
]

// Partner logo wall. Entries without a `logo` render as styled wordmarks —
// swap in real logo files under /public/partners as they become available.
const PARTNERS: { name: string; logo?: string }[] = [
  { name: 'OECS Commission', logo: '/oecs.webp' },
  { name: 'World Bank Group', logo: '/worldbank.webp' },
  { name: 'Caribbean Development Bank' },
  { name: 'CARICOM' },
  { name: 'UNDP' },
  { name: 'ECCB' },
]

const STAT_TILES: { key: keyof PlatformStats; label: MessageDescriptor }[] = [
  { key: 'memberCount', label: msg`Members` },
  { key: 'projectCount', label: msg`Projects` },
  { key: 'grantCount', label: msg`Active Grants` },
  { key: 'eventCount', label: msg`Events` },
]

/**
 * The hero's treatment: frost on the left, then three stacked washes whose
 * opacities MULTIPLY — at the right edge, where the text sits, they used to
 * pass only 0.90 × 0.40 × 0.30 = 11% of the photo through, which flattened the
 * photography to a near-solid navy. Retuned to 0.95 × 0.65 × 0.55 = 34%; the
 * type keeps its contrast through text-shadow-hero instead of through darkness.
 *
 * Shared, not duplicated, because the expanding ghost has to settle into exactly
 * this before it hands over — any drift between the two would show up as a pop
 * at the commit, which is the whole thing this is here to avoid.
 */
function HeroOverlays({ src }: { src: string }) {
  // The frosted copy is a second full-viewport image under blur(8px), and this
  // component is rendered TWICE during a carousel swap (base + ghost) — so on a
  // phone the 6-second tick was scheduling up to two extra full-screen blur
  // rasters. The washes below are plain gradients and stay: they are what
  // carries the text contrast.
  const lite = useMobileLite()
  return (
    <>
      {/* Frosted blur over the left side, fading out toward the right.
          A blurred COPY of the photo, not backdrop-filter — same reasoning as
          PageHero: backdrop-filter samples whatever is painted beneath it, and
          that sampling does not survive being captured into a view-transition
          snapshot. The route card shuffle captures this hero on every
          navigation away from home, and the frost collapsing in that capture —
          the blurred half snapping sharp, the washes over it re-reading as a
          pale gradient band — was THE flicker seen when leaving the home page.
          A filter on the element's own content is part of its paint, so it is
          captured like everything else.
          The mask restates the old panel geometry in full-band coordinates:
          the panel was 80% wide with its fade from 55% across itself, which is
          44%/80% across the whole band — and unchanged below md, where the
          panel was w-full. scale(1.08) overfills so blur() sampling past the
          edges cannot feather the band's own borders. */}
      {!lite && (
      <ResponsiveImage
        src={src}
        alt=""
        aria-hidden="true"
        sizes="100vw"
        // Same reasoning as PageHero's frosted copy: this is the hero photo
        // under blur(8px), so a 960px rung is indistinguishable from the 1920px
        // one and costs a third as much. It matters more here than there —
        // HeroOverlays is rendered twice during a carousel swap, so the full
        // ladder meant up to two extra full-size fetches per 6-second tick.
        maxWidth={960}
        // blur(8px), not the panel's old backdrop-blur-md 12px: a blur baked
        // into the photo copy reads stronger than the same radius sampling a
        // live backdrop, and 12px came out heavier than the original frost.
        className="absolute inset-0 w-full h-full object-cover [filter:blur(8px)_brightness(var(--photo-brightness,1))] [transform:scale(1.08)] [mask-image:linear-gradient(to_right,black_55%,transparent_100%)] md:[mask-image:linear-gradient(to_right,black_44%,transparent_80%)]"
        loading="eager"
        decoding="sync"
      />
      )}
      <div className="absolute inset-y-0 left-0 w-full md:w-[80%] bg-black/5 [mask-image:linear-gradient(to_right,black_55%,transparent_100%)]" />
      {/* Neutral dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-l from-black/35 via-black/18 to-black/12" />
      {/* Brand wash — navy by day, green by night (OECS palette) */}
      <div className={`absolute inset-0 bg-gradient-to-l ${HERO_WASH}`} />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/50 to-transparent" />
    </>
  )
}

export default function DiscoverPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Discover`)

  function grantAmount(g: Grant): string {
    const currency = g.currency || 'USD'
    if (g.amount_max) {
      const amount = g.amount_max.toLocaleString()
      return t`Up to ${currency} ${amount}`
    }
    if (g.amount_min) {
      const amount = g.amount_min.toLocaleString()
      return t`From ${currency} ${amount}`
    }
    return g.grant_type || t`Funding`
  }

  // --- Mode toggle + live data ---
  const [mode, setMode] = useState<Mode>('grants')
  const { grants } = useGrants({ active: true })
  const { projects } = useProjects()
  const { events } = useEvents({ upcoming: true })
  const { stats, loading: statsLoading } = usePlatformStats()

  const items = useMemo<HeroItem[]>(() => {
    if (mode === 'grants') {
      return (grants || []).slice(0, MAX_ITEMS).map((g) => ({
        id: g.id,
        title: g.title,
        meta: grantAmount(g),
        description: g.summary || g.description || t`Funding opportunity for Caribbean innovators.`,
        // Hand-authored details win; otherwise synthesise a block from the
        // columns the record already has, so no hero item reads bare
        details: g.details?.length ? g.details : grantHeroDetails(g),
        href: entityPath('grant', g),
        image: grantImageFor(g.id, g.grant_type, g.is_climate_action),
      }))
    }
    if (mode === 'projects') {
      return (projects || []).slice(0, MAX_ITEMS).map((p) => ({
        id: p.id,
        title: p.title,
        meta: (p.category as string) || t`Project`,
        description: p.summary || p.description || t`An innovation project from the OECS community.`,
        details: p.details?.length ? p.details : projectHeroDetails(p),
        href: entityPath('project', p),
        image: p.image_url || heroImageFor(p.id),
      }))
    }
    return (events || []).slice(0, MAX_ITEMS).map((e) => ({
      id: e.id,
      title: e.title,
      meta: `${format(new Date(e.start_date), 'MMM d, yyyy')}${e.location ? ` · ${e.location}` : ''}`,
      description: e.summary || e.description || t`An upcoming event for the OECS community.`,
      details: e.details?.length ? e.details : eventHeroDetails(e),
      href: entityPath('event', e),
      image: e.image_url || heroImageFor(e.id),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, grants, projects, events, t])

  const activeMode = MODES.find((m) => m.id === mode)!
  const modeLabel = i18n._(activeMode.label)
  const modeIndex = MODES.indexOf(activeMode)

  // --- Selection + auto-rotate ---
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const count = items.length
  // Staged selection: a card only ever expands from the RIGHTMOST slot.
  // Picking the on-deck card (index+1 — what auto-rotate does) expands right
  // away; picking any other card stores it as pending so the strip first
  // rotates it into the rightmost slot, and only then does it become the hero.
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)
  const select = useCallback(
    (i: number) => {
      if (count < 2 || i === index) return
      if (pendingIndex === null && i === (index + 1) % count) setIndex(i)
      else setPendingIndex(i)
    },
    [count, index, pendingIndex],
  )
  const next = useCallback(() => select((index + 1) % count), [select, index, count])
  const prev = useCallback(() => select((index - 1 + count) % count), [select, index, count])

  // Pause auto-rotate when the page isn't actually in view: tab hidden,
  // window minimized, or another app focused in front of the browser.
  const [pageActive, setPageActive] = useState(
    () => typeof document === 'undefined' || (!document.hidden && document.hasFocus()),
  )
  useEffect(() => {
    const update = () => setPageActive(!document.hidden && document.hasFocus())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])

  // A route navigation is starting (routeTransitions.ts fires this before the
  // view transition can capture the old frame). A slide swap caught mid-flight
  // by that capture freezes a half-swapped hero on the outgoing card, so
  // rotation stops for good — this page is about to unmount anyway, and a
  // remount resets the state.
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const onLeave = () => setLeaving(true)
    window.addEventListener('ktip:route-shuffle-start', onLeave)
    return () => window.removeEventListener('ktip:route-shuffle-start', onLeave)
  }, [])

  useEffect(() => {
    if (leaving || paused || !pageActive || count < 2 || pendingIndex !== null) return
    const interval = setInterval(next, 6000)
    return () => clearInterval(interval)
  }, [leaving, paused, pageActive, next, count, pendingIndex])

  // Clamp selection when the list shrinks or mode changes
  useEffect(() => {
    setIndex((i) => (count === 0 ? 0 : Math.min(i, count - 1)))
    setPendingIndex(null)
  }, [count])

  // --- Ring carousel: on-deck queue ---
  // The strip always shows `slots` cards; the RIGHTMOST card is the on-deck
  // item — the next hero (index+1). On rotation the new hero's card expands
  // in place into the hero (via the ghost) while the strip simultaneously
  // slides right: a new card enters from the LEFT and the next on-deck card
  // settles at the right end. The track renders the items reversed (and
  // tripled for circular wrapping) so ascending selection slides rightward.
  const ring = count > 1
  const visibleCount = useVisibleCount()
  // zoom divides the design box rather than multiplying the font-size, so the
  // height-fit guard inside useViewportScale still accounts for the uplift —
  // multiplying afterwards would make the content 10% taller than the guard
  // measured and reopen the overflow-under-the-navbar bug on short viewports.
  const scale = useViewportScale({
    width: HERO.design.width / HERO.zoom,
    height: HERO.design.height / HERO.zoom,
    ...HERO.scale,
  })
  // One base font-size drives every `em` in the hero — this is the whole knob.
  // The reader's text-size preference multiplies into it here: the hero sets its
  // own px base from JS, so unlike the rest of the app it is immune to the root
  // font-size that preference otherwise works through.
  const [a11y] = useAccessibilityPrefs()
  const heroFontSize = `${16 * scale * a11y.fontScale}px`
  // Same base, floored — see HERO.textFloor. Published as a variable rather
  // than swapped into heroFontSize because the two have to coexist: geometry
  // keeps riding `scale` so the layout still fits, and only the elements that
  // opt in with calc(N * var(--hero-type)) stop shrinking.
  const heroTypeSize = `${16 * Math.max(scale, HERO.textFloor) * a11y.fontScale}px`
  // The size --hero-type bottoms out at, published separately so the smaller
  // strings on the right (eyebrow, details, CTA label) can floor at it with
  // max() while keeping their authored ratio above it. Equal to the mini-card
  // title's size at the floor, which is the pairing being enforced: nothing a
  // reader has to READ on the right may render smaller than the card titles
  // opposite. A plain `max(0.75 * --hero-type, --hero-type)` would collapse the
  // ratio at every size and flatten the hierarchy on a large display too.
  const heroTypeFloor = `${16 * HERO.textFloor * a11y.fontScale}px`
  // Icons take numeric px props, so they scale by hand off the same factor
  const px = (n: number) => Math.round(n * scale)
  const slots = Math.min(visibleCount, Math.max(count, 1))
  const revItems = [...items].reverse()
  const trackItems = ring ? [...revItems, ...revItems, ...revItems] : items
  // Item index shown at track position t (reversed mapping when wrapping)
  const itemIdxAt = (t: number) => (ring ? (count - 1 - (t % count) + count) % count : t)
  const [pos, setPos] = useState(0) // track position of the first visible card
  const [trackAnimating, setTrackAnimating] = useState(false)
  const [trackTransition, setTrackTransition] = useState(false)
  const [trackDur, setTrackDur] = useState<number>(MOTION.slideBase)
  const reducedMotion = useReducedMotion()
  // 8em at design scale; the ResizeObserver below replaces this with the real
  // measurement on mount, so it only has to be right for the first frame
  const [cardW, setCardW] = useState(() => 128 * scale)
  // 12px at design scale — matches the strip's gap-[0.75em]. Scales with the
  // cards so the measured step stays exact and rotation lands on slot bounds.
  const GAP = 12 * scale
  const step = cardW + GAP

  // Track position whose window puts the on-deck item (index+1) in the LAST
  // slot. pos DECREASES so the strip always slides RIGHT and new cards enter
  // from the left, wrapping circularly (the track is tripled; we silently
  // re-center into the middle copy between moves). Rightward-only rotation
  // guarantees the expanding card's strip copy always exits through the
  // clipped right edge — no holes are left behind in the strip.
  const targetPos = (() => {
    if (!ring) return 0
    const base = pos < count ? pos + count : pos
    const cur = base % count
    const target =
      pendingIndex !== null
        ? (((count - slots - pendingIndex) % count) + count) % count // pending card → rightmost slot
        : (((count - slots - index - 1) % count) + count) % count // on-deck (index+1) → rightmost slot
    return base - ((cur - target + count) % count)
  })()

  // The promotion that starts the expand is fired on a timer partway through the
  // slide rather than on its `transitionend`, so the two motions overlap. The ref
  // mirror keeps that timer reading the live pending value, not a stale closure.
  const pendingRef = useRef<number | null>(null)
  pendingRef.current = pendingIndex
  const trackRef = useRef<HTMLDivElement>(null)
  const recentered = useRef(false)
  const promoteTimer = useRef<number | null>(null)
  const clearPromote = useCallback(() => {
    if (promoteTimer.current !== null) {
      clearTimeout(promoteTimer.current)
      promoteTimer.current = null
    }
  }, [])
  const promote = useCallback(() => {
    clearPromote()
    const p = pendingRef.current
    if (p === null) return
    if (p < count) setIndex(p)
    setPendingIndex(null)
  }, [clearPromote, count])
  useEffect(() => clearPromote, [clearPromote])

  // Layout effect so the slide's transform+transition commit in the same
  // paint frame as the ghost mount and origin-card hide — zero-jitter start
  useLayoutEffect(() => {
    if (!ring || trackAnimating) return
    // Re-center into the middle copy (no animation) so there's always room
    // to slide right without running off the tripled track
    if (pos < count || pos >= 2 * count) {
      setTrackTransition(false)
      setPos(count + (pos % count))
      recentered.current = true
      return
    }
    if (targetPos === pos) return
    if (recentered.current) {
      recentered.current = false
      // Commit the un-animated re-centre as the NEXT transition's start value.
      // Both commits otherwise land before a single paint, so the browser never
      // observes the jump and animates the following step from where the strip
      // was BEFORE it — a full-width whip across the track that reads as the
      // cards resetting. Same forced-flush trick as the ghost's FLIP kick.
      trackRef.current?.getBoundingClientRect()
    }
    if (reducedMotion) {
      setTrackTransition(false)
      setPos(targetPos)
      return
    }
    const dur = Math.min(MOTION.slideMax, MOTION.slideBase + MOTION.slidePerStep * (pos - targetPos))
    setTrackDur(dur)
    setTrackTransition(true)
    setTrackAnimating(true)
    setPos(targetPos)
    // Hand over to the expand before the slide's long tail has run — the card is
    // already visually in its slot by then, and the ghost measures its live
    // mid-flight rect, so the handoff is seamless rather than staged.
    if (pendingRef.current !== null) {
      clearPromote()
      promoteTimer.current = window.setTimeout(promote, dur * MOTION.promoteAt * 1000)
    }
  }, [targetPos, pos, ring, count, trackAnimating, reducedMotion, promote, clearPromote])

  // Once the pending card has rotated into the rightmost slot, promote it:
  // index changes, the ghost expands from the rightmost rect, and the strip
  // takes its final settle step — rotate first, expand second.
  useEffect(() => {
    if (pendingIndex === null) return
    if (pendingIndex >= count) {
      setPendingIndex(null)
      return
    }
    if (targetPos === pos && !trackAnimating) {
      setIndex(pendingIndex)
      setPendingIndex(null)
    }
  }, [pendingIndex, targetPos, pos, trackAnimating, count])

  // Keep the measured card width in sync — the cards are 8em, so this tracks
  // the hero scale without having to recompute it here
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
    setPendingIndex(null)
  }

  const active: HeroItem | null = count > 0 ? items[index] : null

  // --- Fit the text column to the space the counter and strip leave ---
  // Every length in the column is em-based, so one font-size on the group
  // scales the whole thing — headline, description, details list and the CTA
  // riding under them — as a single piece. It has to be measured rather than
  // authored: how tall the column wants to be depends on the active item, and
  // the viewport scale cannot know that.
  const fitBoxRef = useRef<HTMLDivElement>(null)
  const fitContentRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(FIT.max)
  const [density, setDensity] = useState(0)
  // The strip's height, and whether the column is free to expand over it.
  const [strip, setStrip] = useState({ height: 0, clear: false })
  // How far the text group is pushed up off the bottom of its box. See the fit
  // loop — it is spare room being spent, never room being taken.
  const [lift, setLift] = useState(0)

  /**
   * The bottom strip's height, and whether the text column could expand over it.
   *
   * The two were siblings in one flex column, so the strip's full height came
   * off the text's — ~207px of a 610px laptop, a third of the hero. That is the
   * right DEFAULT: it centres the text in the space above the strip, which is
   * where the hero is meant to read from. It is the wrong hard limit, because
   * the strip is bottom-LEFT and five cards wide while the text is right-aligned
   * and capped at 42em, so on a laptop there is clear air beside it that the
   * column was forbidden from using even while its headline clipped.
   *
   * So the strip is out of flow and its height is applied as a reserve the
   * column can give back under pressure — see the fit loop, which releases it
   * before shedding any copy.
   *
   * `clear` is computed from the WIDEST the text could ever be — the 42em
   * measure at fit 1 — rather than where it currently sits. Measuring the real
   * edge would close a feedback loop: reserving height lowers `fit`, a lower
   * `fit` shrinks the em that 42em is made of, the text narrows, its left edge
   * retreats past the strip, the reserve is released, the text grows back and
   * the whole thing runs backwards forever. Worst-case geometry does not move.
   */
  useLayoutEffect(() => {
    const stripEl = stripRef.current
    const box = fitBoxRef.current
    if (!stripEl || !box) return
    const measureStrip = () => {
      const stripBox = stripEl.getBoundingClientRect()
      const colBox = box.getBoundingClientRect()
      if (!stripBox.height || !colBox.width) return
      const em = parseFloat(heroFontSize)
      // 42em is the max-w on the text block; at fit 1 the em is the hero base
      const widest = Math.min(colBox.width, 42 * em)
      // One em of daylight, so a descender never sits flush against a card
      const clear = colBox.right - widest - stripBox.right > em
      setStrip((prev) =>
        prev.clear === clear && Math.abs(prev.height - stripBox.height) < 1
          ? prev
          : { height: Math.round(stripBox.height), clear },
      )
    }
    measureStrip()
    const ro = new ResizeObserver(measureStrip)
    ro.observe(stripEl)
    ro.observe(box)
    return () => ro.disconnect()
  }, [heroFontSize, count])

  // A new item starts from the authored layout: whatever the last one had to
  // give up says nothing about this one, and starting tight would leave copy
  // hidden on a short item that had room for all of it. Kept out of the fit
  // effect below, which lists both of these as dependencies — resetting there
  // would undo every escalation the moment it happened.
  useLayoutEffect(() => {
    setDensity(0)
  }, [active?.id, mode, heroFontSize])

  // The pass loop below decides whether shrinking has bottomed out, so it needs
  // the values it is currently looking at. Reading the state directly would give
  // it whatever was current when the observer was installed, which is stale by
  // exactly the passes that matter. The strip rides along here rather than in
  // the dependency list so a card image finishing its load cannot restart the
  // pass budget mid-convergence.
  const fitRef = useRef(fit)
  const stripInfoRef = useRef(strip)
  useLayoutEffect(() => {
    fitRef.current = fit
    stripInfoRef.current = strip
  })

  // Does the column scroll rather than clip right now? See SCROLLS_QUERY.
  const [columnScrolls, setColumnScrolls] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SCROLLS_QUERY).matches
  )
  useEffect(() => {
    const query = window.matchMedia(SCROLLS_QUERY)
    const sync = () => setColumnScrolls(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useLayoutEffect(() => {
    const box = fitBoxRef.current
    const content = fitContentRef.current
    if (!box || !content) return
    // Each pass corrects the last one's error, so this settles in two or three
    // renders. The counter is the stop for content whose height is NOT
    // monotonic in font-size — a headline that re-wraps to fewer lines as it
    // shrinks can grow the block back — which would otherwise ping-pong.
    let passes = 0
    let lastAvail = 0
    const measure = () => {
      const avail = box.clientHeight
      const needed = content.scrollHeight
      if (!avail || !needed) return
      // A change in the box itself is new information, not an oscillation
      if (Math.abs(avail - lastAvail) > 1) {
        passes = 0
        lastAvail = avail
      }
      if (passes > 8) return

      /* Where the group sits inside the box, as opposed to how big it is.
       *
       * The box is the full column now, so centring in it would drop the text
       * to the middle of the hero — lower than the design, which reads from the
       * space ABOVE the card strip. Pushing it up by the strip's height puts it
       * back, but only while there is spare room to spend: capped at `avail -
       * needed`, the lift goes to zero exactly when the content grows to fill
       * the box, so a tall item uses the whole height instead of being shoved
       * up and clipped at the top.
       *
       * This is a margin on the GROUP, not the box: `needed` is the group's own
       * scrollHeight and `avail` the box's clientHeight, so neither moves when
       * the lift changes and the loop cannot chase itself. */
      const room = stripInfoRef.current.clear ? stripInfoRef.current.height : 0
      const want = Math.max(0, Math.min(room, avail - needed))
      setLift((prev) => (Math.abs(prev - want) < 2 ? prev : want))

      // Shrinking has run out and the column still does not fit — every
      // remaining pass would return FIT.min and leave the overflow to be
      // clipped at both ends, which is how the headline ended up sliced under
      // the navbar and the CTA off the bottom. Shed a line instead; the next
      // observation runs against shorter content and `fit` climbs back on its
      // own. Monotone within an item, so this escalates at most twice.
      // In the scrolling band these floors are higher: past them the column is
      // trading legibility for space it does not need to buy, because whatever
      // does not fit is one swipe away rather than gone.
      const fitFloor = columnScrolls ? SCROLLING_FIT_MIN : FIT.min
      const densityMax = columnScrolls ? SCROLLING_DENSITY_MAX : DENSITY.length - 1
      // Rotating into the band arrives with whatever `fit` the taller viewport
      // had settled on, which can be under the floor that now applies. Raise it
      // first: the branch below returns without touching `fit`, so a column that
      // came in at 0.6 would otherwise stay there for as long as the phone is
      // sideways — the one case where the floor would have bought nothing.
      if (fitRef.current < fitFloor - 0.001) {
        setFit(fitFloor)
        return
      }
      if (fitRef.current <= fitFloor + 0.001 && needed > avail + 1) {
        setDensity((d) => Math.min(densityMax, d + 1))
        return
      }
      setFit((prev) => {
        // `needed` was measured AT prev, so the size that fits exactly is
        // prev × (avail / needed); 0.995 keeps sub-pixel rounding off the edge
        const next = Math.min(FIT.max, Math.max(fitFloor, prev * (avail / needed) * 0.995))
        // Deadband — without it the 0.995 alone would creep forever
        if (Math.abs(next - prev) < 0.01) return prev
        passes += 1
        return next
      })
    }
    measure()
    // Both ends move: the box on viewport resize, the content on font load,
    // late-arriving data, and each correction pass above
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(content)
    return () => ro.disconnect()
    // `density` restarts the loop with a fresh pass budget: the copy it just
    // shed is new information, so the passes spent reaching the floor should not
    // count against finding the fit that now exists.
  }, [active?.id, mode, heroFontSize, density, columnScrolls])

  // Hero image swap: the moment the selection changes, a ghost mounts exactly
  // on top of the new hero's card in the strip (the rightmost/on-deck card
  // for auto-rotate, the clicked card otherwise) and expands in place to fill
  // the hero WHILE the strip slides — one simultaneous motion. The ghost then
  // fades away to reveal the (already swapped) dimmed base image.
  const heroSrc = active?.image || FALLBACK_IMAGE
  const [shownSrc, setShownSrc] = useState(heroSrc)
  const [anim, setAnim] = useState<{
    src: string
    phase: 'start' | 'expand'
    fromT: number
    imgH: number
    from: { x: number; y: number; w: number; h: number }
    sec: { w: number; h: number }
  } | null>(null)
  const [overlaysIn, setOverlaysIn] = useState(false)

  // Navigation starting: a ghost mid-expansion would be frozen half-way by the
  // view transition's capture of this page. Snap the swap to its end state —
  // base image committed, ghost gone — so the captured frame is settled.
  // Layout effect so the snap is painted before the capture can happen.
  useLayoutEffect(() => {
    if (!leaving || !anim) return
    setShownSrc(anim.src)
    setAnim(null)
  }, [leaving, anim])

  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  // Layout effect so the origin card's rect is measured BEFORE the slide's
  // new transform renders, and the ghost mounts in the same paint frame the
  // origin card hides — a seamless card→ghost handoff
  useLayoutEffect(() => {
    if (heroSrc === shownSrc || anim?.src === heroSrc) return
    const sec = sectionRef.current
    // `leaving`: no new ghost once a navigation has started — swap outright so
    // the view transition captures a settled hero, not a mid-expansion ghost.
    if (!sec || reducedMotion || leaving) {
      setShownSrc(heroSrc)
      return
    }
    const s = sec.getBoundingClientRect()
    // Zero-width section (not laid out yet) would make the ghost's scale factor
    // infinite — swap outright instead
    if (!s.width || !s.height) {
      setShownSrc(heroSrc)
      return
    }
    // Expand from the new hero's card copy currently in the visible window
    let fromT = -1
    for (let t = pos; t < pos + slots; t++) {
      if (itemIdxAt(t) === index && cardRefs.current.has(t)) {
        fromT = t
        break
      }
    }
    const el = fromT >= 0 ? cardRefs.current.get(fromT) : undefined
    // Fallback origin when the card isn't mounted: small box near the strip
    let from = { x: s.width * 0.1, y: s.height * 0.7, w: 128 * scale, h: 200 * scale }
    let imgH = 0
    if (el) {
      const r = el.getBoundingClientRect()
      from = { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }
      imgH = el.firstElementChild?.getBoundingClientRect().height ?? 0
    }
    if (!imgH) imgH = from.h * 0.6
    setAnim({
      src: heroSrc,
      phase: 'start',
      fromT,
      imgH,
      from,
      sec: { w: s.width, h: s.height },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroSrc, shownSrc, anim, index, count, ring, pos, slots])

  // FLIP kick: force a style flush of the ghost's start rect, then flip to
  // 'expand' in the same pre-paint pass — the transition registers with zero
  // dead frames and starts the exact frame the strip slide starts
  useLayoutEffect(() => {
    if (anim?.phase !== 'start') return
    ghostRef.current?.getBoundingClientRect()
    setAnim((a) => (a && a.phase === 'start' ? { ...a, phase: 'expand' } : a))
  }, [anim])

  // Hold the treatment off until the bloom is mostly resolved, then let it
  // settle onto the photo. Mount-driven rather than an opacity toggle: the
  // frost layer is a backdrop-filter, which is not free even at opacity 0.
  useEffect(() => {
    if (anim?.phase !== 'expand') {
      setOverlaysIn(false)
      return
    }
    const t = window.setTimeout(() => setOverlaysIn(true), MOTION.overlayDelay)
    return () => clearTimeout(t)
  }, [anim?.phase, anim?.src])

  /**
   * Transform FLIP. The ghost is laid out ONCE at its final geometry and is
   * shrunk onto the card by an inverse transform, then released to identity —
   * so the browser composites one cached layer instead of relaying out and
   * re-rastering a full-viewport photo every frame.
   *
   * Two deliberate choices:
   *
   *   Uniform scale. The card is portrait and the hero is landscape, so a
   *   non-uniform scale would squash the photo, and the usual remedy —
   *   counter-scaling the child — cannot work through a CSS transition: CSS
   *   interpolates 1/s₀ → 1 linearly, which is not 1/s(t), and at the ~14×
   *   factor in play here the product drifts to ~4 by the midpoint instead of
   *   staying at 1. A uniform factor needs no counter-transform at all. It does
   *   mean the ghost starts as a letterboxed sliver inside the card's image area
   *   rather than filling it; the card fades out over it and the ghost is past
   *   card size within a few frames, so it reads as a bloom.
   *   (Tuning knob: `imgH / sec.h` matches the card's height instead, at the
   *   cost of overflowing its width.)
   *
   *   Shrink-then-grow, never grow-from-small. The layer rasters at scale 1, so
   *   the final frame is always crisp; expanding a small raster would not be.
   */
  const ghostStyle = (): CSSProperties => {
    if (!anim) return {}
    const { from, sec, imgH, phase } = anim
    const k = from.w / sec.w
    // Centre the shrunk hero on the card's IMAGE area, not the whole card —
    // the title block below it is not part of what appears to expand
    const dy = from.y + imgH / 2 - (sec.h * k) / 2
    const base: CSSProperties = {
      left: 0,
      top: 0,
      width: sec.w,
      height: sec.h,
      transformOrigin: '0 0',
      willChange: 'transform',
      backfaceVisibility: 'hidden',
    }
    if (phase === 'start')
      return {
        ...base,
        transform: `translate3d(${from.x}px, ${dy}px, 0) scale(${k})`,
        // Authored pre-scale so it *renders* as the card's 8px at t=0
        borderRadius: 8 / k,
        transition: 'none',
      }
    return {
      ...base,
      transform: 'translate3d(0, 0, 0) scale(1)',
      borderRadius: 0,
      transition: `transform ${MOTION.expand}ms ${MOTION.expandEase}, border-radius ${MOTION.radius}ms ${MOTION.expandEase}`,
    }
  }
  return (
    <>
      <section
        ref={sectionRef}
        id="hero"
        data-spy="Top"
        // rail stays hidden over the full-bleed hero, fading in from the bento
        // grid down
        data-spy-hide
        // brand-navy, not gray-900: the gray scale inverts under html.dark
        // svh, not vh: on mobile Chrome/Safari `100vh` is the *largest* viewport
        // (URL bar collapsed), so the bottom of the hero sits under the bar
        className="sticky top-0 h-[100svh] bg-hero-base overflow-hidden"
      >
        {/* Full-bleed hero image — follows the selected item.
            This is the LCP element of the whole site, and until it carried a
            srcSet a 390px phone downloaded the 1920px source for it. */}
        <ResponsiveImage
          src={shownSrc}
          alt=""
          sizes="100vw"
          className="absolute inset-0 w-full h-full object-cover animate-fade-in photo-dimmable"
          loading="eager" fetchPriority="high"
          /* sync: a src swap on a mounted <img> paints EMPTY until the new
             resource decodes, and an async decode is allowed to miss the swap
             frame — the navy band underneath then blinks through. Normally the
             decode is instant (the ghost just showed this exact URL), but when
             the main thread is busy — a route navigation starting, above all —
             the blank frame lands, which is the 1-in-N flicker seen right
             before leaving the home page. */
          decoding="sync"
        />
        <HeroOverlays src={shownSrc} />

        {/* Ghost card: expands from the new hero's card in the strip to fill the
            hero, then fades. Deliberately one <img> and nothing else — every
            extra layer here (a backdrop-filter especially) is paid for on every
            frame of the expand. The handoff is carried by the origin card
            fading out underneath it, not by a replica drawn inside it. */}
        {anim && (
          <div
            ref={ghostRef}
            className="absolute overflow-hidden pointer-events-none"
            style={ghostStyle()}
            onTransitionEnd={(e) => {
              // border-radius reports per-corner longhands on this same element,
              // so only the property that defines the motion may commit it
              if (!anim || e.target !== e.currentTarget) return
              if (e.propertyName !== 'transform') return
              // Commit. The ghost is now the section's exact size, showing this
              // same image under this same treatment, so swapping the base and
              // dropping the ghost in one render is a visual no-op. Nothing to
              // cross-fade — the fade already happened, on the overlays.
              //
              // Decode-gated: the swap is only a no-op if the base <img> can
              // paint the new src on the very next frame. Committing before the
              // decode is ready drops the ghost while the base is still blank —
              // a navy blink. The probe resolves from the decode cache
              // instantly in the common case (the ghost just displayed this
              // URL), so the ghost normally drops on the same tick as before.
              const src = anim.src
              const commit = () => {
                setShownSrc(src)
                setAnim(null)
              }
              const probe = new Image()
              probe.src = src
              if (probe.complete) commit()
              else probe.decode().then(commit, commit)
            }}
          >
            <ResponsiveImage
              src={anim.src}
              alt=""
              sizes="100vw"
              className="absolute inset-0 w-full h-full object-cover photo-dimmable"
            />
            {/* The hero's frost and washes settle onto the photo while it is
                still growing, so that by the time the transform lands the ghost
                already matches the base exactly. Mounted late rather than held
                at opacity 0 — kept even now that the frost is a blurred img
                copy rather than a backdrop-filter: the blur layer still
                rasters, and this sits inside the layer being scaled every
                frame. */}
            {overlaysIn && (
              <div
                className="absolute inset-0"
                style={{ animation: `fadeIn ${MOTION.overlay}ms ease both` }}
              >
                <HeroOverlays src={anim.src} />
              </div>
            )}
          </div>
        )}


        {/* Content — every length below is in `em` against heroFontSize, so the
            hero renders at design proportions on any viewport, and the column is
            full-bleed to a percentage gutter so those proportions hold in
            POSITION too (see HERO above).

            pt is the one length that cannot scale freely: the navbar does not
            scale with the map, so max() floors the gap at its height plus a
            little air — otherwise a scaled-down 8em drops under it and the
            counter slides beneath. --nav-h is read rather than restated because
            it is not one number: 4.5rem below 1024px and 5.5rem above. */}
        <div
          className="relative w-full flex flex-col h-full px-[5%] pt-[max(calc(var(--nav-h)+0.5rem),8em)] pb-[2.5em]"
          style={
            {
              fontSize: heroFontSize,
              '--hero-type': heroTypeSize,
              '--hero-type-floor': heroTypeFloor,
              // The label size, resolved once. The counter, the eyebrow and the
              // clearance the text column keeps for the counter all have to
              // agree on it, and three copies of the same max() would not stay
              // agreed. max() rather than the bare ratio so the label floors at
              // the mini-card title size instead of dropping under it — see
              // heroTypeFloor.
              '--hero-label': 'max(calc(0.75 * var(--hero-type)), var(--hero-type-floor))',
            } as CSSProperties
          }
        >
          {/* Counter — one short line in the top-right corner that, as a flex
              row, took its full line-height off the text column below across
              the whole width of the hero. `h-0` keeps it exactly where it was
              and gives that height back; the column reserves its own clearance
              with a matching pt, so the two cannot collide on the right where
              they share an edge.

              Left in flow rather than positioned absolutely on purpose: `top`
              would need the same max(--nav-h, 8em) as the column's padding, and
              `8em` on this element resolves against ITS font-size — the floored
              label size, not the hero base — so the two would drift apart by
              exactly the amount the floor is lifting. */}
          <div className="flex justify-end h-0">
            {count > 0 && (
              <p className="text-[var(--hero-label)] font-mono text-white/60 tabular-nums text-shadow-hero">
                {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </p>
            )}
          </div>

          {/* Active item content — right side.
              The BOX is the column minus two clearances, both MARGINS rather
              than padding: `flex-1` sizes against the outer box and the fit loop
              reads clientHeight, which counts padding as available space — as
              padding the loop would place content inside its own clearance and
              push the text down over the strip and up into the counter.

              Top clearance is the counter, in a zero-height row above. The
              bottom keeps the strip's height ONLY where the strip is actually
              beside the text — a narrow screen. On a laptop it is bottom-left
              and five cards wide while this text is right-aligned and capped at
              42em, so the column takes the full height and the strip's ~207px
              of a 610px laptop stop being deducted from a collision that never
              happens. Where the text prefers to SIT in that taller box is a
              separate question, answered by `lift` below.

              The GROUP inside it is measured against that box and scaled by
              `fit`, so text and CTA move together and the button sits directly
              under however much text the active item has, instead of holding one
              Y while the text overruns it.

              overflow-hidden stays as the backstop for content that will not fit
              even at FIT.min and the last DENSITY level: a centered flex child
              taller than its box spills BOTH ways, and the top half bled up
              under the fixed navbar. */}
          <div
            ref={fitBoxRef}
            className="flex-1 min-h-0 w-full flex flex-col justify-center items-end overflow-hidden mt-[calc(1.4*var(--hero-label))] landscape-short:mt-1 landscape-short:justify-start landscape-short:overflow-y-auto landscape-short:overscroll-contain"
            /* The strip's height is deducted from this column so the text sits
               above the cards — except in the scrolling band, where that leaves
               a phone ~130px of column and the pinned CTA covers most of it.
               The strip row is bottom-LEFT (its right half is empty) and this
               column is right-aligned, so sideways the two can share the band:
               the text takes the full height and stays clear by width instead. */
            style={{ marginBottom: columnScrolls ? 0 : strip.clear ? 0 : strip.height }}
          >
            {/* shrink-0 is for the measurement, not the look: as a flex child
                this would otherwise be squeezed to the box height and report a
                clamped scrollHeight, so the fit pass could never see how much
                taller than the box the content actually wants to be. */}
            <div
              ref={fitContentRef}
              className="w-full shrink-0 flex flex-col items-end"
              style={{ fontSize: `${fit}em`, marginBottom: lift }}
            >
            {active ? (
              <div
                key={`content-${mode}-${active.id}`}
                // text-shadow inherits, so one class here covers the eyebrow,
                // headline, description and the whole DetailsList subtree
                className="max-w-[42em] landscape-short:max-w-[24em] animate-reveal-up text-right text-shadow-hero"
              >
                <p className="text-[var(--hero-label)] font-semibold uppercase tracking-[0.3em] mb-[0.75em] text-white/60">
                  {i18n._(activeMode.label)} &middot; {active.meta}
                </p>
                <h1
                  className={`text-[4em] font-display font-extrabold text-white leading-[1.08] tracking-tight ${DENSITY[density].title}`}
                >
                  {active.title}
                </h1>
                {/* Description — pinned to the mini-card title size so the two
                    read as one size. Both now read the floored --hero-type, so
                    the pin holds AND neither drops under laptop size on a small
                    screen; dividing `fit` back out is no longer needed because
                    the variable never carried it. The wrapper keeps the margin
                    and measure on the fit-scaled em, so only the type is pinned
                    — spacing still tightens with the rest of the column. */}
                <div className="mt-[1.25em] max-w-[40em] md:ml-auto">
                  <p
                    className={`text-white/80 leading-relaxed ${DENSITY[density].desc}`}
                    style={{ fontSize: 'var(--hero-type)' }}
                  >
                    {active.description}
                  </p>
                </div>

                {/* DetailsList sizes itself in rem, so its type would stay put
                    while the hero scaled around it. The wrapper sets the size
                    once and the descendant rules force children to inherit it —
                    they out-specify the component's own .text-sm (0,1,1 vs
                    0,1,0). Deliberately `1em`, not `0.875em`, on the children:
                    the list nests, and a fractional em there would compound. */}
                {active.details && active.details.length > 0 && (
                  <div className="mt-[1.25em] max-w-[36em] ml-auto inline-block text-left">
                    <div className="text-[max(calc(0.9375*var(--hero-type)),var(--hero-type-floor))] [&_li]:text-[1em] [&_p]:text-[1em] [&_ul]:pl-[1.067em] [&_li+li]:mt-[0.533em]">
                      <DetailsList
                        details={active.details}
                        tone="dark"
                        compact
                        max={DENSITY[density].details}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[42em] landscape-short:max-w-[24em] animate-fade-in text-right text-shadow-hero">
                <p className="text-[var(--hero-label)] font-semibold uppercase tracking-[0.3em] mb-[0.75em] text-white/60">
                  {i18n._(activeMode.label)}
                </p>
                <h1 className="text-[4em] font-display font-extrabold text-white leading-[1.08] tracking-tight">
                  <Trans>Innovate. Collaborate.</Trans>
                </h1>
                {/* Same pinning as the active-item description above */}
                <div className="mt-[1.25em] max-w-[40em] md:ml-auto">
                  <p
                    className="text-white/80 leading-relaxed"
                    style={{ fontSize: 'var(--hero-type)' }}
                  >
                    <Trans>
                      Nothing to show here yet — explore the platform to see what&apos;s happening
                      across the Caribbean.
                    </Trans>
                  </p>
                </div>
              </div>
            )}

            {/* CTA — in flow directly under the text, so it rides with the
                content instead of anchoring to the column's bottom edge */}
            {/* On a sideways phone the column scrolls (see the fit box), so
                the CTA stops riding under the text and parks at the bottom of
                the scrollport instead — the one control that must never be the
                thing below the fold. No scrim behind it: a full-width fade
                painted a navy band straight across the hero photo, and the
                button is opaque enough to read over whatever scrolls under. */}
            <div className="shrink-0 mt-[2em] flex items-center landscape-short:sticky landscape-short:bottom-0 landscape-short:z-raised landscape-short:mt-[1em] landscape-short:self-end landscape-short:pb-[0.5em]">
              <Link
                to={active ? active.href : activeMode.href}
                // px/py/gap are divided by 0.875 because an `em` length on an
                // element that also sets font-size resolves against that new
                // size: 2em × 0.875 × 16 = the 28px of the original px-7
                // Soft-UI, in the on-dark materials: this sits on hero
                // photography. The radius stays `em` so it tracks the hero's
                // fit scale, at the soft-UI proportion rather than the 6px one.
                className="neu-on-dark group inline-flex items-center gap-[0.571em] px-[2em] py-[0.857em] rounded-[0.9em] bg-brand-navy text-white text-[max(calc(0.875*var(--hero-type)),var(--hero-type-floor))] font-medium tracking-wide shadow-neu-sm hover:bg-brand-green hover:text-brand-navy hover:-translate-y-px active:translate-y-px active:shadow-neu-sm-inset dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green transition-all duration-200"
              >
                {active ? t`View Details` : t`Browse ${modeLabel}`}
                {/* Icons take numeric px, so the fit multiplier that the `em`
                    lengths get for free has to be applied by hand here */}
                <ArrowRight
                  size={Math.round(16 * scale * fit)}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>
            </div>
            </div>
          </div>

          {/* Bottom-left: mode toggle + mini cards.
              Out of flow so its height stops being deducted from the text
              column above — see the fit box. Pinned left and right rather than
              shrink-wrapped: the card strip's `max-w-full` resolves against
              this element, and a shrink-to-fit ancestor would let the strip
              size itself. */}
          <div className="absolute inset-x-[5%] bottom-[2.5em] flex items-end justify-between gap-[1.5em]">
            {/* The ref is on THIS block, not the full-width row above it. The
                row is stretched edge to edge so the card strip's `max-w-full`
                has the column to resolve against; its right edge is therefore
                the column's right edge, and measuring it would report the strip
                as reaching under the text at every width. What actually takes
                up space is the tabs and the five cards, which is this. */}
            <div ref={stripRef} className="min-w-0">
              {/* Slide toggle */}
              {/* Soft-UI segmented control: the track is a well (inset pair,
                  on-dark materials over the photo) and the thumb is lifted out
                  of it — the same two-direction reading as Switch. */}
              <div className="neu-on-dark relative inline-flex bg-white/10 backdrop-blur-sm p-[0.25em] mb-[1em] rounded-[0.75em] shadow-neu-sm-inset">
                <div
                  className="absolute top-[0.25em] bottom-[0.25em] w-[calc((100%-0.5em)/3)] bg-ktip-cream rounded-[0.6em] shadow-neu-sm transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(${modeIndex * 100}%)` }}
                />
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => switchMode(m.id)}
                    className={`relative z-10 flex items-center gap-[0.571em] px-[1.429em] py-[0.571em] text-[calc(0.875*var(--hero-type))] font-medium transition-colors duration-300 ${
                      mode === m.id ? 'text-gray-900' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <m.icon size={px(15)} />
                    {i18n._(m.label)}
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
                  className="overflow-hidden pt-[0.375em] pb-[0.25em] max-w-full"
                  style={count > 0 ? { width: slots * step - GAP } : undefined}
                >
                <div
                  ref={trackRef}
                  className="flex items-end gap-[0.75em]"
                  style={{
                    transform: `translateX(${-pos * step}px)`,
                    // Leaves fast and settles — the expand is kicked off partway
                    // through this (MOTION.promoteAt), so the two overlap and
                    // read as a single gesture rather than two staged legs
                    transition: trackTransition
                      ? `transform ${trackDur}s ${MOTION.slideEase}`
                      : 'none',
                    willChange: trackTransition ? 'transform' : undefined,
                  }}
                  onTransitionEnd={(e) => {
                    if (e.propertyName !== 'transform' || e.target !== e.currentTarget) return
                    setTrackAnimating(false)
                    // Backstop only: the timer normally promotes at 60% of this
                    // slide. Still needed for the case where the transition is
                    // cut short or never fires.
                    if (pendingIndex !== null && pendingIndex < count && pos === targetPos) promote()
                  }}
                >
                {trackItems.map((item, t) => {
                  const itemIdx = itemIdxAt(t)
                  const isActive = itemIdx === index
                  // The ghost's origin copy hands itself over the instant the
                  // ghost mounts on its rect — a short fade rather than a snap,
                  // which is what lets the ghost be a bare image instead of
                  // carrying a replica of this card inside it. Rightward-only
                  // rotation then carries the hidden copy out through the
                  // clipped right edge, so it never leaves a hole in the strip.
                  const hidden = anim?.fromT === t
                  return (
                    <button
                      key={`${t}-${item.id}`}
                      ref={(el) => {
                        if (el) cardRefs.current.set(t, el)
                        else cardRefs.current.delete(t)
                      }}
                      style={{
                        opacity: hidden ? 0 : 1,
                        transition: hidden
                          ? `opacity ${reducedMotion ? 0 : MOTION.cardOut}ms linear`
                          : undefined,
                        pointerEvents: hidden ? 'none' : undefined,
                      }}
                      onClick={() => select(itemIdx)}
                      className={`group text-left shrink-0 w-[8.6em] rounded-[0.5em] overflow-hidden transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out motion-reduce:transition-none ${
                        isActive
                          ? 'bg-ktip-cream shadow-hard -translate-y-[0.25em]'
                          : 'bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:-translate-y-[0.25em] hover:scale-[1.03] hover:shadow-hard'
                      }`}
                    >
                      <div
                        className={`h-[9.7em] overflow-hidden flex items-center justify-center ${
                          isActive ? 'bg-ktip-sand-50' : ''
                        }`}
                      >
                        {item.image ? (
                          <ResponsiveImage
                            src={item.image}
                            alt=""
                            // 100vw, even though a strip card is a fraction of
                            // that. These are the same photos the hero shows,
                            // and the note below depends on the hero having
                            // already fetched them — describing the card's real
                            // box would resolve to a smaller rung, a different
                            // URL, and a second download of every image on the
                            // page. Matching the hero keeps it to one fetch per
                            // photo while still dropping the full-size original.
                            sizes="100vw"
                            className="w-full h-full object-cover photo-dimmable"
                            // NOT lazy. There are at most MAX_ITEMS distinct
                            // images and the hero has already fetched them, but
                            // the track is tripled and clipped, so lazy copies
                            // decode only as rotation reveals them — cards
                            // visibly popping in mid-slide, which reads as the
                            // strip reloading itself.
                            decoding="sync"
                          />
                        ) : (
                          <activeMode.icon
                            size={px(30)}
                            className={isActive ? 'text-ktip-ocean-600' : 'text-white/80'}
                          />
                        )}
                      </div>
                      <div className="px-[0.75em] py-[0.625em]">
                        <p
                          className={`text-[calc(1*var(--hero-type))] leading-[1.43] font-display font-semibold line-clamp-2 min-h-[2.86em] ${
                            isActive ? 'text-ktip-sand-900' : 'text-white'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p
                          className={`text-[calc(0.75*var(--hero-type))] mt-[0.2em] uppercase tracking-wider truncate ${
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
                    Array.from({ length: visibleCount }, (_, i) => (
                      <div
                        key={i}
                        className="shrink-0 w-[8.6em] rounded-[0.5em] overflow-hidden bg-white/10 backdrop-blur-sm animate-pulse"
                        aria-hidden="true"
                      >
                        <div className="h-[9.7em] flex items-center justify-center">
                          <activeMode.icon size={px(30)} className="text-white/30" />
                        </div>
                        <div className="px-[0.75em] py-[0.625em] space-y-[0.5em]">
                          <div className="h-[0.75em] w-4/5 bg-white/20" />
                          <div className="h-[0.5em] w-3/5 bg-white/10" />
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
                      aria-label={t`Previous`}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[2.25em] h-[2.25em] rounded-full bg-brand-navy text-white dark:bg-brand-green dark:text-brand-navy shadow-hard flex items-center justify-center opacity-0 group-hover/cards:opacity-100 hover:bg-brand-green hover:text-brand-navy hover:scale-110 dark:hover:bg-brand-navy dark:hover:text-brand-green transition-all duration-200"
                    >
                      <ChevronLeft size={px(16)} />
                    </button>
                    <button
                      onClick={next}
                      aria-label={t`Next`}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-[2.25em] h-[2.25em] rounded-full bg-brand-navy text-white dark:bg-brand-green dark:text-brand-navy shadow-hard flex items-center justify-center opacity-0 group-hover/cards:opacity-100 hover:bg-brand-green hover:text-brand-navy hover:scale-110 dark:hover:bg-brand-navy dark:hover:text-brand-green transition-all duration-200"
                    >
                      <ChevronRight size={px(16)} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento feature grid */}
      <section
        id="platform"
        data-spy="Platform"
        className="scroll-mt-24 relative z-10 bg-ktip-sand-50 py-20 md:py-28 overflow-x-clip"
      >
        {/* First light section — the watermark straddles the hero/bento boundary:
            top 25% floats over the dark hero (light tint), the rest sits on the
            light section (dark tint) */}
        <FlipWatermark
          className="-top-[0.25em] right-0 md:-right-4"
          charClassName="text-transparent bg-clip-text bg-[linear-gradient(to_bottom,rgba(255,255,255,0.16)_25%,rgba(28,25,23,0.1)_25%)] dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.18)_25%,rgba(255,255,255,0.08)_25%)]"
        />

        <div className="relative container mx-auto px-6 md:px-12">
          <div className="mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-ktip-sand-500 mb-3">
              <Trans>The Platform</Trans>
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-extrabold text-ktip-sand-900 tracking-tight">
              <Trans>Everything you need to innovate</Trans>
            </h2>
            <p className="mt-3 text-ktip-sand-600 max-w-xl">
              <Trans>Discover tools and resources designed to empower Caribbean innovation.</Trans>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:auto-rows-[minmax(10.5rem,auto)] stagger-children">
            {FEATURES.map((f) => (
              <Link
                key={f.href}
                to={f.href}
                className={`group relative rounded-2xl p-6 flex flex-col justify-between gap-6 overflow-hidden shadow-medium hover:shadow-hard hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300 ${f.span}`}
              >
                {/* Photo + brand color wash (solid at top-left, photo shows through bottom-right) */}
                <ResponsiveImage
                  src={f.image}
                  alt=""
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient}`} />

                <div className="relative">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/75 mb-2">
                    {i18n._(f.category)}
                  </p>
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]">
                    {i18n._(f.title)}
                  </h3>
                  <p className="mt-1.5 text-sm text-white/85 leading-relaxed line-clamp-2 max-w-xs [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
                    {i18n._(f.description)}
                  </p>
                </div>

                {/* Soft-UI pill, on-dark materials — the tile behind it is a
                    photo. Kept in step with the BentoCard CTA it was copied
                    from: --radius-neu corner, shadow pair, one-pixel rise. */}
                <span className="neu-on-dark relative self-start inline-flex items-center gap-1.5 bg-brand-navy text-white dark:bg-brand-green dark:text-brand-navy rounded-neu-sm px-4 py-2 text-xs font-semibold shadow-neu-sm group-hover:bg-brand-green group-hover:text-brand-navy group-hover:-translate-y-px dark:group-hover:bg-brand-navy dark:group-hover:text-brand-green group-hover:gap-2.5 transition-all">
                  <Trans>Explore</Trans> <ArrowRight size={13} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Two 75%-wide bands: partners hugging the left, platform stats
          mirrored under them on the right and scrolling the opposite way */}
      <section
        id="partners"
        data-spy="Partners"
        className="scroll-mt-24 relative z-10 bg-ktip-cream pt-8 md:pt-10 pb-20 md:pb-28"
      >
        <div className="container mx-auto px-6 md:px-12">
          {/* min-w-0 so the w-max marquee track can't blow the band out to its
              min-content width */}
          <div className="flex flex-col min-w-0 w-full lg:w-[75%] mr-auto">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-ktip-sand-500 mb-3">
              <Trans>Our Partners</Trans>
            </p>
            <h2 className="text-2xl md:text-4xl font-display font-extrabold text-ktip-sand-900 tracking-tight">
              <Trans>Backed by regional and global institutions</Trans>
            </h2>
            <p className="mt-3 text-ktip-sand-600 max-w-xl">
              <Trans>
                KTIP is delivered with the support of organizations committed to
                advancing knowledge, technology, and innovation across the OECS.
              </Trans>
            </p>

            {/* Single-row marquee, scrolling right; pauses on hover. The
                track holds two copies of the row for a seamless loop. */}
            <div className="mt-10 relative max-w-full overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <div className="flex items-center w-max gap-14 md:gap-20 animate-marquee-right hover:[animation-play-state:paused]">
                {[...PARTNERS, ...PARTNERS].map((p, i) => (
                  <div
                    key={`${p.name}-${i}`}
                    className="group/logo flex items-center justify-center h-20 shrink-0 rounded-xl px-4 transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:bg-ktip-cream hover:shadow-medium"
                    aria-hidden={i >= PARTNERS.length}
                  >
                    {p.logo ? (
                      <img
                        src={p.logo}
                        alt={p.name}
                        className="max-h-16 w-auto object-contain transition-transform duration-300 group-hover/logo:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-lg font-display font-semibold text-ktip-sand-500 whitespace-nowrap transition-colors duration-300 group-hover/logo:text-ktip-sand-900">
                        {p.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Platform stats — same band, mirrored right and running leftward.
              Track holds two copies of the row; the second is aria-hidden. */}
          <div className="mt-12 md:mt-16 flex flex-col min-w-0 w-full lg:w-[75%] ml-auto text-ktip-sand-900">
            <div className="relative max-w-full overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <div className="flex items-center w-max gap-14 md:gap-20 animate-marquee-left hover:[animation-play-state:paused]">
                {[...STAT_TILES, ...STAT_TILES].map((tile, i) => (
                  <div
                    key={`${tile.key}-${i}`}
                    className="flex items-baseline gap-4 shrink-0 h-20 whitespace-nowrap"
                    aria-hidden={i >= STAT_TILES.length}
                  >
                    <span className="text-5xl md:text-6xl font-display font-extrabold tabular-nums">
                      {statsLoading || !stats ? '—' : stats[tile.key].toLocaleString()}
                    </span>
                    <span className="text-sm md:text-base uppercase tracking-[0.2em] text-ktip-sand-500">
                      {i18n._(tile.label)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
