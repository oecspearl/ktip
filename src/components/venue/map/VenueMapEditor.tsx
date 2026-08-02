import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Boxes,
  Building2,
  DoorOpen,
  Eraser,
  Layers,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '../../ui/Button'
import { VenueMapStage } from './VenueMapStage'
import { useAnimatedValue, useElementSize } from './useAnimatedValue'
import {
  DOOR_WIDTH,
  VENUE_MAP,
  VENUE_PALETTE,
  buildGeometry,
  cellKey,
  clampHeight,
  defaultDoor,
  defaultStairs,
  floorBadge,
  floorLabel,
  loopPath,
  makeProjection,
  parseCells,
  rectCells,
  type FloorDoor,
  type MapCell,
  type VenueMapConfig,
} from '../../../lib/venue-map'
import {
  STARTER_LAYOUT,
  VENUE_ROOM_PRESETS,
  presetByKey,
  roomKeyFrom,
  uniqueRoomKey,
  type VenueRoomPreset,
} from '../../../lib/venue-room-presets'
import {
  MAX_SPONSOR_LINKS,
  parseSections,
  parseSponsorLinks,
  sectionChoices,
  setSectionConfig,
  toggleSection,
  type RoomSectionId,
  type RoomSectionSetting,
  type SponsorLink,
} from '../../../lib/venue-room-sections'
import { VENUE_ROLE_LABELS, VENUE_ROOM_KIND_LABELS } from '../../../lib/constants'
import type { VenueMapRoomInput } from '../../../hooks/useVenueMap'
import type { VenueAudioMode, VenueRole, VenueRoom, VenueRoomKind } from '../../../types'

/**
 * A room while it is being drawn.
 *
 * `id` is local — an existing room reuses its database id, a new one gets a
 * `draft-N`. Identity on save travels on `key`, not on this, which is why a
 * host can draw, delete and redraw a room all afternoon and the venue only
 * learns about it once.
 */
interface DraftRoom {
  id: string
  key: string
  name: string
  kind: VenueRoomKind
  description: string
  color: string
  wall_height: number
  capacity: number | null
  audio_mode: VenueAudioMode
  recording_enabled: boolean
  is_open: boolean
  allowed_roles: VenueRole[]
  floor: number
  cells: MapCell[]
  sponsor_name: string | null
  sponsor_url: string | null
  /** Panels the room page renders (091). Empty = this kind's defaults. */
  sections: RoomSectionSetting[]
}

interface EditorState {
  config: VenueMapConfig
  rooms: DraftRoom[]
}

type DragState =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number; moved: boolean }
  | { kind: 'draw'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'erase'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'move'; id: string; ax: number; ay: number; dx: number; dy: number }
  | { kind: 'resize'; id: string; edge: ResizeEdge; cx?: number; cy?: number }

/** Edges and corners. A corner is just both of its edges moving at once. */
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

interface VenueMapEditorProps {
  rooms: VenueRoom[] | undefined
  config: VenueMapConfig
  saving: boolean
  onSave: (config: VenueMapConfig, rooms: VenueMapRoomInput[]) => Promise<unknown>
}

const AUDIO_MODES: { value: VenueAudioMode; label: string }[] = [
  { value: 'open', label: 'Open — everyone can speak' },
  { value: 'moderated', label: 'Moderated — hosts grant the mic' },
  { value: 'listen_only', label: 'Listen only' },
]

const ROOM_KINDS: VenueRoomKind[] = [
  'main_hall',
  'networking',
  'workshop',
  'help_desk',
  'sponsor_booth',
  'judging',
  'stage',
  'breakout',
]

const RESTRICTABLE_ROLES: VenueRole[] = ['participant', 'mentor', 'judge', 'organizer', 'spectator']

/**
 * The venue builder.
 *
 * A host draws the building the way attendees will see it: same projection,
 * same renderer, same colours. The only differences are the grid and the fact
 * that a room can be dragged.
 *
 * Nothing is written until Save. The whole editing session is local state with
 * an undo stack, because an autosaving floorplan means an attendee watching a
 * wall move mid-drag.
 */
export function VenueMapEditor({ rooms, config, saving, onSave }: VenueMapEditorProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(wrapRef)

  const [state, setState] = useState<EditorState>(() => ({
    config,
    rooms: (rooms || []).map(toDraft).filter(Boolean) as DraftRoom[],
  }))
  const [dirty, setDirty] = useState(false)
  const [floor, setFloor] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [armed, setArmed] = useState<VenueRoomPreset | null>(null)
  /** Which fixture is being placed, if any. Rooms use `armed` instead. */
  const [tool, setTool] = useState<'none' | 'door' | 'stairs'>('none')
  const [toolError, setToolError] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<MapCell | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [zoom, setZoom] = useState({ k: 1, px: 0, py: 0 })
  // Drawing happens in plan view — a wall you are looking at edge-on is a wall
  // you cannot place accurately — so 2.5D doubles as "stop editing, look".
  const [preview, setPreview] = useState(false)
  const [stacked, setStacked] = useState(false)

  const history = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] })

  // Reload from the server only while the host has nothing unsaved. Dropping
  // someone's half-drawn floor because a refetch landed is unforgivable.
  useEffect(() => {
    if (dirty) return
    setState({ config, rooms: (rooms || []).map(toDraft).filter(Boolean) as DraftRoom[] })
  }, [rooms, config, dirty])

  const tilt = useAnimatedValue(preview ? 1 : 0)
  const stack = useAnimatedValue(preview && stacked && state.config.floors.length > 1 ? 1 : 0)

  const commit = useCallback((next: EditorState | ((prev: EditorState) => EditorState)) => {
    setState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      if (resolved === prev) return prev
      history.current.undo.push(JSON.stringify(prev))
      if (history.current.undo.length > 60) history.current.undo.shift()
      history.current.redo = []
      return resolved
    })
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    const prev = history.current.undo.pop()
    if (!prev) return
    setState((current) => {
      history.current.redo.push(JSON.stringify(current))
      return JSON.parse(prev) as EditorState
    })
    setDirty(true)
  }, [])

  const redo = useCallback(() => {
    const next = history.current.redo.pop()
    if (!next) return
    setState((current) => {
      history.current.undo.push(JSON.stringify(current))
      return JSON.parse(next) as EditorState
    })
    setDirty(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if (e.key === 'Escape') {
        setArmed(null)
        setTool('none')
        setToolError(null)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ---- geometry + projection ---------------------------------------------

  const geometry = useMemo(() => buildGeometry(state.rooms), [state.rooms])
  const selected = selectedId ? state.rooms.find((r) => r.id === selectedId) || null : null
  const selectedGeo = selectedId ? geometry[selectedId] : null

  const tallest = Math.max(1, ...state.rooms.map((r) => r.wall_height))
  const topZ = stack * (state.config.floors.length - 1) * VENUE_MAP.LEVEL_H + tallest

  const projection = useMemo(
    () =>
      makeProjection({
        cols: state.config.cols,
        rows: state.config.rows,
        tilt,
        width: size.width,
        height: size.height,
        zoom,
        topZ,
      }),
    [state.config.cols, state.config.rows, tilt, size, zoom, topZ]
  )

  const zBase = stack > 0.02 ? floor * VENUE_MAP.LEVEL_H * stack : 0

  const pointerCell = (e: React.PointerEvent): MapCell => {
    const rect = wrapRef.current!.getBoundingClientRect()
    const [wx, wy] = projection.unproject(e.clientX - rect.left, e.clientY - rect.top, zBase)
    return [Math.floor(wx), Math.floor(wy)]
  }

  const inGrid = (x: number, y: number) =>
    x >= 0 && x < state.config.cols && y >= 0 && y < state.config.rows

  /** Cells already spoken for on this floor, ignoring one room. */
  const occupied = useCallback(
    (ignoreId?: string) => {
      const taken = new Set<string>()
      for (const room of state.rooms) {
        if (room.floor !== floor || room.id === ignoreId) continue
        for (const [x, y] of room.cells) taken.add(cellKey(x, y))
      }
      return taken
    },
    [state.rooms, floor]
  )

  // ---- room mutations -----------------------------------------------------

  const patchRoom = (id: string, patch: Partial<DraftRoom>) =>
    commit((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))

  const deleteRoom = (id: string) => {
    commit((prev) => ({ ...prev, rooms: prev.rooms.filter((r) => r.id !== id) }))
    setSelectedId(null)
  }

  const placePreset = (preset: VenueRoomPreset, x0: number, y0: number, x1: number, y1: number) => {
    const taken = occupied()
    const cells = rectCells(x0, y0, x1, y1).filter(
      ([x, y]) => inGrid(x, y) && !taken.has(cellKey(x, y))
    )
    if (!cells.length) return

    const key = uniqueRoomKey(preset.key, state.rooms.map((r) => r.key))
    const id = `draft-${key}-${state.rooms.length}`
    const draft: DraftRoom = {
      id,
      key,
      name: preset.name,
      kind: preset.kind,
      description: preset.description,
      color: preset.color,
      wall_height: preset.wall_height,
      capacity: preset.capacity,
      audio_mode: preset.audio_mode,
      recording_enabled: preset.recording_enabled,
      is_open: true,
      allowed_roles: [...preset.allowed_roles],
      floor,
      cells,
      sponsor_name: null,
      sponsor_url: null,
      // Empty unless the preset disagrees with its kind. An untouched room
      // follows its kind's defaults for ever, so changing those later fixes
      // rooms rather than leaving a frozen copy on every venue ever drawn.
      sections: presetSections(preset),
    }
    commit((prev) => ({ ...prev, rooms: [...prev.rooms, draft] }))
    setSelectedId(id)
    setArmed(null)
    setHoverCell(null)
  }

  const applyStarter = () => {
    const taken = occupied()
    const additions: DraftRoom[] = []
    const keys = state.rooms.map((r) => r.key)

    for (const entry of STARTER_LAYOUT) {
      const preset = presetByKey(entry.preset)
      if (!preset) continue
      const cells = rectCells(...entry.rect).filter(
        ([x, y]) => inGrid(x, y) && !taken.has(cellKey(x, y))
      )
      if (!cells.length) continue
      for (const [x, y] of cells) taken.add(cellKey(x, y))

      const key = uniqueRoomKey(preset.key, keys)
      keys.push(key)
      additions.push({
        id: `draft-${key}`,
        key,
        name: preset.name,
        kind: preset.kind,
        description: preset.description,
        color: preset.color,
        wall_height: preset.wall_height,
        capacity: preset.capacity,
        audio_mode: preset.audio_mode,
        recording_enabled: preset.recording_enabled,
        is_open: true,
        allowed_roles: [...preset.allowed_roles],
        floor,
        cells,
        sponsor_name: null,
        sponsor_url: null,
        sections: presetSections(preset),
      })
    }

    if (additions.length) commit((prev) => ({ ...prev, rooms: [...prev.rooms, ...additions] }))
  }

  // ---- floors -------------------------------------------------------------

  const addFloor = () => {
    if (state.config.floors.length >= VENUE_MAP.MAX_FLOORS) return
    const index = state.config.floors.length
    commit((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        floors: [
          ...prev.config.floors,
          // A new floor arrives with a door, because a floor without one is a
          // room nobody can get into.
          { key: `floor-${index}`, name: floorLabel(index), door: defaultDoor(prev.config) },
        ],
        // The moment a venue has a second level it needs stairs; putting them
        // in here means a host never discovers the omission from an attendee.
        stairs: prev.config.stairs ?? defaultStairs(prev.config, buildGeometry(prev.rooms)),
      },
    }))
    setFloor(index)
    setSelectedId(null)
  }

  // ---- entrance + stairs --------------------------------------------------

  /** Perimeter cell → the door that would sit there. Null when not on an edge. */
  const doorAtCell = (x: number, y: number): FloorDoor | null => {
    const { cols, rows } = state.config
    if (!inGrid(x, y)) return null
    if (y === 0) return { side: 'n', at: Math.min(x, cols - DOOR_WIDTH) }
    if (y === rows - 1) return { side: 's', at: Math.min(x, cols - DOOR_WIDTH) }
    if (x === 0) return { side: 'w', at: Math.min(y, rows - DOOR_WIDTH) }
    if (x === cols - 1) return { side: 'e', at: Math.min(y, rows - DOOR_WIDTH) }
    return null
  }

  const setDoor = (door: FloorDoor) =>
    commit((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        floors: prev.config.floors.map((f, i) => (i === floor ? { ...f, door } : f)),
      },
    }))

  /**
   * Stairs may only land where *every* floor is clear.
   *
   * They are one block shared by the whole building — the thing that makes them
   * stairs rather than four disconnected platforms — so a spot that is free
   * here but under a room upstairs is not a spot.
   */
  const stairsBlocker = (x: number, y: number): string | null => {
    const w = state.config.stairs?.w ?? 2
    const h = state.config.stairs?.h ?? 2
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        if (!inGrid(x + dx, y + dy)) return 'The stairs would hang off the edge of the floor.'
      }
    for (const room of state.rooms) {
      for (const [cx, cy] of room.cells) {
        if (cx >= x && cx < x + w && cy >= y && cy < y + h) {
          return `${room.name} on ${floorBadge(room.floor)} is in the way.`
        }
      }
    }
    return null
  }

  const setStairs = (x: number, y: number) =>
    commit((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        stairs: { x, y, w: prev.config.stairs?.w ?? 2, h: prev.config.stairs?.h ?? 2 },
      },
    }))

  const renameFloor = (index: number, name: string) =>
    commit((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        floors: prev.config.floors.map((f, i) => (i === index ? { ...f, name } : f)),
      },
    }))

  const deleteFloor = (index: number) => {
    if (state.config.floors.length < 2) return
    commit((prev) => ({
      ...prev,
      config: { ...prev.config, floors: prev.config.floors.filter((_, i) => i !== index) },
      // Rooms above the removed floor slide down; rooms on it go with it.
      rooms: prev.rooms
        .filter((r) => r.floor !== index)
        .map((r) => (r.floor > index ? { ...r, floor: r.floor - 1 } : r)),
    }))
    setFloor((f) => Math.max(0, Math.min(f, state.config.floors.length - 2)))
    setSelectedId(null)
  }

  // ---- pointer handling ---------------------------------------------------

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
    const [x, y] = pointerCell(e)

    if (preview) {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, px: zoom.px, py: zoom.py, moved: false })
      return
    }

    if (tool === 'door') {
      const door = doorAtCell(x, y)
      if (!door) {
        setToolError('An entrance has to sit on one of the four edges of the floor.')
        return
      }
      setDoor(door)
      setTool('none')
      setToolError(null)
      return
    }

    if (tool === 'stairs') {
      const blocker = stairsBlocker(x, y)
      if (blocker) {
        setToolError(blocker)
        return
      }
      setStairs(x, y)
      setTool('none')
      setToolError(null)
      return
    }

    if (e.altKey) {
      setDrag({ kind: 'erase', x0: x, y0: y, x1: x, y1: y })
      return
    }
    if (armed) {
      setDrag({ kind: 'draw', x0: x, y0: y, x1: x, y1: y })
      return
    }

    const hit = inGrid(x, y) ? roomIdAt(state.rooms, floor, x, y) : null
    if (hit) {
      setSelectedId(hit)
      setDrag({ kind: 'move', id: hit, ax: x, ay: y, dx: 0, dy: 0 })
    } else {
      setSelectedId(null)
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, px: zoom.px, py: zoom.py, moved: false })
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) {
      const [x, y] = pointerCell(e)
      if (armed || tool !== 'none') setHoverCell(inGrid(x, y) ? [x, y] : null)
      else setHoveredId(inGrid(x, y) ? roomIdAt(state.rooms, floor, x, y) : null)
      return
    }

    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        setZoom((z) => ({ ...z, px: drag.px + dx, py: drag.py + dy }))
        setDrag({ ...drag, moved: true })
      }
      return
    }

    const [rawX, rawY] = pointerCell(e)
    const x = Math.max(0, Math.min(state.config.cols - 1, rawX))
    const y = Math.max(0, Math.min(state.config.rows - 1, rawY))

    if (drag.kind === 'draw' || drag.kind === 'erase') setDrag({ ...drag, x1: x, y1: y })
    else if (drag.kind === 'move') setDrag({ ...drag, dx: x - drag.ax, dy: y - drag.ay })
    else if (drag.kind === 'resize') setDrag({ ...drag, cx: x, cy: y })
  }

  const onPointerUp = () => {
    const d = drag
    setDrag(null)
    if (!d) return

    if (d.kind === 'draw' && armed) {
      let { x0, y0, x1, y1 } = d
      // A click, not a drag: drop the preset at its natural size.
      if (x0 === x1 && y0 === y1) {
        x1 = Math.min(state.config.cols - 1, x0 + armed.size.w - 1)
        y1 = Math.min(state.config.rows - 1, y0 + armed.size.h - 1)
      }
      placePreset(armed, x0, y0, x1, y1)
      return
    }

    if (d.kind === 'erase') {
      const gone = new Set(
        rectCells(d.x0, d.y0, d.x1, d.y1).map(([x, y]) => cellKey(x, y))
      )
      commit((prev) => ({
        ...prev,
        rooms: prev.rooms
          .map((r) =>
            r.floor === floor
              ? { ...r, cells: r.cells.filter(([x, y]) => !gone.has(cellKey(x, y))) }
              : r
          )
          // A room erased down to nothing is a deleted room.
          .filter((r) => r.cells.length > 0),
      }))
      return
    }

    if (d.kind === 'move' && (d.dx || d.dy)) {
      const room = state.rooms.find((r) => r.id === d.id)
      if (!room) return
      const taken = occupied(d.id)
      const moved = room.cells.map(([x, y]) => [x + d.dx, y + d.dy] as MapCell)
      const ok = moved.every(([x, y]) => inGrid(x, y) && !taken.has(cellKey(x, y)))
      if (!ok) return
      patchRoom(d.id, { cells: moved })
      return
    }

    if (d.kind === 'resize' && d.cx !== undefined && d.cy !== undefined) {
      const room = state.rooms.find((r) => r.id === d.id)
      const geo = geometry[d.id]
      if (!room || !geo) return

      let { minX, minY, maxX, maxY } = geo.bbox
      if (d.edge.includes('e')) maxX = Math.max(minX, Math.min(state.config.cols - 1, d.cx))
      if (d.edge.includes('w')) minX = Math.min(maxX, Math.max(0, d.cx))
      if (d.edge.includes('s')) maxY = Math.max(minY, Math.min(state.config.rows - 1, d.cy))
      if (d.edge.includes('n')) minY = Math.min(maxY, Math.max(0, d.cy))

      const taken = occupied(d.id)
      const cells = rectCells(minX, minY, maxX, maxY)
      if (cells.some(([x, y]) => taken.has(cellKey(x, y)))) return
      patchRoom(d.id, { cells })
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setZoom((z) => {
      const k = Math.max(0.5, Math.min(3.2, z.k * Math.exp(-e.deltaY * 0.0012)))
      const f = k / z.k
      return { k, px: mx - (mx - z.px) * f, py: my - (my - z.py) * f }
    })
  }

  // ---- overlays -----------------------------------------------------------

  const overlays: React.ReactNode[] = []
  const quad = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]

  if (!preview && drag && (drag.kind === 'draw' || drag.kind === 'erase')) {
    const x0 = Math.min(drag.x0, drag.x1)
    const x1 = Math.max(drag.x0, drag.x1) + 1
    const y0 = Math.min(drag.y0, drag.y1)
    const y1 = Math.max(drag.y0, drag.y1) + 1
    const erasing = drag.kind === 'erase'
    overlays.push(
      <path
        key="marquee"
        d={loopPath(projection, quad(x0, y0, x1, y1), zBase)}
        fill={erasing ? 'rgba(220,38,38,0.12)' : 'rgba(42,87,136,0.14)'}
        stroke={erasing ? '#dc2626' : '#2A5788'}
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
    )
  }

  // Entrance preview: the two perimeter cells the opening would span.
  if (!preview && tool === 'door' && hoverCell && !drag) {
    const door = doorAtCell(hoverCell[0], hoverCell[1])
    if (door) {
      const { cols, rows } = state.config
      const span: [number, number][] =
        door.side === 'n'
          ? quad(door.at, 0, door.at + DOOR_WIDTH, 0.7)
          : door.side === 's'
            ? quad(door.at, rows - 0.7, door.at + DOOR_WIDTH, rows)
            : door.side === 'w'
              ? quad(0, door.at, 0.7, door.at + DOOR_WIDTH)
              : quad(cols - 0.7, door.at, cols, door.at + DOOR_WIDTH)
      overlays.push(
        <path
          key="door-preview"
          d={loopPath(projection, span, zBase)}
          fill="rgba(151,215,0,0.28)"
          stroke="var(--color-ktip-tropical-600)"
          strokeWidth={1.5}
        />
      )
    }
  }

  // Stairs preview: green where it can land, red where something is under it.
  if (!preview && tool === 'stairs' && hoverCell && !drag) {
    const [hx, hy] = hoverCell
    const w = state.config.stairs?.w ?? 2
    const h = state.config.stairs?.h ?? 2
    const blocked = !!stairsBlocker(hx, hy)
    overlays.push(
      <path
        key="stairs-preview"
        d={loopPath(projection, quad(hx, hy, hx + w, hy + h), zBase)}
        fill={blocked ? 'rgba(220,38,38,0.16)' : 'rgba(4,30,66,0.14)'}
        stroke={blocked ? '#dc2626' : '#041E42'}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
    )
  }

  if (!preview && armed && hoverCell && !drag) {
    const [hx, hy] = hoverCell
    overlays.push(
      <path
        key="ghost"
        d={loopPath(
          projection,
          quad(hx, hy, Math.min(state.config.cols, hx + armed.size.w), Math.min(state.config.rows, hy + armed.size.h)),
          zBase
        )}
        fill="rgba(42,87,136,0.12)"
        stroke="#2A5788"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
    )
  }

  if (!preview && drag?.kind === 'move' && geometry[drag.id]) {
    for (const [i, lp] of geometry[drag.id].loops.entries()) {
      overlays.push(
        <path
          key={`move-${i}`}
          d={loopPath(
            projection,
            lp.outer.map(([x, y]) => [x + drag.dx, y + drag.dy] as [number, number]),
            zBase
          )}
          fill="rgba(42,87,136,0.10)"
          stroke="#2A5788"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )
    }
  }

  // Resize handles, rectangles only. A non-rectangular room has no unambiguous
  // "east edge", so it is reshaped with Alt-erase and redrawing instead.
  const handles: React.ReactNode[] = []
  if (!preview && selectedGeo?.isRect && !drag) {
    const { minX, minY, maxX, maxY } = selectedGeo.bbox
    const grip: Record<ResizeEdge, [number, number]> = {
      n: [(minX + maxX + 1) / 2, minY],
      s: [(minX + maxX + 1) / 2, maxY + 1],
      w: [minX, (minY + maxY + 1) / 2],
      e: [maxX + 1, (minY + maxY + 1) / 2],
      nw: [minX, minY],
      ne: [maxX + 1, minY],
      sw: [minX, maxY + 1],
      se: [maxX + 1, maxY + 1],
    }
    // Corners drag both axes. In an isometric view the screen direction of a
    // grid axis is not up/down, so the cursor is the generic "move" rather than
    // a diagonal that would point the wrong way.
    const cursorFor = (edge: ResizeEdge) =>
      edge.length > 1 ? 'move' : edge === 'n' || edge === 's' ? 'ns-resize' : 'ew-resize'

    for (const edge of ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as ResizeEdge[]) {
      const [sx, sy] = projection.project(grip[edge][0], grip[edge][1], zBase)
      const corner = edge.length > 1
      handles.push(
        corner ? (
          <rect
            key={`handle-${edge}`}
            x={sx - 5.5}
            y={sy - 5.5}
            width={11}
            height={11}
            rx={2}
            fill="var(--color-ktip-cream)"
            stroke="#2A5788"
            strokeWidth={2}
            style={{ cursor: cursorFor(edge) }}
            onPointerDown={(e) => {
              e.stopPropagation()
              ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId)
              setDrag({ kind: 'resize', id: selectedGeo.room.id, edge })
            }}
          />
        ) : (
          <circle
            key={`handle-${edge}`}
            cx={sx}
            cy={sy}
            r={7}
            fill="var(--color-ktip-cream)"
            stroke="#2A5788"
            strokeWidth={2}
            style={{ cursor: cursorFor(edge) }}
            onPointerDown={(e) => {
              e.stopPropagation()
              ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId)
              setDrag({ kind: 'resize', id: selectedGeo.room.id, edge })
            }}
          />
        )
      )
    }
  }

  if (!preview && drag?.kind === 'resize' && geometry[drag.id] && drag.cx !== undefined) {
    let { minX, minY, maxX, maxY } = geometry[drag.id].bbox
    if (drag.edge.includes('e')) maxX = Math.max(minX, drag.cx)
    if (drag.edge.includes('w')) minX = Math.min(maxX, drag.cx)
    if (drag.edge.includes('s')) maxY = Math.max(minY, drag.cy as number)
    if (drag.edge.includes('n')) minY = Math.min(maxY, drag.cy as number)
    overlays.push(
      <path
        key="resize"
        d={loopPath(projection, quad(minX, minY, maxX + 1, maxY + 1), zBase)}
        fill="rgba(42,87,136,0.10)"
        stroke="#2A5788"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
    )
  }

  // ---- save ---------------------------------------------------------------

  const roomsOnFloor = state.rooms.filter((r) => r.floor === floor)

  const save = async () => {
    const payload: VenueMapRoomInput[] = state.rooms.map((room, index) => ({
      key: room.key,
      name: room.name.trim() || 'Room',
      kind: room.kind,
      description: room.description.trim() || null,
      capacity: room.capacity,
      audio_mode: room.audio_mode,
      recording_enabled: room.recording_enabled,
      is_open: room.is_open,
      sort_order: index * 10,
      floor: room.floor,
      cells: room.cells,
      color: room.color,
      wall_height: clampHeight(room.wall_height),
      allowed_roles: room.allowed_roles,
      sponsor_name: room.sponsor_name,
      sponsor_url: room.sponsor_url,
      sections: room.sections,
    }))

    await onSave(state.config, payload)
    setDirty(false)
    history.current = { undo: [], redo: [] }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ktip-sand-200 bg-ktip-cream">
      {/* ---- toolbar ---- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ktip-sand-200 px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ktip-sand-900">
          <Building2 size={15} className="text-ktip-ocean-600" aria-hidden="true" />
          Venue builder
        </span>

        <div className="mx-1 h-5 w-px bg-ktip-sand-200" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Floors">
          {state.config.floors.map((f, i) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={i === floor}
              onClick={() => {
                setFloor(i)
                setSelectedId(null)
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                i === floor
                  ? 'border-ktip-ocean-300 bg-ktip-ocean-50 text-ktip-ocean-700'
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-sand-300'
              }`}
            >
              <span className="font-mono text-[10px] opacity-70">{floorBadge(i)}</span>{' '}
              {f.name}
            </button>
          ))}
          <button
            type="button"
            onClick={addFloor}
            disabled={state.config.floors.length >= VENUE_MAP.MAX_FLOORS}
            className="rounded-lg border border-dashed border-ktip-sand-300 px-2.5 py-1 text-xs font-semibold text-ktip-sand-500 hover:border-ktip-ocean-300 hover:text-ktip-ocean-600 disabled:opacity-40"
          >
            <Plus size={12} className="mr-1 inline" aria-hidden="true" />
            Floor
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Plan draws, 2.5D looks. Stack pulls the levels apart. Both eased. */}
          <div className="flex overflow-hidden rounded-lg border border-ktip-sand-200">
            {([['Plan', false], ['2.5D', true]] as Array<[string, boolean]>).map(([label, on]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setPreview(on)
                  if (on) setArmed(null)
                }}
                aria-pressed={preview === on}
                className={`px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                  preview === on
                    ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                    : 'text-ktip-sand-500 hover:text-ktip-sand-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {preview && state.config.floors.length > 1 && (
            <div className="flex overflow-hidden rounded-lg border border-ktip-sand-200">
              {([['Floor', false], ['Stack', true]] as Array<[string, boolean]>).map(
                ([label, on]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setStacked(on)}
                    aria-pressed={stacked === on}
                    className={`flex items-center gap-1 px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                      stacked === on
                        ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                        : 'text-ktip-sand-500 hover:text-ktip-sand-700'
                    }`}
                  >
                    {on && <Layers size={12} aria-hidden="true" />}
                    {label}
                  </button>
                )
              )}
            </div>
          )}
          <button
            type="button"
            onClick={undo}
            aria-label="Undo"
            className="rounded-lg border border-ktip-sand-200 p-1.5 text-ktip-sand-600 hover:border-ktip-sand-300 hover:text-ktip-ocean-600"
          >
            <Undo2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={redo}
            aria-label="Redo"
            className="rounded-lg border border-ktip-sand-200 p-1.5 text-ktip-sand-600 hover:border-ktip-sand-300 hover:text-ktip-ocean-600"
          >
            <Redo2 size={14} aria-hidden="true" />
          </button>
          <Button size="sm" icon={<Save size={14} />} loading={saving} disabled={!dirty} onClick={save}>
            {dirty ? 'Save map' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[15rem_1fr]">
        {/* ---- preset rail ---- */}
        <div className="max-h-[34rem] overflow-y-auto border-b border-ktip-sand-200 p-3 lg:border-b-0 lg:border-r">
          {/* ---- fixtures ----
              The entrance and the stairs are the two things a floor has that
              are not rooms, so they get their own pair of tools rather than
              hiding inside the room inspector. */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            Doors &amp; stairs
          </p>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTool(tool === 'door' ? 'none' : 'door')
                setArmed(null)
                setPreview(false)
                setToolError(null)
              }}
              aria-pressed={tool === 'door'}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors ${
                tool === 'door'
                  ? 'border-ktip-tropical-500 bg-ktip-tropical-50 text-ktip-tropical-800'
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-sand-300'
              }`}
            >
              <DoorOpen size={13} aria-hidden="true" />
              Entrance
            </button>
            <button
              type="button"
              onClick={() => {
                setTool(tool === 'stairs' ? 'none' : 'stairs')
                setArmed(null)
                setPreview(false)
                setToolError(null)
              }}
              aria-pressed={tool === 'stairs'}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors ${
                tool === 'stairs'
                  ? 'border-ktip-ocean-400 bg-ktip-ocean-50 text-ktip-ocean-700'
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-sand-300'
              }`}
            >
              <ArrowUpDown size={13} aria-hidden="true" />
              Stairs
            </button>
          </div>
          <p className="mb-3 text-[11px] leading-snug text-ktip-sand-500">
            {tool === 'door'
              ? 'Click any cell on the edge of the floor. Each floor has its own entrance.'
              : tool === 'stairs'
                ? 'Click where the stairs go. They sit in the same place on every floor, so the spot has to be clear on all of them.'
                : `Entrance: ${sideLabel(state.config.floors[floor]?.door?.side)}${
                    state.config.stairs
                      ? ` · Stairs at ${state.config.stairs.x},${state.config.stairs.y}`
                      : ' · No stairs yet'
                  }`}
          </p>
          {toolError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              {toolError}
            </p>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            Ready-made rooms
          </p>
          <div className="space-y-1.5">
            {VENUE_ROOM_PRESETS.map((preset) => {
              const on = armed?.key === preset.key
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setArmed(on ? null : preset)
                    setPreview(false)
                    setSelectedId(null)
                  }}
                  aria-pressed={on}
                  className={`w-full rounded-xl border p-2 text-left transition-colors ${
                    on
                      ? 'border-ktip-ocean-400 bg-ktip-ocean-50'
                      : 'border-ktip-sand-200 hover:border-ktip-sand-300 hover:bg-ktip-sand-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: preset.color }}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-ktip-sand-900">{preset.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-ktip-sand-400">
                      {preset.size.w}×{preset.size.h}
                    </span>
                  </span>
                  <span className="mt-0.5 block pl-5 text-[11px] leading-snug text-ktip-sand-500">
                    {preset.hint}
                  </span>
                </button>
              )
            })}
          </div>

          {state.rooms.length === 0 && (
            <button
              type="button"
              onClick={applyStarter}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ktip-tropical-300 bg-ktip-tropical-50 px-3 py-2 text-xs font-semibold text-ktip-tropical-800 hover:border-ktip-tropical-500"
            >
              <Sparkles size={13} aria-hidden="true" />
              Use the starter layout
            </button>
          )}

          <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-ktip-sand-500">
            <Eraser size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            Pick a room then click the grid to drop it, or drag to size it. Drag a placed room to
            move it, drag its handles or corners to resize, hold Alt and drag to carve cells away.
          </p>

          {/* ---- what has been placed ----
              The map only shows the floor being worked on, so this is the only
              place a host can see the whole building at once — and it is how a
              room on another level gets selected without hunting for it. */}
          {state.rooms.length > 0 && (
            <div className="mt-4 border-t border-ktip-sand-200 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
                In this venue
              </p>
              <div className="space-y-2">
                {state.config.floors.map((f, level) => {
                  const onLevel = state.rooms.filter((r) => r.floor === level)
                  return (
                    <div key={f.key}>
                      <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] font-semibold text-ktip-sand-600">
                        <span className="rounded border border-ktip-sand-200 px-1.5 font-mono text-[9px] text-ktip-sand-500">
                          {floorBadge(level)}
                        </span>
                        {f.name}
                        <span className="ml-auto font-mono text-[10px] text-ktip-sand-400">
                          {onLevel.length}
                        </span>
                      </div>
                      {onLevel.length === 0 ? (
                        <p className="px-2 text-[10px] text-ktip-sand-400">Empty</p>
                      ) : (
                        <ul className="mt-0.5 space-y-1">
                          {onLevel.map((room) => (
                            <li key={room.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setFloor(level)
                                  setSelectedId(room.id)
                                  setArmed(null)
                                }}
                                onMouseEnter={() => setHoveredId(room.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                                  room.id === selectedId
                                    ? 'bg-ktip-sand-50'
                                    : 'border-ktip-sand-100 hover:border-ktip-sand-300'
                                }`}
                                style={room.id === selectedId ? { borderColor: room.color } : undefined}
                              >
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ background: room.color }}
                                  aria-hidden="true"
                                />
                                <span className="truncate text-xs text-ktip-sand-800">{room.name}</span>
                                <span className="ml-auto shrink-0 font-mono text-[10px] text-ktip-sand-400">
                                  {room.cells.length}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ---- canvas ---- */}
        <div className="relative">
          <div
            ref={wrapRef}
            onWheel={onWheel}
            className="relative h-[34rem] w-full overflow-hidden bg-ktip-canvas"
            style={{
              cursor:
                armed || tool !== 'none'
                  ? 'crosshair'
                  : drag?.kind === 'pan'
                    ? 'grabbing'
                    : 'default',
            }}
          >
            <svg
              width="100%"
              height="100%"
              style={{ display: 'block', touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => setHoverCell(null)}
            >
              <VenueMapStage
                config={state.config}
                geometry={geometry}
                projection={projection}
                floor={floor}
                tilt={tilt}
                stack={stack}
                selectedId={selectedId}
                hoveredId={hoveredId}
                showGrid={!preview}
              />
              {overlays}
              {handles}
            </svg>

            {/* room name tags */}
            <div className="pointer-events-none absolute inset-0">
              {/* Stacked, every level's rooms are named where they sit. */}
              {(stack > 0.5 ? state.rooms : roomsOnFloor).map((room) => {
                const geo = geometry[room.id]
                if (!geo) return null
                const levelZ = stack > 0.02 ? room.floor * VENUE_MAP.LEVEL_H * stack : zBase
                const [sx, sy] = projection.project(
                  geo.centroid[0],
                  geo.centroid[1],
                  levelZ + (tilt > 0.5 ? geo.height : 0)
                )
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedId(room.id)}
                    className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-ktip-cream/90 px-2.5 py-1 text-[11px] font-semibold shadow-card backdrop-blur-sm"
                    style={{
                      left: sx,
                      top: sy,
                      borderColor: room.id === selectedId ? room.color : 'var(--color-ktip-sand-200)',
                      color: 'var(--color-ktip-sand-900)',
                    }}
                  >
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: room.color }}
                      aria-hidden="true"
                    />
                    {room.name}
                  </button>
                )
              })}
            </div>

            <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-ktip-sand-400">
              {state.config.cols}×{state.config.rows} · {roomsOnFloor.length} rooms on this floor ·
              scroll to zoom
            </div>
          </div>

          {/* ---- inspector ---- */}
          {selected && !preview && (
            <div className="absolute right-3 top-3 max-h-[calc(100%-1.5rem)] w-64 overflow-y-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream/95 p-3 shadow-card backdrop-blur">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: selected.color }}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-ktip-sand-500">
                  Room
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close room settings"
                  className="ml-auto rounded p-0.5 text-ktip-sand-400 hover:text-ktip-sand-700"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>

              <label className="block text-xs">
                <span className="mb-1 block font-medium text-ktip-sand-700">Name</span>
                <input
                  value={selected.name}
                  onChange={(e) => {
                    const name = e.target.value
                    patchRoom(selected.id, {
                      name,
                      // The key follows the name only while the room is new; an
                      // existing room's key is its identity and its deep link.
                      key: selected.id.startsWith('draft-')
                        ? uniqueRoomKey(
                            roomKeyFrom(name),
                            state.rooms.filter((r) => r.id !== selected.id).map((r) => r.key)
                          )
                        : selected.key,
                    })
                  }}
                  className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-sm"
                />
              </label>

              <label className="mt-2 block text-xs">
                <span className="mb-1 block font-medium text-ktip-sand-700">Purpose</span>
                <select
                  value={selected.kind}
                  onChange={(e) => patchRoom(selected.id, { kind: e.target.value as VenueRoomKind })}
                  className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-sm"
                >
                  {ROOM_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {VENUE_ROOM_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-2 block text-xs">
                <span className="mb-1 block font-medium text-ktip-sand-700">Description</span>
                <textarea
                  rows={2}
                  value={selected.description}
                  onChange={(e) => patchRoom(selected.id, { description: e.target.value })}
                  className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-xs"
                />
              </label>

              <fieldset className="mt-2">
                <legend className="mb-1 text-xs font-medium text-ktip-sand-700">Colour</legend>
                <div className="flex flex-wrap gap-1.5">
                  {VENUE_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patchRoom(selected.id, { color: c })}
                      aria-label={`Use colour ${c}`}
                      aria-pressed={selected.color === c}
                      className={`h-5 w-5 rounded ${
                        selected.color === c ? 'ring-2 ring-ktip-ocean-500 ring-offset-1' : ''
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </fieldset>

              <label className="mt-2 block text-xs">
                <span className="mb-1 block font-medium text-ktip-sand-700">
                  Wall height ·{' '}
                  <span className="font-mono text-ktip-sand-500">
                    {selected.wall_height.toFixed(1)}
                  </span>
                </span>
                <input
                  type="range"
                  min={VENUE_MAP.MIN_WALL_H}
                  max={2}
                  step={0.1}
                  value={selected.wall_height}
                  onChange={(e) =>
                    patchRoom(selected.id, { wall_height: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
              </label>

              <label className="mt-2 block text-xs">
                <span className="mb-1 block font-medium text-ktip-sand-700">Audio</span>
                <select
                  value={selected.audio_mode}
                  onChange={(e) =>
                    patchRoom(selected.id, { audio_mode: e.target.value as VenueAudioMode })
                  }
                  className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-xs"
                >
                  {AUDIO_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-2 block text-xs">
                <span className="mb-1 block font-medium text-ktip-sand-700">Capacity</span>
                <input
                  type="number"
                  min={1}
                  value={selected.capacity ?? ''}
                  placeholder="No limit"
                  onChange={(e) =>
                    patchRoom(selected.id, {
                      capacity: e.target.value ? Math.max(1, Number(e.target.value)) : null,
                    })
                  }
                  className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-xs"
                />
              </label>

              <fieldset className="mt-2">
                <legend className="mb-1 text-xs font-medium text-ktip-sand-700">Who can enter</legend>
                <p className="mb-1 text-[10px] text-ktip-sand-500">
                  Nothing ticked means everyone in the venue. Organizers always get in.
                </p>
                <div className="space-y-1">
                  {RESTRICTABLE_ROLES.map((role) => {
                    const on = selected.allowed_roles.includes(role)
                    return (
                      <label key={role} className="flex items-center gap-2 text-xs text-ktip-sand-700">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            patchRoom(selected.id, {
                              allowed_roles: on
                                ? selected.allowed_roles.filter((r) => r !== role)
                                : [...selected.allowed_roles, role],
                            })
                          }
                        />
                        {VENUE_ROLE_LABELS[role]}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <label className="mt-2 flex items-center gap-2 text-xs text-ktip-sand-700">
                <input
                  type="checkbox"
                  checked={selected.is_open}
                  onChange={(e) => patchRoom(selected.id, { is_open: e.target.checked })}
                />
                Open to enter
              </label>

              <label className="mt-1 flex items-center gap-2 text-xs text-ktip-sand-700">
                <input
                  type="checkbox"
                  checked={selected.recording_enabled}
                  onChange={(e) => patchRoom(selected.id, { recording_enabled: e.target.checked })}
                />
                Record this room
              </label>

              {selected.kind === 'sponsor_booth' && (
                <>
                  <label className="mt-2 block text-xs">
                    <span className="mb-1 block font-medium text-ktip-sand-700">Sponsor</span>
                    <input
                      value={selected.sponsor_name ?? ''}
                      onChange={(e) =>
                        patchRoom(selected.id, { sponsor_name: e.target.value || null })
                      }
                      className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="mt-2 block text-xs">
                    <span className="mb-1 block font-medium text-ktip-sand-700">Sponsor link</span>
                    <input
                      value={selected.sponsor_url ?? ''}
                      onChange={(e) =>
                        patchRoom(selected.id, { sponsor_url: e.target.value || null })
                      }
                      placeholder="https://…"
                      className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-xs"
                    />
                  </label>
                </>
              )}

              {/* ---- panels ----
                  What the room page actually renders. Left alone, a room
                  follows its purpose; the moment one box is ticked the whole
                  set is written down for that room. */}
              <fieldset className="mt-3 border-t border-ktip-sand-200 pt-2">
                <legend className="mb-1 text-xs font-medium text-ktip-sand-700">
                  Panels in this room
                </legend>
                <p className="mb-1.5 text-[10px] leading-snug text-ktip-sand-500">
                  {selected.sections.length
                    ? 'Set by hand for this room.'
                    : `Following the defaults for ${VENUE_ROOM_KIND_LABELS[selected.kind] || selected.kind}.`}
                </p>

                {(['main', 'aside'] as const).map((slot) => {
                  const choices = sectionChoices(selected).filter((c) => c.def.slot === slot)
                  if (!choices.length) return null
                  return (
                    <div key={slot} className="mb-1.5">
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ktip-sand-400">
                        {slot === 'main' ? 'Main column' : 'Beside it'}
                      </p>
                      <div className="space-y-1">
                        {choices.map(({ def, enabled }) => (
                          <label
                            key={def.id}
                            title={def.blurb}
                            className="flex items-start gap-2 text-xs text-ktip-sand-700"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={enabled}
                              onChange={() =>
                                patchRoom(selected.id, {
                                  sections: toggleSection(selected, def.id, !enabled),
                                })
                              }
                            />
                            {def.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {selected.sections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => patchRoom(selected.id, { sections: [] })}
                    className="text-[10px] font-semibold text-ktip-ocean-600 hover:underline"
                  >
                    Follow the defaults again
                  </button>
                )}

                {/* The sections whose content is typed here rather than read
                    from somewhere else. Shown only once the box is ticked. */}
                {(['objectives', 'rules'] as const).map((id) =>
                  sectionIsOn(selected, id) ? (
                    <label key={id} className="mt-2 block text-xs">
                      <span className="mb-1 block font-medium text-ktip-sand-700">
                        {id === 'objectives' ? 'What this room is for' : 'House rules'}
                      </span>
                      <textarea
                        rows={3}
                        value={sectionBody(selected, id)}
                        placeholder={
                          id === 'objectives'
                            ? 'Left blank, the room description is used.'
                            : 'Ground rules for this room.'
                        }
                        onChange={(e) =>
                          patchRoom(selected.id, {
                            sections: setSectionConfig(selected, id, { body: e.target.value }),
                          })
                        }
                        className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1.5 text-[11px]"
                      />
                    </label>
                  ) : null
                )}

                {sectionIsOn(selected, 'sponsor_links') && (
                  <SponsorLinkEditor
                    links={rawSponsorLinks(selected)}
                    onChange={(links) =>
                      patchRoom(selected.id, {
                        sections: setSectionConfig(selected, 'sponsor_links', { links }),
                      })
                    }
                  />
                )}
              </fieldset>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-ktip-sand-200 pt-2">
                <span className="font-mono text-[10px] text-ktip-sand-400">
                  {selected.cells.length} cells · {floorBadge(selected.floor)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteRoom(selected.id)}
                  className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={12} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- floor admin strip ---- */}
      <div className="flex flex-wrap items-center gap-2 border-t border-ktip-sand-200 px-3 py-2">
        <Boxes size={14} className="text-ktip-sand-400" aria-hidden="true" />
        <label className="text-xs text-ktip-sand-600">
          <span className="mr-1.5">Floor name</span>
          <input
            value={state.config.floors[floor]?.name ?? ''}
            onChange={(e) => renameFloor(floor, e.target.value)}
            className="rounded-lg border border-ktip-sand-200 px-2 py-1 text-xs"
          />
        </label>
        {state.config.floors.length > 1 && (
          <button
            type="button"
            onClick={() => deleteFloor(floor)}
            className="ml-auto flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 size={12} aria-hidden="true" />
            Delete this floor and its rooms
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function toDraft(room: VenueRoom): DraftRoom | null {
  return {
    id: room.id,
    key: room.key,
    name: room.name,
    kind: room.kind,
    description: room.description || '',
    color: room.color || '#2A5788',
    wall_height: clampHeight(room.wall_height),
    capacity: room.capacity,
    audio_mode: room.audio_mode,
    recording_enabled: room.recording_enabled,
    is_open: room.is_open,
    allowed_roles: room.allowed_roles || [],
    floor: Math.max(0, Math.trunc(Number(room.floor) || 0)),
    cells: parseCells(room.cells),
    sponsor_name: room.sponsor_name,
    sponsor_url: room.sponsor_url,
    sections: parseSections(room.sections),
  }
}

/**
 * Whether a section is on for this room, defaults included.
 *
 * Reads through sectionChoices rather than the stored list, so the config
 * editor for a panel a room gets from its kind appears without the host having
 * to tick a box that is already ticked.
 */
function sectionIsOn(room: DraftRoom, id: RoomSectionId): boolean {
  return sectionChoices(room).some((c) => c.def.id === id && c.enabled)
}

function sectionBody(room: DraftRoom, id: RoomSectionId): string {
  const config = room.sections.find((s) => s.id === id)?.config as
    | { body?: unknown }
    | undefined
  return typeof config?.body === 'string' ? config.body : ''
}

/** A preset's panel list, if it has one. See VenueRoomPreset.sections. */
function presetSections(preset: VenueRoomPreset): RoomSectionSetting[] {
  return (preset.sections || []).map((id) => ({ id }))
}

/**
 * The sponsor link rows as typed, not as validated.
 *
 * parseSponsorLinks drops anything that is not yet a valid http(s) URL, which
 * is the right behaviour on the room page and the wrong one in a text field —
 * a host typing "htt" would watch their row vanish. The editor keeps the raw
 * rows and lets the reader do the filtering.
 */
function rawSponsorLinks(room: DraftRoom): SponsorLink[] {
  const config = room.sections.find((s) => s.id === 'sponsor_links')?.config
  const raw = (config as { links?: unknown } | undefined)?.links
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_SPONSOR_LINKS).map((entry) => {
    const row = (entry || {}) as Record<string, unknown>
    return {
      label: typeof row.label === 'string' ? row.label : '',
      url: typeof row.url === 'string' ? row.url : '',
    }
  })
}

function SponsorLinkEditor({
  links,
  onChange,
}: {
  links: SponsorLink[]
  onChange: (links: SponsorLink[]) => void
}) {
  const patch = (index: number, field: keyof SponsorLink, value: string) =>
    onChange(links.map((link, i) => (i === index ? { ...link, [field]: value } : link)))

  // Rendered from the same parser the room page uses, so the count is what will
  // actually appear rather than what has been typed.
  const valid = parseSponsorLinks({ links }).length

  return (
    <div className="mt-2 rounded-lg border border-ktip-sand-200 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ktip-sand-400">
        Sponsor links
      </p>
      {links.map((link, i) => (
        <div key={i} className="mb-1.5 space-y-1">
          <input
            value={link.label}
            onChange={(e) => patch(i, 'label', e.target.value)}
            placeholder="We are hiring"
            className="w-full rounded-lg border border-ktip-sand-200 px-2 py-1 text-[11px]"
          />
          <div className="flex gap-1">
            <input
              value={link.url}
              onChange={(e) => patch(i, 'url', e.target.value)}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-lg border border-ktip-sand-200 px-2 py-1 text-[11px]"
            />
            <button
              type="button"
              onClick={() => onChange(links.filter((_, j) => j !== i))}
              aria-label="Remove this link"
              className="rounded-lg border border-ktip-sand-200 px-1.5 text-ktip-sand-500 hover:border-red-200 hover:text-red-600"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      {links.length < MAX_SPONSOR_LINKS && (
        <button
          type="button"
          onClick={() => onChange([...links, { label: '', url: '' }])}
          className="text-[10px] font-semibold text-ktip-ocean-600 hover:underline"
        >
          + Add a link
        </button>
      )}
      {links.length > valid && (
        <p className="mt-1 text-[10px] text-ktip-sun-700">
          {links.length - valid} of these {links.length === 1 ? 'is' : 'are'} not a full http(s)
          address and will not be shown.
        </p>
      )}
    </div>
  )
}

function sideLabel(side: FloorDoor['side'] | undefined): string {
  if (side === 'n') return 'north edge'
  if (side === 'e') return 'east edge'
  if (side === 'w') return 'west edge'
  return 'south edge'
}

function roomIdAt(rooms: DraftRoom[], floor: number, x: number, y: number): string | null {
  for (const room of rooms) {
    if (room.floor !== floor) continue
    for (const [cx, cy] of room.cells) if (cx === x && cy === y) return room.id
  }
  return null
}
