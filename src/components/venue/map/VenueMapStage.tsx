import { useMemo } from 'react'
import {
  DOOR_WIDTH,
  VENUE_MAP,
  loopPath,
  shade,
  stairsCells,
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
  /**
   * How solid each level is, 0–1. Supplied by the caller so a floor change can
   * cross-fade; defaults to "active floor solid, everything else ghosted".
   */
  floorAlpha?: (level: number) => number
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
  floorAlpha,
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

    // How present each level is, 0–1. Stacked, every floor is drawn and the
    // inactive ones sit at whatever ghost value the caller chose. Flat, only
    // the floors taking part in a transition have any presence at all — which
    // is one floor normally and two mid-change, dissolving in place.
    const stacked = stack > 0.02 && floorCount > 1
    const presenceOf = (level: number) =>
      floorAlpha ? Math.max(0, Math.min(1, floorAlpha(level))) : level === floor ? 1 : stacked ? 0.14 : 0

    // Painted in order of presence, so the floor you are standing on is always
    // last and its solid walls cover the ghosted geometry of the levels above
    // and below. Index breaks ties, which keeps two equally-ghosted floors
    // stacked bottom-to-top the way a building is.
    const levels = config.floors
      .map((_, i) => i)
      .filter((level) => (stacked ? true : presenceOf(level) > 0.01))
      .sort((a, b) => presenceOf(a) - presenceOf(b) || a - b)
    if (!levels.length) levels.push(floor)

    for (const level of levels) {
      const zBase = stacked ? level * VENUE_MAP.LEVEL_H * stack : 0
      const presence = presenceOf(level)
      const ghost = presence < 0.85
      const dim = stacked ? presence * (ghost ? stack : 1) : presence

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
          fill={`rgba(4,30,66,${(0.045 * dim).toFixed(3)})`}
          stroke="var(--color-ktip-sand-300)"
          strokeWidth={ghost ? 0.75 : 1.25}
          opacity={stacked ? Math.max(0.06, dim) : dim}
        />
      )

      // ---- grid ----
      // Before the fixtures below, so nothing is drawn across a pillar; its
      // opacity rides the level's presence so it fades with everything else
      // instead of blinking off at a threshold.
      if (showGrid && presence > 0.2) {
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
              opacity={presence}
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
              opacity={presence}
            />
          )
        }
      }

      // ---- the way in ----
      // Drawn as a break in the perimeter with a threshold across it, so the
      // entrance reads as an opening rather than as a decal on a wall.
      const door = config.floors[level]?.door
      if (door) {
        // Edge-local axes: `u` runs along the wall, `n` points into the floor.
        // Every side is then the same drawing, which is why there is no switch
        // statement below this point.
        const u: [number, number] = door.side === 'n' || door.side === 's' ? [1, 0] : [0, 1]
        const n: [number, number] =
          door.side === 'n' ? [0, 1] : door.side === 's' ? [0, -1] : door.side === 'w' ? [1, 0] : [-1, 0]
        const origin: [number, number] =
          door.side === 'n'
            ? [door.at, 0]
            : door.side === 's'
              ? [door.at, config.rows]
              : door.side === 'w'
                ? [0, door.at]
                : [config.cols, door.at]

        const at = (alongU: number, alongN: number): [number, number] => [
          origin[0] + u[0] * alongU + n[0] * alongN,
          origin[1] + u[1] * alongU + n[1] * alongN,
        ]

        const PILLAR = 0.26 // pillar footprint, in cells
        const H = 1.35 // pillar height
        const doorOpacity = stacked ? Math.max(0.06, dim) : dim

        // Mat: one whole cell deep, cell-aligned, entirely inside the slab.
        // Nothing here uses a negative offset, which is what keeps the gateway
        // standing on the floor instead of hanging off its edge.
        out.push(
          <path
            key={`door-mat-${level}`}
            d={path([at(0, 0), at(DOOR_WIDTH, 0), at(DOOR_WIDTH, 1), at(0, 1)], zBase)}
            fill={`rgba(151,215,0,${(0.3 * dim).toFixed(3)})`}
            stroke="var(--color-ktip-tropical-600)"
            strokeWidth={1}
            opacity={doorOpacity}
          />
        )

        // Two pillars and a bar across their tops — a gateway, which reads at
        // this camera angle in a way a hinged leaf does not.
        const column = (keySuffix: string, u0: number, u1: number, n0: number, n1: number, top: number, base = 0) => {
          const a = at(u0, n0)
          const b = at(u1, n0)
          const c = at(u1, n1)
          const d = at(u0, n1)
          // Two lit faces plus a cap. Enough to read as solid; a full box would
          // draw three faces the camera can never see.
          // Solid, not tinted: a pillar you can see the portal through is a
          // pane of glass. Depth comes from the two faces being lit
          // differently, the way every wall on this map is shaded.
          for (const [i, [p1, p2, lit]] of (
            [
              [a, b, 1],
              [b, c, 0.62],
            ] as Array<[[number, number], [number, number], number]>
          ).entries()) {
            const s1 = P(p1[0], p1[1], zBase + base)
            const s2 = P(p2[0], p2[1], zBase + base)
            const s3 = P(p2[0], p2[1], zBase + top)
            const s4 = P(p1[0], p1[1], zBase + top)
            out.push(
              <path
                key={`door-${keySuffix}-face-${i}`}
                d={`M${s1[0]} ${s1[1]} L${s2[0]} ${s2[1]} L${s3[0]} ${s3[1]} L${s4[0]} ${s4[1]} Z`}
                fill={shade('#2A5788', lit, 1)}
                opacity={doorOpacity}
              />
            )
          }
          out.push(
            <path
              key={`door-${keySuffix}-cap`}
              d={path([a, b, c, d], zBase + top)}
              fill={shade('#2A5788', 1.25, 1)}
              opacity={doorOpacity}
            />
          )
        }

        // The frame stands on the middle of the mat rather than on its rim —
        // at the rim it reads as floating off the edge of the floor.
        const nearN = 0.5 - PILLAR / 2
        const farN = 0.5 + PILLAR / 2
        const pillars: Array<{ key: string; u0: number; u1: number; depth: number }> = [
          { key: `pillar-${level}-a`, u0: 0, u1: PILLAR, depth: 0 },
          { key: `pillar-${level}-b`, u0: DOOR_WIDTH - PILLAR, u1: DOOR_WIDTH, depth: 0 },
        ].map((p) => {
          // Depth is screen depth, not grid depth: which pillar is nearer the
          // camera depends on the side the door is on.
          const mid = at((p.u0 + p.u1) / 2, 0.5)
          return { ...p, depth: P(mid[0], mid[1], zBase)[1] }
        })
        pillars.sort((a, b) => a.depth - b.depth)

        // Far pillar first, then the portal, then the near one — otherwise the
        // swirl paints over the frame that is supposed to contain it.
        column(pillars[0].key, pillars[0].u0, pillars[0].u1, nearN, farN, H)

        // ---- the portal ----
        // The doorway plane is a parallelogram under this projection, so the
        // artwork is drawn in a unit square and mapped onto it with one matrix.
        // That keeps the swirl free of any isometric maths.
        const originPt = at(PILLAR * 0.6, 0.5)
        const spanPt = at(DOOR_WIDTH - PILLAR * 0.6, 0.5)
        const bl = P(originPt[0], originPt[1], zBase + 0.06)
        const br = P(spanPt[0], spanPt[1], zBase + 0.06)
        const tl = P(originPt[0], originPt[1], zBase + H - 0.04)
        const e1 = [br[0] - bl[0], br[1] - bl[1]]
        const e2 = [tl[0] - bl[0], tl[1] - bl[1]]
        const gradientId = `venue-portal-${level}`

        out.push(
          <g
            key={`door-portal-${level}`}
            transform={`matrix(${e1[0]} ${e1[1]} ${e2[0]} ${e2[1]} ${bl[0]} ${bl[1]})`}
            opacity={doorOpacity}
          >
            <defs>
              <radialGradient id={gradientId} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#EDF9CC" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#97D700" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#5E8A00" stopOpacity="0.25" />
              </radialGradient>
            </defs>
            <ellipse cx="0.5" cy="0.5" rx="0.46" ry="0.47" fill={`url(#${gradientId})`} />
            {/* Strokes are non-scaling: the matrix blows one user unit up to
                the whole doorway, so a plain stroke-width would be drawn a
                doorway thick. With this, width and dashes are screen pixels. */}
            <ellipse
              className="venue-portal-spin"
              cx="0.5"
              cy="0.5"
              rx="0.44"
              ry="0.45"
              fill="none"
              stroke="#C6EA5C"
              strokeWidth={3}
              strokeDasharray="22 12"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <ellipse
              className="venue-portal-spin-rev"
              cx="0.5"
              cy="0.5"
              rx="0.32"
              ry="0.34"
              fill="none"
              stroke="#F7FCE8"
              strokeWidth={2}
              strokeDasharray="14 10"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <ellipse
              className="venue-portal-pulse"
              cx="0.5"
              cy="0.5"
              rx="0.18"
              ry="0.2"
              fill="#F7FCE8"
              opacity="0.55"
            />
          </g>
        )

        // Near pillar last, over the portal. No bar across the top: two posts
        // and a swirl between them read as a gateway on their own, and a lintel
        // at this camera angle mostly hides the thing it frames.
        column(pillars[1].key, pillars[1].u0, pillars[1].u1, nearN, farN, H)
      }

      // ---- stairs ----
      // The same block on every level — that is what makes them connect. Treads
      // step towards the level above so the direction reads without a caption.
      if (config.stairs) {
        const { x, y, w, h } = config.stairs
        const treads = 5
        const rise = VENUE_MAP.LEVEL_H * (stacked ? stack : 0.25) * 0.55
        for (let i = 0; i < treads; i++) {
          const t0 = y + (h * i) / treads
          const t1 = y + (h * (i + 1)) / treads
          const z = zBase + (rise * (i + 1)) / treads
          out.push(
            <path
              key={`stair-${level}-${i}`}
              d={path(
                [
                  [x, t0],
                  [x + w, t0],
                  [x + w, t1],
                  [x, t1],
                ],
                z
              )}
              fill={`rgba(4,30,66,${(0.1 + 0.05 * i).toFixed(3)})`}
              stroke="var(--color-ktip-sand-400)"
              strokeWidth={0.6}
              opacity={stacked ? Math.max(0.06, dim) : dim}
            />
          )
        }
        // Cells the block covers, so it is obvious where to stand.
        for (const [sx, sy] of stairsCells(config.stairs)) {
          out.push(
            <path
              key={`stair-cell-${level}-${sx}-${sy}`}
              d={path(
                [
                  [sx, sy],
                  [sx + 1, sy],
                  [sx + 1, sy + 1],
                  [sx, sy + 1],
                ],
                zBase
              )}
              fill={`rgba(4,30,66,${(0.06 * dim).toFixed(3)})`}
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
              // Denser on the floor being stood on: a thin tint lets a lower
              // level's walls read straight through a room's interior.
              fill={shade(color, 1, (active ? 0.26 : ghost ? 0.11 : 0.18) * alpha)}
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
              fill={shade(color, active ? 1.05 : 1, dim * (muted ? 0.5 : 1))}
              stroke={shade(color, 0.7, dim)}
              strokeWidth={0.75}
            />
          )
        })
      }
    }

    return out
  }, [
    config,
    geometry,
    projection,
    floor,
    floorAlpha,
    tilt,
    stack,
    selectedId,
    hoveredId,
    mutedIds,
    showGrid,
    floorCount,
  ])

  return <g>{elements}</g>
}
