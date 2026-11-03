/**
 * Furniture for the 2.5D venue map.
 *
 * A room on the map used to be a coloured floor with walls round it. That says
 * "there is a room here" and nothing about what happens inside. A stage with
 * rows of seats, a chalkboard over desks, a desk cluster under a video wall:
 * those say what the room is for before anyone reads its name.
 *
 * Pure module, no React. Placement is derived from the room's own cells and
 * wall height, so nothing about furniture is stored except which preset a room
 * uses (venue_rooms.furniture, migration 188). A host who redraws a room gets
 * the furniture re-laid for its new shape, and every attendee sees the same
 * layout.
 *
 * Pieces come in two shapes:
 *   box    a solid block standing on the floor (table, stage, seat, shelf)
 *   panel  a flat rectangle on a vertical plane (chalkboard, screen, monitor)
 * The stage renderer owns colour and projection; this file owns only where
 * things go.
 */

import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { VenueRoomKind } from '../types'
import { VENUE_MAP, cellKey, type MapCell } from './venue-map'

export const FURNITURE_PRESETS = [
  'theatre',
  'stage',
  'cafe',
  'classroom',
  'counter',
  'booth',
  'homebase',
  'panel',
  'lounge',
  'podium',
  'ops',
  'library',
  'bench',
  'none',
] as const

export type FurniturePreset = (typeof FURNITURE_PRESETS)[number]

/** What the host sees in the editor's Furniture picker. */
export const FURNITURE_LABELS: Record<FurniturePreset, MessageDescriptor> = {
  theatre: msg`Stage and screen facing rows of seats`,
  stage: msg`Demo stage with a big screen and risers`,
  cafe: msg`Café tables and a coffee bar`,
  classroom: msg`Chalkboard and desks`,
  counter: msg`Service counter`,
  booth: msg`Sponsor banner and counter`,
  homebase: msg`Team Homebase with a video wall and boards`,
  panel: msg`Judges' panel desk and screens`,
  lounge: msg`Sofas and beanbags`,
  podium: msg`Leaderboard and podium`,
  ops: msg`Ops desks and a dashboard`,
  library: msg`Bookshelves and a reading table`,
  bench: msg`Workbenches`,
  none: msg`Empty room`,
}

/** A stored preset, or null for "follow the room's type". */
export function parseFurniture(raw: unknown): FurniturePreset | null {
  return isFurniturePreset(raw) ? raw : null
}

/** What each kind gets when the host has not picked a preset. */
const KIND_DEFAULT: Record<VenueRoomKind, FurniturePreset> = {
  main_hall: 'theatre',
  networking: 'cafe',
  workshop: 'classroom',
  help_desk: 'counter',
  sponsor_booth: 'booth',
  team: 'homebase',
  judging: 'panel',
  stage: 'stage',
  breakout: 'lounge',
}

export function isFurniturePreset(v: unknown): v is FurniturePreset {
  return typeof v === 'string' && (FURNITURE_PRESETS as readonly string[]).includes(v)
}

/** The preset a room actually renders with. Unknown or empty → its kind's default. */
export function furnitureFor(room: { kind: string; furniture?: string | null }): FurniturePreset {
  if (isFurniturePreset(room.furniture)) return room.furniture
  return KIND_DEFAULT[room.kind as VenueRoomKind] ?? 'none'
}

/**
 * What a team can switch on or off in its Homebase (migration 188 accepts
 * exactly these keys). Wall items share the walls; floor items have their own
 * spots, so switching one off leaves a gap rather than reshuffling the room.
 */
export const HOMEBASE_ITEMS = [
  'video',
  'kanban',
  'whiteboard',
  'banner',
  'mural',
  'desks',
  'sofa',
  'beanbags',
  'coffee',
  'shelf',
  'plants',
  'rug',
] as const
export type HomebaseItem = (typeof HOMEBASE_ITEMS)[number]

export const HOMEBASE_DEFAULT_ITEMS: Record<HomebaseItem, boolean> = {
  video: true,
  kanban: true,
  whiteboard: true,
  banner: false,
  mural: false,
  desks: true,
  sofa: true,
  beanbags: false,
  coffee: false,
  shelf: false,
  plants: true,
  rug: false,
}

/** venue_rooms.decor, parsed. Everything optional: an empty object is the default look. */
export interface RoomDecor {
  color?: string
  items?: Partial<Record<HomebaseItem, boolean>>
  logo_path?: string
  mural_path?: string
}

export function parseDecor(raw: unknown): RoomDecor {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const out: RoomDecor = {}
  if (typeof r.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r.color)) out.color = r.color
  if (r.items && typeof r.items === 'object' && !Array.isArray(r.items)) {
    const items: Partial<Record<HomebaseItem, boolean>> = {}
    for (const k of HOMEBASE_ITEMS) {
      const v = (r.items as Record<string, unknown>)[k]
      if (typeof v === 'boolean') items[k] = v
    }
    out.items = items
  }
  if (typeof r.logo_path === 'string' && r.logo_path) out.logo_path = r.logo_path
  if (typeof r.mural_path === 'string' && r.mural_path) out.mural_path = r.mural_path
  return out
}

/** Effective on/off for every item: the team's choice over the default. */
export function homebaseItems(decor: RoomDecor): Record<HomebaseItem, boolean> {
  return { ...HOMEBASE_DEFAULT_ITEMS, ...(decor.items || {}) }
}

export type FurnitureTone = 'wood' | 'soft' | 'lit' | 'dark' | 'metal' | 'accent' | 'light' | 'plant'

export interface FurnitureBox {
  type: 'box'
  x: number
  y: number
  w: number
  d: number
  /** Bottom of the block, above the floor. */
  z: number
  h: number
  tone: FurnitureTone
}

export type PanelArt =
  | 'chalkboard'
  | 'whiteboard'
  | 'kanban'
  | 'video'
  | 'slides'
  | 'dashboard'
  | 'banner'
  | 'leaderboard'
  | 'monitor'
  | 'mural'

/** A flat image or colour on the floor: the team rug. */
export interface FurnitureRug {
  type: 'rug'
  x: number
  y: number
  w: number
  d: number
  /** Draw the room's logo on it when there is one. */
  image: 'logo' | null
}

export interface FurniturePanel {
  type: 'panel'
  /** Uploaded image drawn on this panel instead of (banner) or as (mural) its art. */
  image?: 'logo' | 'mural'
  /**
   * 'xz' stands on a line of constant y and faces south (+y): a north wall, or
   * a monitor on a desk. 'yz' stands on a line of constant x and faces east
   * (+x): a west wall. Those are the only two faces the camera can see.
   */
  plane: 'xz' | 'yz'
  at: number
  a0: number
  a1: number
  z0: number
  z1: number
  art: PanelArt
}

export type FurniturePiece = (FurnitureBox | FurniturePanel | FurnitureRug) & {
  /** Painter's-algorithm key, back to front. */
  depth: number
}

export interface CellRect {
  x0: number
  y0: number
  /** Exclusive: x1 - x0 is the width in cells. */
  x1: number
  y1: number
}

/**
 * Largest axis-aligned rectangle made only of the room's cells.
 *
 * Furniture is laid out in a rectangle, and an L-shaped hall's biggest
 * rectangle is where its seats belong; the alcove stays clear. Histogram
 * method, O(cells in the bounding box).
 */
export function largestRect(cells: MapCell[]): CellRect | null {
  if (!cells.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of cells) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const have = new Set(cells.map(([x, y]) => cellKey(x, y)))
  const cols = maxX - minX + 1
  const heights = new Array<number>(cols).fill(0)
  let best: CellRect | null = null
  let bestArea = 0

  for (let y = minY; y <= maxY; y++) {
    for (let i = 0; i < cols; i++) heights[i] = have.has(cellKey(minX + i, y)) ? heights[i] + 1 : 0
    // Largest rectangle under this row's histogram.
    const stack: number[] = []
    for (let i = 0; i <= cols; i++) {
      const h = i === cols ? 0 : heights[i]
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!
        const height = heights[top]
        const left = stack.length ? stack[stack.length - 1] + 1 : 0
        const width = i - left
        const area = width * height
        if (height > 0 && area > bestArea) {
          bestArea = area
          best = { x0: minX + left, x1: minX + i, y0: y - height + 1, y1: y + 1 }
        }
      }
      stack.push(i)
    }
  }
  return best
}

/** Hard cap so a huge hall cannot blow up the SVG. */
const MAX_PIECES = 140

/**
 * Lay out a room's furniture.
 *
 * Every size here is in cells (horizontal) and wall-height units (vertical),
 * the same units the walls use, so a piece sits in proportion to the room it
 * is in at every zoom and tilt.
 */
export function furnish(
  room: { cells: MapCell[]; height: number },
  preset: FurniturePreset,
  decor: RoomDecor = {}
): FurniturePiece[] {
  if (preset === 'none') return []
  const rect = largestRect(room.cells)
  if (!rect) return []

  const T = VENUE_MAP.WALL_T
  const H = room.height
  const m = 0.35
  const ix0 = rect.x0 + m
  const iy0 = rect.y0 + m
  const ix1 = rect.x1 - m
  const iy1 = rect.y1 - m
  const W = ix1 - ix0
  const D = iy1 - iy0
  const cx = (ix0 + ix1) / 2
  const cy = (iy0 + iy1) / 2
  if (W < 0.6 || D < 0.6) return []

  const northY = rect.y0 + T + 0.02
  const westX = rect.x0 + T + 0.02
  // Boards hang at a sensible height on any wall: low walls get smaller ones.
  const bz0 = Math.min(0.28, H * 0.28)
  const bz1 = Math.max(bz0 + 0.2, Math.min(H - 0.08, bz0 + Math.max(0.36, H * 0.52)))

  const out: FurniturePiece[] = []
  const box = (x: number, y: number, w: number, d: number, h: number, tone: FurnitureTone, z = 0) => {
    if (w <= 0.05 || d <= 0.05) return
    // Clamp into the room so a small room squeezes rather than overflows.
    const x0 = Math.max(rect.x0 + T, x)
    const y0 = Math.max(rect.y0 + T, y)
    const x1 = Math.min(rect.x1 - T, x + w)
    const y1 = Math.min(rect.y1 - T, y + d)
    if (x1 - x0 <= 0.05 || y1 - y0 <= 0.05) return
    out.push({
      type: 'box',
      x: x0,
      y: y0,
      w: x1 - x0,
      d: y1 - y0,
      z,
      h,
      tone,
      depth: (x0 + x1) / 2 + (y0 + y1) / 2,
    })
  }
  const imageFor = (art: PanelArt): FurniturePanel['image'] =>
    art === 'banner' && decor.logo_path ? 'logo' : art === 'mural' && decor.mural_path ? 'mural' : undefined
  const north = (a0: number, a1: number, art: PanelArt, z0 = bz0, z1 = bz1) => {
    const lo = Math.max(rect.x0 + T + 0.05, a0)
    const hi = Math.min(rect.x1 - T - 0.05, a1)
    if (hi - lo < 0.3) return
    out.push({ type: 'panel', plane: 'xz', at: northY, a0: lo, a1: hi, z0, z1, art, image: imageFor(art), depth: -1000 + lo })
  }
  const west = (a0: number, a1: number, art: PanelArt, z0 = bz0, z1 = bz1) => {
    const lo = Math.max(rect.y0 + T + 0.05, a0)
    const hi = Math.min(rect.y1 - T - 0.05, a1)
    if (hi - lo < 0.3) return
    out.push({ type: 'panel', plane: 'yz', at: westX, a0: lo, a1: hi, z0, z1, art, image: imageFor(art), depth: -1000 + lo })
  }
  /** Share a wall evenly between several pieces, in order. */
  const spread = (wall: typeof north, from: number, to: number, arts: PanelArt[]) => {
    if (!arts.length) return
    const step = (to - from) / arts.length
    arts.forEach((art, i) => wall(from + step * i + 0.06, from + step * (i + 1) - 0.06, art))
  }
  const rug = (x: number, y: number, w: number, d: number) => {
    out.push({ type: 'rug', x, y, w, d, image: decor.logo_path ? 'logo' : null, depth: -500 })
  }
  /** A monitor standing on a desk top, facing the camera. */
  const monitor = (x: number, y: number, w: number, deskTop: number, deskDepth: number) => {
    out.push({
      type: 'panel',
      plane: 'xz',
      at: y,
      a0: x,
      a1: x + w,
      z0: deskTop,
      z1: deskTop + 0.2,
      art: 'monitor',
      // Just in front of the desk it stands on, so the desk top never paints
      // over its base.
      depth: deskDepth + 0.02,
    })
  }
  const chair = (x: number, y: number) => box(x, y, 0.3, 0.3, 0.16, 'soft')

  switch (preset) {
    case 'theatre': {
      const stageD = Math.max(0.8, Math.min(1.8, D * 0.25))
      box(ix0, iy0, W, stageD, 0.18, 'wood')
      box(cx - 0.18, iy0 + stageD - 0.55, 0.36, 0.28, 0.3, 'dark', 0.18)
      north(ix0 + W * 0.18, ix1 - W * 0.18, 'slides', Math.max(bz0, 0.32), Math.max(bz1, Math.min(H - 0.06, 1.3)))
      for (let y = iy0 + stageD + 0.6; y + 0.4 <= iy1; y += 0.85) {
        for (let x = ix0 + 0.15; x + 0.45 <= ix1; x += 0.7) {
          if (Math.abs(x + 0.22 - cx) < 0.42) continue // centre aisle
          box(x, y, 0.45, 0.4, 0.15, 'soft')
        }
      }
      break
    }
    case 'stage': {
      const stageD = Math.max(0.8, Math.min(1.6, D * 0.3))
      box(ix0, iy0, W, stageD, 0.22, 'dark')
      box(ix0 + 0.1, iy0 + stageD - 0.12, W - 0.2, 0.08, 0.02, 'lit', 0.22)
      north(ix0 + W * 0.12, ix1 - W * 0.12, 'video', Math.max(bz0, 0.35), Math.max(bz1, Math.min(H - 0.06, 1.45)))
      // Risers climbing toward the back of the audience.
      const rows = Math.max(1, Math.min(3, Math.floor((D - stageD - 0.6) / 0.75)))
      for (let i = 0; i < rows; i++) {
        const y = iy0 + stageD + 0.7 + i * 0.75
        box(ix0 + 0.2, y, W - 0.4, 0.6, 0.1 + 0.09 * i, 'soft')
      }
      break
    }
    case 'cafe': {
      box(ix0, iy0, Math.min(2.6, W * 0.45), 0.45, 0.36, 'lit')
      for (let y = iy0 + 1.1; y + 1 <= iy1; y += 2) {
        for (let x = ix0 + 0.35; x + 1 <= ix1; x += 2) {
          box(x + 0.15, y + 0.15, 0.75, 0.75, 0.28, 'wood')
          chair(x - 0.25, y + 0.38)
          chair(x + 0.98, y + 0.38)
          chair(x + 0.38, y - 0.25)
          chair(x + 0.38, y + 0.98)
        }
      }
      box(ix1 - 0.4, iy1 - 0.4, 0.32, 0.32, 0.5, 'plant')
      break
    }
    case 'classroom': {
      north(ix0 + 0.3, ix1 - 0.3, 'chalkboard')
      box(cx - 0.55, iy0 + 0.35, 1.1, 0.5, 0.3, 'wood')
      for (let y = iy0 + 1.5; y + 0.9 <= iy1; y += 1.05) {
        for (let x = ix0 + 0.1; x + 0.8 <= ix1; x += 1.1) {
          box(x, y, 0.8, 0.42, 0.27, 'wood')
          box(x + 0.25, y + 0.5, 0.3, 0.28, 0.15, 'soft')
        }
      }
      break
    }
    case 'counter': {
      const len = Math.min(W - 0.4, 2.8)
      box(ix0 + 0.2, iy0 + 0.55, len, 0.5, 0.42, 'lit')
      box(ix0 + 0.2, iy0 + 1.05, 0.5, Math.min(D - 1.3, 1.2), 0.42, 'lit')
      monitor(ix0 + 0.9, iy0 + 0.72, 0.5, 0.42, ix0 + 1.15 + iy0 + 0.8)
      chair(ix0 + 1.0, iy0 + 1.35)
      chair(ix0 + 1.7, iy0 + 1.35)
      north(ix1 - Math.min(1.6, W * 0.45), ix1 - 0.1, 'whiteboard')
      box(ix1 - 0.4, iy1 - 0.4, 0.32, 0.32, 0.5, 'plant')
      break
    }
    case 'booth': {
      north(ix0 + 0.1, ix1 - 0.1, 'banner')
      const cw = Math.min(W - 0.4, 2)
      box(cx - cw / 2, iy0 + D * 0.5, cw, 0.5, 0.4, 'accent')
      box(ix0 + 0.15, iy0 + 0.4, 0.42, 0.42, 0.55, 'dark')
      monitor(ix0 + 0.12, iy0 + 0.6, 0.48, 0.55, ix0 + 0.36 + iy0 + 0.61)
      break
    }
    case 'homebase': {
      // A team's own room: call on the wall, the plan on the boards, people at
      // the desks. The busiest preset on purpose, and the one a team decorates.
      const on = homebaseItems(decor)
      // Wall pieces in order of importance. The north wall is the one the
      // camera sees best, so it takes the first two; the west wall the rest.
      const wallArts: PanelArt[] = []
      if (on.video) wallArts.push('video')
      if (on.banner) wallArts.push('banner')
      if (on.kanban) wallArts.push('kanban')
      if (on.whiteboard) wallArts.push('whiteboard')
      if (on.mural) wallArts.push('mural')
      const northCount = W >= 2.8 ? 2 : 1
      spread(north, ix0, ix1, wallArts.slice(0, northCount))
      spread(west, iy0 + 0.2, Math.min(iy1 - 0.2, iy0 + Math.max(2.4, D * 0.7)), wallArts.slice(northCount, northCount + 2))

      if (on.rug) rug(cx - Math.min(1.4, W / 2 - 0.2), cy - Math.min(1, D / 2 - 0.2), Math.min(2.8, W - 0.4), Math.min(2, D - 0.4))

      const dw = Math.min(2, W - 1)
      const dd = Math.min(1, D - 1.4)
      if (on.desks && dw > 0.6 && dd > 0.4) {
        const dx = cx - dw / 2 + 0.2
        const dy = cy - dd / 2 + 0.15
        box(dx, dy, dw, dd, 0.29, 'wood')
        const deskDepth = dx + dw / 2 + dy + dd / 2
        monitor(dx + 0.12, dy + 0.15, Math.min(0.5, dw / 2 - 0.2), 0.29, deskDepth)
        monitor(dx + dw / 2 + 0.1, dy + 0.15, Math.min(0.5, dw / 2 - 0.2), 0.29, deskDepth)
        // Sticky notes and a laptop on the desk.
        box(dx + 0.2, dy + dd - 0.35, 0.16, 0.16, 0.01, 'accent', 0.29)
        box(dx + 0.42, dy + dd - 0.3, 0.16, 0.16, 0.01, 'plant', 0.29)
        box(dx + dw - 0.6, dy + dd - 0.4, 0.4, 0.28, 0.02, 'metal', 0.29)
        chair(dx + 0.25, dy - 0.38)
        chair(dx + dw - 0.55, dy - 0.38)
        chair(dx + 0.25, dy + dd + 0.08)
        chair(dx + dw - 0.55, dy + dd + 0.08)
      }
      // Sofa in the near corner for the 2am stand-up.
      if (on.sofa && D >= 3 && W >= 2.4) {
        box(ix1 - 1.3, iy1 - 0.5, 1.2, 0.45, 0.18, 'soft')
        box(ix1 - 1.3, iy1 - 0.5, 1.2, 0.12, 0.2, 'soft', 0.18)
      }
      if (on.beanbags) {
        box(ix0 + 0.5, iy1 - 0.65, 0.48, 0.48, 0.15, 'accent')
        box(ix0 + 1.15, iy1 - 0.55, 0.45, 0.45, 0.14, 'lit')
      }
      if (on.coffee) {
        box(ix1 - 0.55, iy0 + 0.35, 0.45, 0.8, 0.36, 'dark')
        box(ix1 - 0.45, iy0 + 0.5, 0.12, 0.12, 0.08, 'light', 0.36)
        box(ix1 - 0.45, iy0 + 0.8, 0.12, 0.12, 0.08, 'accent', 0.36)
      }
      if (on.shelf) box(ix0 + 0.05, cy + 0.3, 0.32, Math.min(1.4, iy1 - cy - 0.8), Math.min(H * 0.7, 0.8), 'wood')
      if (on.plants) {
        box(ix0 + 0.05, iy1 - 0.4, 0.32, 0.32, 0.5, 'plant')
        if (!on.coffee) box(ix1 - 0.4, iy0 + 0.3, 0.3, 0.3, 0.45, 'plant')
      }
      break
    }
    case 'panel': {
      const dw = Math.min(W - 0.6, 3.6)
      const dy = iy0 + Math.max(0.9, D * 0.35)
      box(cx - dw / 2, dy, dw, 0.55, 0.32, 'dark')
      for (let i = 0; i < 3; i++) chair(cx - dw / 2 + (dw / 3) * i + dw / 6 - 0.15, dy - 0.42)
      north(ix0 + W * 0.2, ix1 - W * 0.2, 'dashboard')
      west(iy0 + 0.3, iy1 - 0.3, 'slides')
      chair(cx - 0.15, dy + 1.2)
      break
    }
    case 'lounge': {
      const sw = Math.min(2.2, W - 0.6)
      box(ix0 + 0.2, iy0 + 0.25, sw, 0.5, 0.18, 'soft')
      box(ix0 + 0.2, iy0 + 0.25, sw, 0.14, 0.2, 'soft', 0.18)
      box(ix0 + 0.2 + sw / 2 - 0.45, iy0 + 1.05, 0.9, 0.5, 0.17, 'wood')
      box(ix1 - 0.7, cy - 0.1, 0.5, 0.5, 0.15, 'accent')
      box(ix1 - 1.4, cy + 0.6, 0.5, 0.5, 0.15, 'lit')
      box(ix0 + 0.4, iy1 - 0.7, 0.5, 0.5, 0.15, 'accent')
      box(ix1 - 0.4, iy0 + 0.2, 0.32, 0.32, 0.5, 'plant')
      break
    }
    case 'podium': {
      north(ix0 + W * 0.15, ix1 - W * 0.15, 'leaderboard')
      box(cx - 0.4, cy - 0.35, 0.8, 0.8, 0.45, 'lit')
      box(cx - 1.25, cy - 0.25, 0.8, 0.7, 0.3, 'metal')
      box(cx + 0.45, cy - 0.15, 0.8, 0.7, 0.2, 'wood')
      break
    }
    case 'ops': {
      north(ix0 + 0.2, ix1 - 0.2, 'dashboard', bz0, bz1)
      const n = Math.max(1, Math.floor((W + 0.2) / 1.25))
      for (let i = 0; i < n; i++) {
        const x = ix0 + i * 1.25
        const y = iy0 + 0.8
        box(x, y, 1, 0.5, 0.3, 'dark')
        monitor(x + 0.25, y + 0.12, 0.5, 0.3, x + 0.5 + y + 0.25)
        chair(x + 0.35, y + 0.6)
      }
      if (D >= 2.6) west(iy0 + 1.6, iy1 - 0.2, 'whiteboard')
      break
    }
    case 'library': {
      const sh = Math.min(H * 0.75, 0.9)
      box(ix0, iy0, W, 0.35, sh, 'wood')
      box(ix0, iy0 + 0.4, 0.35, D - 0.4, sh, 'wood')
      box(cx - 0.6, cy - 0.3, 1.2, 0.7, 0.28, 'wood')
      chair(cx - 0.45, cy + 0.5)
      chair(cx + 0.15, cy + 0.5)
      box(ix1 - 0.4, iy1 - 0.4, 0.32, 0.32, 0.5, 'plant')
      break
    }
    case 'bench': {
      for (let y = iy0 + 0.3; y + 0.6 <= iy1; y += 1.4) {
        box(ix0 + 0.2, y, W - 0.4, 0.6, 0.34, 'metal')
        for (let x = ix0 + 0.4; x + 0.3 <= ix1 - 0.3; x += 0.9) box(x, y + 0.15, 0.3, 0.25, 0.1, 'dark', 0.34)
        for (let x = ix0 + 0.5; x + 0.3 <= ix1 - 0.3; x += 1.2) chair(x, y + 0.7)
      }
      north(ix0 + 0.2, ix1 - 0.2, 'whiteboard')
      break
    }
  }

  out.sort((a, b) => a.depth - b.depth)
  return out.slice(0, MAX_PIECES)
}
