import { describe, expect, it } from 'vitest'
import { VENUE_TEMPLATES, templateById, templatesForType } from './venue-templates'
import { STARTER_LAYOUT, presetByKey } from './venue-room-presets'
import { VENUE_MAP } from './venue-map'

describe('the template gallery', () => {
  it('has no duplicate ids', () => {
    expect(new Set(VENUE_TEMPLATES.map((t) => t.id)).size).toBe(VENUE_TEMPLATES.length)
  })

  it('only ever places presets that exist', () => {
    for (const template of VENUE_TEMPLATES) {
      for (const entry of template.rooms) {
        expect(presetByKey(entry.preset), `${template.id} places unknown preset ${entry.preset}`).toBeTruthy()
      }
    }
  })

  it('keeps every rect inside the default grid', () => {
    for (const template of VENUE_TEMPLATES) {
      for (const entry of template.rooms) {
        const [x1, y1, x2, y2] = entry.rect
        expect(x1, `${template.id}`).toBeGreaterThanOrEqual(0)
        expect(y1, `${template.id}`).toBeGreaterThanOrEqual(0)
        expect(x2, `${template.id}`).toBeLessThan(VENUE_MAP.COLS)
        expect(y2, `${template.id}`).toBeLessThan(VENUE_MAP.ROWS)
        expect(x1).toBeLessThanOrEqual(x2)
        expect(y1).toBeLessThanOrEqual(y2)
      }
    }
  })

  it('never overlaps two rooms on the same floor', () => {
    for (const template of VENUE_TEMPLATES) {
      const seen = new Set<string>()
      for (const entry of template.rooms) {
        const floor = entry.floor ?? 0
        const [x1, y1, x2, y2] = entry.rect
        for (let x = x1; x <= x2; x++) {
          for (let y = y1; y <= y2; y++) {
            const key = `${floor}:${x},${y}`
            expect(seen.has(key), `${template.id} overlaps at ${key}`).toBe(false)
            seen.add(key)
          }
        }
      }
    }
  })

  it('hackathon-hq is STARTER_LAYOUT — the SQL seed parity promise holds', () => {
    // seed_default_venue_rooms() (070) and STARTER_LAYOUT are documented twins;
    // the template must be the same building again, not a third copy to drift.
    expect(templateById('hackathon-hq')!.rooms).toEqual(
      STARTER_LAYOUT.map((entry) => ({ preset: entry.preset, rect: entry.rect }))
    )
  })

  it('puts the suggested building first for each type, without filtering any out', () => {
    expect(templatesForType('conference')[0].id).toBe('conference-center')
    expect(templatesForType('hackathon')[0].id).toBe('hackathon-hq')
    expect(templatesForType('workshop')[0].id).toBe('workshop-studio')
    for (const type of ['conference', 'hackathon', null, 'symposium']) {
      expect(templatesForType(type)).toHaveLength(VENUE_TEMPLATES.length)
    }
  })
})
