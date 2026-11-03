import { describe, expect, it } from 'vitest'
import {
  FLIGHT_H,
  FLIGHT_W,
  doorClearance,
  flightsOn,
  layoutBuilding,
  packFloor,
  planFlights,
  rectKeys,
  seededRandom,
  type Rect,
} from './venue-layout'

const COLS = 28
const ROWS = 18
const DOOR = { side: 's' as const, at: 13 }

const overlap = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

const FLOORS = [
  { door: DOOR, rooms: [
    { key: 'hall', w: 9, h: 8 }, { key: 'lounge', w: 8, h: 7 }, { key: 'reg', w: 6, h: 4 },
    { key: 'help', w: 6, h: 5 }, { key: 'finder', w: 5, h: 5 }, { key: 'booth', w: 5, h: 3 }, { key: 'quiet', w: 8, h: 4 },
  ] },
  { door: DOOR, rooms: Array.from({ length: 6 }, (_, i) => ({ key: `hb${i}`, w: 6, h: 5 })).concat([{ key: 'commons', w: 4, h: 12 }]) },
  { door: DOOR, rooms: [{ key: 'workshop', w: 8, h: 6 }, { key: 'bench', w: 7, h: 6 }, { key: 'lib', w: 7, h: 6 }, { key: 'm', w: 5, h: 6 }] },
  { door: DOOR, rooms: [{ key: 'judging', w: 8, h: 7 }, { key: 'hq', w: 8, h: 7 }, { key: 'green', w: 7, h: 5 }] },
]

describe('planFlights', () => {
  it('joins every pair of floors, clear of the door', () => {
    const flights = planFlights({ cols: COLS, rows: ROWS, floors: 5, doors: Array(5).fill(DOOR), rng: seededRandom(1) })
    expect(flights.map((f) => f.from)).toEqual([0, 1, 2, 3])
    const clear = doorClearance(COLS, ROWS, DOOR)
    for (const f of flights) {
      expect(f.w).toBe(FLIGHT_W)
      expect(f.h).toBe(FLIGHT_H)
      expect(rectKeys(f).some((c) => clear.has(c))).toBe(false)
    }
  })

  it('puts the way up and the way down apart on a middle floor', () => {
    for (let seed = 1; seed < 20; seed++) {
      const flights = planFlights({ cols: COLS, rows: ROWS, floors: 4, doors: Array(4).fill(DOOR), rng: seededRandom(seed) })
      for (let floor = 1; floor < 3; floor++) {
        const { up, down } = flightsOn(flights, floor)
        expect(up && down).toBeTruthy()
        expect(overlap(up!, down!, 2)).toBe(false)
      }
    }
  })

  it('gives the ground floor only a way up and the top floor only a way down', () => {
    const flights = planFlights({ cols: COLS, rows: ROWS, floors: 3, doors: Array(3).fill(DOOR), rng: seededRandom(4) })
    expect(flightsOn(flights, 0).down).toBeNull()
    expect(flightsOn(flights, 0).up).not.toBeNull()
    expect(flightsOn(flights, 2).up).toBeNull()
    expect(flightsOn(flights, 2).down).not.toBeNull()
  })
})

describe('packFloor', () => {
  it('keeps a corridor between rooms and stays off blocked cells', () => {
    const blocked = doorClearance(COLS, ROWS, DOOR)
    const { placed, missing } = packFloor({ cols: COLS, rows: ROWS, rooms: FLOORS[0].rooms, blocked, door: DOOR, rng: seededRandom(3) })
    expect(missing).toEqual([])
    const rects = Object.values(placed)
    for (let i = 0; i < rects.length; i++) {
      expect(rectKeys(rects[i]).some((c) => blocked.has(c))).toBe(false)
      for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j], 1)).toBe(false)
    }
  })

  it('is different from one seed to the next but the same for one seed', () => {
    const run = (seed: number) =>
      JSON.stringify(packFloor({ cols: COLS, rows: ROWS, rooms: FLOORS[2].rooms, blocked: new Set(), door: DOOR, rng: seededRandom(seed) }).placed)
    expect(run(5)).toBe(run(5))
    const layouts = new Set([1, 2, 3, 4, 5, 6].map(run))
    expect(layouts.size).toBeGreaterThan(1)
  })
})

describe('layoutBuilding', () => {
  it('fits the test hackathon on every seed tried', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const result = layoutBuilding({ cols: COLS, rows: ROWS, floors: [...FLOORS, FLOORS[3]], seed })
      expect(result.missing).toEqual([])
      expect(result.flights).toHaveLength(4)
      result.rooms.forEach((rooms, floor) => {
        const { up, down } = flightsOn(result.flights, floor)
        for (const r of Object.values(rooms)) {
          for (const f of [up, down]) if (f) expect(overlap(r, f, 1)).toBe(false)
        }
      })
    }
  })
})
