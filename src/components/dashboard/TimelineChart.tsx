import { useMemo } from 'react'
import { format } from 'date-fns'
import { FileText, FolderKanban } from 'lucide-react'
import { cn, formatDate } from '../../lib/utils'
import {
  computeMonthRange,
  positionFor,
  positionForDate,
  type TimelineItem,
} from '../../lib/timeline'
import { Badge } from '../ui/Badge'
import {
  GRANT_APPLICATION_STATUS_COLORS,
  GRANT_APPLICATION_STATUS_LABELS,
  PHASE_COLORS,
  PHASE_LABELS,
} from '../../lib/constants'

interface TimelineChartProps {
  items: TimelineItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function TimelineChart({ items, selectedId, onSelect }: TimelineChartProps) {
  const today = useMemo(() => new Date(), [])
  const { months, rangeStart, rangeEnd } = useMemo(
    () => computeMonthRange(items, today),
    [items, today]
  )
  const todayPct = positionForDate(today, rangeStart, rangeEnd)

  return (
    <div className="bg-ktip-cream border border-ktip-sand-100 rounded-2xl shadow-card overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Month header */}
        <div className="flex border-b border-ktip-sand-100">
          <div className="w-44 shrink-0 sticky left-0 bg-ktip-cream z-10 border-r border-ktip-sand-100" />
          <div className="flex-1 flex relative">
            {months.map((month) => (
              <div
                key={month.toISOString()}
                className="flex-1 px-2 py-3 text-xs font-medium uppercase tracking-wide text-ktip-sand-500 border-l border-ktip-sand-200/60 first:border-l-0"
              >
                {format(month, 'MMM yyyy')}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {/* Month gridlines + today marker overlay */}
          <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
            <div className="w-44 shrink-0" />
            <div className="flex-1 flex relative">
              {months.map((month, i) => (
                <div
                  key={month.toISOString()}
                  className={cn('flex-1 border-l border-ktip-sand-200/60', i === 0 && 'border-l-0')}
                />
              ))}
              <div
                className="absolute inset-y-0 w-px bg-ktip-ocean-400/60"
                style={{ left: `${todayPct}%` }}
              >
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-ktip-ocean-500 text-white text-[10px] font-medium leading-none whitespace-nowrap">
                  Today
                </span>
              </div>
            </div>
          </div>

          <div className="stagger-children">
            {items.map((item) => {
              const { leftPct, widthPct } = positionFor(item, rangeStart, rangeEnd, today)
              const isSelected = selectedId === item.id
              const isGrant = item.kind === 'grant_application'
              const KindIcon = isGrant ? FileText : FolderKanban
              const statusLabel = isGrant
                ? (GRANT_APPLICATION_STATUS_LABELS[item.currentKey] ?? item.currentKey)
                : (PHASE_LABELS[item.currentKey] ?? item.currentKey)
              const statusColor = isGrant
                ? GRANT_APPLICATION_STATUS_COLORS[item.currentKey]
                : PHASE_COLORS[item.currentKey]

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isSelected}
                  aria-label={`${item.title} — ${statusLabel}`}
                  onClick={() => onSelect(isSelected ? null : item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(isSelected ? null : item.id)
                    }
                  }}
                  className={cn(
                    'flex items-stretch cursor-pointer transition-colors border-b border-ktip-sand-100 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400 focus-visible:ring-inset',
                    isSelected ? 'bg-ktip-ocean-50/60' : 'hover:bg-ktip-sand-50/60'
                  )}
                >
                  {/* Label column */}
                  <div
                    className={cn(
                      'w-44 shrink-0 sticky left-0 z-10 px-3 py-2 border-r border-ktip-sand-100 flex flex-col justify-center gap-1',
                      isSelected ? 'bg-ktip-ocean-50' : 'bg-ktip-cream'
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <KindIcon
                        size={14}
                        className={cn(
                          'shrink-0',
                          isGrant ? 'text-ktip-ocean-500' : 'text-ktip-tropical-700'
                        )}
                      />
                      <span className="text-sm font-medium text-ktip-sand-900 truncate">
                        {item.title}
                      </span>
                    </div>
                    <Badge size="sm" className={cn('self-start', statusColor)}>
                      {statusLabel}
                    </Badge>
                  </div>

                  {/* Bar area */}
                  <div className="flex-1 relative h-14">
                    <div
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 h-3 rounded-full',
                        item.isRejected
                          ? 'bg-red-400'
                          : isGrant
                            ? 'bg-ktip-ocean-500'
                            : 'bg-ktip-tropical-500',
                        !item.endAt &&
                          '[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]'
                      )}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                    {/* Stage markers */}
                    {item.stages
                      .filter((s) => s.reachedAt)
                      .map((stage) => (
                        <span
                          key={stage.key}
                          title={`${stage.label} — ${formatDate(stage.reachedAt!, 'PP')}`}
                          className={cn(
                            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-ktip-cream',
                            item.isRejected
                              ? 'bg-red-600'
                              : isGrant
                                ? 'bg-ktip-ocean-700'
                                : 'bg-ktip-tropical-700'
                          )}
                          style={{
                            left: `${positionForDate(new Date(stage.reachedAt!), rangeStart, rangeEnd)}%`,
                          }}
                        />
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
