import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { HERO_WASH, pageHeroFor } from '../../lib/hero-images'
import { Reveal } from '../ui/Reveal'
import { useLingui } from '@lingui/react/macro'
import { resolveCopy, type Copy } from '../../i18n/copy'

export interface BreadcrumbItem {
  /**
   * `Copy`, not `string`: most callers already resolve with `t\`…\`` before
   * this ever sees the prop, but site-map-sourced crumbs arrive as harvested
   * source strings. Resolved here rather than at every call site, same as
   * SortSelect.
   */
  label: Copy
  href?: string
}

interface PageHeroProps {
  eyebrow: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Explicit hero image (e.g. an entity's image_url). Falls back to the stock pool. */
  image?: string | null
  /** Stable seed for picking a stock image; defaults to the eyebrow text. */
  imageSeed?: string
  breadcrumb?: BreadcrumbItem[]
  actions?: ReactNode
  /** Extra content under the title (badges, meta rows). */
  children?: ReactNode
  /** Shorter band for utility/tool pages. */
  compact?: boolean
  /** Admin variant: rounded card inside a constrained column instead of full-bleed. */
  inset?: boolean
  /** Scrollspy rail label for the hero band; pass null to keep it off the rail.
   *  Inert on its own — the rail hides until the page marks a second section. */
  spyLabel?: string | null
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  image,
  imageSeed,
  breadcrumb,
  actions,
  children,
  compact = false,
  inset = false,
  spyLabel = 'Top',
}: PageHeroProps) {
    const { t, i18n } = useLingui()
  const src =
    image ||
    pageHeroFor(
      imageSeed,
      typeof eyebrow === 'string' ? eyebrow : null,
      typeof title === 'string' ? title : null
    )

  /**
   * Photo reveal, gated on the browser having actually PAINTED the image.
   *
   * During the route card shuffle the incoming page renders live inside
   * ::view-transition-new(root), and Chromium defers the first compositor
   * raster of a large image even when it is fetched and decoded (measured
   * 840ms deferred under the transition vs ≤139ms without it). Nothing in CSS
   * or JS controls the raster moment, so a CSS entrance animation cannot help:
   * a fade that starts at mount can be over before the raster lands, and the
   * photo still snaps in mid-slide — the reported navy flash over the hero.
   *
   * So the reveal is sequenced instead of timed. The imgs sit at opacity
   * 0.002 — invisible over the navy band, but NOT opacity 0, which would let
   * the compositor skip the layer and defer the raster the reveal is waiting
   * on. On load, two rAFs let a frame containing the painted image commit,
   * then the opacity transition runs — over pixels that already exist.
   */
  const [photoReady, setPhotoReady] = useState(false)
  const photoRef = useRef<HTMLImageElement>(null)
  const markPhotoReady = useCallback(() => {
    // Three rAFs, not one: the raster happens off the main thread, so the
    // reveal waits for frames that can only exist once the image is in them.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => setPhotoReady(true)))
    )
  }, [])
  useEffect(() => {
    // Memory-cache hit can complete before React attaches the load handler.
    if (photoRef.current?.complete) markPhotoReady()
  }, [markPhotoReady])
  // ease-in-out, not ease-out: if a straggler raster lands a frame or two into
  // the reveal, an ease-out curve is already at ~40% opacity and the pop is
  // visible; ease-in-out is still near-invisible there, so the tail of the
  // raster race fades in instead of flashing.
  const photoReveal = `transition-opacity duration-500 ease-in-out ${
    photoReady ? 'opacity-100' : 'opacity-[0.002]'
  }`

  // The full breadcrumb is desktop-only, which left phones with no way back to
  // the parent listing at all — the browser button was it. The last crumb that
  // still has an href is that parent, so it doubles as a one-tap back chip.
  const linkedCrumbs = breadcrumb?.filter((c) => c.href) ?? []
  const backCrumb = linkedCrumbs[linkedCrumbs.length - 1]

  // The band under the photo is hero-base (brand navy by day, near-black under
  // html.dark), never gray-900: the gray scale inverts at night, so it flashed
  // white while the image loaded (and stayed white if the image 404'd).
  return (
    <div
      id={spyLabel ? 'page-top' : undefined}
      data-spy={spyLabel ?? undefined}
      // The band rides the display ramp, same as the headline inside it — a
      // band on a fixed height would crop the title as the type scaled up.
      className={`relative bg-hero-base overflow-hidden flex items-end ${
        compact ? 'min-h-hero-band-compact' : 'min-h-hero-band'
      } ${inset ? 'rounded-surface shadow-medium mb-8' : ''}`}
    >
      <img
        ref={photoRef}
        src={src}
        alt=""
        onLoad={markPhotoReady}
        className={`absolute inset-0 w-full h-full object-cover photo-dimmable ${photoReveal}`}
        loading="eager" fetchPriority="high"
        /* sync, not async. `decoding="async"` is permission to paint a frame
           WITHOUT this image and decode it afterwards — and MainLayout remounts
           the whole routed subtree on every cross-shell navigation
           (key={shellKey(pathname)}; dashboard/admin tab changes keep the hero
           mounted), so this is a brand-new element needing a fresh decode on
           every page change, cache or no cache. The route card shuffle then captures that
           first paint into ::view-transition-new(root) and holds it for 500ms.
           With the photo absent the band shows what is underneath it: the
           navy `bg-brand-navy`, the bottom fade's upward gradient cut off at
           the band edge, and the frosted panel with no backdrop left to blur.
           The image is already eager + high priority; there is nothing to gain
           by letting it miss the frame it was fetched for.

           decoding="sync" is still not enough during the card shuffle — see
           the photoReady note above for why the reveal is JS-gated. */
        decoding="sync"
      />
      {/* Frosted blur over the right side, fading out toward the left.
          A blurred COPY of the photo, not backdrop-filter. backdrop-filter has
          to sample whatever is painted beneath it, and that sampling does not
          survive being captured into a view-transition snapshot — so for the
          whole 500ms the route card shuffle holds that snapshot on screen the
          frost is simply gone, the photo shows sharp, and the washes over it
          (including the bottom fade's upward gradient) sit on an unsoftened
          image and read as a hard-edged navy band. A filter on the element's
          own content is part of its paint, so it is captured like everything
          else.
          scale-110 overfills the box because blur() samples past the edges and
          would otherwise feather the band's own borders. The mask is restated
          in hero coordinates: the old panel was 80% of the width with the fade
          starting 55% across itself, which is 44%/80% measured across the
          whole band — and full width below md, where the panel was w-full. */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        // One explicit `filter`, not `photo-dimmable blur-2xl`. Both of those
        // set the `filter` property, so the utility won and the copy computed
        // to `brightness(1)` — no blur at all. `scale-110` was lost the same
        // way. Composed by hand here so neither can clobber the other.
        // Two knobs: blur() is the strength, the mask stops are the ramp.
        // 40px read as over-frosted; the long stop range is what makes it a
        // gradient blur rather than a hard frosted panel with a fading tint.
        className={`absolute inset-0 w-full h-full object-cover ${photoReveal} [filter:blur(24px)_brightness(var(--photo-brightness,1))] [transform:scale(1.08)] [mask-image:linear-gradient(to_left,black_25%,transparent_95%)] md:[mask-image:linear-gradient(to_left,black_20%,transparent_78%)]`}
        loading="eager" decoding="sync"
      />
      <div className="absolute inset-y-0 right-0 w-full md:w-[80%] bg-black/10 [mask-image:linear-gradient(to_left,black_55%,transparent_100%)]" />
      {/* Neutral dark overlays for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-black/20" />
      {/* Brand wash — navy by day, green by night (OECS palette) */}
      <div className={`absolute inset-0 bg-gradient-to-r ${HERO_WASH}`} />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

      <div
        className={`relative w-full ${
          inset
            ? 'px-6 py-6 md:py-8'
            // pt clears the fixed navbar; pb sets the band height
            : 'w-full max-w-page mx-auto px-6 md:px-12 pt-[calc(var(--nav-h)+1.5rem)] pb-6 md:pb-8'
        }`}
      >
        {backCrumb && (
          <Link
            to={backCrumb.href!}
            className="md:hidden mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-label font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {resolveCopy(i18n, backCrumb.label)}
          </Link>
        )}

        <div className="flex flex-col md:flex-row-reverse md:items-end justify-between gap-4">
          <div className="min-w-0 md:text-right">
            <Reveal order={0}>
              <div className="text-micro font-semibold uppercase tracking-[0.3em] text-white/60 mb-3">
                {eyebrow}
              </div>
            </Reveal>
            <Reveal order={1}>
              <h1
                // One token replaces a three-step ladder. The ladder topped out
                // at md:, so the headline was the same size on a 1280 laptop and
                // a 2560 desktop; the display ramp keeps going past that.
                className={`font-display font-extrabold text-white leading-[1.08] tracking-tight ${
                  compact ? 'text-display-sm' : 'text-display'
                }`}
              >
                {title}
              </h1>
            </Reveal>
            {subtitle && (
              <Reveal order={2}>
                <p className="mt-3 text-body text-white/80 max-w-xl leading-relaxed md:ml-auto">
                  {subtitle}
                </p>
              </Reveal>
            )}
            {children && (
              <Reveal order={3}>
                <div className="mt-4 md:flex md:justify-end">{children}</div>
              </Reveal>
            )}
          </div>

          <div className="flex flex-col items-start gap-4 shrink-0">
            {/* The nav is hidden below md, so the old `text-base md:text-lg`
                pair only ever rendered at its md: step — one token, same size. */}
            {breadcrumb && breadcrumb.length > 0 && (
              <nav className="text-body-lg text-white/70 hidden md:block" aria-label={t`Breadcrumb`}>
                {breadcrumb.map((item, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span className="mx-1.5">
                        <ChevronRight size={15} className="inline" />
                      </span>
                    )}
                    {item.href ? (
                      <Link to={item.href} className="hover:text-white transition-colors">
                        {resolveCopy(i18n, item.label)}
                      </Link>
                    ) : (
                      <span className="text-white">{resolveCopy(i18n, item.label)}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
