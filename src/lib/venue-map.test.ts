import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAP_CONFIG,
  DOOR_WIDTH,
  autoLayout,
  buildGeometry,
  cellOwners,
  clampToFloor,
  defaultDoor,
  defaultStairs,
  doorAnchor,
  doorCells,
  floorAlpha,
  isOnStairs,
  makeProjection,
  parseCells,
  parseMapConfig,
  rectCells,
  roomAt,
  roomGeometry,
  spawnAtDoor,
  spawnPoint,
  stairsCentre,
  stepTowards,
  traceLoops,
  type FloorSide,
  type MapCell,
  type VenueMapConfig,
} from './venue-map'
import type { VenueRoom } from '../types'

function room(over: Partial<VenueRoom> = {}): VenueRoom {
  return {
    id: 'r1',
    event_id: 'e1',
    key: 'main-hall',
    name: 'Main Hall',
    kind: 'main_hall',
    description: null,
    svg_zone_id: null,
    floor: 0,
    cells: rectCells(2, 2, 4, 3),
    color: '#2A5788',
    wall_height: 1.2,
    allowed_roles: [],
    capacity: null,
    audio_mode: 'open',
    max_publishers: 12,
    recording_enabled: false,
    is_open: true,
    sponsor_name: null,
    sponsor_logo_url: null,
    sponsor_url: null,
    sort_order: 10,
    created_at: '2026-08-02T09:00:00.000Z',
    updated_at: '2026-08-02T09:00:00.000Z',
    ...over,
  } as VenueRoom
}

describe('parseCells', () => {
  it('drops malformed pairs rather than throwing', () => {
    const cells = parseCells([[1, 2], 'nope', [3], [null, 4], [5, 6]])
    expect(cells).toEqual([
      [1, 2],
      [5, 6],
    ])
  })

  // A duplicated cell would emit two boundary edges for the same side and the
  // outline walk would never close.
  it('de-duplicates', () => {
    expect(parseCells([[1, 1], [1, 1]])).toEqual([[1, 1]])
  })
})

describe('traceLoops', () => {
  it('walks a rectangle as one four-corner loop', () => {
    const loops = traceLoops(rectCells(0, 0, 2, 1))
    expect(loops).toHaveLength(1)
    expect(loops[0].outer).toHaveLength(4)
    // The inner loop is the wall's inside face, so it is strictly smaller.
    const xs = loops[0].inner.map((p) => p[0])
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(3)
  })

  // The reason rooms are cell sets and not rects: an L-shaped hall is normal.
  it('traces a non-rectangular room in one loop with six corners', () => {
    const cells: MapCell[] = [...rectCells(0, 0, 2, 0), ...rectCells(0, 1, 0, 2)]
    const loops = traceLoops(cells)
    expect(loops).toHaveLength(1)
    expect(loops[0].outer).toHaveLength(6)
  })

  it('returns nothing for an empty room', () => {
    expect(traceLoops([])).toEqual([])
  })
})

describe('roomGeometry', () => {
  it('reports a rectangle as rectangular and centres on the cells', () => {
    const geo = roomGeometry(room())!
    expect(geo.isRect).toBe(true)
    expect(geo.centroid).toEqual([3.5, 3])
    expect(geo.bbox).toEqual({ minX: 2, minY: 2, maxX: 4, maxY: 3 })
  })

  it('is null for a room that is not on the map', () => {
    expect(roomGeometry(room({ cells: [] }))).toBeNull()
  })

  // A wall height outside the DB's CHECK would render a room through the floor
  // above it, so the client clamps to the same range the column does.
  it('clamps an out-of-range wall height', () => {
    expect(roomGeometry(room({ wall_height: 99 }))!.height).toBe(3)
    expect(roomGeometry(room({ wall_height: 0 }))!.height).toBe(0.3)
  })
})

describe('cellOwners and roomAt', () => {
  const rooms = [
    room({ id: 'a', cells: rectCells(0, 0, 1, 1) }),
    room({ id: 'b', floor: 1, cells: rectCells(0, 0, 1, 1) }),
  ]
  const geometry = buildGeometry(rooms)

  it('only owns cells on its own floor', () => {
    expect(cellOwners(geometry, 0).get('0,0')).toBe('a')
    expect(cellOwners(geometry, 1).get('0,0')).toBe('b')
  })

  it('hit-tests a fractional walking position', () => {
    expect(roomAt(geometry, 0, 1.6, 0.2)?.room.id).toBe('a')
    expect(roomAt(geometry, 0, 5.5, 5.5)).toBeNull()
  })
})

describe('autoLayout', () => {
  it('places rooms that have no cells', () => {
    const laid = autoLayout([room({ id: 'a', cells: [] }), room({ id: 'b', cells: [] })], DEFAULT_MAP_CONFIG)
    expect(laid.every((r) => parseCells(r.cells).length > 0)).toBe(true)
  })

  it('leaves a drawn room exactly where it was', () => {
    const drawn = room({ id: 'a', cells: rectCells(5, 5, 6, 6) })
    const laid = autoLayout([drawn, room({ id: 'b', cells: [] })], DEFAULT_MAP_CONFIG)
    expect(laid.find((r) => r.id === 'a')!.cells).toEqual(drawn.cells)
  })

  it('never overlaps an already-drawn room', () => {
    const drawn = room({ id: 'a', cells: rectCells(1, 1, 6, 6) })
    const laid = autoLayout(
      [drawn, room({ id: 'b', cells: [] }), room({ id: 'c', cells: [] })],
      DEFAULT_MAP_CONFIG
    )
    const seen = new Set<string>()
    for (const r of laid) {
      for (const [x, y] of parseCells(r.cells)) {
        expect(seen.has(`${x},${y}`)).toBe(false)
        seen.add(`${x},${y}`)
      }
    }
  })
})

describe('walking', () => {
  it('spawns outside every room', () => {
    const geometry = buildGeometry([room({ cells: rectCells(0, 0, 20, 12) })])
    const spawn = spawnPoint(DEFAULT_MAP_CONFIG, geometry, 0)
    expect(roomAt(geometry, 0, spawn.x, spawn.y)).toBeNull()
  })

  it('keeps a walker on the slab', () => {
    const clamped = clampToFloor(DEFAULT_MAP_CONFIG, { x: -4, y: 999 })
    expect(clamped.x).toBeGreaterThan(0)
    expect(clamped.y).toBeLessThan(DEFAULT_MAP_CONFIG.rows)
  })

  it('arrives rather than overshooting', () => {
    const { pos, arrived } = stepTowards({ x: 0, y: 0 }, { x: 1, y: 0 }, 10, 1)
    expect(arrived).toBe(true)
    expect(pos).toEqual({ x: 1, y: 0 })
  })

  it('takes a partial step when the target is far', () => {
    const { pos, arrived } = stepTowards({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, 0.1)
    expect(arrived).toBe(false)
    expect(pos.x).toBeCloseTo(0.5)
  })
})

describe('projection', () => {
  // Picking a room is unproject(); drawing it is project(). If they disagree,
  // a host clicks one room and selects another.
  it.each([0, 0.5, 1])('round-trips a point at tilt %s', (tilt) => {
    const proj = makeProjection({
      cols: 28,
      rows: 18,
      tilt,
      width: 900,
      height: 600,
      zoom: { k: 1.3, px: 40, py: -25 },
      topZ: 3,
    })
    const [sx, sy] = proj.project(7.25, 11.5, 0)
    const [gx, gy] = proj.unproject(sx, sy, 0)
    expect(gx).toBeCloseTo(7.25, 6)
    expect(gy).toBeCloseTo(11.5, 6)
  })
})

describe('doors', () => {
  const cfg = DEFAULT_MAP_CONFIG

  it.each(['n', 's', 'e', 'w'] as FloorSide[])('keeps a %s door inside the grid', (side) => {
    const cells = doorCells(cfg, { side, at: side === 'n' || side === 's' ? cfg.cols - 1 : cfg.rows - 1 })
    expect(cells.length).toBeGreaterThan(0)
    for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(cfg.cols)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(cfg.rows)
    }
  })

  it('spans two cells on the edge it names', () => {
    expect(doorCells(cfg, { side: 'n', at: 4 })).toEqual([
      [4, 0],
      [5, 0],
    ])
    expect(doorCells(cfg, { side: 'w', at: 4 })).toEqual([
      [0, 4],
      [0, 5],
    ])
  })

  it('anchors just inside the wall, never outside it', () => {
    for (const side of ['n', 's', 'e', 'w'] as FloorSide[]) {
      const p = doorAnchor(cfg, { side, at: 4 })
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(cfg.cols)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(cfg.rows)
    }
  })

  // A venue drawn before doors existed must not load without a way in.
  it('gives an old venue a default entrance', () => {
    const parsed = parseMapConfig({ cols: 28, rows: 18, floors: [{ key: 'g', name: 'Ground' }] })
    expect(parsed.floors[0].door).toEqual(defaultDoor(parsed))
  })

  it('clamps a door that would hang off the end of its edge', () => {
    const parsed = parseMapConfig({
      cols: 28,
      rows: 18,
      floors: [{ key: 'g', name: 'G', door: { side: 'n', at: 999 } }],
    })
    expect(parsed.floors[0].door).toEqual({ side: 'n', at: 28 - DOOR_WIDTH })
  })

  it('spawns you at the door, outside every room', () => {
    const cfgWithDoor: VenueMapConfig = {
      ...DEFAULT_MAP_CONFIG,
      floors: [{ key: 'g', name: 'G', door: { side: 'n', at: 4 } }],
    }
    const geometry = buildGeometry([room({ cells: rectCells(10, 10, 14, 14) })])
    const spawn = spawnAtDoor(cfgWithDoor, geometry, 0)
    expect(spawn.y).toBeLessThan(1)
    expect(roomAt(geometry, 0, spawn.x, spawn.y)).toBeNull()
  })

  // A room drawn over the doorway would otherwise drop the walker inside a room
  // they never chose.
  it('falls back to open floor when a room covers the doorway', () => {
    const cfgWithDoor: VenueMapConfig = {
      ...DEFAULT_MAP_CONFIG,
      floors: [{ key: 'g', name: 'G', door: { side: 'n', at: 4 } }],
    }
    const geometry = buildGeometry([room({ cells: rectCells(0, 0, 8, 2) })])
    const spawn = spawnAtDoor(cfgWithDoor, geometry, 0)
    expect(roomAt(geometry, 0, spawn.x, spawn.y)).toBeNull()
  })
})

describe('stairs', () => {
  it('lands somewhere no floor has a room', () => {
    const rooms = [
      room({ id: 'a', cells: rectCells(20, 12, 27, 17) }),
      room({ id: 'b', floor: 1, cells: rectCells(0, 0, 6, 6) }),
    ]
    const stairs = defaultStairs(DEFAULT_MAP_CONFIG, buildGeometry(rooms))
    const geometry = buildGeometry(rooms)
    for (let dy = 0; dy < stairs.h; dy++)
      for (let dx = 0; dx < stairs.w; dx++) {
        expect(roomAt(geometry, 0, stairs.x + dx, stairs.y + dy)).toBeNull()
        expect(roomAt(geometry, 1, stairs.x + dx, stairs.y + dy)).toBeNull()
      }
  })

  it('knows when a walker is standing on it', () => {
    const stairs = { x: 4, y: 4, w: 2, h: 2 }
    expect(isOnStairs(stairs, { x: 5.5, y: 4.2 })).toBe(true)
    expect(isOnStairs(stairs, { x: 6.1, y: 4.2 })).toBe(false)
    expect(isOnStairs(undefined, { x: 5, y: 5 })).toBe(false)
    expect(stairsCentre(stairs)).toEqual({ x: 5, y: 5 })
  })

  it('survives a round trip through the stored config', () => {
    const parsed = parseMapConfig({ cols: 28, rows: 18, floors: [], stairs: { x: 3, y: 4, w: 2, h: 2 } })
    expect(parsed.stairs).toEqual({ x: 3, y: 4, w: 2, h: 2 })
  })
})

describe('floorAlpha', () => {
  // The whole point of the cross-fade: at either end exactly one floor is solid.
  it('hands the solid floor over as the mix runs', () => {
    expect(floorAlpha(0, 0, 1, 0)).toBe(1)
    expect(floorAlpha(1, 0, 1, 0)).toBeLessThan(0.2)
    expect(floorAlpha(1, 0, 1, 1)).toBe(1)
    expect(floorAlpha(0, 0, 1, 1)).toBeLessThan(0.2)
  })

  it('is monotonic in between, so nothing flickers', () => {
    let last = floorAlpha(1, 0, 1, 0)
    for (const mix of [0.2, 0.4, 0.6, 0.8, 1]) {
      const next = floorAlpha(1, 0, 1, mix)
      expect(next).toBeGreaterThanOrEqual(last)
      last = next
    }
  })

  it('leaves untouched floors ghosted throughout', () => {
    for (const mix of [0, 0.5, 1]) expect(floorAlpha(2, 0, 1, mix)).toBeLessThan(0.2)
  })

  // Flat view passes ghost = 0, which is what makes a floor change a dissolve
  // rather than a cut: nothing else is on screen to distract from the swap, and
  // the two participating levels always add up to one whole floor's worth.
  it('draws nothing but the two floors involved when the ghost is zero', () => {
    for (const mix of [0, 0.25, 0.5, 1]) {
      expect(floorAlpha(2, 0, 1, mix, 0)).toBe(0)
      expect(floorAlpha(0, 0, 1, mix, 0) + floorAlpha(1, 0, 1, mix, 0)).toBeCloseTo(1, 6)
    }
  })
})

describe('parseMapConfig', () => {
  it('falls back to one ground floor, with a way into it', () => {
    expect(parseMapConfig(null).floors).toEqual([
      { key: 'ground', name: 'Ground floor', door: { side: 's', at: 13 } },
    ])
  })

  // Out of range clamps; unreadable falls back. Both beat rendering a grid
  // with 5000 columns of hairlines in it.
  it('clamps an absurd grid and falls back on nonsense', () => {
    const clamped = parseMapConfig({ cols: 5000, rows: -3, floors: [] })
    expect(clamped.cols).toBe(64)
    expect(clamped.rows).toBe(8)
    expect(parseMapConfig({ cols: 'wide' }).cols).toBe(28)
  })
})
