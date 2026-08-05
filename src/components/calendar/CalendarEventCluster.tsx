import { cn } from '../../lib/utils'
import { CALENDAR_META_CLASS, CALENDAR_ROW_TITLE_CLASS } from '../../lib/constants'
import { CalendarRelationCheck, calendarItemLabel } from './CalendarAccentBar'
import { CalendarAccentRail } from './CalendarAccentRail'
import { accentWash } from '../../lib/calendar-accent'
import { formatMinuteRange } from '../../lib/calendar-week'
import { useTimeFormat } from './useTimeFormat'
import type { CalendarItem } from '../../lib/calendar'
import type { ClusterRow, WeekCluster } from '../../lib/calendar-week'

interface CalendarEventClusterProps {
  cluster: WeekCluster
  selectedItemId?: string | null
  onSelectItem: (item: CalendarItem) => void
}

/** Below this a row cannot hold two lines, so it becomes a single line. */
const TINY_ROW_PX = 36

function ClusterRowButton({
  row,
  selected,
  onSelect,
  divided,
}: {
  row: ClusterRow
  selected: boolean
  onSelect: (item: CalendarItem) => void
  divided: boolean
}) {
  const { use24 } = useTimeFormat()
  const tiny = row.heightPx < TINY_ROW_PX
  const meta = [formatMinuteRange(row.startMin, row.endMin, use24), !tiny && row.item.locationLabel]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <button
      type="button"
      onClick={() => onSelect(row.item)}
      aria-pressed={selected}
      aria-label={calendarItemLabel(row.item)}
      style={{
        height: row.heightPx,
        // The wash bleeds out of the rail so the bar reads as the edge of a
        // tint. Dropped on the selected row — two washes fight
        backgroundImage: selected ? undefined : accentWash(row.item.dotClass, row.past),
      }}
      className={cn(
        'relative w-full shrink-0 overflow-hidden pl-2 pr-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ktip-ocean-500',
        tiny ? 'flex items-center gap-2 py-0.5' : 'py-1',
        selected ? 'bg-ktip-ocean-50 ring-1 ring-inset ring-ktip-ocean-500' : 'hover:bg-ktip-sand-100'
      )}
    >
      {/* Inset on both sides so the rule never runs into the rail or the edge */}
      {divided && !selected && (
        <span aria-hidden="true" className="absolute inset-x-2 top-0 h-px bg-ktip-sand-200" />
      )}

      <span className={cn('flex items-start gap-1', tiny && 'min-w-0 flex-1')}>
        <span
          className={cn(
            CALENDAR_ROW_TITLE_CLASS,
            'min-w-0 flex-1 truncate',
            tiny ? undefined : 'line-clamp-2 whitespace-normal',
            // Past rows drain their colour rather than fading — an opacity drop
            // takes the contrast with it and the title stops being readable
            row.past ? 'font-normal text-ktip-sand-500' : 'text-ktip-sand-900'
          )}
        >
          {row.item.title}
        </span>
        <CalendarRelationCheck item={row.item} className="mt-[2px]" />
      </span>

      <span
        className={cn(
          CALENDAR_META_CLASS,
          'block truncate',
          tiny ? 'shrink-0' : 'mt-0.5',
          row.past ? 'text-ktip-sand-400' : 'text-ktip-sand-600'
        )}
      >
        {meta}
      </span>

      {!tiny && row.item.statusLabel && (
        <span className={cn(CALENDAR_META_CLASS, 'mt-0.5 block truncate text-ktip-sand-500')}>
          {row.item.statusLabel}
        </span>
      )}
    </button>
  )
}

/**
 * A run of overlapping events, drawn as one opaque box of stacked rows with a
 * single accent rail down the left.
 *
 * The box is opaque on purpose — it is what hides the hour rule running behind
 * it, which is the difference between a grid that reads as paper and one that
 * reads as a table with things floating over it.
 */
export function CalendarEventCluster({
  cluster,
  selectedItemId,
  onSelectItem,
}: CalendarEventClusterProps) {
  return (
    <div
      style={{ top: cluster.topPx, height: cluster.heightPx }}
      className="absolute inset-x-1 flex flex-col overflow-hidden rounded-cal-sm border border-ktip-sand-300 bg-ktip-cream pl-[3px] transition-all duration-200 animate-cal-week hover:z-raised hover:border-ktip-ocean-300 hover:shadow-card-hover"
    >
      {/* The rail: one continuous gradient, each row's accent holding across
          its own band and blending across the seam into the next */}
      <CalendarAccentRail
        className="absolute inset-y-0 left-0 w-[3px]"
        bands={cluster.rows.map((row) => ({
          item: row.item,
          weight: row.heightPx,
          past: row.past,
        }))}
      />

      {cluster.rows.map((row, index) => (
        <ClusterRowButton
          key={row.item.id}
          row={row}
          divided={index > 0}
          selected={row.item.id === selectedItemId}
          onSelect={onSelectItem}
        />
      ))}
    </div>
  )
}
