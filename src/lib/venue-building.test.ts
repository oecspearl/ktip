import { describe, expect, it } from 'vitest'
import { planRoomInputs, planScratch, planTemplate } from './venue-building'
import { VENUE_TEMPLATES, isLaidOut, templateById, templateSize } from './venue-templates'
import { presetByKey } from './venue-room-presets'
import { flightsOn, rectKeys } from './venue-layout'
import { cellKey, parseMapConfig } from './venue-map'

const SEEDS = [1, 42, 1234, 99991, 2 ** 30 + 7]
const LAID_OUT = VENUE_TEMPLATES.filter(isLaidOut)

describe('laid-out templates', () => {
  it('offers several multi-floor buildings', () => {
    expect(LAID_OUT.length).toBeGreaterThanOrEqual(4)
    expect(LAID_OUT.some((t) => (t.floors?.length ?? 0) >= 5)).toBe(true)
  })

  it('only ever names presets that exist', () => {
    for (const template of LAID_OUT) {
      for (const floor of template.floors!) {
        for (const room of floor.rooms) {
          expect(presetByKey(room.preset), `${template.id}: ${room.preset}`).toBeTruthy()
        }
      }
    }
  })

  for (const template of LAID_OUT) {
    describe(template.id, () => {
      for (const seed of SEEDS) {
        it(`lays out every room with seed ${seed}`, () => {
          const plan = planTemplate(template, seed)
          const size = templateSize(template)

          expect(plan.missing, `missing on ${template.id}`).toEqual([])
          expect(plan.rooms).toHaveLength(size.rooms)
          expect(plan.rooms.every((r) => r.rect)).toBe(true)
          expect(plan.config.floors).toHaveLength(size.floors)
          expect(plan.config.flights ?? []).toHaveLength(size.floors - 1)
        })
      }

      it('puts each room on the floor the template names', () => {
        const plan = planTemplate(template, 7)
        let i = 0
        template.floors!.forEach((floor, index) => {
          for (const entry of floor.rooms) {
            const room = plan.rooms[i++]
            expect(room.floor).toBe(index)
            expect(room.preset.key).toBe(entry.preset)
            // The layout may turn a room, never resize it.
            const { w, h } = room.rect!
            expect([w, h].sort()).toEqual([entry.w, entry.h].sort())
          }
        })
      })

      it('never overlaps two rooms or a room and a flight', () => {
        const plan = planTemplate(template, 3)
        const flights = plan.config.flights ?? []
        plan.config.floors.forEach((_, index) => {
          const seen = new Set<string>()
          const { up, down } = flightsOn(flights, index)
          for (const f of [up, down]) if (f) for (const c of rectKeys(f)) seen.add(c)
          for (const room of plan.rooms.filter((r) => r.floor === index)) {
            for (const c of rectKeys(room.rect!)) {
              expect(seen.has(c), `${template.id} floor ${index} at ${c}`).toBe(false)
              seen.add(c)
            }
          }
        })
      })
    })
  }

  it('gives a different floorplan for a different seed, and the same one for the same seed', () => {
    const tower = templateById('hackathon-tower')!
    const a = planTemplate(tower, 11)
    const b = planTemplate(tower, 11)
    const c = planTemplate(tower, 12)
    expect(b.rooms.map((r) => r.rect)).toEqual(a.rooms.map((r) => r.rect))
    expect(c.rooms.map((r) => r.rect)).not.toEqual(a.rooms.map((r) => r.rect))
  })

  it('gives every room a unique key', () => {
    for (const template of VENUE_TEMPLATES) {
      const keys = planTemplate(template, 5).rooms.map((r) => r.key)
      expect(new Set(keys).size, template.id).toBe(keys.length)
    }
  })
})

describe('fixed templates', () => {
  it('keep their rects and stay on one floor', () => {
    const hq = templateById('hackathon-hq')!
    const plan = planTemplate(hq, 1)
    expect(plan.config.floors).toHaveLength(1)
    expect(plan.config.flights).toBeUndefined()
    expect(plan.rooms[0].rect).toEqual({ x: 2, y: 2, w: 8, h: 6 })
    expect(planTemplate(hq, 2).rooms.map((r) => r.rect)).toEqual(plan.rooms.map((r) => r.rect))
  })
})

describe('from scratch', () => {
  for (const floors of [1, 2, 3, 4, 5]) {
    it(`builds ${floors} empty floor(s) with doors and ${floors - 1} flight(s)`, () => {
      for (const seed of SEEDS) {
        const plan = planScratch(floors, seed)
        expect(plan.rooms).toEqual([])
        expect(plan.config.floors).toHaveLength(floors)
        expect(plan.config.floors.every((f) => f.door)).toBe(true)
        expect(plan.config.flights ?? []).toHaveLength(floors - 1)
      }
    })
  }

  it('clamps the floor count to 1 to 5', () => {
    expect(planScratch(0, 1).config.floors).toHaveLength(1)
    expect(planScratch(9, 1).config.floors).toHaveLength(5)
  })
})

describe('what gets saved', () => {
  it('turns a plan into room inputs that survive the map parser', () => {
    const plan = planTemplate(templateById('hackathon-tower')!, 21)
    const inputs = planRoomInputs(plan, (d) => d.message ?? d.id)
    expect(inputs).toHaveLength(plan.rooms.length)
    for (const [i, input] of inputs.entries()) {
      const room = plan.rooms[i]
      expect(input.floor).toBe(room.floor)
      expect(input.cells).toHaveLength(room.rect!.w * room.rect!.h)
      expect(input.kind).toBe(room.preset.kind)
      expect(input.sort_order).toBe(i * 10)
    }
    // The saved map round-trips: floors, doors and flights all kept.
    const parsed = parseMapConfig(JSON.parse(JSON.stringify(plan.config)))
    expect(parsed.floors.map((f) => f.name)).toEqual(plan.config.floors.map((f) => f.name))
    expect(parsed.flights).toEqual(plan.config.flights)
  })

  it('adds the extra panels a renamed room needs', () => {
    const plan = planTemplate(templateById('hackathon-tower')!, 4)
    const commons = plan.rooms.find((r) => r.name === 'Collab Commons')!
    expect(commons.sections.map((s) => s.id)).toContain('collab_commons')
    // The kind's own panels are kept, not replaced by the one extra.
    expect(commons.sections.map((s) => s.id)).toContain('chat')
    const desk = plan.rooms.find((r) => r.name === 'Submission Desk')!
    expect(desk.sections.map((s) => s.id)).toContain('submission_desk')
  })

  it('writes no cells twice on one floor', () => {
    for (const template of LAID_OUT) {
      const inputs = planRoomInputs(planTemplate(template, 8), (d) => d.id)
      const seen = new Set<string>()
      for (const input of inputs) {
        for (const [x, y] of input.cells) {
          const k = `${input.floor}:${cellKey(x, y)}`
          expect(seen.has(k), `${template.id} ${k}`).toBe(false)
          seen.add(k)
        }
      }
    }
  })
})
