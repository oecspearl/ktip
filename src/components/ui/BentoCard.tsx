import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { heroImageFor, gradientFor } from '../../lib/hero-images'
import { cn } from '../../lib/utils'

/** The tile is a fixed min-height, so tags have to stay a single short row. */
const MAX_CARD_TAGS = 3

interface BentoCardProps {
  to: string
  /** Entity image; falls back to a seeded stock photo. */
  image?: string | null
  imageSeed: string
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Small line under the description (date, amount, location…). */
  meta?: ReactNode
  /** Topic tags; only the first few render, the rest collapse into a +N pill. */
  tags?: string[]
  cta?: string
  onClick?: () => void
  /** Grid span / sizing classes (see lib/bento.ts); merged over the defaults. */
  className?: string
  /** Extra overlay content (badges, action buttons). Rendered above the CTA row. */
  children?: ReactNode
}

// Even-sized bento tile in the homepage FEATURES style: photo fill + brand
// color wash + white text + white pill CTA.
export function BentoCard({
  to,
  image,
  imageSeed,
  eyebrow,
  title,
  description,
  meta,
  tags,
  cta = 'View',
  onClick,
  className,
  children,
}: BentoCardProps) {
  const visibleTags = tags?.slice(0, MAX_CARD_TAGS) ?? []
  const overflowTags = Math.max((tags?.length ?? 0) - MAX_CARD_TAGS, 0)

  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        // @container: the tag rail only splits off once the tile itself is wide
        // enough, so a 4-per-row grid keeps the full width for the text
        '@container group relative rounded-surface p-card-pad flex flex-col justify-between gap-6 overflow-hidden shadow-medium hover:shadow-hard hover:-translate-y-0.5 transition-all duration-300 h-full min-h-tile-min',
        className
      )}
    >
      <img
        src={image || heroImageFor(imageSeed)}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientFor(imageSeed)}`} />

      <div className="relative flex gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="text-micro font-semibold uppercase tracking-widest text-white/75 mb-2">
              {eyebrow}
            </p>
          )}
          <h3 className="text-title-sm font-display font-bold text-white leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.25)] line-clamp-2">
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 text-body text-white/85 leading-relaxed line-clamp-2 [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
              {description}
            </p>
          )}
          {meta && (
            <p className="mt-2 text-caption text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
              {meta}
            </p>
          )}
          {/* Narrow tile: no room for the rail, so the tags run inline as one
              eyebrow line under the meta */}
          {visibleTags.length > 0 && (
            <p className="@md:hidden mt-2 text-micro font-semibold uppercase tracking-widest text-white/75 [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
              {visibleTags.join(' · ')}
              {overflowTags > 0 && ` +${overflowTags}`}
            </p>
          )}
        </div>

        {/* Tag rail — a fifth of the tile, right-aligned, same typographic
            treatment as the eyebrow */}
        {visibleTags.length > 0 && (
          <div className="hidden @md:flex w-1/5 shrink-0 flex-col items-end gap-1 text-right">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="max-w-full truncate text-micro font-semibold uppercase tracking-widest text-white/75 [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]"
              >
                {tag}
              </span>
            ))}
            {overflowTags > 0 && (
              <span className="text-micro font-semibold uppercase tracking-widest text-white/55">
                +{overflowTags}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative flex items-end justify-between gap-3">
        {/* Same CTA pill as the homepage FEATURES tiles: brand pair, flipping
            navy→green (green→navy at night) and lifting with the card */}
        <span className="relative self-start inline-flex items-center gap-1.5 bg-brand-navy text-white dark:bg-brand-green dark:text-brand-navy rounded-control px-4 py-2 text-caption font-semibold shadow-soft group-hover:shadow-medium group-hover:bg-brand-green group-hover:text-brand-navy group-hover:-translate-y-0.5 group-hover:scale-[1.03] dark:group-hover:bg-brand-navy dark:group-hover:text-brand-green group-hover:gap-2.5 transition-all">
          {cta} <ArrowRight size={13} />
        </span>
        {children && (
          // Actions live inside the card Link — cancel navigation for clicks here
          <div
            className="relative z-10"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            {children}
          </div>
        )}
      </div>
    </Link>
  )
}
