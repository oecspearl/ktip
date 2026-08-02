/**
 * Sticky-note model, geometry and offline storage.
 *
 * Positions travel as fractions of the viewport rather than pixels: the same
 * note has to land in the same relative place on a laptop and on a phone, and
 * a pixel written on a 2560px monitor puts the note off-screen everywhere else.
 * Sizes *are* pixels — the box is authored by the owner dragging a corner,
 * and rescaling it with the window would undo that choice.
 *
 * Signed-out visitors keep their notes in localStorage; `drainLocalNotes()`
 * hands them over exactly once when the person signs in.
 */

/** Paper colours. Deliberately literal hex, not ktip tokens: a note keeps its
 *  colour in dark mode — a yellow sticky that turns brown at dusk stops being
 *  the same note — and the header shade is derived from the value in CSS. */
export const NOTE_COLORS = [
  '#fef08a', // yellow
  '#bbf7d0', // green
  '#bfdbfe', // blue
  '#fecaca', // red
  '#e9d5ff', // purple
  '#fed7aa', // orange
] as const

export const COLOR_LABELS: Record<string, string> = {
  '#fef08a': 'Yellow',
  '#bbf7d0': 'Green',
  '#bfdbfe': 'Blue',
  '#fecaca': 'Red',
  '#e9d5ff': 'Purple',
  '#fed7aa': 'Orange',
}

export const DEFAULT_NOTE_COLOR = NOTE_COLORS[0]
export const DEFAULT_NOTE_TITLE = 'New note'
export const DEFAULT_GROUP_TITLE = 'Folder'

/** Matches the CHECK in migration 094. A resize cannot go below the point
 *  where the toolbar stops fitting, and the ceiling keeps a stray drag from
 *  producing a note the size of a monitor. */
export const NOTE_MIN = { width: 240, height: 180 }
export const NOTE_MAX = { width: 1600, height: 1600 }
export const NOTE_DEFAULT_SIZE = { width: 300, height: 260 }

/** Collapsed height of a minimized note, and the folder's footprint. Both are
 *  needed by the clamp, which has to know the box it is keeping on screen. */
export const NOTE_MINIMIZED_HEIGHT = 44
export const GROUP_SIZE = { width: 140, height: 130 }

/** 51 notes is not organisation, it is a symptom. The cap is generous enough
 *  that nobody legitimate meets it, and low enough that a runaway caller
 *  cannot fill the table. */
export const MAX_NOTES = 50

export interface StickyNoteRecord {
  id: string
  title: string
  /** Rich text as HTML. Sanitised on the way into the DOM, never trusted. */
  content: string
  color: string
  pinned: boolean
  /** Route the note was written on. Ignored when `pinned`. */
  page_path: string | null
  /** Left edge as a fraction of viewport width, 0..1 */
  x: number
  /** Top edge as a fraction of viewport height, 0..1 */
  y: number
  width: number
  height: number
  minimized: boolean
  group_id: string | null
  created_at: string
}

export interface StickyGroupRecord {
  id: string
  title: string
  color: string
  pinned: boolean
  page_path: string | null
  x: number
  y: number
  minimized: boolean
  created_at: string
}

export interface Viewport {
  width: number
  height: number
}

export interface Box {
  width: number
  height: number
}

const LOCAL_NOTES_KEY = 'ktip_sticky_notes'
const LOCAL_GROUPS_KEY = 'ktip_sticky_note_groups'

/** Bottom-right is the FAB's corner. A note dropped under it is unclickable,
 *  so new notes start clear of it and the cascade walks down-right. */
const SPAWN = { x: 0.5, y: 0.16 }
const CASCADE_STEP = 0.035

/** The header is the paper, darkened. One value, so recolouring a note never
 *  needs a second lookup table kept in sync with the first. */
export function headerColor(color: string): string {
  return `color-mix(in srgb, ${color} 88%, #6b5b3e)`
}

/** Body text on every palette colour is dark — the palette is pastel by
 *  design, so there is no light-on-dark case to handle. */
export const NOTE_TEXT_COLOR = '#3f3a2c'

export function boxOf(note: Pick<StickyNoteRecord, 'width' | 'height' | 'minimized'>): Box {
  return {
    width: note.width,
    height: note.minimized ? NOTE_MINIMIZED_HEIGHT : note.height,
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function clampSize(size: Box): Box {
  return {
    width: Math.min(NOTE_MAX.width, Math.max(NOTE_MIN.width, Math.round(size.width))),
    height: Math.min(NOTE_MAX.height, Math.max(NOTE_MIN.height, Math.round(size.height))),
  }
}

/**
 * Keep a box's top-left inside the viewport with the whole box visible.
 * Takes and returns fractions. On a viewport smaller than the box the box pins
 * to 0 rather than going negative — half a note is recoverable, a note at
 * x = -0.3 is not.
 */
export function clampNotePosition(
  pos: { x: number; y: number },
  viewport: Viewport,
  box: Box
): { x: number; y: number } {
  const maxX = viewport.width > box.width ? 1 - box.width / viewport.width : 0
  const maxY = viewport.height > box.height ? 1 - box.height / viewport.height : 0

  return {
    x: Math.min(clamp01(pos.x), maxX),
    y: Math.min(clamp01(pos.y), maxY),
  }
}

export function fractionToPixels(
  pos: { x: number; y: number },
  viewport: Viewport
): { left: number; top: number } {
  return {
    left: Math.round(pos.x * viewport.width),
    top: Math.round(pos.y * viewport.height),
  }
}

/** Inverse of `fractionToPixels`, clamped — every caller is a drag handler,
 *  and a drag is the one input that can push a note off the edge. */
export function pixelsToFraction(
  px: { left: number; top: number },
  viewport: Viewport,
  box: Box
): { x: number; y: number } {
  const raw = {
    x: viewport.width > 0 ? px.left / viewport.width : 0,
    y: viewport.height > 0 ? px.top / viewport.height : 0,
  }
  return clampNotePosition(raw, viewport, box)
}

/**
 * Where the next note goes. Straight stacking hides every note but the last,
 * so each one steps down-right from the spawn point and wraps after five —
 * the same cascade a window manager uses, for the same reason.
 */
export function nextNotePosition(existingCount: number, viewport: Viewport): { x: number; y: number } {
  const step = existingCount % 5
  return clampNotePosition(
    { x: SPAWN.x + step * CASCADE_STEP, y: SPAWN.y + step * CASCADE_STEP },
    viewport,
    NOTE_DEFAULT_SIZE
  )
}

/** Rotate through the palette so consecutive notes are visually separable. */
export function nextNoteColor(existingCount: number): string {
  return NOTE_COLORS[existingCount % NOTE_COLORS.length]
}

/**
 * A note belongs to the page it was written on unless it is pinned.
 *
 * A note about a grant application following you onto the events calendar is
 * noise; pinning is how someone says "this one comes with me". A note with no
 * page (made before the column existed, or by a caller that did not care) is
 * treated as belonging everywhere rather than nowhere.
 */
export function isNoteOnPage(
  note: Pick<StickyNoteRecord, 'pinned' | 'page_path'>,
  pathname: string
): boolean {
  return note.pinned || note.page_path === null || note.page_path === pathname
}

/** A folder shows where its own page says, or wherever any note in it would
 *  have shown — otherwise filing a pinned note into a folder would hide it. */
export function isGroupOnPage(
  group: Pick<StickyGroupRecord, 'pinned' | 'page_path'>,
  members: Pick<StickyNoteRecord, 'pinned' | 'page_path'>[],
  pathname: string
): boolean {
  if (group.pinned || group.page_path === null || group.page_path === pathname) return true
  return members.some((n) => isNoteOnPage(n, pathname))
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `local-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function makeNote(
  partial: Partial<StickyNoteRecord> & { x: number; y: number }
): StickyNoteRecord {
  return {
    id: partial.id ?? newId(),
    title: partial.title ?? DEFAULT_NOTE_TITLE,
    content: partial.content ?? '',
    color: partial.color ?? DEFAULT_NOTE_COLOR,
    pinned: partial.pinned ?? false,
    page_path: partial.page_path ?? null,
    x: partial.x,
    y: partial.y,
    width: partial.width ?? NOTE_DEFAULT_SIZE.width,
    height: partial.height ?? NOTE_DEFAULT_SIZE.height,
    minimized: partial.minimized ?? false,
    group_id: partial.group_id ?? null,
    created_at: partial.created_at ?? new Date().toISOString(),
  }
}

export function makeGroup(
  partial: Partial<StickyGroupRecord> & { x: number; y: number }
): StickyGroupRecord {
  return {
    id: partial.id ?? newId(),
    title: partial.title ?? DEFAULT_GROUP_TITLE,
    color: partial.color ?? DEFAULT_NOTE_COLOR,
    pinned: partial.pinned ?? false,
    page_path: partial.page_path ?? null,
    x: partial.x,
    y: partial.y,
    minimized: partial.minimized ?? false,
    created_at: partial.created_at ?? new Date().toISOString(),
  }
}

function isNote(value: unknown): value is StickyNoteRecord {
  const n = value as StickyNoteRecord
  return (
    !!n &&
    typeof n === 'object' &&
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.content === 'string' &&
    typeof n.x === 'number' &&
    typeof n.y === 'number' &&
    typeof n.color === 'string'
  )
}

function isGroup(value: unknown): value is StickyGroupRecord {
  const g = value as StickyGroupRecord
  return (
    !!g &&
    typeof g === 'object' &&
    typeof g.id === 'string' &&
    typeof g.title === 'string' &&
    typeof g.x === 'number' &&
    typeof g.y === 'number'
  )
}

function readLocal<T>(key: string, guard: (v: unknown) => v is T): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(guard)
  } catch {
    return []
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or a blocked store — the notes are still on screen for this session */
  }
}

/** Signed-out store. Never throws: a note is not worth breaking a page over,
 *  and localStorage is unavailable outright in some privacy modes. */
export function readLocalNotes(): StickyNoteRecord[] {
  return readLocal(LOCAL_NOTES_KEY, isNote)
}

export function writeLocalNotes(notes: StickyNoteRecord[]): void {
  writeLocal(LOCAL_NOTES_KEY, notes)
}

export function readLocalGroups(): StickyGroupRecord[] {
  // A folder with nothing in it is unreachable, so it is dropped on read
  // rather than being allowed to accumulate in the store.
  const notes = readLocalNotes()
  return readLocal(LOCAL_GROUPS_KEY, isGroup).filter((g) =>
    notes.some((n) => n.group_id === g.id)
  )
}

export function writeLocalGroups(groups: StickyGroupRecord[]): void {
  writeLocal(LOCAL_GROUPS_KEY, groups)
}

/**
 * Hand the signed-out notes and folders to the caller and forget them.
 * Clearing after a successful sync is what stops the merge running twice on
 * the next page load; the caller writes them back if the sync fails.
 */
export function drainLocalNotes(): { notes: StickyNoteRecord[]; groups: StickyGroupRecord[] } {
  const notes = readLocalNotes()
  const groups = readLocalGroups()
  if (notes.length === 0) return { notes: [], groups: [] }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(LOCAL_NOTES_KEY)
      window.localStorage.removeItem(LOCAL_GROUPS_KEY)
    } catch {
      /* see writeLocal */
    }
  }
  return { notes, groups }
}
