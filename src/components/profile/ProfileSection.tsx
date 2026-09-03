import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ProfileSectionProps {
  /**
   * URL fragment. Stable and English — a translated #anchor breaks every
   * shared link the moment the reader's language differs from the sharer's.
   */
  id?: string
  /**
   * Scroll-spy marker. Also English, and for a harder reason: the tutorials in
   * src/data/tutorials target these by literal string (`[data-spy="Members"]`),
   * so translating one silently breaks a page tour with no error anywhere.
   */
  spy?: string
  title: string
  /** Right-aligned figure on the heading row — a count, "9 earned". */
  count?: ReactNode
  /** Trailing controls on the heading row. Sits after the count. */
  actions?: ReactNode
  /**
   * Which rung of the elevation ladder this sits on.
   *
   * `card`  — L1. Cream fill, soft-UI shadow, NO border. The page's content
   *           column. The old markup was `rounded-3xl border border-sand-200`
   *           on every section, which is what flattened the page: a border and
   *           a fill say "separate object" once, and saying it six times at the
   *           same weight says nothing.
   * `rail`  — L1 with a quieter, smaller heading. The page's sticky rail, where
   *           the headings are labels over reference data rather than titles.
   * `flush` — no surface at all, divided from its neighbour by a hairline. The
   *           drawer: stacked cards inside a 34rem panel are boxes in a box.
   */
  tone?: 'card' | 'rail' | 'flush'
  className?: string
  children: ReactNode
}

const TONE = {
  card: 'neu-surface rounded-surface bg-ktip-cream shadow-neu p-card-pad',
  rail: 'neu-surface rounded-surface bg-ktip-cream shadow-neu p-card-pad-sm',
  flush: 'border-t border-ktip-sand-200 px-gutter py-5 first:border-t-0',
} as const

/**
 * One titled block on a profile surface.
 *
 * Replaces four near-identical local helpers that had drifted apart — the
 * drawer's `Section`, the page's six hand-rolled `<section>` elements, its
 * `LinkSection`, and the label row inside `TagRow`. They rendered the same
 * green tick and the same heading at three different sizes.
 */
export function ProfileSection({
  id,
  spy,
  title,
  count,
  actions,
  tone = 'card',
  className,
  children,
}: ProfileSectionProps) {
  const rail = tone === 'rail'

  return (
    <section
      id={id}
      data-spy={spy}
      className={cn('scroll-mt-24', TONE[tone], className)}
    >
      <h2
        className={cn(
          'flex items-center gap-2',
          rail
            ? 'mb-2.5 text-micro font-semibold uppercase tracking-[0.14em] text-ktip-sand-500'
            : 'mb-3 font-display text-title-sm font-bold text-ktip-sand-900'
        )}
      >
        <span
          aria-hidden
          className={cn('shrink-0 rounded-sm bg-brand-green', rail ? 'h-3 w-[3px]' : 'h-4 w-1')}
        />
        {title}
        {count != null && (
          <span className="ml-auto text-micro font-semibold tabular-nums text-ktip-sand-500">
            {count}
          </span>
        )}
        {actions && <span className={cn(count == null && 'ml-auto')}>{actions}</span>}
      </h2>
      {children}
    </section>
  )
}
