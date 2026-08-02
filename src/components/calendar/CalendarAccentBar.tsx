import { cn } from '../../lib/utils'
import type { CalendarItem } from '../../lib/calendar'

interface CalendarAccentBarProps {
  item: CalendarItem
  /** Sizing/position classes — the caller owns width, radius and placement */
  className?: string
}

/**
 * The colour stripe on every calendar row. One solid band for a plain item;
 * split in two when the viewer has their own tie to it — top half says *what it
 * is* (event type, deadline), bottom half says *where you stand* (registered,
 * waitlisted). Encodes both facts without a second row or extra height.
 */
export function CalendarAccentBar({ item, className }: CalendarAccentBarProps) {
  if (!item.relation) {
    return <span aria-hidden="true" className={cn(item.dotClass, className)} />
  }

  return (
    <span aria-hidden="true" className={cn('flex flex-col overflow-hidden', className)}>
      <span className={cn('flex-1', item.dotClass)} />
      <span className={cn('flex-1', item.relation.dotClass)} />
    </span>
  )
}

/** Screen-reader / tooltip text for an item, including the viewer's relation. */
export function calendarItemLabel(item: CalendarItem): string {
  return [
    item.badgeLabel,
    item.title,
    item.relation
      ? [item.relation.label, item.relation.detail].filter(Boolean).join(' — ')
      : undefined,
    item.statusLabel,
  ]
    .filter(Boolean)
    .join(', ')
}
