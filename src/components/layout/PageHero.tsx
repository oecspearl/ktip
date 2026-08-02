import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { HERO_WASH, pageHeroFor } from '../../lib/hero-images'
import { Reveal } from '../ui/Reveal'

export interface BreadcrumbItem {
  label: string
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
  const src =
    image ||
    pageHeroFor(
      imageSeed,
      typeof eyebrow === 'string' ? eyebrow : null,
      typeof title === 'string' ? title : null
    )

  // The full breadcrumb is desktop-only, which left phones with no way back to
  // the parent listing at all — the browser button was it. The last crumb that
  // still has an href is that parent, so it doubles as a one-tap back chip.
  const linkedCrumbs = breadcrumb?.filter((c) => c.href) ?? []
  const backCrumb = linkedCrumbs[linkedCrumbs.length - 1]

  // The band under the photo is brand-navy, not gray-900: the gray scale
  // inverts under html.dark, so it flashed white at night while the image
  // loaded (and stayed white if the image 404'd).
  return (
    <div
      id={spyLabel ? 'page-top' : undefined}
      data-spy={spyLabel ?? undefined}
      // The band rides the display ramp, same as the headline inside it — a
      // band on a fixed height would crop the title as the type scaled up.
      className={`relative bg-brand-navy overflow-hidden flex items-end ${
        compact ? 'min-h-hero-band-compact' : 'min-h-hero-band'
      } ${inset ? 'rounded-surface shadow-medium mb-8' : ''}`}
    >
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover photo-dimmable"
        loading="eager" fetchPriority="high" decoding="async"
      />
      {/* Frosted blur over the right side, fading out toward the left */}
      <div className="absolute inset-y-0 right-0 w-full md:w-[80%] backdrop-blur-2xl bg-black/10 [mask-image:linear-gradient(to_left,black_55%,transparent_100%)]" />
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
            {backCrumb.label}
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
              <nav className="text-body-lg text-white/70 hidden md:block" aria-label="Breadcrumb">
                {breadcrumb.map((item, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span className="mx-1.5">
                        <ChevronRight size={15} className="inline" />
                      </span>
                    )}
                    {item.href ? (
                      <Link to={item.href} className="hover:text-white transition-colors">
                        {item.label}
                      </Link>
                    ) : (
                      <span className="text-white">{item.label}</span>
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
