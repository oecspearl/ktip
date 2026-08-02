import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DoorOpen, Lock, Move, Users } from 'lucide-react'
import { VenueMapStage } from './VenueMapStage'
import { useAnimatedValue, useElementSize } from './useAnimatedValue'
import {
  VENUE_MAP,
  buildGeometry,
  clampToFloor,
  floorBadge,
  makeProjection,
  roomAt,
  spawnPoint,
  stepTowards,
  type RoomGeometry,
  type VenueMapConfig,
} from '../../../lib/venue-map'
import { VENUE } from '../../../lib/constants'
import type { PeerPosition } from '../../../hooks/useVenuePresence'
import type { VenueOccupant, VenuePosition, VenueRole, VenueRoom } from '../../../types'

interface VenueMapExplorerProps {
  config: VenueMapConfig
  rooms: VenueRoom[]
  occupants: VenueOccupant[]
  occupancy: Record<string, number>
  meId: string
  myRole: VenueRole
  /** Live peer positions, mutated in place by the presence channel. */
  peers: React.MutableRefObject<Map<string, PeerPosition>>
  onPositionChange: (pos: VenuePosition | null) => void
  onEnter: (room: VenueRoom) => void
}

type EnterPhase = 'idle' | 'walking' | 'zooming'

/** A member may enter unless the room is shut or its role list excludes them. */
export function canEnterRoom(room: VenueRoom, role: VenueRole): boolean {
  if (role === 'organizer') return true
  if (!room.is_open) return false
  const allowed = room.allowed_roles || []
  return allowed.length === 0 || allowed.includes(role)
}

/**
 * The walkable venue.
 *
 * You are a dot on the floorplan. Arrow keys or a click move you; walking into
 * a room, or clicking it, takes you inside. Entering is deliberately not
 * instant — the camera walks you over and pushes in, because a hard cut to a
 * chat page loses the one thing a map is for, which is knowing where you went.
 *
 * Everyone else's dot comes off the same presence channel that already drives
 * the avatars in the room lists, so no new subscription and no new table.
 */
export function VenueMapExplorer({
  config,
  rooms,
  occupants,
  occupancy,
  meId,
  myRole,
  peers,
  onPositionChange,
  onEnter,
}: VenueMapExplorerProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(wrapRef)

  const [floor, setFloor] = useState(0)
  const [zoom, setZoom] = useState({ k: 1, px: 0, py: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [phase, setPhase] = useState<EnterPhase>('idle')
  const [enteringRoomId, setEnteringRoomId] = useState<string | null>(null)
  const [veil, setVeil] = useState(0)
  const [, setFrame] = useState(0)

  const geometry = useMemo(() => buildGeometry(rooms), [rooms])
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])

  // Movement state lives in refs: this updates every animation frame and
  // nothing above this component needs to re-render when a dot moves 3px.
  const posRef = useRef<{ x: number; y: number } | null>(null)
  const targetRef = useRef<{ x: number; y: number } | null>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const pendingRoomRef = useRef<VenueRoom | null>(null)
  const phaseRef = useRef<EnterPhase>('idle')
  const enteredRef = useRef(false)
  const veilRef = useRef(0)

  const tilt = useAnimatedValue(1)
  const stack = 0 // one floor at a time: you can only stand on the floor you are on

  const topZ = Math.max(1, ...rooms.map((r) => Number(r.wall_height) || 1))
  const projection = useMemo(
    () =>
      makeProjection({
        cols: config.cols,
        rows: config.rows,
        tilt,
        width: size.width,
        height: size.height,
        zoom,
        topZ,
      }),
    [config.cols, config.rows, tilt, size, zoom, topZ]
  )

  // ---- spawn --------------------------------------------------------------

  useEffect(() => {
    if (posRef.current) return
    posRef.current = spawnPoint(config, geometry, floor)
    onPositionChange({ ...posRef.current, f: floor })
  }, [config, geometry, floor, onPositionChange])

  // ---- keyboard -----------------------------------------------------------

  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null
      return !!node && ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)
    }
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        keysRef.current.add(k)
        // Steering by hand cancels a click-to-walk, and cancels an entry that
        // has not committed yet: changing your mind is allowed until the door.
        targetRef.current = null
        if (phaseRef.current === 'walking') {
          pendingRoomRef.current = null
          phaseRef.current = 'idle'
          setPhase('idle')
          setEnteringRoomId(null)
        }
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---- the loop -----------------------------------------------------------

  const beginEntry = useCallback((room: VenueRoom) => {
    pendingRoomRef.current = room
    phaseRef.current = 'zooming'
    setPhase('zooming')
    setEnteringRoomId(room.id)
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      let moved = false
      const pos = posRef.current

      if (pos && phaseRef.current !== 'zooming') {
        // Keyboard first — a held key beats a stale click target.
        const keys = keysRef.current
        let dx = 0
        let dy = 0
        if (keys.has('arrowup') || keys.has('w')) dy -= 1
        if (keys.has('arrowdown') || keys.has('s')) dy += 1
        if (keys.has('arrowleft') || keys.has('a')) dx -= 1
        if (keys.has('arrowright') || keys.has('d')) dx += 1

        if (dx || dy) {
          const len = Math.hypot(dx, dy) || 1
          const next = clampToFloor(config, {
            x: pos.x + (dx / len) * VENUE.WALK_SPEED * dt,
            y: pos.y + (dy / len) * VENUE.WALK_SPEED * dt,
          })
          posRef.current = next
          moved = true
        } else if (targetRef.current) {
          const { pos: next, arrived } = stepTowards(pos, targetRef.current, VENUE.WALK_SPEED, dt)
          posRef.current = clampToFloor(config, next)
          moved = true
          if (arrived) {
            targetRef.current = null
            const room = pendingRoomRef.current
            if (room) beginEntry(room)
          }
        }
      }

      if (moved && posRef.current) {
        onPositionChange({ ...posRef.current, f: floor })
      }

      // Camera: push in on the room being entered, otherwise sit still.
      if (phaseRef.current === 'zooming' && pendingRoomRef.current) {
        const geo = geometry[pendingRoomRef.current.id]
        if (geo && wrapRef.current) {
          const [sx, sy] = projection.project(geo.centroid[0], geo.centroid[1], 0)
          const cx = size.width / 2
          const cy = size.height / 2
          setZoom((z) => ({
            k: Math.min(2.6, z.k + (2.6 - z.k) * Math.min(1, dt * 4)),
            px: z.px + (cx - sx) * Math.min(1, dt * 5),
            py: z.py + (cy - sy) * Math.min(1, dt * 5),
          }))
        }
        // The veil is tracked in a ref and mirrored to state: firing the
        // navigation from inside a state updater would run it twice under
        // StrictMode, and entering a room twice is a double join_venue call.
        veilRef.current = Math.min(1, veilRef.current + dt * 1.9)
        setVeil(veilRef.current)
        if (veilRef.current >= 0.999 && !enteredRef.current) {
          enteredRef.current = true
          const room = pendingRoomRef.current
          if (room) onEnter(room)
        }
      }

      // One re-render per frame while anything is in motion. When the venue is
      // still and nobody is walking, this settles to nothing.
      if (moved || phaseRef.current === 'zooming' || peers.current.size > 0) {
        setFrame((f) => (f + 1) % 1_000_000)
      }

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [config, floor, geometry, projection, size, onPositionChange, onEnter, beginEntry, peers])

  // ---- pointer ------------------------------------------------------------

  const pointerToGrid = (e: React.PointerEvent): [number, number] => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return projection.unproject(e.clientX - rect.left, e.clientY - rect.top, 0)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const [x, y] = pointerToGrid(e)
    const geo = roomAt(geometry, floor, x, y)
    setHoveredId(geo ? geo.room.id : null)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (phase === 'zooming') return
    const [x, y] = pointerToGrid(e)
    const hit = roomAt(geometry, floor, x, y)

    if (hit) {
      const room = roomsById.get(hit.room.id)
      if (!room || !canEnterRoom(room, myRole)) return
      pendingRoomRef.current = room
      targetRef.current = { x: hit.centroid[0], y: hit.centroid[1] }
      phaseRef.current = 'walking'
      setPhase('walking')
      setEnteringRoomId(room.id)
      return
    }

    pendingRoomRef.current = null
    targetRef.current = clampToFloor(config, { x, y })
    phaseRef.current = 'idle'
    setPhase('idle')
    setEnteringRoomId(null)
  }

  // ---- derived ------------------------------------------------------------

  const me = posRef.current
  const standingIn = me ? roomAt(geometry, floor, me.x, me.y) : null
  const standingRoom = standingIn ? roomsById.get(standingIn.room.id) || null : null

  const mutedIds = useMemo(() => {
    const out = new Set<string>()
    for (const room of rooms) if (!canEnterRoom(room, myRole)) out.add(room.id)
    return out
  }, [rooms, myRole])

  const hoveredRoom = hoveredId ? roomsById.get(hoveredId) || null : null
  const hoveredGeo = hoveredId ? geometry[hoveredId] : null

  // Where everyone else is. A peer with a live movement packet is drawn from
  // that; anyone else falls back to the coarse position on their presence
  // payload, which is what a member who has not moved since joining has.
  const others = occupants
    .filter((o) => o.user_id !== meId && o.availability !== 'offline')
    .map((o) => {
      const live = peers.current.get(o.user_id)
      const fresh = live && Date.now() - live.at < VENUE.POS_STALE_MS ? live : null
      const pos = fresh ?? o.pos
      return pos && (pos.f ?? 0) === floor ? { occupant: o, pos } : null
    })
    .filter(Boolean) as Array<{ occupant: VenueOccupant; pos: VenuePosition }>

  return (
    <div
      ref={wrapRef}
      className="relative h-[32rem] w-full overflow-hidden rounded-2xl border border-ktip-sand-200 bg-ktip-canvas shadow-card md:h-[36rem]"
    >
      <svg
        width="100%"
        height="100%"
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoveredId(null)}
      >
        <VenueMapStage
          config={config}
          geometry={geometry}
          projection={projection}
          floor={floor}
          tilt={tilt}
          stack={stack}
          hoveredId={hoveredId}
          selectedId={enteringRoomId}
          mutedIds={mutedIds}
        />
      </svg>

      {/* ---- room labels ---- */}
      <div className="pointer-events-none absolute inset-0">
        {Object.values(geometry)
          .filter((g: RoomGeometry<VenueRoom>) => g.floor === floor)
          .map((g: RoomGeometry<VenueRoom>) => {
            const room = g.room
            const [sx, sy] = projection.project(g.centroid[0], g.centroid[1], g.height)
            const here = occupancy[room.id] || 0
            const locked = !canEnterRoom(room, myRole)
            return (
              <div
                key={room.id}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={{ left: sx, top: sy - 8 }}
              >
                <span
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-ktip-cream/90 px-2.5 py-1 text-[11px] font-semibold shadow-card backdrop-blur-sm ${
                    locked ? 'text-ktip-sand-500' : 'text-ktip-sand-900'
                  }`}
                  style={{ borderColor: hoveredId === room.id ? g.color : 'var(--color-ktip-sand-200)' }}
                >
                  {locked ? (
                    <Lock size={10} aria-hidden="true" />
                  ) : (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: g.color }}
                      aria-hidden="true"
                    />
                  )}
                  {room.name}
                  {here > 0 && (
                    <span className="flex items-center gap-0.5 font-mono text-[10px] text-ktip-sand-500">
                      <Users size={9} aria-hidden="true" />
                      {here}
                    </span>
                  )}
                </span>
              </div>
            )
          })}

        {/* ---- other people ---- */}
        {others.map(({ occupant, pos }) => {
          const [sx, sy] = projection.project(pos.x, pos.y, 0)
          return (
            <div
              key={occupant.user_id}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-100"
              style={{ left: sx, top: sy }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ktip-cream bg-ktip-ocean-500 text-[9px] font-bold text-white shadow-card"
                title={occupant.display_name || 'Member'}
              >
                {initials(occupant.display_name)}
              </span>
            </div>
          )
        })}

        {/* ---- you ---- */}
        {me && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: projection.project(me.x, me.y, 0)[0], top: projection.project(me.x, me.y, 0)[1] }}
          >
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-ktip-cream bg-ktip-tropical-500 text-[10px] font-bold text-ktip-ocean-700 shadow-card">
              You
            </span>
          </div>
        )}
      </div>

      {/* ---- hover card ---- */}
      {hoveredRoom && hoveredGeo && phase === 'idle' && (
        <div
          className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 rounded-xl border border-ktip-sand-200 bg-ktip-cream/95 p-2.5 text-xs shadow-card backdrop-blur"
          style={{
            left: projection.project(hoveredGeo.centroid[0], hoveredGeo.centroid[1], hoveredGeo.height)[0],
            top:
              projection.project(hoveredGeo.centroid[0], hoveredGeo.centroid[1], hoveredGeo.height)[1] + 14,
          }}
        >
          <p className="font-semibold text-ktip-sand-900">{hoveredRoom.name}</p>
          {hoveredRoom.description && (
            <p className="mt-0.5 text-[11px] leading-snug text-ktip-sand-600">
              {hoveredRoom.description}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-ktip-sand-500">
            {occupancy[hoveredRoom.id] || 0} here
            {hoveredRoom.capacity ? ` · cap ${hoveredRoom.capacity}` : ''} ·{' '}
            {hoveredRoom.audio_mode.replace('_', ' ')}
          </p>
          {!canEnterRoom(hoveredRoom, myRole) && (
            <p className="mt-1 text-[10px] font-semibold text-ktip-sand-500">
              {hoveredRoom.is_open ? 'Restricted to other roles' : 'Closed right now'}
            </p>
          )}
        </div>
      )}

      {/* ---- floors ---- */}
      {config.floors.length > 1 && (
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {config.floors.map((f, i) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setFloor(i)
                const landing = spawnPoint(config, geometry, i)
                posRef.current = landing
                targetRef.current = null
                onPositionChange({ ...landing, f: i })
              }}
              aria-pressed={i === floor}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur transition-colors ${
                i === floor
                  ? 'border-ktip-ocean-300 bg-ktip-ocean-50/90 text-ktip-ocean-700'
                  : 'border-ktip-sand-200 bg-ktip-cream/80 text-ktip-sand-600 hover:border-ktip-sand-300'
              }`}
            >
              <span className="font-mono text-[10px] opacity-70">{floorBadge(i)}</span>
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* ---- standing-in prompt ---- */}
      {standingRoom && phase === 'idle' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={() => {
              if (!canEnterRoom(standingRoom, myRole)) return
              beginEntry(standingRoom)
            }}
            disabled={!canEnterRoom(standingRoom, myRole)}
            className="flex items-center gap-2 rounded-full border border-ktip-ocean-300 bg-ktip-ocean-600 px-4 py-2 text-sm font-semibold text-white shadow-card transition-transform hover:-translate-y-0.5 disabled:opacity-50 dark:bg-ktip-ocean-200 dark:text-ktip-ocean-900"
          >
            <DoorOpen size={15} aria-hidden="true" />
            Enter {standingRoom.name}
          </button>
        </div>
      )}

      {/* ---- controls hint ---- */}
      <p className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 font-mono text-[10px] text-ktip-sand-400">
        <Move size={11} aria-hidden="true" />
        arrows / WASD to walk · click a room to go in
      </p>

      {/* ---- entry veil ---- */}
      <div
        className="pointer-events-none absolute inset-0 bg-ktip-ocean-700"
        style={{ opacity: veil * 0.92, transition: 'opacity 80ms linear' }}
        aria-hidden={veil < 0.02}
      >
        {veil > 0.35 && enteringRoomId && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-display text-lg font-bold text-white">
            Entering {roomsById.get(enteringRoomId)?.name}…
          </p>
        )}
      </div>
    </div>
  )
}

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}
