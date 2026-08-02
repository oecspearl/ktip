/**
 * Geometry for the drawn venue map (migration 089).
 *
 * A venue is a grid of cells per floor. A room is a *set* of cells, not a
 * rectangle, so an L-shaped main hall costs nothing extra — everything here
 * works from the cell set and traces the outline itself.
 *
 * Everything in this file is pure. The editor, the attendee map and the tests
 * all share it, which is the only way the host's drawing and the attendee's
 * walkable floor can be guaranteed to agree about where a wall is.
 */

import type { VenueRoom } from '../types'

/** Fixed drawing constants. Grid size is per event; these are not. */
export const VENUE_MAP = {
  /** Default grid. Stored per event so a later venue can be bigger. */
  COLS: 28,
  ROWS: 18,
  /** Wall thickness, in cells. The inner loop is the outer loop inset by this. */
  WALL_T: 0.1,
  /** Vertical gap between stacked floors, in projected units. */
  LEVEL_H: 2.4,
  /** Isometric basis. cx/cy are the x-axis vector; the y-axis mirrors it. */
  ISO_CX: 0.866,
  ISO_CY: 0.5,
  Z_SCALE: 0.85,
  MAX_FLOORS: 12,
  MIN_WALL_H: 0.3,
  MAX_WALL_H: 3,
} as const

export type MapCell = [number, number]

export interface VenueMapFloor {
  /** Stable slug. Rooms reference floors by index, so this is for display. */
  key: string
  name: string
}

export interface VenueMapConfig {
  v: 1
  cols: number
  rows: number
  floors: VenueMapFloor[]
}

export const DEFAULT_MAP_CONFIG: VenueMapConfig = {
  v: 1,
  cols: VENUE_MAP.COLS,
  rows: VENUE_MAP.ROWS,
  floors: [{ key: 'ground', name: 'Ground floor' }],
}

/**
 * Room colours. Brand primitives only — the venue is not a place to invent a
 * seventh hue, and every one of these is already somewhere else on the site.
 */
export const VENUE_PALETTE = [
  '#2A5788', // ocean 500
  '#7AB000', // tropical 600
  '#E6AC09', // sun 600
  '#7E9EC7', // ocean 300
  '#041E42', // ocean 700 (brand navy)
  '#AEE12B', // tropical 400
  '#B38500', // sun 700
  '#78716c', // sand 500
] as const

/** Fallback colour per room kind, for rooms authored before 089. */
const KIND_COLOR: Record<string, string> = {
  main_hall: '#2A5788',
  networking: '#7AB000',
  workshop: '#E6AC09',
  help_desk: '#7E9EC7',
  sponsor_booth: '#B38500',
  team: '#AEE12B',
  judging: '#041E42',
  stage: '#041E42',
  breakout: '#78716c',
}

export function colorForRoom(room: Pick<VenueRoom, 'kind'> & { color?: string | null }): string {
  return room.color || KIND_COLOR[room.kind] || VENUE_PALETTE[0]
}

// ---------------------------------------------------------------------------
// cells
// ---------------------------------------------------------------------------

export const cellKey = (x: number, y: number) => `${x},${y}`

export function inBounds(cfg: VenueMapConfig, x: number, y: number): boolean {
  return x >= 0 && x < cfg.cols && y >= 0 && y < cfg.rows
}

/** Inclusive rectangle → cell list, in row-major order. */
export function rectCells(x0: number, y0: number, x1: number, y1: number): MapCell[] {
  const out: MapCell[] = []
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y])
  return out
}

/**
 * Cells as stored in jsonb. Anything malformed is dropped rather than thrown:
 * a single bad pair must not blank a whole venue.
 */
export function parseCells(raw: unknown): MapCell[] {
  if (!Array.isArray(raw)) return []
  const out: MapCell[] = []
  const seen = new Set<string>()
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    const x = Math.trunc(Number(pair[0]))
    const y = Math.trunc(Number(pair[1]))
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) continue
    const k = cellKey(x, y)
    if (seen.has(k)) continue
    seen.add(k)
    out.push([x, y])
  }
  return out
}

export function parseMapConfig(raw: unknown): VenueMapConfig {
  const obj = (raw || {}) as Partial<VenueMapConfig>
  const cols = clampInt(obj.cols, 8, 64, VENUE_MAP.COLS)
  const rows = clampInt(obj.rows, 8, 64, VENUE_MAP.ROWS)
  const floors = Array.isArray(obj.floors) && obj.floors.length
    ? obj.floors.slice(0, VENUE_MAP.MAX_FLOORS).map((f, i) => ({
        key: typeof f?.key === 'string' && f.key ? f.key : `floor-${i}`,
        name: typeof f?.name === 'string' && f.name ? f.name : floorLabel(i),
      }))
    : DEFAULT_MAP_CONFIG.floors
  return { v: 1, cols, rows, floors }
}

export function floorLabel(index: number): string {
  return index === 0 ? 'Ground floor' : `Level ${index}`
}

/** Short badge for a floor — "G", "L1", "L2". */
export function floorBadge(index: number): string {
  return index === 0 ? 'G' : `L${index}`
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

/** True when a room actually sits on the drawn map. */
export function isPlaced(room: Pick<VenueRoom, 'cells'>): boolean {
  return Array.isArray(room.cells) && room.cells.length > 0
}

// ---------------------------------------------------------------------------
// outlines
// ---------------------------------------------------------------------------

export type LoopPoint = [number, number]
export interface RoomLoop {
  /** The outline, walked clockwise in grid coordinates. */
  outer: LoopPoint[]
  /** The same loop pushed inwards by WALL_T — the inside face of the wall. */
  inner: LoopPoint[]
}

/**
 * March the boundary of a cell set into closed loops.
 *
 * Each cell contributes an edge for every side with no neighbour, then the
 * edges are walked head-to-tail. A room with a hole in it (a courtyard) yields
 * two loops, which is why this returns a list.
 */
export function traceLoops(cells: MapCell[]): RoomLoop[] {
  const set = new Set(cells.map(([x, y]) => cellKey(x, y)))
  const has = (x: number, y: number) => set.has(cellKey(x, y))

  const edges = new Map<string, Array<{ x: number; y: number }>>()
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const k = cellKey(x1, y1)
    const list = edges.get(k)
    if (list) list.push({ x: x2, y: y2 })
    else edges.set(k, [{ x: x2, y: y2 }])
  }

  // Sorted so the output is stable regardless of the order cells were drawn in.
  const ordered = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  for (const [x, y] of ordered) {
    if (!has(x, y - 1)) add(x, y, x + 1, y)
    if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1)
    if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1)
    if (!has(x - 1, y)) add(x, y + 1, x, y)
  }

  const loops: RoomLoop[] = []
  while (edges.size) {
    const startK = edges.keys().next().value as string
    const [sx, sy] = startK.split(',').map(Number)
    let px = sx
    let py = sy
    let pdx: number | null = null
    let pdy: number | null = null
    const pts: LoopPoint[] = [[sx, sy]]

    // Guarded: a corrupt edge map must not spin the render loop forever.
    for (let guard = 0; guard < 8000; guard++) {
      const k = cellKey(px, py)
      const arr = edges.get(k)
      if (!arr || !arr.length) break

      // At a pinch point two edges leave the same vertex. Prefer the left turn,
      // which keeps the walk on one loop instead of hopping between them.
      let pick = 0
      if (arr.length > 1 && pdx !== null && pdy !== null) {
        for (let i = 0; i < arr.length; i++) {
          const dx = Math.sign(arr[i].x - px)
          const dy = Math.sign(arr[i].y - py)
          if (dx === -pdy && dy === pdx) {
            pick = i
            break
          }
        }
      }

      const e = arr.splice(pick, 1)[0]
      if (!arr.length) edges.delete(k)

      const dx = Math.sign(e.x - px)
      const dy = Math.sign(e.y - py)
      // Collinear steps extend the last point rather than adding a vertex.
      if (dx === pdx && dy === pdy) pts[pts.length - 1] = [e.x, e.y]
      else pts.push([e.x, e.y])

      pdx = dx
      pdy = dy
      px = e.x
      py = e.y
      if (px === sx && py === sy) break
    }

    if (
      pts.length > 1 &&
      pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1]
    ) {
      pts.pop()
    }

    // The start vertex may be mid-run along a straight edge; drop it if so.
    if (pts.length > 2) {
      const n = pts.length
      const d1 = [Math.sign(pts[0][0] - pts[n - 1][0]), Math.sign(pts[0][1] - pts[n - 1][1])]
      const d2 = [Math.sign(pts[1][0] - pts[0][0]), Math.sign(pts[1][1] - pts[0][1])]
      if (d1[0] === d2[0] && d1[1] === d2[1]) pts.shift()
    }

    if (pts.length >= 4) loops.push({ outer: pts, inner: insetLoop(pts, VENUE_MAP.WALL_T) })
  }

  return loops
}

/**
 * Push an axis-aligned loop inwards by `t`.
 *
 * Every segment is horizontal or vertical, so the offset of a corner is just
 * the two neighbouring segment offsets combined — no general polygon offsetting
 * is needed, and none of its degenerate cases can occur.
 */
export function insetLoop(pts: LoopPoint[], t: number): LoopPoint[] {
  const n = pts.length
  const off = pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    const dx = Math.sign(q[0] - p[0])
    const dy = Math.sign(q[1] - p[1])
    return dx !== 0 ? { y: p[1] + t * dx } : { x: p[0] - t * dy }
  })

  const out: LoopPoint[] = []
  for (let i = 0; i < n; i++) {
    const prev = off[(i - 1 + n) % n] as { x?: number; y?: number }
    const cur = off[i] as { x?: number; y?: number }
    out.push([cur.x !== undefined ? cur.x : (prev.x as number), cur.y !== undefined ? cur.y : (prev.y as number)])
  }
  return out
}

// ---------------------------------------------------------------------------
// per-room geometry
// ---------------------------------------------------------------------------

/**
 * The minimum a thing needs to be drawable. The editor's in-progress rooms are
 * not `VenueRoom` rows yet — they have no id from the database and may never
 * get one if the host cancels — so the geometry layer asks for the shape it
 * actually reads rather than the whole row.
 */
export interface PlacedRoom {
  id: string
  kind: VenueRoom['kind']
  cells: unknown
  color?: string | null
  wall_height?: number | null
  floor?: number | null
}

export interface RoomGeometry<T extends PlacedRoom = PlacedRoom> {
  room: T
  cells: MapCell[]
  loops: RoomLoop[]
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  /** Cell-average, not bbox centre: an L-shape's label belongs inside the L. */
  centroid: [number, number]
  color: string
  height: number
  floor: number
  isRect: boolean
}

export function roomGeometry<T extends PlacedRoom>(room: T): RoomGeometry<T> | null {
  const cells = parseCells(room.cells)
  if (!cells.length) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let cx = 0
  let cy = 0
  for (const [x, y] of cells) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    cx += x + 0.5
    cy += y + 0.5
  }

  const height = clampHeight(room.wall_height)
  return {
    room,
    cells,
    loops: traceLoops(cells),
    bbox: { minX, minY, maxX, maxY },
    centroid: [cx / cells.length, cy / cells.length],
    color: colorForRoom(room),
    height,
    floor: Math.max(0, Math.trunc(Number(room.floor) || 0)),
    isRect: cells.length === (maxX - minX + 1) * (maxY - minY + 1),
  }
}

export function clampHeight(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.max(VENUE_MAP.MIN_WALL_H, Math.min(VENUE_MAP.MAX_WALL_H, n))
}

/** Geometry for every placed room, keyed by room id. */
export function buildGeometry<T extends PlacedRoom>(
  rooms: T[] | undefined
): Record<string, RoomGeometry<T>> {
  const out: Record<string, RoomGeometry<T>> = {}
  for (const room of rooms || []) {
    const g = roomGeometry(room)
    if (g) out[room.id] = g
  }
  return out
}

/** cellKey → room id, for one floor. Used for hit-testing and for collision. */
export function cellOwners(
  geometry: Record<string, RoomGeometry<any>>,
  floor: number
): Map<string, string> {
  const owners = new Map<string, string>()
  for (const g of Object.values(geometry)) {
    if (g.floor !== floor) continue
    for (const [x, y] of g.cells) owners.set(cellKey(x, y), g.room.id)
  }
  return owners
}

export function roomAt<T extends PlacedRoom>(
  geometry: Record<string, RoomGeometry<T>>,
  floor: number,
  x: number,
  y: number
): RoomGeometry<T> | null {
  const cx = Math.floor(x)
  const cy = Math.floor(y)
  for (const g of Object.values(geometry)) {
    if (g.floor !== floor) continue
    for (const [gx, gy] of g.cells) if (gx === cx && gy === cy) return g
  }
  return null
}

// ---------------------------------------------------------------------------
// projection
// ---------------------------------------------------------------------------

export interface Projection {
  /** Grid + height → screen pixels. */
  project: (x: number, y: number, z?: number) => [number, number]
  /** Screen pixels → grid, for a given floor height. */
  unproject: (px: number, py: number, z?: number) => [number, number]
  scale: number
}

/**
 * One projection covering both views.
 *
 * `tilt` runs 0 (flat top-down, what the editor uses) to 1 (full isometric).
 * Animating it between the two is what makes the map tip up rather than cut,
 * and it means there is only one set of maths to keep correct.
 */
export function makeProjection(args: {
  cols: number
  rows: number
  tilt: number
  width: number
  height: number
  zoom: { k: number; px: number; py: number }
  /** Height of the tallest thing drawn, so the fit accounts for the stack. */
  topZ: number
  padding?: number
}): Projection {
  const { cols, rows, tilt: t, width, height, zoom, topZ } = args
  const pad = args.padding ?? 96

  const a = 1 - (1 - VENUE_MAP.ISO_CX) * t
  const b = VENUE_MAP.ISO_CX * t
  const c = VENUE_MAP.ISO_CY * t
  const d = 1 - (1 - VENUE_MAP.ISO_CY) * t
  const zk = VENUE_MAP.Z_SCALE * t

  const raw = (x: number, y: number, z: number): [number, number] => [a * x - b * y, c * x + d * y - z * zk]

  const corners: Array<[number, number]> = []
  for (const [x, y] of [
    [0, 0],
    [cols, 0],
    [cols, rows],
    [0, rows],
  ] as Array<[number, number]>) {
    corners.push(raw(x, y, 0), raw(x, y, topZ))
  }
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const bw = Math.max(...xs) - minX
  const bh = Math.max(...ys) - minY

  const fit = Math.min(
    Math.max(1, width - pad) / (bw || 1),
    Math.max(1, height - pad) / (bh || 1)
  )
  const S = fit * zoom.k
  const ox = width / 2 - S * (minX + bw / 2) + zoom.px
  const oy = height / 2 - S * (minY + bh / 2) + zoom.py

  const det = a * d + b * c

  return {
    scale: S,
    project: (x, y, z = 0) => {
      const [rx, ry] = raw(x, y, z)
      return [rx * S + ox, ry * S + oy]
    },
    unproject: (px, py, z = 0) => {
      const rx = (px - ox) / S
      const ry = (py - oy) / S + z * zk
      return [(rx * d + b * ry) / det, (a * ry - c * rx) / det]
    },
  }
}

/** SVG path for a loop at a given height. */
export function loopPath(proj: Projection, pts: LoopPoint[], z = 0): string {
  return (
    pts
      .map((p, i) => {
        const [sx, sy] = proj.project(p[0], p[1], z)
        return `${i ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`
      })
      .join(' ') + ' Z'
  )
}

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ]
}

/** Multiply a hex colour towards black (f<1) or white-ish (f>1), with alpha. */
export function shade(hex: string, f: number, a = 1): string {
  const [r, g, b] = channels(hex)
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `rgba(${clamp(r * f)},${clamp(g * f)},${clamp(b * f)},${a})`
}

/** Readable text colour on a filled swatch of `hex`. */
export function contrastInk(hex: string): string {
  const [r, g, b] = channels(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#041E42' : '#FFFFFF'
}

// ---------------------------------------------------------------------------
// walking
// ---------------------------------------------------------------------------

/** Where a new arrival is dropped: the middle of the floor, outside any room. */
export function spawnPoint(
  cfg: VenueMapConfig,
  geometry: Record<string, RoomGeometry<any>>,
  floor: number
): { x: number; y: number } {
  const owners = cellOwners(geometry, floor)
  const cx = cfg.cols / 2
  const cy = cfg.rows / 2

  let best: { x: number; y: number; d: number } | null = null
  for (let y = 0; y < cfg.rows; y++) {
    for (let x = 0; x < cfg.cols; x++) {
      if (owners.has(cellKey(x, y))) continue
      const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2
      if (!best || d < best.d) best = { x: x + 0.5, y: y + 0.5, d }
    }
  }
  return best ? { x: best.x, y: best.y } : { x: cx, y: cy }
}

/** Keep a walker on the floor slab. Rooms are enterable, so they do not block. */
export function clampToFloor(
  cfg: VenueMapConfig,
  pos: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: Math.max(0.15, Math.min(cfg.cols - 0.15, pos.x)),
    y: Math.max(0.15, Math.min(cfg.rows - 0.15, pos.y)),
  }
}

/** Step `pos` towards `target` at `speed` cells/second. */
export function stepTowards(
  pos: { x: number; y: number },
  target: { x: number; y: number },
  speed: number,
  dt: number
): { pos: { x: number; y: number }; arrived: boolean } {
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const dist = Math.hypot(dx, dy)
  const travel = speed * dt
  if (dist <= travel || dist < 0.01) return { pos: { ...target }, arrived: true }
  return { pos: { x: pos.x + (dx / dist) * travel, y: pos.y + (dy / dist) * travel }, arrived: false }
}
