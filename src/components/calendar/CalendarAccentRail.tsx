import { cn } from '../../lib/utils'
import { CalendarAccentBar } from './CalendarAccentBar'
import { accentVar, drainAccent } from '../../lib/calendar-accent'
import type { CalendarItem } from '../../lib/calendar'

interface RailBand {
  item: CalendarItem
  /** Share of the rail this item occupies — any unit, they are normalised */
  weight: number
  /** Drained because the item has already finished */
  past?: boolean
}

interface CalendarAccentRailProps {
  bands: RailBand[]
  className?: string
}

/**
 * How much of a band is spent fading into its neighbour, in percent, and the
 * share of a band it may claim. Generous on purpose — a narrow blend on a 3px
 * rail reads as a hard join at any realistic card height.
 */
const MAX_BLEND_PCT = 24
const BLEND_SHARE = 0.45

/**
 * The shared colour spine down a cluster card. One continuous gradient: each
 * row's own accent holds steady across its own band and blends across the seam
 * into the next, so a day of mixed types reads as one object rather than as a
 * stack of separate stickers.
 *
 * Falls back to solid stacked segments when any accent is not a plain colour
 * class — a butt-jointed rail is still correct, just less pretty.
 */
export function CalendarAccentRail({ bands, className }: CalendarAccentRailProps) {
  if (bands.length === 0) return null

  // One stop per band, and the band's own colour is the only one it gets. The
  // rail used to split registered items in half and give the bottom half the
  // RSVP colour, which put a green stop on a navy event for reasons the rail
  // could not explain. Registration is a check on the row now.
  const stops: { color: string; weight: number }[] = []
  let resolvable = true

  for (const band of bands) {
    const own = accentVar(band.item.dotClass)
    if (!own) {
      resolvable = false
      break
    }
    const weight = Math.max(band.weight, 0.0001)
    stops.push({ color: band.past ? drainAccent(own) : own, weight })
  }

  if (!resolvable) {
    const total = bands.reduce((sum, band) => sum + Math.max(band.weight, 0.0001), 0)
    return (
      <span aria-hidden="true" className={cn('flex flex-col overflow-hidden', className)}>
        {bands.map((band) => (
          <CalendarAccentBar
            key={band.item.id}
            item={band.item}
            className={cn('w-full shrink-0', band.past && 'opacity-45')}
            style={{ height: `${(Math.max(band.weight, 0.0001) / total) * 100}%` }}
          />
        ))}
      </span>
    )
  }

  if (stops.length === 1) {
    return (
      <span
        aria-hidden="true"
        className={cn('overflow-hidden', className)}
        style={{ background: stops[0].color }}
      />
    )
  }

  const total = stops.reduce((sum, stop) => sum + stop.weight, 0)
  const parts: string[] = []
  let offset = 0

  stops.forEach((stop, index) => {
    const top = (offset / total) * 100
    const bottom = ((offset + stop.weight) / total) * 100
    // Short bands cannot spare the full width at each end or the flat run
    // disappears and the band stops naming its own colour
    const blend = Math.min(MAX_BLEND_PCT, (bottom - top) * BLEND_SHARE)
    const from = index === 0 ? 0 : top + blend
    const to = index === stops.length - 1 ? 100 : bottom - blend
    parts.push(`${stop.color} ${from.toFixed(2)}%`, `${stop.color} ${to.toFixed(2)}%`)
    offset += stop.weight
  })

  return (
    <span
      aria-hidden="true"
      className={cn('overflow-hidden', className)}
      style={{ background: `linear-gradient(180deg, ${parts.join(', ')})` }}
    />
  )
}
