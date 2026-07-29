import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { heroImageFor, gradientFor } from '../../lib/hero-images'

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
  children,
}: BentoCardProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group relative rounded-2xl p-6 flex flex-col justify-between gap-6 overflow-hidden shadow-medium hover:shadow-hard hover:-translate-y-0.5 transition-all duration-300 h-full min-h-[13rem]"
    >
      <img
        src={image || heroImageFor(imageSeed)}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientFor(imageSeed)}`} />

      <div className="relative">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/75 mb-2">
            {eyebrow}
          </p>
        )}
        <h3 className="text-xl font-display font-bold text-white leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.25)] line-clamp-2">
          {title}
        </h3>
        {description && (
          <p className="mt-1.5 text-sm text-white/85 leading-relaxed line-clamp-2 [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
            {description}
          </p>
        )}
        {meta && (
          <p className="mt-2 text-xs text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
            {meta}
          </p>
        )}
        {tags && tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.slice(0, MAX_CARD_TAGS).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white border border-white/25 backdrop-blur-[2px]"
              >
                {tag}
              </span>
            ))}
            {tags.length > MAX_CARD_TAGS && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white/80">
                +{tags.length - MAX_CARD_TAGS}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <span className="self-start inline-flex items-center gap-1.5 bg-ktip-cream text-gray-900 rounded-lg px-4 py-2 text-xs font-semibold shadow-md group-hover:gap-2.5 transition-all">
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
