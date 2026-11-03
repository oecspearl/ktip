/**
 * Laying out a building: stair flights between floors, and rooms packed
 * around them.
 *
 * Self-contained on purpose (no runtime imports), so the seed script can load
 * it under Node's type stripping as well as the app under Vite.
 *
 * Stairs are flights, one per pair of floors. A flight from floor n stands on
 * floor n as the way up and on floor n+1, in the same place, as the way down.
 * So the ground floor only has a way up, the top floor only a way down, and
 * every floor between has one of each, in different places.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A staircase joining floor `from` to floor `from + 1`. */
export interface VenueFlight extends Rect {
  from: number
}

export type Side = 'n' | 's' | 'e' | 'w'

export interface LayoutDoor {
  side: Side
  /** First cell of the doorway along its wall. */
  at: number
}

/** Width of a doorway in cells. Mirrors DOOR_WIDTH in venue-map.ts. */
const DOOR_W = 2
/** Flights are two cells wide and three deep, treads running north to south. */
export const FLIGHT_W = 2
export const FLIGHT_H = 3

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/** A small seeded generator, so a layout can be repeated from its seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

const key = (x: number, y: number) => `${x},${y}`

export function rectKeys(r: Rect, pad = 0): string[] {
  const out: string[] = []
  for (let y = r.y - pad; y < r.y + r.h + pad; y++)
    for (let x = r.x - pad; x < r.x + r.w + pad; x++) out.push(key(x, y))
  return out
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  )
}

/** The doorway cells and the two rows in front of them, kept clear. */
export function doorClearance(cols: number, rows: number, door: LayoutDoor | undefined): Set<string> {
  const out = new Set<string>()
  if (!door) return out
  for (let i = -1; i < DOOR_W + 1; i++) {
    for (let d = 0; d < 3; d++) {
      const at = door.at + i
      if (door.side === 's') out.add(key(at, rows - 1 - d))
      else if (door.side === 'n') out.add(key(at, d))
      else if (door.side === 'w') out.add(key(d, at))
      else out.add(key(cols - 1 - d, at))
    }
  }
  return out
}

/** Where someone walks in: the doorway's inner cell. */
export function doorCell(cols: number, rows: number, door: LayoutDoor | undefined): [number, number] {
  if (!door) return [Math.floor(cols / 2), rows - 1]
  const mid = door.at + Math.floor(DOOR_W / 2)
  if (door.side === 's') return [mid, rows - 1]
  if (door.side === 'n') return [mid, 0]
  if (door.side === 'w') return [0, mid]
  return [cols - 1, mid]
}

// ---------------------------------------------------------------------------
// Stair flights
// ---------------------------------------------------------------------------

/** The flights that stand on one floor: the way up, the way down, or both. */
export function flightsOn(flights: readonly VenueFlight[], floor: number): {
  up: VenueFlight | null
  down: VenueFlight | null
} {
  return {
    up: flights.find((f) => f.from === floor) ?? null,
    down: flights.find((f) => f.from === floor - 1) ?? null,
  }
}

export function onFlight(f: Rect | null | undefined, pos: { x: number; y: number } | null): boolean {
  if (!f || !pos) return false
  return pos.x >= f.x && pos.x < f.x + f.w && pos.y >= f.y && pos.y < f.y + f.h
}

export function flightCentre(f: Rect): { x: number; y: number } {
  return { x: f.x + f.w / 2, y: f.y + f.h / 2 }
}

/**
 * Picks a spot for each flight. A flight must be clear on both floors it joins,
 * away from each floor's door, and on a middle floor well apart from that
 * floor's other flight, so up and down are two different walks. Spots near the
 * outer walls are preferred: stairs belong against a wall, not mid-floor.
 *
 * `taken[f]` holds cells already used on floor f (rooms, when laying flights
 * into an existing building). Returns fewer flights than asked for only when a
 * floor is too full to take one.
 */
export function planFlights(opts: {
  cols: number
  rows: number
  floors: number
  doors: Array<LayoutDoor | undefined>
  taken?: Array<Set<string>>
  /** Flights already fixed, kept as they are. */
  keep?: VenueFlight[]
  rng?: () => number
}): VenueFlight[] {
  const { cols, rows, floors } = opts
  const rng = opts.rng ?? Math.random
  const flights: VenueFlight[] = []
  const clear = opts.doors.map((d) => doorClearance(cols, rows, d))

  for (let from = 0; from < floors - 1; from++) {
    const kept = opts.keep?.find((k) => k.from === from)
    if (kept) {
      flights.push(kept)
      continue
    }
    const below = flights.find((f) => f.from === from - 1) ?? null
    const candidates: Array<{ r: VenueFlight; score: number }> = []
    for (let y = 1; y <= rows - 1 - FLIGHT_H; y++) {
      for (let x = 1; x <= cols - 1 - FLIGHT_W; x++) {
        const r: VenueFlight = { from, x, y, w: FLIGHT_W, h: FLIGHT_H }
        const cells = rectKeys(r, 1)
        let ok = true
        for (const f of [from, from + 1]) {
          const taken = opts.taken?.[f]
          if (cells.some((c) => clear[f]?.has(c) || taken?.has(c))) {
            ok = false
            break
          }
        }
        if (!ok) continue
        // The way down on floor `from` is the flight below; keep them apart.
        if (below && overlaps(r, below, 2)) continue
        const toWall = Math.min(x - 1, y - 1, cols - 1 - (x + FLIGHT_W), rows - 1 - (y + FLIGHT_H))
        const apart = below
          ? Math.hypot(x - below.x, y - below.y) / Math.hypot(cols, rows)
          : 0
        candidates.push({ r, score: -toWall * 1.5 + apart * 12 + rng() * 4 })
      }
    }
    if (!candidates.length) break
    candidates.sort((a, b) => b.score - a.score)
    // Pick among the best few, so two runs give two buildings.
    const top = candidates.slice(0, Math.min(6, candidates.length))
    flights.push(top[Math.floor(rng() * top.length)].r)
  }
  return flights
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export interface PackRoom {
  key: string
  w: number
  h: number
  /** May the room be turned 90 degrees to fit. Default true. */
  rotate?: boolean
}

/**
 * Packs one floor's rooms tightly with a one-cell corridor between them.
 *
 * Big rooms go first. Each takes the spot that touches the most walls, rooms
 * and corridor edge already there, so the floor fills from one corner instead
 * of scattering. The corner, the order of equal rooms and small ties are
 * random, so every run is a different but tidy floor. A spot is only used if
 * every room, stair flight and the door can still be walked to.
 *
 * Returns the rooms that fit; `missing` lists any that did not.
 */
export function packFloor(opts: {
  cols: number
  rows: number
  rooms: PackRoom[]
  /** Cells nothing may cover: stair flights (with a margin) and the door. */
  blocked: Set<string>
  /** Must stay reachable from the door: stair flights on this floor. */
  reach?: Rect[]
  door?: LayoutDoor
  rng?: () => number
}): { placed: Record<string, Rect>; missing: string[] } {
  const { cols, rows } = opts
  const rng = opts.rng ?? Math.random
  const start = doorCell(cols, rows, opts.door)
  // Fill from a random corner.
  const cx = rng() < 0.5 ? 0 : cols
  const cy = rng() < 0.5 ? 0 : rows

  const order = [...opts.rooms]
    .map((r) => ({ r, jitter: rng() }))
    .sort((a, b) => b.r.w * b.r.h - a.r.w * a.r.h || a.jitter - b.jitter)
    .map((x) => x.r)

  // Flat grids, not string sets: this runs for every cell of every floor.
  const idx = (x: number, y: number) => y * cols + x
  const blocked = new Uint8Array(cols * rows)
  for (const c of opts.blocked) {
    const [x, y] = c.split(',').map(Number)
    if (x >= 0 && y >= 0 && x < cols && y < rows) blocked[idx(x, y)] = 1
  }
  const solid = new Uint8Array(cols * rows)
  const fill = (grid: Uint8Array, r: Rect, v: number) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[idx(x, y)] = v
  }

  const placed: Record<string, Rect> = {}
  const rects: Rect[] = []
  const missing: string[] = []
  const seen = new Uint8Array(cols * rows)
  const queue = new Int32Array(cols * rows)

  /** Every room and target still has a free neighbour reachable from the door. */
  const connected = (trial: Rect): boolean => {
    fill(solid, trial, 1)
    seen.fill(0)
    let head = 0
    let tail = 0
    const s0 = idx(start[0], start[1])
    if (!solid[s0]) {
      seen[s0] = 1
      queue[tail++] = s0
    }
    while (head < tail) {
      const at = queue[head++]
      const x = at % cols
      const y = (at - x) / cols
      if (x > 0 && !seen[at - 1] && !solid[at - 1]) (seen[at - 1] = 1), (queue[tail++] = at - 1)
      if (x < cols - 1 && !seen[at + 1] && !solid[at + 1]) (seen[at + 1] = 1), (queue[tail++] = at + 1)
      if (y > 0 && !seen[at - cols] && !solid[at - cols]) (seen[at - cols] = 1), (queue[tail++] = at - cols)
      if (y < rows - 1 && !seen[at + cols] && !solid[at + cols]) (seen[at + cols] = 1), (queue[tail++] = at + cols)
    }
    const touches = (r: Rect) => {
      for (let y = r.y - 1; y <= r.y + r.h; y++)
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue
          const i = idx(x, y)
          if (seen[i] && !solid[i]) return true
        }
      return false
    }
    const ok = [...rects, trial].every(touches) && (opts.reach ?? []).every(touches)
    fill(solid, trial, 0)
    for (const r of rects) fill(solid, r, 1)
    return ok
  }

  for (const room of order) {
    const shapes: Array<[number, number]> = [[room.w, room.h]]
    if (room.rotate !== false && room.w !== room.h) shapes.push([room.h, room.w])
    const bbox = rects.length
      ? {
          x1: Math.min(...rects.map((q) => q.x)),
          y1: Math.min(...rects.map((q) => q.y)),
          x2: Math.max(...rects.map((q) => q.x + q.w)),
          y2: Math.max(...rects.map((q) => q.y + q.h)),
        }
      : null
    const candidates: Array<{ r: Rect; score: number }> = []

    for (const [w, h] of shapes) {
      for (let y = 1; y <= rows - 1 - h; y++) {
        for (let x = 1; x <= cols - 1 - w; x++) {
          const r = { x, y, w, h }
          let clear = true
          for (let yy = y; yy < y + h && clear; yy++)
            for (let xx = x; xx < x + w; xx++)
              if (blocked[idx(xx, yy)]) {
                clear = false
                break
              }
          if (!clear) continue
          if (rects.some((o) => overlaps(r, o, 1))) continue
          // Contact: cells two out from the room that sit against the outer
          // margin, another room or a blocked cell. More contact, tighter floor.
          let contact = 0
          for (let py = y - 2; py < y + h + 2; py++) {
            for (let px = x - 2; px < x + w + 2; px++) {
              const inner = px >= x - 1 && px < x + w + 1 && py >= y - 1 && py < y + h + 1
              if (inner) continue
              if (px <= 0 || py <= 0 || px >= cols - 1 || py >= rows - 1) contact++
              else if (solid[idx(px, py)] || blocked[idx(px, py)]) contact++
            }
          }
          const dist = Math.hypot(x + w / 2 - cx, y + h / 2 - cy) / Math.hypot(cols, rows)
          // Growing the footprint of everything placed so far is what scatters a
          // floor; keeping it small is what packs one.
          const grown = bbox
            ? (Math.max(bbox.x2, x + w) - Math.min(bbox.x1, x)) * (Math.max(bbox.y2, y + h) - Math.min(bbox.y1, y)) -
              (bbox.x2 - bbox.x1) * (bbox.y2 - bbox.y1)
            : 0
          candidates.push({ r, score: contact - dist * 4 - (grown / (cols * rows)) * 120 + rng() * 1.5 })
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    let chosen: Rect | null = null
    for (const c of candidates.slice(0, 60)) {
      if (connected(c.r)) {
        chosen = c.r
        break
      }
    }
    if (chosen) {
      rects.push(chosen)
      fill(solid, chosen, 1)
      placed[room.key] = chosen
    } else {
      missing.push(room.key)
    }
  }

  return { placed, missing }
}

/** Blocked cells for a floor: its flights with a one-cell margin, and the door. */
export function floorBlocked(
  cols: number,
  rows: number,
  floor: number,
  flights: readonly VenueFlight[],
  door: LayoutDoor | undefined
): Set<string> {
  const out = doorClearance(cols, rows, door)
  const { up, down } = flightsOn(flights, floor)
  for (const f of [up, down]) if (f) for (const c of rectKeys(f, 1)) out.add(c)
  return out
}

/**
 * One floor, packed until everything fits: fresh shuffles first, and only if
 * none of those fits every room, the stranded room loses a cell off its longer
 * side and the floor tries again. Rooms never shrink below 3 by 3.
 */
function packFloorFully(
  args: Omit<Parameters<typeof packFloor>[0], 'rng'>,
  rng: () => number,
  tries = 30
): { placed: Record<string, Rect>; missing: string[] } {
  let rooms = args.rooms
  let best: { placed: Record<string, Rect>; missing: string[] } | null = null
  for (let shrink = 0; shrink < 6; shrink++) {
    for (let i = 0; i < tries; i++) {
      const result = packFloor({ ...args, rooms, rng })
      if (!result.missing.length) return result
      if (!best || result.missing.length < best.missing.length) best = result
    }
    const stuck = new Set(best!.missing)
    let changed = false
    rooms = rooms.map((r) => {
      if (!stuck.has(r.key)) return r
      if (r.w >= r.h && r.w > 3) {
        changed = true
        return { ...r, w: r.w - 1 }
      }
      if (r.h > 3) {
        changed = true
        return { ...r, h: r.h - 1 }
      }
      return r
    })
    if (!changed) break
  }
  return best!
}

/**
 * A whole building: flights first, then each floor packed around them. Tries a
 * few stair plans, and on each packs every floor until its rooms all fit.
 */
export function layoutBuilding(opts: {
  cols: number
  rows: number
  floors: Array<{ door?: LayoutDoor; rooms: PackRoom[] }>
  seed?: number
  attempts?: number
}): { flights: VenueFlight[]; rooms: Array<Record<string, Rect>>; missing: string[]; seed: number } {
  const attempts = opts.attempts ?? 6
  let best: ReturnType<typeof layoutBuilding> | null = null
  const base = opts.seed ?? Math.floor(Math.random() * 2 ** 31)
  for (let i = 0; i < attempts; i++) {
    const seed = base + i * 7919
    const rng = seededRandom(seed)
    const flights = planFlights({
      cols: opts.cols,
      rows: opts.rows,
      floors: opts.floors.length,
      doors: opts.floors.map((f) => f.door),
      rng,
    })
    const rooms: Array<Record<string, Rect>> = []
    const missing: string[] = []
    opts.floors.forEach((floor, index) => {
      const { up, down } = flightsOn(flights, index)
      const result = packFloorFully(
        {
          cols: opts.cols,
          rows: opts.rows,
          rooms: floor.rooms,
          blocked: floorBlocked(opts.cols, opts.rows, index, flights, floor.door),
          reach: [up, down].filter(Boolean) as Rect[],
          door: floor.door,
        },
        rng
      )
      rooms.push(result.placed)
      missing.push(...result.missing)
    })
    const attempt = { flights, rooms, missing, seed }
    if (!missing.length && flights.length === opts.floors.length - 1) return attempt
    if (!best || missing.length < best.missing.length) best = attempt
  }
  return best!
}
