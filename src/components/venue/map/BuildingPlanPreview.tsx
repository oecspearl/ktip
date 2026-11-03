import { flightsOn } from '../../../lib/venue-layout'
import { DOOR_WIDTH, floorBadge, type FloorDoor } from '../../../lib/venue-map'
import { planTemplate, type BuildingPlan } from '../../../lib/venue-building'
import type { VenueTemplate } from '../../../lib/venue-templates'
import { cn } from '../../../lib/utils'

/** Stairs and doors are drawn in the brand navy, rooms in their preset colour. */
const FIXTURE = '#041E42'

/** The doorway as a short bar on the outer wall. */
function DoorMark({ door, cols, rows }: { door?: FloorDoor; cols: number; rows: number }) {
  if (!door) return null
  const t = 0.5
  if (door.side === 's') return <rect x={door.at} y={rows - t} width={DOOR_WIDTH} height={t} fill={FIXTURE} />
  if (door.side === 'n') return <rect x={door.at} y={0} width={DOOR_WIDTH} height={t} fill={FIXTURE} />
  if (door.side === 'w') return <rect x={0} y={door.at} width={t} height={DOOR_WIDTH} fill={FIXTURE} />
  return <rect x={cols - t} y={door.at} width={t} height={DOOR_WIDTH} fill={FIXTURE} />
}

/** One floor from above: the slab, its rooms, its stairs and its door. */
export function FloorPlanSvg({
  plan,
  floor,
  className,
}: {
  plan: BuildingPlan
  floor: number
  className?: string
}) {
  const { cols, rows } = plan.config
  const { up, down } = flightsOn(plan.config.flights ?? [], floor)
  return (
    <svg viewBox={`0 0 ${cols} ${rows}`} className={className} aria-hidden="true">
      <rect x={0} y={0} width={cols} height={rows} rx={0.8} className="fill-ktip-sand-100" />
      {plan.rooms
        .filter((room) => room.floor === floor && room.rect)
        .map((room) => (
          <rect
            key={room.key}
            x={room.rect!.x}
            y={room.rect!.y}
            width={room.rect!.w}
            height={room.rect!.h}
            rx={0.5}
            fill={room.preset.color}
            opacity={0.85}
          />
        ))}
      {[up, down].map((f, i) =>
        f ? (
          <g key={i}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke={FIXTURE} strokeWidth={0.3} />
            {Array.from({ length: f.h - 1 }, (_, n) => (
              <line
                key={n}
                x1={f.x}
                x2={f.x + f.w}
                y1={f.y + n + 1}
                y2={f.y + n + 1}
                stroke={FIXTURE}
                strokeWidth={0.2}
              />
            ))}
          </g>
        ) : null
      )}
      <DoorMark door={plan.config.floors[floor]?.door} cols={cols} rows={rows} />
    </svg>
  )
}

/**
 * A building from above, one small plan per floor. `compact` packs every floor
 * into one short strip for a card; otherwise each floor gets a labelled tile.
 */
export function BuildingPlanPreview({
  plan,
  compact = false,
  className,
}: {
  plan: BuildingPlan
  compact?: boolean
  className?: string
}) {
  const floors = plan.config.floors
  if (compact) {
    return (
      <div className={cn('flex h-20 items-center gap-1 rounded-lg bg-white', className)}>
        {floors.map((f, i) => (
          <FloorPlanSvg key={f.key} plan={plan} floor={i} className="h-full min-w-0 flex-1" />
        ))}
      </div>
    )
  }
  return (
    <ol className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>
      {floors.map((f, i) => (
        <li key={f.key} className="min-w-0">
          <FloorPlanSvg plan={plan} floor={i} className="w-full" />
          <p className="mt-1 truncate text-xs text-ktip-sand-600">
            <span className="font-semibold text-ktip-sand-800">{floorBadge(i)}</span> {f.name}
          </p>
        </li>
      ))}
    </ol>
  )
}

/**
 * The card thumbnail's plan. Laid out once per template with a fixed seed and
 * kept, so the gallery does not reshuffle on every render.
 */
const thumbs = new Map<string, BuildingPlan>()
export function thumbnailPlan(template: VenueTemplate): BuildingPlan {
  let plan = thumbs.get(template.id)
  if (!plan) {
    plan = planTemplate(template, 20261103)
    thumbs.set(template.id, plan)
  }
  return plan
}
