import { useMemo } from 'react'
import {
  DOOR_WIDTH,
  VENUE_MAP,
  loopPath,
  resolveFlights,
  shade,
  type Projection,
  type RoomGeometry,
  type VenueMapConfig,
} from '../../../lib/venue-map'
import { buildDecor, type DecorTree } from '../../../lib/venue-decor'
import { flightsOn, rectKeys, type VenueFlight } from '../../../lib/venue-layout'
import { furnish, furnitureFor, parseDecor, type FurniturePiece } from '../../../lib/venue-furniture'
import { renderFurniture } from './venueFurnitureArt'

/**
 * How tall a front wall stands, in wall-height units. Front walls are cut down
 * to a kerb (the "cutaway" every isometric game uses) so the furniture inside
 * a room is visible; back walls keep their full height and carry the boards.
 */
const CUTAWAY_H = 0.3

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
  /**
   * Draws furniture in each room (venue-furniture.ts). On by default; the
   * editor's flat view still shows it, as a floor plan.
   */
  furniture?: boolean
  /** Public URL for a path in the venue-room-art bucket (logos, murals). */
  roomArtUrl?: (path: string) => string
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
  furniture = true,
  roomArtUrl,
}: VenueMapStageProps) {
  const floorCount = config.floors.length

  // One flight per pair of floors (venue-layout.ts): the way up on the lower
  // floor, the way down on the upper one.
  const flights = useMemo(() => resolveFlights(config, geometry), [config, geometry])

  const decorData = useMemo(
    () => (decor ? buildDecor(config, geometry) : null),
    [decor, config, geometry]
  )

  // Furniture depends only on each room's shape and look, not on tilt, zoom or
  // hover, so it is laid out once per geometry change rather than per frame.
  const furnitureByRoom = useMemo(() => {
    const out: Record<string, { pieces: FurniturePiece[]; logo?: string; mural?: string }> = {}
    if (!furniture) return out
    for (const g of Object.values(geometry)) {
      const look = parseDecor(g.room.decor)
      out[g.room.id] = {
        pieces: furnish({ cells: g.cells, height: g.height }, furnitureFor(g.room), look),
        logo: look.logo_path,
        mural: look.mural_path,
      }
    }
    return out
  }, [geometry, furniture])

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
      // A floor is a slab, not a sheet: its two edges facing the camera are
      // drawn as solid faces under the top, so a level reads as something you
      // could stand on, stacked or flat.
      {
        const T = 0.32
        const slabO = stacked ? Math.max(0.06, dim) : dim
        const face = (pts: [number, number, number][], fill: string, k: string) => {
          const d =
            pts
              .map(([px, py, pz], i) => {
                const [sx, sy] = P(px, py, pz)
                return `${i ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`
              })
              .join(' ') + ' Z'
          out.push(<path key={k} d={d} fill={fill} opacity={slabO} />)
        }
        face(
          [
            [0, config.rows, zBase],
            [config.cols, config.rows, zBase],
            [config.cols, config.rows, zBase - T],
            [0, config.rows, zBase - T],
          ],
          'rgba(4,30,66,0.30)',
          `slab-edge-s-${level}`
        )
        face(
          [
            [config.cols, 0, zBase],
            [config.cols, config.rows, zBase],
            [config.cols, config.rows, zBase - T],
            [config.cols, 0, zBase - T],
          ],
          'rgba(4,30,66,0.42)',
          `slab-edge-e-${level}`
        )
      }
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
          fill={`rgba(4,30,66,${(0.1 * dim).toFixed(3)})`}
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
      // A flight from this floor rises towards the level above; the flight from
      // the level below arrives here as a stairwell going down. Both are drawn
      // in the depth-sorted pass with the rooms, so a room south of a flight
      // stands in front of it and one north of it behind.
      const treads = 6
      const o = stacked ? Math.max(0.06, dim) : dim
      const quad = (pts: [number, number, number][]) =>
        pts
          .map(([px, py, pz], k) => {
            const [sx, sy] = P(px, py, pz)
            return `${k ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`
          })
          .join(' ') + ' Z'

      const drawUp = (fl: VenueFlight) => {
        const { x, y, w, h } = fl
        // Climbs most of a storey even in the flat view, so the stairs read as
        // a way up from across the map rather than as a doormat.
        const rise = VENUE_MAP.LEVEL_H * 0.55 * Math.max(0.65, stacked ? stack : 0.65)
        for (let i = 0; i < treads; i++) {
          // Lowest step at the south end, where you walk on; top step north.
          const t1 = y + h - (h * i) / treads
          const t0 = y + h - (h * (i + 1)) / treads
          const zTop = zBase + (rise * (i + 1)) / treads
          const top = i === treads - 1
          const base = top ? '#97D700' : '#2A5788'
          if (tilt > 0.01) {
            out.push(
              <path
                key={`up-front-${level}-${i}`}
                d={quad([
                  [x, t1, zBase],
                  [x + w, t1, zBase],
                  [x + w, t1, zTop],
                  [x, t1, zTop],
                ])}
                fill={shade(base, 0.78, 1)}
                opacity={o}
              />,
              <path
                key={`up-side-${level}-${i}`}
                d={quad([
                  [x + w, t0, zBase],
                  [x + w, t1, zBase],
                  [x + w, t1, zTop],
                  [x + w, t0, zTop],
                ])}
                fill={shade(base, 0.6, 1)}
                opacity={o}
              />
            )
          }
          out.push(
            <path
              key={`up-${level}-${i}`}
              d={path(
                [
                  [x, t0],
                  [x + w, t0],
                  [x + w, t1],
                  [x, t1],
                ],
                zTop
              )}
              fill={shade(base, top ? 1 : 1.25, 1)}
              stroke={shade(base, 0.6, 0.8)}
              strokeWidth={0.6}
              opacity={o}
            />
          )
        }
      }

      const drawDown = (fl: VenueFlight) => {
        const { x, y, w, h } = fl
        const drop = VENUE_MAP.LEVEL_H * 0.5
        // The opening in the floor.
        out.push(
          <path
            key={`down-well-${level}`}
            d={path(
              [
                [x, y],
                [x + w, y],
                [x + w, y + h],
                [x, y + h],
              ],
              zBase
            )}
            fill="rgba(4,30,66,0.55)"
            opacity={o}
          />
        )
        if (tilt > 0.01) {
          // The two inner walls the camera can see: the far (north) one and the
          // left (west) one, going down into the floor below.
          out.push(
            <path
              key={`down-wall-n-${level}`}
              d={quad([
                [x, y, zBase],
                [x + w, y, zBase],
                [x + w, y, zBase - drop],
                [x, y, zBase - drop],
              ])}
              fill={shade('#2A5788', 0.55, 1)}
              opacity={o}
            />,
            <path
              key={`down-wall-w-${level}`}
              d={quad([
                [x, y, zBase],
                [x, y + h, zBase],
                [x, y + h, zBase - drop],
                [x, y, zBase - drop],
              ])}
              fill={shade('#2A5788', 0.42, 1)}
              opacity={o}
            />
          )
        }
        // Treads sinking northwards, deepest first so the shallow ones cover it.
        for (let i = 0; i < treads; i++) {
          const t0 = y + (h * i) / treads
          const t1 = y + (h * (i + 1)) / treads
          const z = zBase - (drop * (treads - i)) / (treads + 1)
          const first = i === treads - 1
          const base = first ? '#97D700' : '#7E9EC7'
          out.push(
            <path
              key={`down-${level}-${i}`}
              d={path(
                [
                  [x, t0],
                  [x + w, t0],
                  [x + w, t1],
                  [x, t1],
                ],
                z
              )}
              fill={shade(base, 0.7 + (0.5 * i) / treads, 1)}
              stroke={shade(base, 0.45, 0.8)}
              strokeWidth={0.5}
              opacity={o}
            />
          )
        }
        // A rail round the three closed sides, so the hole reads as stairs
        // and not as a gap in the floor.
        const railZ = zBase + 0.22
        const pts: [number, number][] = [
          [x, y + h],
          [x, y],
          [x + w, y],
          [x + w, y + h],
        ]
        out.push(
          <path
            key={`down-rail-${level}`}
            d={pts
              .map(([px, py], k) => {
                const [sx, sy] = P(px, py, railZ)
                return `${k ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`
              })
              .join(' ')}
            fill="none"
            stroke={shade('#97D700', 0.85, 1)}
            strokeWidth={1.6}
            strokeLinejoin="round"
            opacity={o}
          />
        )
        for (const [px, py] of pts) {
          const [x1, y1] = P(px, py, zBase)
          const [x2, y2] = P(px, py, railZ)
          out.push(
            <line
              key={`down-post-${level}-${px}-${py}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={shade('#97D700', 0.7, 1)}
              strokeWidth={1.4}
              opacity={o}
            />
          )
        }
      }

      const here = flightsOn(flights, level)
      for (const fl of [here.up, here.down]) {
        if (!fl) continue
        // Cells the flight covers, so it is obvious where to stand.
        for (const c of rectKeys(fl)) {
          const [sx, sy] = c.split(',').map(Number)
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
            /** Inner-loop face = the inside of a back wall. Outer = a front wall. */
            inner: boolean
            nx: number
            ny: number
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
                  faces.push({ p1: a, p2: b, f: lit, depth: (a[0] + a[1] + b[0] + b[1]) / 2, inner, nx, ny })

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
          const T = VENUE_MAP.WALL_T
          const cut = Math.min(g.height, CUTAWAY_H)
          // One wall face plus the strip of cap on top of it. The cap runs from
          // the face back into the wall's thickness, so every wall reads as a
          // solid slab at whatever height it is drawn to.
          const drawFace = (fc: (typeof faces)[number], i: number, top: number, tag: string) => {
            const { p1, p2, f, nx, ny } = fc
            const a = P(p1[0], p1[1], zBase)
            const b = P(p2[0], p2[1], zBase)
            const c = P(p2[0], p2[1], zBase + top)
            const d = P(p1[0], p1[1], zBase + top)
            const back1: [number, number] = [p1[0] - nx * T, p1[1] - ny * T]
            const back2: [number, number] = [p2[0] - nx * T, p2[1] - ny * T]
            out.push(
              <path
                key={`w${tag}-${level}-${id}-${i}`}
                d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} L${d[0]} ${d[1]} Z`}
                fill={shade(color, f, 0.92 * alpha)}
              />,
              <path
                key={`c${tag}-${level}-${id}-${i}`}
                d={path([p1, p2, back2, back1], zBase + top)}
                fill={shade(color, active ? 1.05 : 1, dim * (muted ? 0.5 : 1))}
                stroke={shade(color, 0.7, dim)}
                strokeWidth={0.5}
              />
            )
          }

          // Back walls first, at full height: they are behind everything in
          // the room, and they are where the boards and screens hang.
          faces.forEach((fc, i) => fc.inner && drawFace(fc, i, g.height, 'b'))

          // Furniture between the back walls and the front kerb.
          const furn = furnitureByRoom[id]
          if (furn?.pieces.length) {
            out.push(
              ...renderFurniture({
                pieces: furn.pieces,
                project: P,
                zBase,
                color,
                alpha: alpha * (ghost ? 0.6 : 1),
                tilt,
                keyPrefix: `fu-${level}-${id}`,
                logoUrl: furn.logo && roomArtUrl ? roomArtUrl(furn.logo) : null,
                muralUrl: furn.mural && roomArtUrl ? roomArtUrl(furn.mural) : null,
              })
            )
          }

          // Front walls cut down to a kerb so the room can be seen into.
          faces.forEach((fc, i) => !fc.inner && drawFace(fc, i, cut, 'f'))
        } else {
          // Flat plan: no walls, but the furniture still reads as a layout.
          const furn = furnitureByRoom[id]
          if (furn?.pieces.length) {
            out.push(
              ...renderFurniture({
                pieces: furn.pieces,
                project: P,
                zBase,
                color,
                alpha: alpha * 0.8,
                tilt,
                keyPrefix: `fu-${level}-${id}`,
              })
            )
          }
        }

        // ---- outline ----
        // The footprint, traced at floor level: always visible, even in the
        // flat plan where there are no walls to show where a room ends. When
        // hovered or selected it glows.
        g.loops.forEach((lp, i) => {
          const floorPath = path(lp.outer, zBase)
          if (!ghost && active) {
            out.push(
              <path
                key={`glow-${level}-${id}-${i}`}
                d={floorPath}
                fill="none"
                stroke={shade(color, 1, 0.45)}
                strokeWidth={5}
                strokeLinejoin="round"
              />
            )
          }
          out.push(
            <path
              key={`cap-${level}-${id}-${i}`}
              d={floorPath}
              fill="none"
              stroke={shade(color, 0.7, dim * (muted ? 0.5 : 1))}
              strokeWidth={tilt > 0.01 ? 0.75 : 1.5}
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

        // ---- palm ----
        // A tapered, ringed trunk with a lit side, a crown of solid feathered
        // fronds shaded by how far they face the camera, and a coconut
        // cluster. Everything is projected point by point, so the crown lies
        // flat in plan view and droops in 2.5D.
        const h = 1.6 * t.s
        const lean = ((ti * 37) % 7) / 7 - 0.5
        const [tx, ty] = P(t.x + lean * 0.18 * t.s, t.y - 0.08 * t.s, zBase + h)
        const cx = (bx + tx) / 2 + (0.2 + lean * 0.15) * t.s * S
        const cy = (by + ty) / 2

        // Shadow: a soft outer pool and a darker core under the crown.
        out.push(
          <ellipse
            key={`palm-sh-${level}-${ti}`}
            cx={bx + 0.22 * t.s * S}
            cy={by + 0.08 * t.s * S}
            rx={0.75 * t.s * S}
            ry={0.26 * t.s * S}
            fill="rgba(4,30,66,0.07)"
            opacity={o}
          />,
          <ellipse
            key={`palm-sh2-${level}-${ti}`}
            cx={bx + 0.12 * t.s * S}
            cy={by + 0.05 * t.s * S}
            rx={0.38 * t.s * S}
            ry={0.13 * t.s * S}
            fill="rgba(4,30,66,0.12)"
            opacity={o}
          />
        )

        // Trunk: sampled along the curve, wide at the base, narrow at the top.
        const N = 9
        const along = (u: number): [number, number] => [
          (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * cx + u * u * tx,
          (1 - u) * (1 - u) * by + 2 * (1 - u) * u * cy + u * u * ty,
        ]
        const left: string[] = []
        const right: string[] = []
        const lit: string[] = []
        const rings: React.ReactNode[] = []
        for (let k = 0; k <= N; k++) {
          const u = k / N
          const [px, py] = along(u)
          const [qx, qy] = along(Math.min(1, u + 0.02))
          const [rx0, ry0] = along(Math.max(0, u - 0.02))
          let nx = -(qy - ry0)
          let ny = qx - rx0
          const len = Math.hypot(nx, ny) || 1
          nx /= len
          ny /= len
          const half = (0.075 - 0.035 * u) * t.s * S
          left.push(`${(px + nx * half).toFixed(1)} ${(py + ny * half).toFixed(1)}`)
          right.push(`${(px - nx * half).toFixed(1)} ${(py - ny * half).toFixed(1)}`)
          lit.push(`${(px + nx * half * 0.15).toFixed(1)} ${(py + ny * half * 0.15).toFixed(1)}`)
          if (k > 0 && k < N) {
            rings.push(
              <line
                key={`palm-ring-${level}-${ti}-${k}`}
                x1={px + nx * half}
                y1={py + ny * half}
                x2={px - nx * half}
                y2={py - ny * half}
                stroke={shade('#5C4630', 1, 0.55)}
                strokeWidth={Math.max(0.6, 0.018 * t.s * S)}
              />
            )
          }
        }
        out.push(
          <g key={`palm-trunk-${level}-${ti}`} opacity={o}>
            <path
              d={`M${left.join(' L')} L${right.reverse().join(' L')} Z`}
              fill={shade('#8C6A43', 0.92, 1)}
            />
            <path
              d={`M${left.join(' L')} L${lit.reverse().join(' L')} Z`}
              fill={shade('#B8915E', 1.05, 0.9)}
            />
            {rings}
          </g>
        )

        // Fronds: eleven, alternating long and short, drawn back to front.
        const fronds: Array<{ depth: number; node: React.ReactNode }> = []
        const count = 11
        for (let fi = 0; fi < count; fi++) {
          const ang = (fi / count) * Math.PI * 2 + ti * 0.7
          const dx = Math.cos(ang)
          const dy = Math.sin(ang)
          const long = fi % 2 === 0
          const r = (long ? 0.95 : 0.72) * t.s
          const droop = (long ? 0.62 : 0.42) * t.s
          const [ex, ey] = P(t.x + dx * r, t.y + dy * r, zBase + h - droop)
          const [qx, qy] = P(t.x + dx * r * 0.42, t.y + dy * r * 0.42, zBase + h + 0.28 * t.s)
          // Facing the camera (south and east) catches the light.
          const facing = (dx + dy) / Math.SQRT2
          const tone = facing > 0.3 ? '#97D700' : facing < -0.3 ? '#5E8A00' : '#7AB000'
          const lift = 0.85 + 0.3 * Math.max(0, facing)
          const pts: string[] = []
          const back: string[] = []
          const M = 10
          const bez = (u: number): [number, number] => [
            (1 - u) * (1 - u) * tx + 2 * (1 - u) * u * qx + u * u * ex,
            (1 - u) * (1 - u) * ty + 2 * (1 - u) * u * qy + u * u * ey,
          ]
          for (let k = 0; k <= M; k++) {
            const u = k / M
            const [px, py] = bez(u)
            const [ax, ay] = bez(Math.min(1, u + 0.03))
            const [zx, zy] = bez(Math.max(0, u - 0.03))
            let nx = -(ay - zy)
            let ny = ax - zx
            const len = Math.hypot(nx, ny) || 1
            nx /= len
            ny /= len
            // Leaflets: the edge steps in and out, so a frond reads feathered.
            const notch = k % 2 ? 0.7 : 1
            const half = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.13 * t.s * S * notch * (1 - 0.35 * u)
            pts.push(`${(px + nx * half).toFixed(1)} ${(py + ny * half).toFixed(1)}`)
            back.push(`${(px - nx * half).toFixed(1)} ${(py - ny * half).toFixed(1)}`)
          }
          fronds.push({
            depth: ey,
            node: (
              <g key={`palm-frond-${level}-${ti}-${fi}`}>
                <path
                  d={`M${pts.join(' L')} L${back.reverse().join(' L')} Z`}
                  fill={shade(tone, lift, 0.97)}
                  stroke={shade(tone, 0.7, 0.5)}
                  strokeWidth={0.5}
                  strokeLinejoin="round"
                />
                <path
                  d={`M${tx.toFixed(1)} ${ty.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
                  fill="none"
                  stroke={shade(tone, 0.62, 0.8)}
                  strokeWidth={Math.max(0.6, 0.02 * t.s * S)}
                  strokeLinecap="round"
                />
              </g>
            ),
          })
        }
        fronds.sort((a, b) => a.depth - b.depth)

        // Coconuts: a cluster of three under the crown, each with a highlight.
        const nuts: React.ReactNode[] = []
        for (const [ni, [ox, oy, rr]] of (
          [
            [-0.05, 0.07, 0.06],
            [0.06, 0.06, 0.055],
            [0.005, 0.11, 0.052],
          ] as Array<[number, number, number]>
        ).entries()) {
          const ncx = tx + ox * t.s * S
          const ncy = ty + oy * t.s * S
          const nr = Math.max(1.1, rr * t.s * S)
          nuts.push(
            <circle key={`palm-nut-${level}-${ti}-${ni}`} cx={ncx} cy={ncy} r={nr} fill={shade('#7A5A1E', 1)} />,
            <circle
              key={`palm-nut-hi-${level}-${ti}-${ni}`}
              cx={ncx - nr * 0.3}
              cy={ncy - nr * 0.35}
              r={nr * 0.35}
              fill="rgba(255,255,255,0.35)"
            />
          )
        }

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
            {fronds.filter((fr) => fr.depth <= ty).map((fr) => fr.node)}
            {nuts}
            {fronds.filter((fr) => fr.depth > ty).map((fr) => fr.node)}
          </g>
        )
      }

      const items: Array<{ depth: number; draw: () => void }> = Object.values(geometry)
        .filter((g) => g.floor === level)
        .map((g) => ({ depth: g.bbox.maxX + g.bbox.maxY, draw: () => drawRoom(g) }))
      if (here.up) {
        const fl = here.up
        items.push({ depth: fl.x + fl.w - 1 + fl.y + fl.h - 1, draw: () => drawUp(fl) })
      }
      if (here.down) {
        const fl = here.down
        // A hole in the floor: drawn before anything standing near it.
        items.push({ depth: fl.x + fl.y - 1, draw: () => drawDown(fl) })
      }
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
    furnitureByRoom,
    roomArtUrl,
    flights,
  ])

  return <g>{elements}</g>
}
