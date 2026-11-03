/**
 * Turning a template (or "from scratch") into a whole building: the map config
 * with its floors, doors and stair flights, and every room with its cells.
 *
 * Pure, so the create-event form, the venue editor and the tests all build the
 * same venue from the same template and seed. The layout itself is
 * venue-layout.ts; this file only decides what goes in and what comes out.
 */

import type { MessageDescriptor } from '@lingui/core'
import { layoutBuilding, planFlights, rectKeys, type Rect } from './venue-layout'
import {
  VENUE_MAP,
  defaultDoor,
  floorLabel,
  rectCells,
  type VenueMapConfig,
  type VenueMapFloor,
} from './venue-map'
import {
  presetByKey,
  roomKeyFrom,
  uniqueRoomKey,
  type VenueRoomPreset,
} from './venue-room-presets'
import { toggleSection, type RoomSectionId, type RoomSectionSetting } from './venue-room-sections'
import type { FurniturePreset } from './venue-furniture'
import { templateById, templatesForType, type VenueTemplate } from './venue-templates'
import type { VenueMapRoomInput } from '../hooks/useVenueMap'

/** Floors a host can start from scratch with. */
export const SCRATCH_MIN_FLOORS = 1
export const SCRATCH_MAX_FLOORS = 5

/** One room of a planned building. */
export interface PlannedRoom {
  key: string
  name: string
  preset: VenueRoomPreset
  floor: number
  /** Where it landed. Null when it did not fit; it is then saved off the map. */
  rect: Rect | null
  /** Overrides the preset's description. */
  description?: MessageDescriptor
  furniture: FurniturePreset
  sections: RoomSectionSetting[]
}

export interface BuildingPlan {
  config: VenueMapConfig
  rooms: PlannedRoom[]
  /** Keys of rooms that did not fit. Empty for every built-in template. */
  missing: string[]
  /** The seed the layout used. Fixed templates ignore it. */
  seed: number
}

/** A fresh random seed, in the range layoutBuilding uses. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

const GRID = { cols: VENUE_MAP.COLS, rows: VENUE_MAP.ROWS }

function floorsOf(names: string[]): VenueMapFloor[] {
  return names.map((name, i) => ({
    key: i === 0 ? 'ground' : `floor-${i}`,
    name,
    door: defaultDoor(GRID),
  }))
}

/** The preset's panels plus the extras, written out as one complete list. */
function sectionsFor(preset: VenueRoomPreset, extra: readonly RoomSectionId[] = []): RoomSectionSetting[] {
  let sections: RoomSectionSetting[] = (preset.sections ?? []).map((id) => ({ id }))
  for (const id of extra) {
    sections = toggleSection({ kind: preset.kind, sections }, id, true)
  }
  return sections
}

/**
 * A template as a building. Laid-out templates go through layoutBuilding with
 * `seed`, so the same seed gives the same floorplan. Fixed templates keep their
 * rects and ignore the seed.
 */
export function planTemplate(template: VenueTemplate, seed: number = randomSeed()): BuildingPlan {
  const keys: string[] = []
  const nextKey = (name: string | undefined, preset: VenueRoomPreset) => {
    const key = uniqueRoomKey(name ? roomKeyFrom(name) : preset.key, keys)
    keys.push(key)
    return key
  }

  if (template.floors?.length) {
    const floors = floorsOf(template.floors.map((f) => f.name))
    const rooms: PlannedRoom[] = []
    const sizes = new Map<string, { w: number; h: number }>()
    template.floors.forEach((floor, index) => {
      for (const entry of floor.rooms) {
        const preset = presetByKey(entry.preset)
        if (!preset) continue
        const key = nextKey(entry.name, preset)
        sizes.set(key, { w: entry.w, h: entry.h })
        rooms.push({
          key,
          name: entry.name ?? preset.name,
          preset,
          floor: index,
          rect: null,
          description: entry.description,
          furniture: entry.furniture ?? preset.furniture,
          sections: sectionsFor(preset, entry.addSections),
        })
      }
    })

    const layout = layoutBuilding({
      ...GRID,
      seed,
      floors: floors.map((f, index) => ({
        door: f.door,
        rooms: rooms
          .filter((r) => r.floor === index)
          .map((r) => ({ key: r.key, ...sizes.get(r.key)! })),
      })),
    })
    for (const room of rooms) room.rect = layout.rooms[room.floor]?.[room.key] ?? null

    return {
      config: {
        v: 1,
        ...GRID,
        floors,
        ...(layout.flights.length ? { flights: layout.flights } : {}),
      },
      rooms,
      missing: layout.missing,
      seed: layout.seed,
    }
  }

  // Fixed rects.
  const count = Math.max(1, ...template.rooms.map((r) => (r.floor ?? 0) + 1))
  const floors = floorsOf(Array.from({ length: count }, (_, i) => floorLabel(i)))
  const rooms: PlannedRoom[] = []
  for (const entry of template.rooms) {
    const preset = presetByKey(entry.preset)
    if (!preset) continue
    const [x1, y1, x2, y2] = entry.rect
    rooms.push({
      key: nextKey(entry.name, preset),
      name: entry.name ?? preset.name,
      preset,
      floor: entry.floor ?? 0,
      rect: { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 },
      furniture: preset.furniture,
      sections: sectionsFor(preset),
    })
  }
  let flights: VenueMapConfig['flights']
  if (count > 1) {
    const taken = floors.map(() => new Set<string>())
    for (const r of rooms) if (r.rect) for (const c of rectKeys(r.rect)) taken[r.floor].add(c)
    flights = planFlights({ ...GRID, floors: count, doors: floors.map((f) => f.door), taken })
  }
  return {
    config: { v: 1, ...GRID, floors, ...(flights?.length ? { flights } : {}) },
    rooms,
    missing: [],
    seed,
  }
}

/** Empty floors with a door each and stairs between them, ready to draw on. */
export function planScratch(floorCount: number, seed: number = randomSeed()): BuildingPlan {
  const count = Math.max(
    SCRATCH_MIN_FLOORS,
    Math.min(SCRATCH_MAX_FLOORS, Math.trunc(floorCount) || SCRATCH_MIN_FLOORS)
  )
  const floors = floorsOf(Array.from({ length: count }, (_, i) => floorLabel(i)))
  const layout = layoutBuilding({
    ...GRID,
    seed,
    floors: floors.map((f) => ({ door: f.door, rooms: [] })),
  })
  return {
    config: {
      v: 1,
      ...GRID,
      floors,
      ...(layout.flights.length ? { flights: layout.flights } : {}),
    },
    rooms: [],
    missing: layout.missing,
    seed: layout.seed,
  }
}

/** The rooms of a plan as save_venue_map wants them. */
export function planRoomInputs(
  plan: BuildingPlan,
  translate: (descriptor: MessageDescriptor) => string
): VenueMapRoomInput[] {
  return plan.rooms.map((room, index) => {
    const { preset, rect } = room
    return {
      key: room.key,
      name: room.name,
      kind: preset.kind,
      description: translate(room.description ?? preset.description) || null,
      capacity: preset.capacity,
      audio_mode: preset.audio_mode,
      recording_enabled: preset.recording_enabled,
      is_open: true,
      sort_order: index * 10,
      floor: room.floor,
      cells: rect ? rectCells(rect.x, rect.y, rect.x + rect.w - 1, rect.y + rect.h - 1) : [],
      color: preset.color,
      wall_height: preset.wall_height,
      allowed_roles: [...preset.allowed_roles],
      sections: room.sections,
      furniture: room.furniture,
    }
  })
}

/** The "from scratch" choice, next to the template ids. */
export const SCRATCH_BUILDING = 'scratch'

/** The choice to start on: the first building suggested for this event type. */
export function defaultBuildingFor(eventType: string | null | undefined): string {
  return templatesForType(eventType)[0]?.id ?? SCRATCH_BUILDING
}

/**
 * The building a choice stands for, laid out with `seed`. An unknown id (a
 * template removed since the draft was saved) falls back to the default.
 */
export function planBuilding(
  choice: string,
  scratchFloors: number,
  seed: number,
  eventType: string | null | undefined
): BuildingPlan {
  if (choice === SCRATCH_BUILDING) return planScratch(scratchFloors, seed)
  const template = templateById(choice) ?? templateById(defaultBuildingFor(eventType))
  return template ? planTemplate(template, seed) : planScratch(1, seed)
}
