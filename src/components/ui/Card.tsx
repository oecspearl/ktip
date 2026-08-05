import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ className, hover, padding, children, ...others }: CardProps) {
  const paddingStyles = {
    none: '',
    sm: 'p-card-pad-sm',
    md: 'p-card-pad',
    lg: 'p-card-pad-lg',
  }

  return (
    <div
      className={cn(
        // Homepage bento depth: medium at rest, hard on hover.
        // No hairline in either theme: the cream fill sits far enough off
        // ktip-canvas that the ground gap separates the card by itself, and a
        // sand-100 edge would only ring it in something brighter than both
        // neighbours. Dark mode earns this by grounding canvas at true black
        // (see the html.dark block in index.css) — if that ever moves back up
        // toward the cream fill, the border has to come back with it.
        // .neu-surface re-points --neu-surface at the cream fill, so a Button
        // inside the card sculpts out of the CARD rather than out of the page
        // ground — without it the soft-UI shadow pair halos. See index.css.
        'neu-surface bg-ktip-cream rounded-surface shadow-medium',
        hover && 'hover:shadow-hard hover:-translate-y-0.5 transition-all duration-300 cursor-pointer',
        paddingStyles[padding || 'md'],
        className
      )}
      {...others}
    >
      {children}
    </div>
  )
}
