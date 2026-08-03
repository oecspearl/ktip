/**
 * Procedural scenery for the venue map.
 *
 * Everything here is deterministic: placement is seeded from the venue's own
 * shape (grid, door, rooms), so every attendee sees the same trees in the same
 * places without a byte of it being stored. Redrawing a room reflows the
 * scenery around it, which is exactly what a groundskeeper would do.
 *
 * Pure module, no React — the stage renders what this computes.
 */

import {
  DOOR_WIDTH,
  cellKey,
  doorCells,
  inBounds,
  stairsCells,
  type FloorSide,
  type MapCell,
  type RoomGeometry,
  type VenueMapConfig,
} from './venue-map'

export interface DecorTree {
  x: number
  y: number
  /** Size multiplier, ~0.7–1.4. */
  s: number
  kind: 'palm' | 'bush'
  /** Sway period in seconds — varied so the grove does not move in lockstep. */
  sway: number
}

/** A doorway carved into a room's wall: the room cell and the open side. */
export interface WallOpening {
  x: number
  y: number
  side: FloorSide
}

export interface VenueDecor {
  /** How far the grass apron extends past the slab, in cells. */
  margin: number
  /**
   * Paved cells per floor, indexed by level: each floor has its own door and
   * its own rooms, so each gets its own plaza and walkways — drawn on that
   * floor's slab, at that floor's height when the stack is pulled apart.
   */
  paveByFloor: MapCell[][]
  /** Doorways to cut, keyed by room id — one wherever a walkway meets a room. */
  openings: Record<string, WallOpening[]>
  trees: DecorTree[]
}

// ---------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------

/** FNV-1a. Tiny, stable, and plenty for scattering shrubbery. */
function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — the standard tiny seeded PRNG. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// placement
// ---------------------------------------------------------------------------

export function buildDecor(
  cfg: VenueMapConfig,
  geometry: Record<string, RoomGeometry<any>>
): VenueDecor {
  const margin = 2.4
  const door = cfg.floors[0]?.door

  // Seeded from the venue's shape: same venue, same garden, on every screen.
  const roomSig = Object.values(geometry)
    .map((g) => `${g.room.id}:${g.floor}:${g.bbox.minX},${g.bbox.minY},${g.bbox.maxX},${g.bbox.maxY}`)
    .sort()
    .join('|')
  const rng = mulberry32(fnv(`${cfg.cols}x${cfg.rows}:${door?.side}${door?.at}:${roomSig}`))

  // Cells nothing may be planted on or paved over. All floors count for
  // planting — in the stacked view an upper room hangs over its footprint and
  // a palm poking through Level 2 reads as a mistake.
  const planted = new Set<string>()
  for (const g of Object.values(geometry)) for (const [x, y] of g.cells) planted.add(cellKey(x, y))
  if (cfg.stairs) for (const [x, y] of stairsCells(cfg.stairs)) planted.add(cellKey(x, y))

  // ---- pavement -----------------------------------------------------------
  // Computed floor by floor: each level has its own door and its own rooms,
  // and — stacked — its own slab height, so a level's pavers must belong to
  // that level rather than all being poured on the ground.

  const paveByFloor: MapCell[][] = []
  const openings: Record<string, WallOpening[]> = {}
  for (let f = 0; f < cfg.floors.length; f++) {
    const cells: MapCell[] = []
    const set = new Set<string>()

    // Walkways stop at this floor's walls — a room upstairs is open sky here.
    const wall = new Set<string>()
    for (const g of Object.values(geometry)) {
      if (g.floor !== f) continue
      for (const [x, y] of g.cells) wall.add(cellKey(x, y))
    }
    if (cfg.stairs) for (const [x, y] of stairsCells(cfg.stairs)) wall.add(cellKey(x, y))

    const pave = (x: number, y: number) => {
      const k = cellKey(x, y)
      if (!inBounds(cfg, x, y) || wall.has(k) || set.has(k)) return
      set.add(k)
      cells.push([x, y])
    }

    const fdoor = cfg.floors[f]?.door
    let anchor: MapCell | null = null
    if (fdoor) {
      // Edge-local axes, same trick the gateway uses: u along the wall, n inward.
      const u: MapCell = fdoor.side === 'n' || fdoor.side === 's' ? [1, 0] : [0, 1]
      const n: MapCell =
        fdoor.side === 'n'
          ? [0, 1]
          : fdoor.side === 's'
            ? [0, -1]
            : fdoor.side === 'w'
              ? [1, 0]
              : [-1, 0]
      const [mx, my] = doorCells(cfg, fdoor)[0] ?? [0, 0]

      // Plaza: one cell wider than the doorway on both sides, two deep.
      for (let i = -1; i <= DOOR_WIDTH; i++) {
        for (let j = 0; j <= 2; j++) {
          pave(mx + u[0] * i + n[0] * j, my + u[1] * i + n[1] * j)
        }
      }
      anchor = [
        mx + u[0] * Math.floor(DOOR_WIDTH / 2) + n[0] * 2,
        my + u[1] * Math.floor(DOOR_WIDTH / 2) + n[1] * 2,
      ]
    }

    // ---- the path network ----
    // One network per floor: the entrance and every room are nodes, and a
    // minimum spanning tree decides which pairs get a path — every room
    // reachable, no loops, nothing drawn twice. A room offers up to four door
    // points (the middle of each wall side); an edge uses whichever pair of
    // points sits closest, walks an L between them that prefers not to cross
    // walls, and records the doorway to carve at each end.

    interface DoorPoint {
      /** Room cell just inside the wall the path arrives at. */
      cell: MapCell
      /** The free cell just outside it — the single paver that touches. */
      out: MapCell
      side: FloorSide
    }

    const candidatesOf = (g: RoomGeometry<any>): DoorPoint[] => {
      const mine = new Set(g.cells.map(([x, y]) => cellKey(x, y)))
      const dirs: Array<[FloorSide, number, number]> = [
        ['n', 0, -1],
        ['s', 0, 1],
        ['w', -1, 0],
        ['e', 1, 0],
      ]
      const points: DoorPoint[] = []
      for (const [side, ox, oy] of dirs) {
        // Boundary cells facing this way, with a clear cell beyond the wall.
        const edge = g.cells.filter(([x, y]) => {
          if (mine.has(cellKey(x + ox, y + oy))) return false
          return inBounds(cfg, x + ox, y + oy) && !wall.has(cellKey(x + ox, y + oy))
        })
        if (!edge.length) continue

        // The middle of the longest straight run — a door belongs in the
        // centre of a wall, not tucked into its corner.
        const along = ox === 0 ? 0 : 1
        const fixed = ox === 0 ? 1 : 0
        const byLine = new Map<number, number[]>()
        for (const c of edge) {
          const list = byLine.get(c[fixed]) ?? []
          list.push(c[along])
          byLine.set(c[fixed], list)
        }
        let bestRun: { line: number; start: number; len: number } | null = null
        for (const [line, values] of byLine) {
          values.sort((a, b) => a - b)
          let start = values[0]
          let len = 1
          for (let i = 1; i <= values.length; i++) {
            if (values[i] === values[i - 1] + 1) len++
            else {
              if (!bestRun || len > bestRun.len) bestRun = { line, start, len }
              start = values[i]
              len = 1
            }
          }
        }
        if (!bestRun) continue
        const mid = bestRun.start + Math.floor((bestRun.len - 1) / 2)
        const cell: MapCell = along === 0 ? [mid, bestRun.line] : [bestRun.line, mid]
        points.push({ cell, out: [cell[0] + ox, cell[1] + oy], side })
      }
      return points
    }

    interface PathNode {
      geo: RoomGeometry<any> | null
      points: DoorPoint[]
    }
    const nodes: PathNode[] = []
    // The entrance is a node like any room — that is what makes "connect to
    // each other or to the entrance" one decision instead of two systems.
    if (anchor) nodes.push({ geo: null, points: [{ cell: anchor, out: anchor, side: 'n' }] })
    for (const g of Object.values(geometry)) {
      if (g.floor !== f) continue
      const points = candidatesOf(g)
      if (points.length) nodes.push({ geo: g, points })
    }

    const pairFor = (a: PathNode, b: PathNode) => {
      let best: { pa: DoorPoint; pb: DoorPoint; d: number } | null = null
      for (const pa of a.points) {
        for (const pb of b.points) {
          const d = Math.abs(pa.out[0] - pb.out[0]) + Math.abs(pa.out[1] - pb.out[1])
          if (!best || d < best.d) best = { pa, pb, d }
        }
      }
      return best!
    }

    /** L-route between two free cells; of the two turns, the one that crosses
        fewer walls wins. Wall cells are never paved either way. */
    const routeBetween = (a: MapCell, b: MapCell): MapCell[] => {
      const attempt = (xFirst: boolean) => {
        const route: MapCell[] = [[a[0], a[1]]]
        let hits = 0
        let [px, py] = a
        const walk = (axis: 0 | 1) => {
          const goal = axis === 0 ? b[0] : b[1]
          while ((axis === 0 ? px : py) !== goal) {
            if (axis === 0) px += Math.sign(goal - px)
            else py += Math.sign(goal - py)
            if (wall.has(cellKey(px, py))) hits++
            else route.push([px, py])
          }
        }
        walk(xFirst ? 0 : 1)
        walk(xFirst ? 1 : 0)
        return { route, hits }
      }
      const r1 = attempt(true)
      if (!r1.hits) return r1.route
      const r2 = attempt(false)
      return r2.hits < r1.hits ? r2.route : r1.route
    }

    if (nodes.length > 1) {
      const inTree = new Set<number>([0])
      while (inTree.size < nodes.length) {
        let from = -1
        let next = -1
        let best = Infinity
        for (const i of inTree) {
          for (let j = 0; j < nodes.length; j++) {
            if (inTree.has(j)) continue
            const { d } = pairFor(nodes[i], nodes[j])
            if (d < best) {
              best = d
              from = i
              next = j
            }
          }
        }
        if (next < 0) break
        const { pa, pb } = pairFor(nodes[from], nodes[next])
        for (const [x, y] of routeBetween(pa.out, pb.out)) pave(x, y)
        const fromGeo = nodes[from].geo
        const nextGeo = nodes[next].geo
        if (fromGeo)
          (openings[fromGeo.room.id] ??= []).push({ x: pa.cell[0], y: pa.cell[1], side: pa.side })
        if (nextGeo)
          (openings[nextGeo.room.id] ??= []).push({ x: pb.cell[0], y: pb.cell[1], side: pb.side })
        inTree.add(next)
      }
    }

    paveByFloor.push(cells)
  }

  const paveSet = new Set(paveByFloor[0]?.map(([x, y]) => cellKey(x, y)) ?? [])

  // ---- planting -----------------------------------------------------------

  const trees: DecorTree[] = []
  const farEnough = (x: number, y: number, min: number) =>
    trees.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= min * min)

  /** Keep the view out of the front door clear of trunks. */
  const nearDoorFront = (x: number, y: number): boolean => {
    if (!door) return false
    const lo = door.at - 2
    const hi = door.at + DOOR_WIDTH + 2
    if (door.side === 'n') return y < 1 && x >= lo && x <= hi
    if (door.side === 's') return y > cfg.rows - 1 && x >= lo && x <= hi
    if (door.side === 'w') return x < 1 && y >= lo && y <= hi
    return x > cfg.cols - 1 && y >= lo && y <= hi
  }

  // Around the outside: a loose ring of palms on the grass apron.
  const outerPalms = 9 + Math.floor(rng() * 4)
  for (let i = 0, guard = 0; i < outerPalms && guard < 80; guard++) {
    const side = Math.floor(rng() * 4)
    const along = rng()
    const dist = 0.7 + rng() * (margin - 1.0)
    const x =
      side === 0 || side === 1
        ? -margin + 0.3 + along * (cfg.cols + 2 * margin - 0.6)
        : side === 2
          ? -dist
          : cfg.cols + dist
    const y =
      side === 2 || side === 3
        ? -margin + 0.3 + along * (cfg.rows + 2 * margin - 0.6)
        : side === 0
          ? -dist
          : cfg.rows + dist
    if (nearDoorFront(x, y) || !farEnough(x, y, 2.3)) continue
    trees.push({ x, y, s: 0.85 + rng() * 0.5, kind: 'palm', sway: 4.5 + rng() * 2.5 })
    i++
  }

  // A few bushes tucked between the palms, closer to the slab edge.
  const outerBushes = 5 + Math.floor(rng() * 4)
  for (let i = 0, guard = 0; i < outerBushes && guard < 60; guard++) {
    const side = Math.floor(rng() * 4)
    const along = 0.1 + rng() * 0.8
    const dist = 0.35 + rng() * 0.8
    const x =
      side === 0 || side === 1 ? along * cfg.cols : side === 2 ? -dist : cfg.cols + dist
    const y = side === 2 || side === 3 ? along * cfg.rows : side === 0 ? -dist : cfg.rows + dist
    if (nearDoorFront(x, y) || !farEnough(x, y, 1.6)) continue
    trees.push({ x, y, s: 0.7 + rng() * 0.5, kind: 'bush', sway: 0 })
    i++
  }

  // On the slab: a handful of planters in the border band, on free cells only,
  // so the middle of the floor stays walkable and readable.
  const innerCandidates: MapCell[] = []
  for (let y = 0; y < cfg.rows; y++) {
    for (let x = 0; x < cfg.cols; x++) {
      const band = x < 2 || y < 2 || x >= cfg.cols - 2 || y >= cfg.rows - 2
      if (!band) continue
      const k = cellKey(x, y)
      if (planted.has(k) || paveSet.has(k)) continue
      innerCandidates.push([x, y])
    }
  }
  // Fisher–Yates with the seeded rng, so "random" is the same for everyone.
  for (let i = innerCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[innerCandidates[i], innerCandidates[j]] = [innerCandidates[j], innerCandidates[i]]
  }
  let innerLeft = 5
  for (const [cx, cy] of innerCandidates) {
    if (!innerLeft) break
    const x = cx + 0.5
    const y = cy + 0.5
    if (nearDoorFront(x, y) || !farEnough(x, y, 3)) continue
    trees.push({
      x,
      y,
      s: 0.65 + rng() * 0.35,
      kind: rng() < 0.45 ? 'palm' : 'bush',
      sway: 4.5 + rng() * 2.5,
    })
    innerLeft--
  }

  return { margin, paveByFloor, openings, trees }
}
