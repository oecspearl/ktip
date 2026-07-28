import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { heroImageFor } from '../../lib/hero-images'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeroProps {
  eyebrow: string
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
}: PageHeroProps) {
  const src = image || heroImageFor(imageSeed ?? eyebrow)

  return (
    <div
      className={`relative bg-gray-900 overflow-hidden flex items-end ${
        compact ? 'min-h-[230px]' : 'min-h-[300px] md:min-h-[340px]'
      } ${inset ? 'rounded-2xl shadow-medium mb-8' : ''}`}
    >
      <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
      {/* Frosted blur over the left side, fading out toward the right */}
      <div className="absolute inset-y-0 left-0 w-full md:w-[80%] backdrop-blur-2xl bg-black/10 [mask-image:linear-gradient(to_right,black_55%,transparent_100%)]" />
      {/* Neutral dark overlays for text readability */}
      <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/40 to-black/30" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

      <div
        className={`relative w-full ${
          inset
            ? 'px-6 py-6 md:py-8'
            : 'w-full max-w-[calc(50vw+48rem)] mx-auto px-6 md:px-12 pt-24 md:pt-28 pb-8 md:pb-10'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60 mb-3">
              {eyebrow}
            </p>
            <h1
              className={`font-display font-extrabold text-white leading-[1.08] tracking-tight ${
                compact ? 'text-2xl sm:text-3xl md:text-4xl' : 'text-3xl sm:text-4xl md:text-5xl'
              }`}
            >
              {title}
            </h1>
            {subtitle && <p className="mt-3 text-white/80 max-w-xl leading-relaxed">{subtitle}</p>}
            {children && <div className="mt-4">{children}</div>}
          </div>

          <div className="flex flex-col items-start md:items-end gap-4 shrink-0">
            {breadcrumb && breadcrumb.length > 0 && (
              <nav className="text-sm text-white/60 hidden md:block" aria-label="Breadcrumb">
                {breadcrumb.map((item, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span className="mx-1.5">
                        <ChevronRight size={12} className="inline" />
                      </span>
                    )}
                    {item.href ? (
                      <Link to={item.href} className="hover:text-white transition-colors">
                        {item.label}
                      </Link>
                    ) : (
                      <span className="text-white/80">{item.label}</span>
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
