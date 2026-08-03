import { describe, expect, it } from 'vitest'
import { buildDecor } from './venue-decor'
import { buildGeometry, cellKey, parseMapConfig, rectCells } from './venue-map'

const cfg = parseMapConfig({
  cols: 28,
  rows: 18,
  floors: [{ key: 'ground', name: 'Ground floor', door: { side: 's', at: 13 } }],
})

const room = (id: string, x0: number, y0: number, x1: number, y1: number) => ({
  id,
  kind: 'breakout' as const,
  cells: rectCells(x0, y0, x1, y1),
  floor: 0,
})

describe('buildDecor', () => {
  const rooms = [room('a', 4, 3, 9, 7), room('b', 16, 10, 21, 14)]
  const geometry = buildGeometry(rooms)

  it('is deterministic for the same venue', () => {
    expect(buildDecor(cfg, geometry)).toEqual(buildDecor(cfg, geometry))
  })

  it('paves a network and carves one doorway per connected room end', () => {
    const decor = buildDecor(cfg, geometry)
    expect(decor.paveByFloor[0].length).toBeGreaterThan(0)
    // Both rooms are reachable, so both got at least one doorway.
    expect(decor.openings['a']?.length).toBeGreaterThan(0)
    expect(decor.openings['b']?.length).toBeGreaterThan(0)
    // Every doorway names a cell the room actually owns.
    for (const [id, list] of Object.entries(decor.openings)) {
      const owned = new Set(geometry[id].cells.map(([x, y]) => cellKey(x, y)))
      for (const o of list) expect(owned.has(cellKey(o.x, o.y))).toBe(true)
    }
  })

  it('never paves or plants inside a room', () => {
    const decor = buildDecor(cfg, geometry)
    const owned = new Set(rooms.flatMap((r) => r.cells.map(([x, y]) => cellKey(x, y))))
    for (const [x, y] of decor.paveByFloor[0]) {
      expect(owned.has(cellKey(x, y))).toBe(false)
    }
    for (const t of decor.trees) {
      expect(owned.has(cellKey(Math.floor(t.x), Math.floor(t.y)))).toBe(false)
    }
  })
})
