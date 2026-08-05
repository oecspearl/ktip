import { BadgeCheck } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { CalendarItem } from '../../lib/calendar'

interface CalendarAccentBarProps {
  item: CalendarItem
  /** Sizing/position classes — the caller owns width, radius and placement */
  className?: string
  /** Measured sizing the cluster rail computes at layout time */
  style?: React.CSSProperties
}

/**
 * The colour stripe on every calendar row: one solid band, the item's own
 * colour and nothing else.
 *
 * It used to split in two when the viewer had a tie to the item — what it is on
 * top, where you stand underneath. The second half read as a colour the row had
 * no other reason to be, so a navy hackathon you were registered for came out
 * half green. Registration is a check on the row now (CalendarRelationCheck),
 * which says the same thing without spending the colour channel on it.
 */
export function CalendarAccentBar({ item, className, style }: CalendarAccentBarProps) {
  return <span aria-hidden="true" style={style} className={cn(item.dotClass, className)} />
}

/**
 * "You are on this one." Shown on rows the viewer holds a live registration
 * for; a cancelled or declined RSVP is not attendance, so it shows nothing.
 *
 * Decorative only — every row already names the relation in its accessible
 * label, so the icon is not the sole carrier of the fact.
 */
export function CalendarRelationCheck({
  item,
  className,
}: {
  item: CalendarItem
  className?: string
}) {
  if (!item.relation || item.relation.negative) return null

  return (
    <BadgeCheck
      size={13}
      aria-hidden="true"
      // Filled, not outlined: the badge shape takes the green and the tick is
      // knocked out of it in the card colour, which is the verified mark this
      // app already uses for an approved state. A bare stroke tick at 13px on
      // a tinted chip reads as a stray glyph.
      className={cn('shrink-0 fill-ktip-tropical-500 text-ktip-cream', className)}
    />
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
