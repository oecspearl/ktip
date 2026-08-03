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
import { buildDecor, type DecorTree } from '../../../lib/venue-decor'

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
  /**
   * Draws the scenery — grass apron, pavement, palms, ghost skyline. The
   * attendee venue wants a place; the editor wants a drawing board.
   */
  decor?: boolean
  /**
   * Draws every floor at its true height even outside the stack view, so
   * standing on Level 2 shows a slab floating two storeys over the lawn
   * rather than sitting on it. The editor leaves this off: its selection
   * overlays are drawn against a ground-level slab.
   */
  elevate?: boolean
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
  decor = false,
  elevate = false,
}: VenueMapStageProps) {
  const floorCount = config.floors.length

  const decorData = useMemo(
    () => (decor ? buildDecor(config, geometry) : null),
    [decor, config, geometry]
  )

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

    // ---- scenery ----
    // The world the building stands in: grass past the slab edge, a paved way
    // up to the door, ghost neighbours on the horizon. All of it under every
    // level, none of it interactive, all of it deterministic (venue-decor.ts).
    if (decorData) {
      const M = decorData.margin

      // One grass sheet. Its edge is feathered by a wide stroke of its own
      // colour rather than by a second sheet — two nested greens read as two
      // floors, which is exactly what a lawn must not do.
      out.push(
        <path
          key="decor-lawn"
          d={path([
            [-M, -M],
            [config.cols + M, -M],
            [config.cols + M, config.rows + M],
            [-M, config.rows + M],
          ])}
          fill="rgba(122,176,0,0.12)"
          stroke="rgba(122,176,0,0.05)"
          strokeWidth={14}
          strokeLinejoin="round"
        />
      )

      // Forecourt: a paved way widening from the ground-floor door out across
      // the lawn — the walk up to the building, drawn under its gateway.
      const d0 = config.floors[0]?.door
      if (d0) {
        const u: [number, number] = d0.side === 'n' || d0.side === 's' ? [1, 0] : [0, 1]
        const o: [number, number] =
          d0.side === 'n' ? [0, -1] : d0.side === 's' ? [0, 1] : d0.side === 'w' ? [-1, 0] : [1, 0]
        const org: [number, number] =
          d0.side === 'n'
            ? [d0.at, 0]
            : d0.side === 's'
              ? [d0.at, config.rows]
              : d0.side === 'w'
                ? [0, d0.at]
                : [config.cols, d0.at]
        const at = (alongU: number, alongO: number): [number, number] => [
          org[0] + u[0] * alongU + o[0] * alongO,
          org[1] + u[1] * alongU + o[1] * alongO,
        ]
        out.push(
          <path
            key="decor-forecourt"
            d={path([at(-0.3, 0), at(DOOR_WIDTH + 0.3, 0), at(DOOR_WIDTH + 1.2, M), at(-1.2, M)])}
            fill="rgba(87,83,78,0.24)"
            stroke="rgba(87,83,78,0.36)"
            strokeWidth={0.75}
          />
        )
      }
    }

    // How high off the ground a level's slab sits. The active floor, elevated,
    // is pinned at its full height — it must not bob when the stack toggles —
    // while the others ride the stack (or, mid-fade in the flat view, hold
    // their own height so a floor change dissolves in place, not in freefall).
    const liftOf = (level: number) =>
      level === floor && elevate ? 1 : stacked ? stack : elevate ? 1 : 0
    const zOf = (level: number) => level * VENUE_MAP.LEVEL_H * liftOf(level)

    // ---- stack guides ----
    // A floating slab is four loose sheets of paper; a vertical dashed line at
    // each corner ties it back to the ground it belongs to. Drawn first, so
    // they read as scaffolding behind the floors rather than walls in front.
    {
      let guideTop = 0
      let guideA = 0
      if (stacked) {
        guideTop = (floorCount - 1) * VENUE_MAP.LEVEL_H * stack
        guideA = stack
      }
      if (elevate) {
        for (const level of levels) {
          if (level === 0) continue
          guideTop = Math.max(guideTop, zOf(level))
          guideA = Math.max(guideA, presenceOf(level))
        }
      }
      if (guideTop > 0.05 && guideA > 0.02) {
        const corners: [number, number][] = [
          [0, 0],
          [config.cols, 0],
          [config.cols, config.rows],
          [0, config.rows],
        ]
        for (const [i, [cx, cy]] of corners.entries()) {
          const [x1, y1] = P(cx, cy, 0)
          const [x2, y2] = P(cx, cy, guideTop)
          out.push(
            <line
              key={`stack-guide-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-ktip-sand-400)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.65 * guideA}
            />
          )
        }
      }
    }

    for (const level of levels) {
      const zBase = zOf(level)
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

      // ---- pavement ----
      // This level's plaza and walkways, as two-tone pavers. Drawn at zBase,
      // so stacked they ride up with their slab, and dimmed with `dim`, so a
      // floor change fades a level's paths exactly as it fades its rooms.
      if (decorData?.paveByFloor[level]?.length) {
        for (const [cx, cy] of decorData.paveByFloor[level]) {
          out.push(
            <path
              key={`pave-${level}-${cx}-${cy}`}
              d={path(
                [
                  [cx, cy],
                  [cx + 1, cy],
                  [cx + 1, cy + 1],
                  [cx, cy + 1],
                ],
                zBase
              )}
              fill={`rgba(87,83,78,${(((cx + cy) % 2 === 0 ? 0.3 : 0.22) * dim).toFixed(3)})`}
              stroke={`rgba(87,83,78,${(0.38 * dim).toFixed(3)})`}
              strokeWidth={0.5}
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


      // ---- rooms & trees, back to front ----
      // One depth-sorted pass for everything standing on this floor: a palm
      // south of a room stands in front of its wall, one north of it hides
      // behind — the same painter's algorithm, now with shrubbery.
      const drawRoom = (g: RoomGeometry<any>) => {
        const id = g.room.id
        // Doorways the path network carved into this room, as "cell,side"
        // keys — the wall renderer below drops the wall units they name.
        const roomOpenings = decorData?.openings[id]
        const openSet = roomOpenings?.length
          ? new Set(roomOpenings.map((o) => `${o.x},${o.y},${o.side}`))
          : null
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
                if (!(nx > 0 || ny > 0)) continue
                const lit = ny > 0 ? (inner ? 0.62 : 0.95) : inner ? 0.5 : 0.74
                const push = (a: [number, number], b: [number, number]) =>
                  faces.push({ p1: a, p2: b, f: lit, depth: (a[0] + a[1] + b[0] + b[1]) / 2 })

                if (!openSet) {
                  push(p1, p2)
                  continue
                }

                // A doorway: the wall is split at cell boundaries and the
                // units named by an opening are simply not drawn. The cap up
                // top stays whole, which is what turns the gap into a doorway
                // under a lintel rather than a slot cut down the building.
                // Works for both loops: each unit's owning cell is recovered
                // from its midpoint, which lands right for the inner loop's
                // inset coordinates too.
                const ax = dx !== 0 ? 0 : 1
                const dirn = dx !== 0 ? dx : dy
                const perp = ax === 0 ? p1[1] : p1[0]
                const at = (v: number): [number, number] => (ax === 0 ? [v, p1[1]] : [p1[0], v])
                const end = p2[ax]
                let cursor = p1[ax]
                let runStart: number | null = null
                while (Math.abs(cursor - end) > 1e-6) {
                  const next =
                    dirn > 0
                      ? Math.min(Math.floor(cursor + 1e-6) + 1, end)
                      : Math.max(Math.ceil(cursor - 1e-6) - 1, end)
                  const mid = (cursor + next) / 2
                  let unitKey: string
                  if (ax === 0 && dirn > 0) unitKey = `${Math.floor(mid)},${Math.round(perp)},n`
                  else if (ax === 1 && dirn > 0) unitKey = `${Math.round(perp) - 1},${Math.floor(mid)},e`
                  else if (ax === 0) unitKey = `${Math.floor(mid)},${Math.round(perp) - 1},s`
                  else unitKey = `${Math.round(perp)},${Math.floor(mid)},w`
                  if (openSet.has(unitKey)) {
                    if (runStart !== null) push(at(runStart), at(cursor))
                    runStart = null
                  } else if (runStart === null) {
                    runStart = cursor
                  }
                  cursor = next
                }
                if (runStart !== null) push(at(runStart), at(end))
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

      // ---- a tree ----
      // Trunk and fronds are strokes in screen pixels (scaled by the
      // projection), with their anchor points projected — which keeps a palm
      // leaning the right way at every tilt without any of its own iso maths.
      const S = projection.scale
      const drawTree = (t: DecorTree, ti: number) => {
        const o = stacked ? Math.max(0.06, dim) : dim
        if (o < 0.02) return
        const [bx, by] = P(t.x, t.y, zBase)

        if (t.kind === 'bush') {
          out.push(
            <ellipse
              key={`bush-sh-${level}-${ti}`}
              cx={bx + 0.06 * t.s * S}
              cy={by + 0.03 * t.s * S}
              rx={0.4 * t.s * S}
              ry={0.16 * t.s * S}
              fill="rgba(4,30,66,0.1)"
              opacity={o}
            />
          )
          // Three overlapping lobes, lit unevenly — one circle is a lollipop.
          const lobes: Array<[number, number, number, number]> = [
            [-0.16, 0.04, 0.24, 0.88],
            [0.15, 0.02, 0.2, 1.12],
            [0, -0.06, 0.28, 1],
          ]
          for (const [li, [ox, oy, lr, lit]] of lobes.entries()) {
            const [lx, ly] = P(t.x + ox * t.s, t.y + oy * t.s, zBase + 0.12 * t.s)
            out.push(
              <ellipse
                key={`bush-${level}-${ti}-${li}`}
                cx={lx}
                cy={ly}
                rx={lr * t.s * S}
                ry={lr * t.s * S * 0.85}
                fill={shade('#7AB000', lit, 0.9)}
                opacity={o}
              />
            )
          }
          return
        }

        const h = 1.55 * t.s
        const [tx, ty] = P(t.x, t.y, zBase + h)
        out.push(
          <ellipse
            key={`palm-sh-${level}-${ti}`}
            cx={bx + 0.08 * t.s * S}
            cy={by + 0.04 * t.s * S}
            rx={0.5 * t.s * S}
            ry={0.2 * t.s * S}
            fill="rgba(4,30,66,0.1)"
            opacity={o}
          />,
          <path
            key={`palm-trunk-${level}-${ti}`}
            d={`M${bx.toFixed(1)} ${by.toFixed(1)} Q${((bx + tx) / 2 + 0.16 * t.s * S).toFixed(1)} ${((by + ty) / 2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`}
            fill="none"
            stroke={shade('#78716c', 0.8)}
            strokeWidth={Math.max(1.2, 0.09 * t.s * S)}
            strokeLinecap="round"
            opacity={o}
          />
        )

        // Fronds radiate in grid directions and are projected point-by-point,
        // so the crown spreads flat in plan view and drapes in 2.5D.
        const fronds: React.ReactNode[] = []
        const dirs: Array<[number, number]> = [
          [1, 0],
          [0.7, 0.7],
          [0, 1],
          [-0.7, 0.7],
          [-1, 0],
          [-0.7, -0.7],
          [0, -1],
          [0.7, -0.7],
        ]
        for (const [fi, [dx, dy]] of dirs.entries()) {
          const r = 0.8 * t.s
          const [ex, ey] = P(t.x + dx * r, t.y + dy * r, zBase + h - 0.5 * t.s)
          const [qx, qy] = P(t.x + dx * r * 0.45, t.y + dy * r * 0.45, zBase + h + 0.3 * t.s)
          fronds.push(
            <path
              key={`palm-frond-${level}-${ti}-${fi}`}
              d={`M${tx.toFixed(1)} ${ty.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
              fill="none"
              stroke={shade(fi % 2 ? '#AEE12B' : '#7AB000', 1, 0.95)}
              strokeWidth={Math.max(1.2, 0.11 * t.s * S)}
              strokeLinecap="round"
            />
          )
        }
        fronds.push(
          <circle
            key={`palm-nut-${level}-${ti}-a`}
            cx={tx - 0.05 * t.s * S}
            cy={ty + 0.06 * t.s * S}
            r={Math.max(1, 0.055 * t.s * S)}
            fill={shade('#B38500', 0.95)}
          />,
          <circle
            key={`palm-nut-${level}-${ti}-b`}
            cx={tx + 0.06 * t.s * S}
            cy={ty + 0.05 * t.s * S}
            r={Math.max(1, 0.05 * t.s * S)}
            fill={shade('#B38500', 0.8)}
          />
        )
        out.push(
          <g
            key={`palm-top-${level}-${ti}`}
            className="venue-palm-sway"
            // Period and phase vary per tree so the grove never sways in step.
            style={{
              animationDuration: `${t.sway.toFixed(2)}s`,
              animationDelay: `-${((ti * 1.37) % Math.max(t.sway, 1)).toFixed(2)}s`,
            }}
            opacity={o}
          >
            {fronds}
          </g>
        )
      }

      const items: Array<{ depth: number; draw: () => void }> = Object.values(geometry)
        .filter((g) => g.floor === level)
        .map((g) => ({ depth: g.bbox.maxX + g.bbox.maxY, draw: () => drawRoom(g) }))
      if (decorData && level === 0) {
        for (const [ti, t] of decorData.trees.entries()) {
          items.push({ depth: t.x + t.y, draw: () => drawTree(t, ti) })
        }
      }
      items.sort((a, b) => a.depth - b.depth)
      for (const item of items) item.draw()
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
    decorData,
    elevate,
  ])

  return <g>{elements}</g>
}
