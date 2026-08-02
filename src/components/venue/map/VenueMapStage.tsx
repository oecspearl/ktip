import { useMemo } from 'react'
import {
  VENUE_MAP,
  loopPath,
  shade,
  type Projection,
  type RoomGeometry,
  type VenueMapConfig,
} from '../../../lib/venue-map'

interface VenueMapStageProps {
  config: VenueMapConfig
  /** Every placed room, keyed by id — including rooms on other floors. */
  geometry: Record<string, RoomGeometry<any>>
  projection: Projection
  /** The floor being worked on. Others draw as faint ghosts when stacked. */
  floor: number
  /** 0 = flat top-down, 1 = full isometric. Animated between the two. */
  tilt: number
  /** 0 = floors collapsed onto each other, 1 = pulled apart into a building. */
  stack: number
  selectedId?: string | null
  hoveredId?: string | null
  /** Rooms drawn dimmed — closed rooms, or ones this member cannot enter. */
  mutedIds?: Set<string>
  /** Draws the cell grid. The editor wants it; the attendee map does not. */
  showGrid?: boolean
}

/**
 * The map itself: slabs, walls and floors, in one SVG group.
 *
 * Shared by the host's editor and the attendee's venue so there is exactly one
 * renderer — a room that looks a certain way while it is being drawn looks the
 * same way to everyone who walks into it.
 *
 * Draw order is painter's-algorithm by depth (x+y), which is all a 2.5D
 * projection with no overlapping geometry needs. There is no z-buffer here and
 * there does not need to be: rooms never intersect, because cells have one
 * owner.
 */
export function VenueMapStage({
  config,
  geometry,
  projection,
  floor,
  tilt,
  stack,
  selectedId,
  hoveredId,
  mutedIds,
  showGrid = false,
}: VenueMapStageProps) {
  const floorCount = config.floors.length

  const elements = useMemo(() => {
    const out: React.ReactNode[] = []
    const P = projection.project
    const path = (pts: [number, number][], z = 0) => loopPath(projection, pts, z)

    // Which floors to draw. Collapsed (stack ≈ 0) draws only the active one:
    // stacking three identical slabs at the same height is just haze.
    const stacked = stack > 0.02 && floorCount > 1
    const levels = stacked ? config.floors.map((_, i) => i) : [floor]

    for (const level of levels) {
      const zBase = stacked ? level * VENUE_MAP.LEVEL_H * stack : 0
      const ghost = level !== floor
      const dim = ghost ? 0.16 * stack : 1

      // ---- the slab ----
      out.push(
        <path
          key={`slab-${level}`}
          d={path(
            [
              [0, 0],
              [config.cols, 0],
              [config.cols, config.rows],
              [0, config.rows],
            ],
            zBase
          )}
          fill={ghost ? 'rgba(4,30,66,0.02)' : 'rgba(4,30,66,0.04)'}
          stroke={ghost ? 'var(--color-ktip-sand-200)' : 'var(--color-ktip-sand-300)'}
          strokeWidth={ghost ? 0.75 : 1.25}
          opacity={ghost ? 0.8 * stack : 1}
        />
      )

      if (showGrid && !ghost) {
        for (let x = 1; x < config.cols; x++) {
          const [x1, y1] = P(x, 0, zBase)
          const [x2, y2] = P(x, config.rows, zBase)
          out.push(
            <line
              key={`gv-${level}-${x}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-ktip-sand-200)"
              strokeWidth={x % 4 === 0 ? 1 : 0.5}
            />
          )
        }
        for (let y = 1; y < config.rows; y++) {
          const [x1, y1] = P(0, y, zBase)
          const [x2, y2] = P(config.cols, y, zBase)
          out.push(
            <line
              key={`gh-${level}-${y}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-ktip-sand-200)"
              strokeWidth={y % 4 === 0 ? 1 : 0.5}
            />
          )
        }
      }

      // ---- rooms, back to front ----
      const rooms = Object.values(geometry)
        .filter((g) => g.floor === level)
        .sort((a, b) => a.bbox.maxX + a.bbox.maxY - (b.bbox.maxX + b.bbox.maxY))

      for (const g of rooms) {
        const id = g.room.id
        const active = !ghost && (id === selectedId || id === hoveredId)
        const muted = !!mutedIds?.has(id)
        const alpha = (muted ? 0.45 : 1) * dim
        const color = g.color

        // Floor tint, one quad per cell. Per-cell rather than per-loop so a
        // room with a hole in it tints correctly without a fill rule.
        for (const [cx, cy] of g.cells) {
          out.push(
            <path
              key={`f-${level}-${id}-${cx}-${cy}`}
              d={path(
                [
                  [cx, cy],
                  [cx + 1, cy],
                  [cx + 1, cy + 1],
                  [cx, cy + 1],
                ],
                zBase
              )}
              fill={shade(color, 1, (active ? 0.2 : 0.11) * alpha)}
            />
          )
        }

        // ---- walls ----
        if (tilt > 0.01) {
          const faces: Array<{
            p1: [number, number]
            p2: [number, number]
            f: number
            depth: number
          }> = []

          for (const lp of g.loops) {
            const collect = (pts: [number, number][], inner: boolean) => {
              const n = pts.length
              for (let i = 0; i < n; i++) {
                const p1 = pts[i]
                const p2 = pts[(i + 1) % n]
                const dx = Math.sign(p2[0] - p1[0])
                const dy = Math.sign(p2[1] - p1[1])
                // Outward normal for the outer loop, inward for the inner one.
                const nx = inner ? -dy : dy
                const ny = inner ? dx : -dx
                // Only faces pointing at the camera are drawn — the far side of
                // a room would otherwise paint over its own interior.
                if (nx > 0 || ny > 0) {
                  const lit = ny > 0 ? (inner ? 0.62 : 0.95) : inner ? 0.5 : 0.74
                  faces.push({ p1, p2, f: lit, depth: (p1[0] + p1[1] + p2[0] + p2[1]) / 2 })
                }
              }
            }
            collect(lp.outer, false)
            collect(lp.inner, true)
          }

          faces.sort((a, b) => a.depth - b.depth)
          faces.forEach(({ p1, p2, f }, i) => {
            const a = P(p1[0], p1[1], zBase)
            const b = P(p2[0], p2[1], zBase)
            const c = P(p2[0], p2[1], zBase + g.height)
            const d = P(p1[0], p1[1], zBase + g.height)
            out.push(
              <path
                key={`w-${level}-${id}-${i}`}
                d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} L${d[0]} ${d[1]} Z`}
                fill={shade(color, f, 0.92 * alpha)}
              />
            )
          })
        }

        // ---- wall caps ----
        g.loops.forEach((lp, i) => {
          const capPath = `${path(lp.outer, zBase + g.height)} ${path(lp.inner, zBase + g.height)}`
          if (!ghost && active) {
            out.push(
              <path
                key={`glow-${level}-${id}-${i}`}
                d={capPath}
                fillRule="evenodd"
                fill="none"
                stroke={shade(color, 1, 0.35)}
                strokeWidth={5}
                strokeLinejoin="round"
              />
            )
          }
          out.push(
            <path
              key={`cap-${level}-${id}-${i}`}
              d={capPath}
              fillRule="evenodd"
              fill={shade(color, active ? 1.05 : 1, (ghost ? 0.2 * stack : 1) * (muted ? 0.5 : 1))}
              stroke={shade(color, 0.7, ghost ? 0.15 * stack : 1)}
              strokeWidth={0.75}
            />
          )
        })
      }
    }

    return out
  }, [config, geometry, projection, floor, tilt, stack, selectedId, hoveredId, mutedIds, showGrid, floorCount])

  return <g>{elements}</g>
}
