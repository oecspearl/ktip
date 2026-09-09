import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { VerifiedBadge } from '../ui/VerifiedBadge'
import { useLingui } from '@lingui/react/macro'
import { ResponsiveImage } from '../ui/ResponsiveImage'
import { BannerAurora } from './BannerAurora'
import {
  avatarBackdropImage,
  avatarGradientSpec,
  isCutoutStyle,
  type AvatarStyle,
} from '../../lib/avatar-backdrop'
import { bannerImage, bannerPosition, isGradientBanner, type BannerSpec } from '../../lib/banner'
import { pageHeroFor } from '../../lib/hero-images'
import { ROLE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { cn } from '../../lib/utils'
import type { PortraitFrame, SubjectSide } from '../../lib/portrait-mask'
import type { UserRole } from '../../types'

export interface HeroBack {
  label: string
  href: string
}

interface PortraitHeroProps {
  name: string
  verified?: boolean
  roles?: UserRole[] | null
  /**
   * The line above the name. Everyone on this platform is a member, so the
   * word "Member" there is a label that costs a line and says nothing; this
   * carries what actually distinguishes the person — where they are, and what
   * they are here as.
   */
  eyebrow?: ReactNode
  /** One or two lines under the name: the title, the employer, a sentence of the bio. */
  lede?: ReactNode
  /** Country · organisation · joined. */
  meta?: ReactNode
  /** Connect / Message / CV — styled for the band by the caller (see heroButton). */
  actions?: ReactNode
  /** Level, progress and the three figures; goes on the far side of the band. */
  standing?: ReactNode
  avatarUrl: string | null
  style: AvatarStyle
  banner: BannerSpec | null
  imageSeed: string
  /**
   * Where "back" goes — the directory, normally.
   *
   * There is no breadcrumb on this page. A trail costs a whole line above a
   * 96 px name to say something the reader of ONE person's page already
   * knows, so the way back hides inside the eyebrow instead and swaps in when
   * you reach for it. Below `md`, where there is no pointer to hover with, it
   * is a plain pill under the band's top edge.
   */
  back: HeroBack
  /**
   * The diamond in the sticky rail the portrait flies into, and the rail
   * itself (to know when it sticks). Both measured live on scroll.
   *
   * Optional because a band with `flight={false}` never measures either.
   */
  dockRef?: RefObject<HTMLDivElement | null>
  railRef?: RefObject<HTMLDivElement | null>
  /** The rail's sticky `top`, px — matches `lg:top-24`. */
  stickyTop?: number
  /**
   * The band's scroll-spy label, mirroring PageHero's own prop. `null` drops
   * both the marker and `id="page-top"`, which is what a band nested under a
   * page that already has a hero must do — two elements with the same id
   * inside `<main>`, and two "Top" steps in the rail.
   */
  spy?: string | null
  /**
   * The portrait's flight into the rail's diamond. Off for a band that is not
   * a page opener: the flyer is `position: fixed` positioned from viewport
   * coordinates, so ANY transformed ancestor (a route animation's
   * `fill-mode: both` counts, long after it has finished) becomes its
   * containing block and lands it somewhere else entirely.
   */
  flight?: boolean
  /**
   * A band inside a column rather than under the navbar: no nav-height
   * padding to clear a navbar that is not directly above it, a shorter
   * desktop minimum, and a radius so it reads as a surface in the column.
   */
  compact?: boolean
  /** Chrome painted over the band — the edit affordances, in practice. */
  overlay?: ReactNode
}

/** Below this the flight is off and the portrait sits in the hero. Tailwind's `lg`. */
const DESKTOP = '(min-width: 1024px)'
const RECT: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]]
const DIAMOND: Array<[number, number]> = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const polygon = (t: number) =>
  `polygon(${RECT.map((p, i) => `${(lerp(p[0], DIAMOND[i][0], t) * 100).toFixed(2)}% ${(lerp(p[1], DIAMOND[i][1], t) * 100).toFixed(2)}%`).join(',')})`

/**
 * Buttons that sit on the band. Not the soft-UI Button: there is no surface
 * to sculpt out of on a photo, so these are the two materials that survive
 * any backdrop — solid white, and frosted glass. Exported so the page can
 * dress ConnectButton and its links the same way.
 */
export const heroButton = {
  base: 'inline-flex items-center justify-center gap-2 rounded-neu px-5 py-3 text-label font-bold transition-colors disabled:opacity-60',
  light: 'bg-white text-brand-navy hover:bg-ktip-sand-100',
  ghost: 'border border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20',
} as const

/**
 * The member page opener: the person, large, with their name on the other
 * side of the band — and, on desktop, a portrait that settles into the
 * rail's diamond as you scroll, so the same face is on screen the whole way
 * down beside whatever you are reading about them.
 *
 * Three treatments, driven by the member's avatar style (148):
 *
 * - **photo** — the upload as it was, in a large diamond. Nothing is cut, so
 *   the diamond is the only honest shape for a photo that still has a room in
 *   it. Members who never opened the studio get this.
 * - **cut-out** — the subject on transparency, standing on the band's bottom
 *   edge over the backdrop they chose (a built-in design or their aurora).
 *   The words go on the side the head is not.
 * - **animated** — the same, with the aurora drifting. A flag on the style,
 *   not a fourth kind.
 *
 * The flight is one fixed element whose box, clip and inner image are
 * interpolated between two live rectangles — the hero slot and the rail's
 * diamond — on every scroll frame. As it goes, the words on the band fade
 * and lift, and the rail's plate wakes up: its dashed slot gives way to the
 * arriving face, its ring lights, its name and buttons come up to full. The
 * rail side of that is CSS reading one variable, `--land`, that this writes
 * on the rail element (see `.land-*` in index.css). When the flyer lands the
 * real DiamondAvatar underneath (the baked composite, the same picture)
 * takes over and the flyer hides. Under prefers-reduced-motion it snaps.
 */
export function PortraitHero({
  name,
  verified,
  roles,
  eyebrow,
  lede,
  meta,
  actions,
  standing,
  avatarUrl,
  style,
  banner,
  imageSeed,
  back,
  dockRef,
  railRef,
  stickyTop = 96,
  spy = 'Top',
  flight = true,
  compact,
  overlay,
}: PortraitHeroProps) {
  const { i18n } = useLingui()
  const cutout = isCutoutStyle(style) ? style : null
  const side: SubjectSide = cutout?.side ?? 'right'
  const portraitSrc = cutout?.cutout ?? avatarUrl
  const animated = !!cutout?.animated

  const slotRef = useRef<HTMLDivElement>(null)
  const wordsRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const flyImgRef = useRef<HTMLImageElement>(null)
  const flyBgRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  // ------------------------------------------------------------- flight
  useEffect(() => {
    if (!flight || !portraitSrc || !natural) return
    const desktop = window.matchMedia(DESKTOP)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0

    const frame: PortraitFrame = cutout?.frame ?? coverFrame(natural.w, natural.h)

    const fadeWords = (e: number | null) => {
      for (const el of [wordsRef.current, sideRef.current]) {
        if (!el) continue
        if (e == null) {
          el.style.opacity = ''
          el.style.transform = ''
        } else {
          el.style.opacity = (1 - clamp01(e * 1.35)).toFixed(3)
          el.style.transform = `translateY(${(-18 * e).toFixed(1)}px)`
        }
      }
    }

    const update = () => {
      raf = 0
      const flyer = flyerRef.current
      const img = flyImgRef.current
      const bg = flyBgRef.current
      const slot = slotRef.current
      const dock = dockRef?.current
      const rail = railRef?.current
      if (!flyer || !img || !bg || !slot || !dock || !rail) return

      if (!desktop.matches) {
        // Below lg there is no flight: the rail shows its own diamond, whole.
        flyer.style.visibility = 'hidden'
        rail.style.removeProperty('--land')
        fadeWords(null)
        return
      }

      const from = slot.getBoundingClientRect()
      const to = dock.getBoundingClientRect()
      const railTop = rail.getBoundingClientRect().top
      // Where the dock sits once the rail is stuck: the sticky offset plus its
      // own offset inside the rail (constant while both scroll together).
      const dockStuck = stickyTop + (to.top - railTop)
      const dockDoc = to.top + window.scrollY
      const range = Math.max(1, dockDoc - dockStuck)
      const p = clamp01(window.scrollY / range)
      const e = reduce.matches ? Math.round(p) : ease(p)

      rail.style.setProperty('--land', e.toFixed(3))
      fadeWords(e)

      if (e >= 1) {
        flyer.style.visibility = 'hidden'
        return
      }
      flyer.style.visibility = 'visible'

      // The box.
      const bx = lerp(from.left, to.left, e)
      const by = lerp(from.top, to.top, e)
      const bw = lerp(from.width, to.width, e)
      const bh = lerp(from.height, to.height, e)
      flyer.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`
      flyer.style.width = `${bw}px`
      flyer.style.height = `${bh}px`
      flyer.style.clipPath = polygon(cutout ? e : 1)

      // The image inside it: "contain, standing on the bottom" in the hero,
      // the head frame filling the diamond at the dock.
      const a = natural.w / natural.h
      let w0: number
      let h0: number
      if (cutout) {
        h0 = from.height
        w0 = h0 * a
        if (w0 > from.width) {
          w0 = from.width
          h0 = w0 / a
        }
      } else {
        // Photo mode starts as a square diamond: cover the slot.
        const s = Math.max(from.width / natural.w, from.height / natural.h)
        w0 = natural.w * s
        h0 = natural.h * s
      }
      const x0 = (from.width - w0) / 2
      // A cut-out stands ON the band's bottom edge, so it is anchored there. A
      // photo is a cover crop and must be CENTRED, exactly as `object-cover`
      // centres the same picture in the slot underneath and in the rail's
      // diamond. Bottom-anchoring it pushed the face up out of the frame by
      // half the overflow, so the hero showed a chest where every other
      // surface showed a head.
      const y0 = cutout ? from.height - h0 : (from.height - h0) / 2
      const w1 = to.width / frame.s
      const h1 = w1 / a
      const x1 = -frame.x * w1
      const y1 = -frame.y * h1
      img.style.width = `${lerp(w0, w1, e)}px`
      img.style.height = `${lerp(h0, h1, e)}px`
      img.style.transform = `translate(${lerp(x0, x1, e).toFixed(1)}px, ${lerp(y0, y1, e).toFixed(1)}px)`
      // The cut-out fades into the band's edge until it has a diamond to sit
      // in, and its sides fade too (a cropped photo leaves a straight edge)
      // until the diamond's clip takes over that job.
      const sideFade = (7 * (1 - e)).toFixed(2)
      const style = img.style as unknown as Record<string, string>
      if (cutout && e < 1) {
        // The base is not a flat fade but a V: two diagonal fades, one toward
        // each bottom corner, intersected. Their meeting line is the lower
        // half of the diamond the figure is about to fly into, so the rest
        // of the page's shape is already in the band before the flight.
        const vStart = 58 + 42 * e
        const vEnd = 84 + 16 * e
        const v = (deg: number) => `linear-gradient(${deg}deg, #000 ${vStart}%, rgba(0,0,0,${e}) ${vEnd}%)`
        img.style.maskImage = `${v(135)}, ${v(225)}, linear-gradient(to right, rgba(0,0,0,${e}), #000 ${sideFade}%, #000 ${100 - Number(sideFade)}%, rgba(0,0,0,${e}))`
        style.maskComposite = 'intersect'
        style.webkitMaskComposite = 'source-in'
      } else {
        img.style.maskImage = ''
        style.maskComposite = ''
        style.webkitMaskComposite = ''
      }
      style.webkitMaskImage = img.style.maskImage
      // The backdrop arrives only once the clip is most of the way to a
      // diamond. Fading it in linearly paints a rectangle of backdrop art over
      // the hero for the first half of the flight, which reads as a stray box
      // rather than as an avatar forming.
      bg.style.opacity = cutout ? clamp01((e - 0.55) / 0.35).toFixed(3) : '0'
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    desktop.addEventListener('change', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      desktop.removeEventListener('change', schedule)
      if (raf) cancelAnimationFrame(raf)
      railRef?.current?.style.removeProperty('--land')
      fadeWords(null)
    }
  }, [flight, portraitSrc, natural, cutout, dockRef, railRef, stickyTop])

  // --------------------------------------------------------- background
  const bannerImg = bannerImage(banner)
  const background = isGradientBanner(banner) ? (
    <BannerAurora spec={banner} animated={animated || undefined} />
  ) : bannerImg ? (
    <ResponsiveImage
      src={bannerImg}
      alt=""
      sizes="100vw"
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: bannerPosition(banner, 'page') }}
      loading="eager"
      fetchPriority="high"
      decoding="sync"
    />
  ) : cutout?.kind === 'gradient' ? (
    <BannerAurora spec={avatarGradientSpec(cutout)} animated={animated} />
  ) : cutout?.kind === 'backdrop' ? (
    <img
      src={avatarBackdropImage(cutout) ?? undefined}
      alt=""
      className={cn('absolute inset-0 h-full w-full object-cover', animated && 'animate-backdrop-drift')}
      decoding="sync"
    />
  ) : avatarUrl ? (
    // Photo mode with no banner: the member's own photo, blurred and darkened,
    // rather than a stock crowd shot. A room full of strangers behind a small
    // diamond of the member reads as somebody else's page.
    <img
      src={avatarUrl}
      alt=""
      className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 [filter:blur(28px)_saturate(1.15)_brightness(0.55)]"
      decoding="async"
    />
  ) : (
    <ResponsiveImage
      src={pageHeroFor(imageSeed, 'Member', name)}
      alt=""
      sizes="100vw"
      className="absolute inset-0 h-full w-full object-cover"
      loading="eager"
      fetchPriority="high"
      decoding="sync"
    />
  )
  // Photos need a scrim for the type; the aurora is born dark and does not.
  const drawn = isGradientBanner(banner) || (!bannerImg && !!cutout)

  // Right / left: the words and the standing stack in one column, the
  // portrait spans both rows beside them. Centred: three columns, the
  // standing on the far side, right-aligned.
  const gridCols =
    side === 'center'
      ? // The words get a floor. Two 1fr tracks either side of a 560 px
        // portrait leave about 340 px each on a laptop, and a 96 px name in a
        // 340 px column breaks in the middle of a word.
        'lg:grid-cols-[minmax(18rem,1.1fr)_auto_minmax(13rem,0.9fr)]'
      : side === 'left'
        ? 'lg:grid-cols-[auto_minmax(0,1.15fr)]'
        : 'lg:grid-cols-[minmax(0,1.15fr)_auto]'
  const wordsCol = side === 'left' ? 'lg:col-start-2' : 'lg:col-start-1'
  const portraitCol =
    side === 'center' ? 'lg:col-start-2 lg:row-start-1' : side === 'left' ? 'lg:col-start-1 lg:row-span-2 lg:row-start-1' : 'lg:col-start-2 lg:row-span-2 lg:row-start-1'
  const sideCol =
    side === 'center'
      ? 'lg:col-start-3 lg:row-start-1 lg:justify-self-end lg:text-right'
      : side === 'left'
        ? 'lg:col-start-2 lg:row-start-2'
        : 'lg:col-start-1 lg:row-start-2'

  const chips = roles?.length ? (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {roles.slice(0, 6).map((role) => (
        <span
          key={role}
          className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-caption font-semibold text-white backdrop-blur-sm"
        >
          {resolveCopy(i18n, ROLE_LABELS[role] || role)}
        </span>
      ))}
      {roles.length > 6 && (
        <span className="inline-flex items-center rounded-full border border-dashed border-white/30 px-3 py-1.5 text-caption font-semibold tabular-nums text-white/70">
          +{roles.length - 6}
        </span>
      )}
    </div>
  ) : null

  return (
    <>
      <section
        // Dropped together: a second `page-top` inside <main> is a duplicate
        // DOM id, and useSpySteps only names the elements that lack one.
        id={spy === null ? undefined : 'page-top'}
        data-spy={spy ?? undefined}
        className={cn(
          'relative isolate overflow-hidden bg-hero-base text-white',
          compact && 'rounded-surface-lg'
        )}
      >
        {background}
        {!drawn && <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-black/25" />}
        {/* Even a drawn backdrop gets a scrim under the WORDS — the aurora is
            dark on average but a preset can put a bright band exactly where
            the meta line sits, and a member picks art, not contrast ratios.
            Anchored to the side the words are on, so it never dims the face. */}
        <div
          className={cn(
            'absolute inset-y-0 w-[70%] lg:w-[58%]',
            side === 'left'
              ? 'right-0 bg-gradient-to-l from-black/55 via-black/25 to-transparent'
              : 'left-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent'
          )}
        />
        {side === 'center' && (
          <div className="absolute inset-y-0 right-0 hidden w-[32%] bg-gradient-to-l from-black/45 to-transparent lg:block" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/55 to-transparent" />

        <div
          className={cn(
            'relative mx-auto w-full max-w-page px-6 md:px-12',
            compact
              ? // Nothing fixed sits above a band in a column, so clearing the
                // navbar's height here would just be a dead strip of banner.
                'pt-8 lg:pt-10'
              : 'pt-[calc(var(--nav-h)+1.5rem)] lg:pt-[calc(var(--nav-h)+1.75rem)]'
          )}
        >
          {/* Below md there is no pointer to hover with, so the way back is a
              plain pill. Above md it lives inside the eyebrow — see below. */}
          <Link
            to={back.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-label font-semibold text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white md:hidden"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {back.label}
          </Link>

          <div
            className={cn(
              'mt-7 grid items-end gap-x-12 gap-y-8 lg:mt-5 xl:gap-x-16',
              // Now the band is a screenful, bottom-aligned words sat in the
              // last third of it with a void above. Centring lifts them into
              // the band. The portrait is unaffected — it carries its own
              // `self-end`, because a cut-out has to stand on the bottom edge.
              !compact && 'lg:items-center',
              // The band is the whole of the first screen, deliberately.
              //
              // 36rem was a fixed guess, and on any viewport taller than about
              // 1300px it left the rail's identity plate and the standing meter
              // showing under it — the same name, level, points and figures the
              // band is already displaying. That duplication is not a bug in
              // the layout: the portrait's flight fades the band's words out as
              // the rail wakes up, so the two are never MEANT to be read at
              // once. Sizing the band to the viewport is what guarantees that,
              // instead of hoping 36rem is enough.
              //
              // svh, not vh: on mobile Chrome and Safari `vh` is the largest
              // viewport, so a vh-sized band hides content behind the URL bar.
              // The 36rem floor keeps it from collapsing on a short laptop.
              compact
                ? 'lg:min-h-[34rem]'
                : 'lg:min-h-[max(36rem,calc(100svh-var(--nav-h)-1.75rem))]',
              gridCols
            )}
          >
            {/* The words. */}
            <div
              ref={wordsRef}
              className={cn('min-w-0 lg:row-start-1 lg:pb-2', wordsCol)}
            >
              {/* The eyebrow and the way back share one cell.
                  Reach for the top-left with the pointer and the line about
                  where this person is gives way to the link out; move away and
                  it comes back. Two layers of one grid cell, so nothing moves
                  and the trail costs no height. Keyboard users get the same
                  thing from focus-within, which is why the link is real markup
                  that is always in the tab order rather than something
                  conjured on hover. */}
              <div className="group/back relative inline-grid w-max md:min-h-9 md:items-center">
                {eyebrow && (
                  // No status dot beside this. The eyebrow leads with the
                  // member's flag, and a green pip next to a flag is two small
                  // marks competing an inch apart — the flag is the one that
                  // says something.
                  <p
                    className={cn(
                      'col-start-1 row-start-1 inline-flex items-center gap-2.5 text-label font-bold uppercase tracking-[0.18em] text-white/80',
                      'transition-opacity duration-200 md:group-hover/back:opacity-0 md:group-focus-within/back:opacity-0'
                    )}
                  >
                    {eyebrow}
                  </p>
                )}
                <Link
                  to={back.href}
                  className={cn(
                    'col-start-1 row-start-1 hidden w-max items-center gap-1.5 justify-self-start rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-label font-semibold text-white backdrop-blur-sm',
                    'transition-opacity duration-200 hover:bg-white/20 md:inline-flex',
                    // Hidden until reached for — by pointer, or by tab.
                    eyebrow ? 'md:opacity-0 md:group-hover/back:opacity-100 md:group-focus-within/back:opacity-100' : ''
                  )}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  {back.label}
                </Link>
              </div>
              {/* Not a flex row: a two-line name in a flex container drops the
                  tick onto a third line of its own. Inline keeps it on the
                  last word, which is where a tick belongs. */}
              <h1
                className={cn(
                  'mt-5 font-display text-display-lg font-semibold text-white [text-wrap:balance]',
                  // A centred subject stands between the two columns, so the
                  // name has half the width it has when the person is to one
                  // side. It gets the smaller of the two display sizes.
                  side === 'center' ? 'lg:text-display' : 'lg:text-hero'
                )}
              >
                <span className="break-words">{name}</span>
                {verified && (
                  <>
                    {' '}
                    <VerifiedBadge
                      verified
                      size={30}
                      tone="inverse"
                      className="inline-block translate-y-[-0.12em]"
                    />
                  </>
                )}
              </h1>
              {lede && (
                <p className="mt-5 max-w-[34ch] text-body-lg font-normal leading-snug text-white/85 [text-wrap:pretty] lg:text-title-sm">
                  {lede}
                </p>
              )}
              {chips}
              {meta && (
                <div className="mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-caption text-white/75">
                  {meta}
                </div>
              )}
              {actions && <div className="mt-8 flex flex-wrap items-center gap-2.5">{actions}</div>}
            </div>

            {/* The person. On desktop this box is only measured — the flyer
                paints over it; below lg the image sits here for real. */}
            <div
              ref={slotRef}
              className={cn(
                'relative order-first justify-self-center self-end lg:order-none',
                portraitCol,
                // Wider than the subject needs: `object-contain` then leaves
                // air on both sides, so a shoulder meets the glow rather than
                // a hard vertical cut at the box edge.
                // The subject is drawn `object-contain`, so for a square or
                // near-square cut-out it is the WIDTH that decides how tall
                // the person reads. Both clamps grow together for that reason.
                // The band fills the screen now, so the person in it can be the
                // size a person on their own page should be. Every desktop
                // clamp grew; the phone ones did not, because there the band is
                // a stack and the portrait already leads it.
                // Ceilings, not just floors. A cut-out drawn 1000 px tall puts a
                // head on screen at half a metre, and at that size the lens of
                // the phone that took it starts to show: front cameras are wide,
                // faces shot at arm's length broaden across the cheeks, and what
                // was invisible at 300 px reads as a stretched image at 500. So
                // the centred portrait stops growing at about 720.
                //
                // To one side the rule is different: the person should stand
                // TALLER than the column of words beside them, so the head sits
                // above the eyebrow and the figure owns the band rather than
                // sitting in its lower half. That column is about three quarters
                // of the screen, so the box is keyed to svh, not vw — a wide
                // short laptop must not get a taller person than a tall monitor.
                // The width grows with it because a near-square cut-out is
                // width-bound under object-contain: at 900 px wide a 0.9:1
                // figure only ever reached 1000 px tall however tall the box.
                // Lifted off the band's bottom edge by a few svh, too — the
                // bottom fade in the mask already dissolves the figure, so the
                // gap under it is invisible and the head clears the eyebrow.
                // The wider box must not take its width from the words: the
                // portrait track is `auto`, sized from the margin box, so a
                // negative right margin hands that width back to the words and
                // slides the figure toward the screen edge instead. The band is
                // overflow-hidden, so the box's overhang is simply cropped.
                // The height is the grid's own minimum, never more: a taller
                // box is the row's tallest item, so it stretches the row and
                // shoves the centred words down off the first screen.
                cutout && side === 'center'
                  ? 'h-[clamp(340px,62vw,460px)] w-[clamp(280px,52vw,380px)] lg:h-[clamp(540px,52vw,720px)] lg:w-[clamp(380px,35vw,500px)]'
                  : cutout
                  ? 'h-[clamp(340px,62vw,460px)] w-[clamp(280px,52vw,380px)] lg:h-[clamp(640px,calc(100svh-var(--nav-h)-1.75rem),1500px)] lg:w-[clamp(480px,56vw,1500px)]'
                  : 'mb-8 h-[clamp(230px,46vw,300px)] w-[clamp(230px,46vw,300px)] lg:mb-14 lg:h-[clamp(420px,40vw,760px)] lg:w-[clamp(420px,40vw,760px)]',
                // Both boxes overhang the page edge by the same margin so the
                // words column is the same width either way; each is then
                // nudged so the FACE lands in the same place. The cut-out's face
                // is in its top third and the diamond's is at its centre, so the
                // diamond sits further left and lower than the cut-out's box.
                side !== 'center' && 'lg:-mr-[14vw] lg:justify-self-end',
                side !== 'center' &&
                  (cutout ? 'lg:-translate-x-[4vw] lg:-translate-y-[5svh]' : 'lg:-translate-x-[10vw] lg:-translate-y-[16svh]')
              )}
              aria-hidden="true"
            >
              {/* Glow the person stands in; also what hides a soft matte edge. */}
              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 top-[45%] aspect-square w-[135%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_62%)] blur-2xl',
                  animated && 'animate-halo-breathe'
                )}
              />
              {/* Photo mode: a gradient rim around the diamond, the one place
                  the brand green touches the member's own face. */}
              {!cutout && portraitSrc && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-1.5 bg-[linear-gradient(160deg,rgba(255,255,255,0.55),rgba(255,255,255,0.08)_45%,rgba(151,215,0,0.5))] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]"
                >
                  <span className="absolute inset-1.5 bg-hero-base [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
                </span>
              )}
              {portraitSrc && (
                <img
                  src={portraitSrc}
                  alt=""
                  onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  className={cn(
                    'absolute inset-0 h-full w-full',
                    // Hidden on desktop only because the flyer paints over it.
                    // With no flyer this IS the portrait — hide it and the band
                    // is empty above lg.
                    flight && 'lg:invisible',
                    // The bottom fade seats the figure on the band's edge; the
                    // side fades hide the straight edge a cut-out has wherever
                    // the original photo was cropped through the person.
                    cutout
                      ? 'object-contain object-bottom [mask-composite:intersect] [mask-image:linear-gradient(135deg,#000_58%,transparent_84%),linear-gradient(225deg,#000_58%,transparent_84%),linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)]'
                      : 'object-cover [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]'
                  )}
                  decoding="async"
                />
              )}
            </div>

            {/* The standing: under the words, or on the far side when the
                subject is centred. */}
            {standing && (
              <div ref={sideRef} className={cn('min-w-0 lg:pb-12', sideCol)}>
                {standing}
              </div>
            )}
          </div>
          {/* The words column carries the bottom padding when there is no
              standing row to do it. */}
          {!standing && <div className="h-10 lg:h-14" />}
        </div>
        {overlay}
      </section>

      {/* The flyer. Fixed, above the page, below the navbar; driven by the
          effect above and invisible below lg. */}
      {flight && portraitSrc && (
        <div
          ref={flyerRef}
          aria-hidden="true"
          // z-rail, not z-nav: the portrait flies UNDER the fixed navbar and
          // over the page, which is the same plane the spy rail occupies.
          className="pointer-events-none fixed left-0 top-0 z-rail hidden overflow-hidden will-change-transform lg:block"
          style={{ visibility: 'hidden' }}
        >
          <div ref={flyBgRef} className="absolute inset-0 opacity-0">
            {cutout?.kind === 'gradient' ? (
              <BannerAurora spec={avatarGradientSpec(cutout)} animated={false} />
            ) : cutout?.kind === 'backdrop' ? (
              <img src={avatarBackdropImage(cutout) ?? undefined} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
          </div>
          <img ref={flyImgRef} src={portraitSrc} alt="" className="absolute left-0 top-0 max-w-none origin-top-left" decoding="async" />
        </div>
      )}
    </>
  )
}

/** Photo mode has no stored frame: the centred square DiamondAvatar's `object-fit: cover` shows. */
function coverFrame(w: number, h: number): PortraitFrame {
  const side = Math.min(w, h)
  return { x: (w - side) / 2 / w, y: (h - side) / 2 / h, s: side / w }
}
