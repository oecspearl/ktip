import { useMemo, useRef } from 'react'
import { FileText, FolderKanban } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { TimelineItem } from '../../lib/timeline'
import { timelineToGantt } from '../../lib/timeline-gantt'
import { Gantt, GanttNav, GanttView, type GanttApi, type GanttResource } from '../gantt'
import type { GanttResourceLabelContext } from '../gantt'
import { Badge } from '../ui/Badge'
import {
  GRANT_APPLICATION_STATUS_COLORS,
  GRANT_APPLICATION_STATUS_LABELS,
  PHASE_COLORS,
  PHASE_LABELS,
} from '../../lib/constants'

interface TimelineGanttProps {
  items: TimelineItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function ItemLabel({ item }: { item: TimelineItem }) {
  const isGrant = item.kind === 'grant_application'
  const KindIcon = isGrant ? FileText : FolderKanban
  const statusLabel = isGrant
    ? (GRANT_APPLICATION_STATUS_LABELS[item.currentKey] ?? item.currentKey)
    : (PHASE_LABELS[item.currentKey] ?? item.currentKey)
  const statusColor = isGrant
    ? GRANT_APPLICATION_STATUS_COLORS[item.currentKey]
    : PHASE_COLORS[item.currentKey]

  return (
    <>
      <div className="flex items-center gap-1.5 min-w-0">
        <KindIcon
          size={14}
          className={cn('shrink-0', isGrant ? 'text-ktip-ocean-500' : 'text-ktip-tropical-700')}
        />
        <span className="text-sm font-medium text-ktip-sand-900 truncate">{item.title}</span>
      </div>
      <Badge size="sm" className={cn('self-start', statusColor)}>
        {statusLabel}
      </Badge>
    </>
  )
}

function GroupLabel({ resource, ctx }: { resource: GanttResource; ctx: GanttResourceLabelContext }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ktip-sand-600 truncate">
        {resource.title}
      </span>
      {ctx.summary && (
        <span className="text-[10px] font-medium text-ktip-sand-400 shrink-0">
          {ctx.summary.count}
        </span>
      )}
    </span>
  )
}

/**
 * The dashboard's read-only gantt: two swimlanes (grant applications,
 * projects) over derived date ranges. Selection is lifted so TimelineSection
 * can render the detail panel underneath.
 */
export function TimelineGantt({ items, selectedId, onSelect }: TimelineGanttProps) {
  // `now` is pinned per item set so open-ended bars don't creep between renders.
  const model = useMemo(
    () => timelineToGantt(items, { now: new Date(), withStageMarkers: true }),
    [items]
  )
  const apiRef = useRef<GanttApi | null>(null)

  return (
    <Gantt
      resources={model.resources}
      events={model.events}
      defaultScale="month"
      apiRef={apiRef}
      treePanel={{ width: 224 }}
      selectedEventId={selectedId}
      onSelectEvent={(event) => onSelect(event?.id ?? null)}
      renderResourceLabel={(resource, ctx) => {
        if (ctx.isGroup) return <GroupLabel resource={resource} ctx={ctx} />
        const item = model.itemsById.get(resource.id)
        return item ? <ItemLabel item={item} /> : undefined
      }}
      className="w-full"
    >
      <GanttNav />
      <GanttView />
    </Gantt>
  )
}
