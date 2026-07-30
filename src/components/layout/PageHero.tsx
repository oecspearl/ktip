import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
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

  // The band under the photo is brand-navy, not gray-900: the gray scale
  // inverts under html.dark, so it flashed white at night while the image
  // loaded (and stayed white if the image 404'd).
  return (
    <div
      id={spyLabel ? 'page-top' : undefined}
      data-spy={spyLabel ?? undefined}
      className={`relative bg-brand-navy overflow-hidden flex items-end ${
        compact ? 'min-h-[190px]' : 'min-h-[250px] md:min-h-[280px]'
      } ${inset ? 'rounded-2xl shadow-medium mb-8' : ''}`}
    >
      <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
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
            // pt clears the fixed navbar (~88px tall); pb sets the band height
            : 'w-full max-w-[calc(50vw+48rem)] mx-auto px-6 md:px-12 pt-24 pb-6 md:pb-8'
        }`}
      >
        <div className="flex flex-col md:flex-row-reverse md:items-end justify-between gap-4">
          <div className="min-w-0 md:text-right">
            <Reveal order={0}>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60 mb-3">
                {eyebrow}
              </div>
            </Reveal>
            <Reveal order={1}>
              <h1
                className={`font-display font-extrabold text-white leading-[1.08] tracking-tight ${
                  compact ? 'text-2xl sm:text-3xl md:text-4xl' : 'text-3xl sm:text-4xl md:text-5xl'
                }`}
              >
                {title}
              </h1>
            </Reveal>
            {subtitle && (
              <Reveal order={2}>
                <p className="mt-3 text-white/80 max-w-xl leading-relaxed md:ml-auto">{subtitle}</p>
              </Reveal>
            )}
            {children && (
              <Reveal order={3}>
                <div className="mt-4 md:flex md:justify-end">{children}</div>
              </Reveal>
            )}
          </div>

          <div className="flex flex-col items-start gap-4 shrink-0">
            {breadcrumb && breadcrumb.length > 0 && (
              <nav className="text-base md:text-lg text-white/70 hidden md:block" aria-label="Breadcrumb">
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
