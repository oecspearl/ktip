import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  DoorOpen,
  Lock,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react'
import { VenueMapStage } from './VenueMapStage'
import { VenueRoomList } from './VenueRoomList'
import { useAnimatedValue, useElementSize } from './useAnimatedValue'
import {
  VENUE_MAP,
  buildGeometry,
  clampToFloor,
  contrastInk,
  floorAlpha as floorAlphaAt,
  floorBadge,
  isOnStairs,
  makeProjection,
  roomAt,
  spawnAtDoor,
  stairsCentre,
  stepTowards,
  type RoomGeometry,
  type VenueMapConfig,
} from '../../../lib/venue-map'
import { VENUE } from '../../../lib/constants'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import type { PeerPosition } from '../../../hooks/useVenuePresence'
import type { VenueOccupant, VenuePosition, VenueRole, VenueRoom } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface VenueMapExplorerProps {
  config: VenueMapConfig
  rooms: VenueRoom[]
  occupants: VenueOccupant[]
  occupancy: Record<string, number>
  meId: string
  myName: string
  myAvatarUrl: string | null
  myRole: VenueRole
  /** Live peer positions, mutated in place by the presence channel. */
  peers: React.MutableRefObject<Map<string, PeerPosition>>
  /**
   * The room this member was in a moment ago. Set when they have just left one,
   * and it is what turns a hard cut back to the map into the reverse of the
   * entry animation: the camera starts inside that room and pulls out.
   */
  arriveFromRoomId?: string | null
  /** A room chosen from the sidebar. The nonce lets the same one be re-picked. */
  focusRoom?: { roomId: string; nonce: number } | null
  onPositionChange: (pos: VenuePosition | null) => void
  /** The room being stood in without entering, for the side panel. */
  onStandingRoomChange?: (roomId: string | null) => void
  /**
   * The room being pointed at, on the map or in the rail. Clicking a room walks
   * you into it, so hovering is the only way to read one you are not standing
   * in — the side panel shows this in place of the room underfoot.
   */
  onPreviewRoomChange?: (roomId: string | null) => void
  /**
   * Commit to the room. Return (or resolve) `false` when entry was refused —
   * the camera pulls back out instead of leaving the veil up over the map.
   */
  onEnter: (room: VenueRoom) => void | boolean | Promise<void | boolean>
  /**
   * Fill the parent instead of self-sizing to the viewport, and drop the card
   * chrome — for the immersive floorplan page, where the map is the page.
   */
  frameless?: boolean
}

type EnterPhase = 'idle' | 'walking' | 'zooming' | 'arriving'

/** Walking to a room is a decision already made, so it is not a stroll. */
const APPROACH_SPEED = VENUE.WALK_SPEED * 1.8

/** How far in the camera sits at the moment of entering, and of coming back. */
const ARRIVE_ZOOM = 2.6

/**
 * Breathing room around the fitted floor, in pixels.
 *
 * Tighter than the projection's own default: this view has a frame around it
 * already, and the slack the editor needs for handles is, here, just a smaller
 * building. Enough is kept for the name tags, which are drawn above the walls.
 */
const VIEW_PAD = 52

/**
 * Extra height the fit reserves above the tallest wall, in wall units — the
 * palm crowns stand past the slab edge, and without this the back row loses
 * its fronds to the viewport edge.
 */
const DECOR_HEADROOM = 1.4

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
  myName,
  myAvatarUrl,
  myRole,
  peers,
  arriveFromRoomId,
  focusRoom,
  onPositionChange,
  onStandingRoomChange,
  onPreviewRoomChange,
  onEnter,
  frameless,
}: VenueMapExplorerProps) {
  const { t } = useLingui()
  const myDisplayName = myName || t`You`
  const wrapRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(wrapRef)

  const [floor, setFloor] = useState(0)
  const [zoom, setZoom] = useState({ k: 1, px: 0, py: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  /** Hover in the rooms rail. Kept apart from the map's own hover so pointing
      at a row can also light that room up on the floor. */
  const [railHoverId, setRailHoverId] = useState<string | null>(null)
  // View controls. 2D is the honest plan view — easier to judge distance in,
  // and the one people fall back to when the walls get in the way. Stack lifts
  // the floors apart so a multi-level venue reads as a building.
  const [iso, setIso] = useState(true)
  const [stacked, setStacked] = useState(false)
  const [railOpen, setRailOpen] = useState(true)
  /**
   * A floor change in progress. `mix` runs 0 → 1 in the animation loop and
   * drives every level's opacity, so the floor you left dissolves as the one
   * you arrived on solidifies.
   */
  const [fade, setFade] = useState({ from: 0, to: 0, mix: 1 })
  const [phase, setPhase] = useState<EnterPhase>('idle')
  const [enteringRoomId, setEnteringRoomId] = useState<string | null>(null)
  const [veil, setVeil] = useState(0)
  const [, setFrame] = useState(0)

  const geometry = useMemo(() => buildGeometry(rooms), [rooms])
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])

  // Movement state lives in refs: this updates every animation frame and
  // nothing above this component needs to re-render when a dot moves 3px.
  const posRef = useRef<{ x: number; y: number } | null>(null)
  // The camera too: the zoom easing corrects pan against where the room sits
  // on screen, and reading that from the render-time projection overshoots
  // whenever a slow frame lets several steps run against the same stale
  // render — seen as the camera bouncing on the way into a room. The ref is
  // the source of truth per step; the state is only the mirror React draws.
  const zoomRef = useRef({ k: 1, px: 0, py: 0 })
  // The loop reads the callbacks through refs: the page recreates them on its
  // own re-renders (presence churn), and as effect deps each new identity tore
  // the animation loop down mid-walk — a visible hiccup every restart.
  const onEnterRef = useRef(onEnter)
  const onPositionChangeRef = useRef(onPositionChange)
  useEffect(() => {
    onEnterRef.current = onEnter
    onPositionChangeRef.current = onPositionChange
  })
  const targetRef = useRef<{ x: number; y: number } | null>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const pendingRoomRef = useRef<VenueRoom | null>(null)
  const phaseRef = useRef<EnterPhase>('idle')
  const enteredRef = useRef(false)
  const veilRef = useRef(0)
  const fadeRef = useRef({ from: 0, to: 0, mix: 1 })

  // Both eased on animation frames rather than by CSS: the projection is
  // recomputed from them every frame, so the map tips and lifts instead of
  // cutting between two states.
  const tilt = useAnimatedValue(iso ? 1 : 0)
  const stack = useAnimatedValue(stacked && iso && config.floors.length > 1 ? 1 : 0)

  const tallest = Math.max(1, ...rooms.map((r) => Number(r.wall_height) || 1))
  const topZ =
    Math.max(stack * (config.floors.length - 1), floor) * VENUE_MAP.LEVEL_H +
    tallest +
    DECOR_HEADROOM
  /**
   * Height a level's slab is drawn at. The floor being stood on always sits at
   * its true storey height (the stage's `elevate`), so Level 1 floats over the
   * lawn even in the flat view; the others only rise as the stack pulls apart.
   */
  const levelZOf = useCallback(
    (level: number) => level * VENUE_MAP.LEVEL_H * (level === floor ? 1 : stack),
    [floor, stack]
  )
  /** Height of the floor being stood on — where the avatars walk. */
  const zBase = levelZOf(floor)
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
        padding: VIEW_PAD,
      }),
    [config.cols, config.rows, tilt, size, zoom, topZ]
  )

  /**
   * Move to another level.
   *
   * One routine for the stairs, the floor chips and the sidebar, so all three
   * cross-fade identically and all three land you somewhere sensible: on the
   * stairs if that is how you travelled, at the door otherwise.
   */
  const goToFloor = useCallback(
    (level: number, viaStairs = false) => {
      if (level < 0 || level >= config.floors.length) return
      const current = fadeRef.current.to
      if (level === current) return

      fadeRef.current = { from: current, to: level, mix: 0 }
      setFade({ ...fadeRef.current })
      setFloor(level)
      setHoveredId(null)

      const landing =
        viaStairs && config.stairs
          ? stairsCentre(config.stairs)
          : spawnAtDoor(config, geometry, level)
      posRef.current = landing
      targetRef.current = null
      pendingRoomRef.current = null
      onPositionChange({ ...landing, f: level })
    },
    [config, geometry, onPositionChange]
  )

  // ---- spawn --------------------------------------------------------------

  useEffect(() => {
    if (posRef.current) return

    // Coming back out of a room: stand where that room is, with the camera
    // still pushed in and the veil still up, and let the loop pull both back.
    const from = arriveFromRoomId ? geometry[arriveFromRoomId] : null
    if (from) {
      posRef.current = { x: from.centroid[0], y: from.centroid[1] }
      setFloor(from.floor)
      fadeRef.current = { from: from.floor, to: from.floor, mix: 1 }
      setFade({ ...fadeRef.current })
      onPositionChange({ ...posRef.current, f: from.floor })

      const zoomed = makeProjection({
        cols: config.cols,
        rows: config.rows,
        tilt: 1,
        width: size.width,
        height: size.height,
        zoom: { k: ARRIVE_ZOOM, px: 0, py: 0 },
        topZ,
        padding: VIEW_PAD,
      })
      const [sx, sy] = zoomed.project(
        from.centroid[0],
        from.centroid[1],
        from.floor * VENUE_MAP.LEVEL_H
      )
      zoomRef.current = { k: ARRIVE_ZOOM, px: size.width / 2 - sx, py: size.height / 2 - sy }
      setZoom(zoomRef.current)
      veilRef.current = 1
      setVeil(1)
      phaseRef.current = 'arriving'
      setPhase('arriving')
      return
    }

    // First arrival: through the front door, which is what a door is for.
    posRef.current = spawnAtDoor(config, geometry, floor)
    onPositionChange({ ...posRef.current, f: floor })
  }, [config, geometry, floor, size, topZ, arriveFromRoomId, onPositionChange])

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
    let lastTick = 0

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      let moved = false
      const pos = posRef.current

      if (pos && phaseRef.current !== 'zooming' && phaseRef.current !== 'arriving') {
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
          // Heading for a room is brisker than wandering to a spot on the floor.
          const speed = pendingRoomRef.current ? APPROACH_SPEED : VENUE.WALK_SPEED
          const { pos: next, arrived } = stepTowards(pos, targetRef.current, speed, dt)
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
        onPositionChangeRef.current({ ...posRef.current, f: floor })
      }

      // Camera: push in on the room being entered, otherwise sit still.
      if (phaseRef.current === 'zooming' && pendingRoomRef.current) {
        const geo = geometry[pendingRoomRef.current.id]
        if (geo && wrapRef.current) {
          // Projected from the ref's zoom, not the render's: the pan
          // correction must see its own previous step, or a lagging render
          // makes it re-apply corrections and the camera bounces.
          const z = zoomRef.current
          const stepProj = makeProjection({
            cols: config.cols,
            rows: config.rows,
            tilt,
            width: size.width,
            height: size.height,
            zoom: z,
            topZ,
            padding: VIEW_PAD,
          })
          // The room being entered is on the active floor, which the stage
          // draws at its true storey height — aim the camera at that height.
          const [sx, sy] = stepProj.project(
            geo.centroid[0],
            geo.centroid[1],
            floor * VENUE_MAP.LEVEL_H
          )
          const cx = size.width / 2
          const cy = size.height / 2
          zoomRef.current = {
            k: Math.min(2.6, z.k + (2.6 - z.k) * Math.min(1, dt * 4)),
            px: z.px + (cx - sx) * Math.min(1, dt * 5),
            py: z.py + (cy - sy) * Math.min(1, dt * 5),
          }
          setZoom(zoomRef.current)
        }
        // The veil is tracked in a ref and mirrored to state: firing the
        // navigation from inside a state updater would run it twice under
        // StrictMode, and entering a room twice is a double join_venue call.
        veilRef.current = Math.min(1, veilRef.current + dt * 1.9)
        setVeil(veilRef.current)
        if (veilRef.current >= 0.999 && !enteredRef.current) {
          enteredRef.current = true
          const room = pendingRoomRef.current
          if (room) {
            void (async () => {
              const ok = await onEnterRef.current(room)
              if (ok === false) {
                // Entry refused (closed door, capacity, network): unwind the
                // same way a room is left, rather than sitting behind the veil.
                enteredRef.current = false
                pendingRoomRef.current = null
                setEnteringRoomId(null)
                phaseRef.current = 'arriving'
                setPhase('arriving')
              }
            })()
          }
        }
      }

      // Floor cross-fade. Eased here rather than in CSS because the same number
      // has to reach the SVG renderer, which paints per frame from a prop.
      if (fadeRef.current.mix < 1) {
        fadeRef.current = {
          ...fadeRef.current,
          mix: Math.min(1, fadeRef.current.mix + dt * 2.4),
        }
        setFade({ ...fadeRef.current })
      }

      // Coming back out: the entry animation played backwards. Same easing, so
      // leaving a room feels like the same door it was entered through.
      if (phaseRef.current === 'arriving') {
        const z = zoomRef.current
        const ease = Math.min(1, dt * 3.2)
        zoomRef.current = {
          k: z.k + (1 - z.k) * ease,
          px: z.px * (1 - ease),
          py: z.py * (1 - ease),
        }
        setZoom(zoomRef.current)
        veilRef.current = Math.max(0, veilRef.current - dt * 1.6)
        setVeil(veilRef.current)
        if (veilRef.current <= 0.001) {
          phaseRef.current = 'idle'
          setPhase('idle')
          setEnteringRoomId(null)
        }
      }

      // Re-render only when something actually moved, and at most ~30fps for
      // other people's dots: a venue with twenty idle avatars must not re-render
      // this page sixty times a second forever.
      // p.at is a wall clock (Date.now) while `now` is a monotonic frame time,
      // so staleness has to be measured against the wall clock.
      const wall = Date.now()
      const peerMoving = [...peers.current.values()].some(
        (p) => wall - p.at < VENUE.POS_BROADCAST_MS * 4
      )
      // Your own step and the camera render at frame rate — sampling your own
      // walk at 30fps is what reads as jitter. The 33ms throttle only guards
      // against other people's dots re-rendering an otherwise idle map.
      if (
        moved ||
        phaseRef.current === 'zooming' ||
        phaseRef.current === 'arriving' ||
        fadeRef.current.mix < 1
      ) {
        lastTick = now
        setFrame((f) => (f + 1) % 1_000_000)
      } else if (peerMoving && now - lastTick >= 33) {
        lastTick = now
        setFrame((f) => (f + 1) % 1_000_000)
      }

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // `projection` deliberately absent: the loop builds its own from zoomRef.
    // Depending on it re-registered this effect on every zooming frame. The
    // callbacks are read through refs for the same reason.
  }, [config, floor, geometry, tilt, topZ, size, beginEntry, peers])

  // ---- pointer ------------------------------------------------------------

  const pointerToGrid = (e: React.PointerEvent, z = zBase): [number, number] => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return projection.unproject(e.clientX - rect.left, e.clientY - rect.top, z)
  }

  /**
   * What is under the cursor.
   *
   * Pulled apart, the floors overlap on screen, so each one is unprojected at
   * its own height and the topmost hit wins — that is what makes clicking a
   * room on Level 2 select the room on Level 2 and not the slab beneath it.
   */
  const pickAt = (e: React.PointerEvent): { floor: number; geo: RoomGeometry<VenueRoom> } | null => {
    const levels =
      stack > 0.5 ? config.floors.map((_, i) => i) : [floor]
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i]
      const [x, y] = pointerToGrid(e, levelZOf(level))
      const geo = roomAt(geometry, level, x, y)
      if (geo) return { floor: level, geo }
    }
    return null
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const hit = pickAt(e)
    setHoveredId(hit ? hit.geo.room.id : null)
  }

  /** Walk to a room and go in. Crossing floors moves you there first. */
  const approach = (room: VenueRoom, geo: RoomGeometry<VenueRoom>, level: number) => {
    if (!canEnterRoom(room, myRole)) return
    if (level !== floor) goToFloor(level)
    pendingRoomRef.current = room
    targetRef.current = { x: geo.centroid[0], y: geo.centroid[1] }
    phaseRef.current = 'walking'
    setPhase('walking')
    setEnteringRoomId(room.id)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (phase === 'zooming') return
    const hit = pickAt(e)

    if (hit) {
      const room = roomsById.get(hit.geo.room.id)
      if (room) approach(room, hit.geo, hit.floor)
      return
    }

    // Empty floor. Clicking one of the other slabs in a stack means "take me to
    // that level", not "walk to a spot on the floor I am already standing on".
    const [x, y] = pointerToGrid(e)
    pendingRoomRef.current = null
    targetRef.current = clampToFloor(config, { x, y })
    phaseRef.current = 'idle'
    setPhase('idle')
    setEnteringRoomId(null)
  }

  // ---- derived ------------------------------------------------------------

  /**
   * Per-level opacity, shared by the SVG and by the HTML labels over it.
   *
   * Stacked, floors you are not on stay faintly there as context. Flat, they
   * are not drawn at all — which is what turns a floor change from a cut into
   * a dissolve: the level you left fades to nothing exactly as the new one
   * comes up, in the same place.
   */
  const alphaFor = useCallback(
    // Ghost floors sit at 0.07: present enough to read as the rest of the
    // building, faint enough that the active floor is unmistakably the one
    // being stood on.
    (level: number) => floorAlphaAt(level, fade.from, fade.to, fade.mix, stack > 0.02 ? 0.07 : 0),
    [fade, stack]
  )

  const me = posRef.current
  const onStairs = isOnStairs(config.stairs, me)
  const standingIn = me ? roomAt(geometry, floor, me.x, me.y) : null
  const standingRoom = standingIn ? roomsById.get(standingIn.room.id) || null : null

  // Tell the page which room is underfoot so it can show that room's rules
  // beside the map. Reported from an effect rather than during render because
  // the position it reads is a ref the animation loop is writing.
  const standingId = standingRoom?.id ?? null
  useEffect(() => {
    onStandingRoomChange?.(standingId)
  }, [standingId, onStandingRoomChange])

  /** The rail wins over the map: it is the deliberate pointer of the two. */
  const activeHoverId = railHoverId ?? hoveredId

  // Pointing at a room reads it in the side panel. Suppressed once an entry is
  // under way — the camera is already committed, and suppressed for the room
  // underfoot so standing there keeps saying "you are at" rather than flicking
  // to a preview of where you already are.
  const previewId =
    phase === 'idle' && activeHoverId && activeHoverId !== standingId ? activeHoverId : null
  useEffect(() => {
    onPreviewRoomChange?.(previewId)
  }, [previewId, onPreviewRoomChange])

  // A room picked from the sidebar list behaves exactly like clicking it on the
  // map. The nonce is what makes picking the same room twice work.
  const lastFocusRef = useRef(0)
  useEffect(() => {
    if (!focusRoom || focusRoom.nonce === lastFocusRef.current) return
    lastFocusRef.current = focusRoom.nonce
    const geo = geometry[focusRoom.roomId]
    const room = roomsById.get(focusRoom.roomId)
    if (!geo || !room || !canEnterRoom(room, myRole)) return

    if (geo.floor !== floor) goToFloor(geo.floor)
    pendingRoomRef.current = room
    targetRef.current = { x: geo.centroid[0], y: geo.centroid[1] }
    phaseRef.current = 'walking'
    setPhase('walking')
    setEnteringRoomId(room.id)
  }, [focusRoom, geometry, roomsById, myRole, floor, goToFloor])

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
    // Sized to the window, not to a card. The floor is the content, so it takes
    // what is left of the viewport under the page chrome — and stops there, so
    // the first scroll reaches the footer rather than more map. Clamped at both
    // ends: never so short it cannot be walked, never taller than the screen.
    <div
      className={`flex w-full overflow-hidden bg-ktip-cream ${
        frameless
          ? 'h-full'
          : 'h-[clamp(26rem,calc(100svh-var(--nav-h)-19rem),46rem)] rounded-2xl border border-ktip-sand-200 shadow-card md:h-[clamp(28rem,calc(100svh-var(--nav-h)-16rem),46rem)]'
      }`}
    >
      {/* ---- rooms rail ----
          Attached to the map rather than floating beside it, and collapsible,
          because on a small screen the list and the floor are competing for the
          same space and the floor should win. */}
      <div
        className={`flex shrink-0 flex-col border-r border-ktip-sand-200 transition-[width] duration-300 ${
          railOpen ? 'w-52' : 'w-9'
        }`}
        // The same grid the floor is drawn on, so the rail reads as part of the
        // map rather than as a panel that happens to be next to it.
        style={{
          backgroundImage:
            'linear-gradient(var(--color-ktip-sand-200) 1px, transparent 1px), linear-gradient(90deg, var(--color-ktip-sand-200) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
          backgroundColor: 'var(--color-ktip-cream)',
        }}
      >
        {/* The whole bar is the control — collapsed there is nothing else to
            click, and expanded the header is the obvious place to press. */}
        <button
          type="button"
          onClick={() => setRailOpen((v) => !v)}
          aria-expanded={railOpen}
          className={`border-b border-ktip-sand-200 bg-ktip-cream/70 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500 hover:bg-ktip-sand-50 ${
            railOpen ? 'flex items-center px-2 py-2' : 'flex-1 pt-2'
          }`}
        >
          {railOpen ? (
            <>
              {/* Centred by the two side cells being the same width — the icon
                  is an affordance, the whole bar is still the button. */}
              <PanelLeftClose size={14} className="shrink-0 opacity-0" aria-hidden="true" />
              <span className="flex-1 text-center">
                <Trans>
                  Rooms <span className="font-mono text-[10px] text-ktip-sand-400">{rooms.length}</span>
                </Trans>
              </span>
              <PanelLeftClose size={14} className="shrink-0" aria-hidden="true" />
            </>
          ) : (
            <span className="flex flex-col items-center gap-2">
              <PanelLeftOpen size={14} aria-hidden="true" />
              <span
                className="font-mono text-[10px] tracking-widest"
                style={{ writingMode: 'vertical-rl' }}
              >
                <Trans>Rooms</Trans>
              </span>
            </span>
          )}
          <span className="sr-only">{railOpen ? t`Collapse the room list` : t`Show the room list`}</span>
        </button>

        {railOpen && (
          <div className="min-h-0 flex-1 overflow-y-auto bg-ktip-cream/70 p-2">
            <VenueRoomList
              bare
              config={config}
              rooms={rooms}
              occupancy={occupancy}
              activeRoomId={standingRoom?.id ?? null}
              lockedIds={mutedIds}
              onPick={(room) => {
                const geo = geometry[room.id]
                if (geo) approach(room, geo, geo.floor)
              }}
              onHover={(room) => setRailHoverId(room?.id ?? null)}
            />
          </div>
        )}
      </div>

      <div ref={wrapRef} className="relative min-w-0 flex-1 bg-ktip-canvas">
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
          floorAlpha={alphaFor}
          tilt={tilt}
          stack={stack}
          hoveredId={activeHoverId}
          selectedId={enteringRoomId}
          mutedIds={mutedIds}
          showGrid
          decor
          elevate
        />
      </svg>

      {/* ---- room labels ---- */}
      <div className="pointer-events-none absolute inset-0">
        {Object.values(geometry)
          // Only the floor being stood on is labelled. In a stack the other
          // levels are context, and their name tags read as clutter over the
          // one you are actually on — they fade out with the floor itself.
          .filter((g: RoomGeometry<VenueRoom>) => alphaFor(g.floor) > 0.35)
          .map((g: RoomGeometry<VenueRoom>) => {
            const room = g.room
            const levelZ = levelZOf(g.floor)
            const [sx, sy] = projection.project(g.centroid[0], g.centroid[1], levelZ + g.height)
            const here = occupancy[room.id] || 0
            const locked = !canEnterRoom(room, myRole)
            const presence = alphaFor(g.floor)
            return (
              <div
                key={room.id}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={{ left: sx, top: sy - 8, opacity: Math.max(0, (presence - 0.35) / 0.65) }}
              >
                <span
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-ktip-cream/90 px-2.5 py-1 text-[11px] font-semibold shadow-card backdrop-blur-sm ${
                    locked ? 'text-ktip-sand-500' : 'text-ktip-sand-900'
                  }`}
                  style={{
                    borderColor: activeHoverId === room.id ? g.color : 'var(--color-ktip-sand-200)',
                  }}
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
          const [sx, sy] = projection.project(pos.x, pos.y, zBase)
          return (
            <div
              key={occupant.user_id}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-100"
              style={{ left: sx, top: sy }}
            >
              <DiamondAvatar
                src={occupant.avatar_url}
                name={occupant.display_name || t`Member`}
                size={26}
                title={occupant.display_name || t`Member`}
                frameClassName="ring-1 ring-ktip-sand-200"
              />
            </div>
          )
        })}

        {/* ---- you ----
            Same diamond the rest of the app uses for a person, ringed in brand
            green so it is findable in a crowd of identical shapes. */}
        {me && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: projection.project(me.x, me.y, zBase)[0],
              top: projection.project(me.x, me.y, zBase)[1],
            }}
          >
            <DiamondAvatar
              src={myAvatarUrl}
              name={myDisplayName}
              size={34}
              title={t`${myDisplayName} (you)`}
              frameClassName="ring-2 ring-ktip-tropical-500 shadow-card"
            />
          </div>
        )}
      </div>

      {/* ---- hover card ---- */}
      {hoveredRoom && hoveredGeo && phase === 'idle' && (
        <div
          className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 rounded-xl border border-ktip-sand-200 bg-ktip-cream/95 p-2.5 text-xs shadow-card backdrop-blur"
          style={{
            left: projection.project(
              hoveredGeo.centroid[0],
              hoveredGeo.centroid[1],
              levelZOf(hoveredGeo.floor) + hoveredGeo.height
            )[0],
            top:
              projection.project(
                hoveredGeo.centroid[0],
                hoveredGeo.centroid[1],
                levelZOf(hoveredGeo.floor) + hoveredGeo.height
              )[1] + 14,
          }}
        >
          <p className="font-semibold text-ktip-sand-900">{hoveredRoom.name}</p>
          {hoveredRoom.description && (
            <p className="mt-0.5 text-[11px] leading-snug text-ktip-sand-600">
              {hoveredRoom.description}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-ktip-sand-500">
            <Trans>{occupancy[hoveredRoom.id] || 0} here</Trans>
            {hoveredRoom.capacity ? t` · cap ${hoveredRoom.capacity}` : ''} ·{' '}
            {hoveredRoom.audio_mode.replace('_', ' ')}
          </p>
          {!canEnterRoom(hoveredRoom, myRole) && (
            <p className="mt-1 text-[10px] font-semibold text-ktip-sand-500">
              {hoveredRoom.is_open ? t`Restricted to other roles` : t`Closed right now`}
            </p>
          )}
        </div>
      )}

      {/* ---- floors + view toggles ----
          One cluster in the top-left corner: the floor pills, then the view
          controls beside them, so the map's right edge stays clear for the
          presence panel.
          Plan view for judging distance, 2.5D for reading the place, and — in a
          building with more than one level — Stack to lift them apart. Both
          transitions are eased, not cut. */}
      <div className="absolute left-3 top-3 flex items-start gap-2">
        {config.floors.length > 1 && (
          <div className="flex flex-col gap-1">
            {config.floors.map((f, i) => (
              <button
                key={f.key}
                type="button"
                onClick={() => goToFloor(i)}
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

        <div className="flex overflow-hidden rounded-lg border border-ktip-sand-200 bg-ktip-cream/90 backdrop-blur">
          {([['2D', false], ['2.5D', true]] as Array<[string, boolean]>).map(([label, on]) => (
            <button
              key={label}
              type="button"
              onClick={() => setIso(on)}
              aria-pressed={iso === on}
              className={`px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                iso === on
                  ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                  : 'text-ktip-sand-500 hover:text-ktip-sand-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {iso && config.floors.length > 1 && (
          <div className="flex overflow-hidden rounded-lg border border-ktip-sand-200 bg-ktip-cream/90 backdrop-blur">
            {([['Floor', false], ['Stack', true]] as Array<[string, boolean]>).map(([label, on]) => (
              <button
                key={label}
                type="button"
                onClick={() => setStacked(on)}
                aria-pressed={stacked === on}
                className={`px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                  stacked === on
                    ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                    : 'text-ktip-sand-500 hover:text-ktip-sand-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- standing-in prompt ---- */}
      {/* ---- stairs ----
          Standing on the block offers the levels either side of this one. The
          floor chips do the same thing; this is the version you find by
          walking, which is the point of drawing stairs at all. */}
      {onStairs && phase === 'idle' && config.floors.length > 1 && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {floor + 1 < config.floors.length && (
            <button
              type="button"
              onClick={() => goToFloor(floor + 1, true)}
              className="flex items-center gap-1.5 rounded-full border border-ktip-sand-200 bg-ktip-cream/95 px-3.5 py-2 text-sm font-semibold text-ktip-sand-800 shadow-card backdrop-blur transition-transform hover:-translate-y-0.5"
            >
              <ArrowUp size={15} aria-hidden="true" />
              {config.floors[floor + 1].name}
            </button>
          )}
          {floor > 0 && (
            <button
              type="button"
              onClick={() => goToFloor(floor - 1, true)}
              className="flex items-center gap-1.5 rounded-full border border-ktip-sand-200 bg-ktip-cream/95 px-3.5 py-2 text-sm font-semibold text-ktip-sand-800 shadow-card backdrop-blur transition-transform hover:-translate-y-0.5"
            >
              <ArrowDown size={15} aria-hidden="true" />
              {config.floors[floor - 1].name}
            </button>
          )}
        </div>
      )}

      {standingRoom && standingIn && !onStairs && phase === 'idle' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={() => {
              if (!canEnterRoom(standingRoom, myRole)) return
              beginEntry(standingRoom)
            }}
            disabled={!canEnterRoom(standingRoom, myRole)}
            // Wears the room's own colour: the button and the walls you are
            // standing between should not disagree about which room this is.
            style={{
              background: standingIn.color,
              color: contrastInk(standingIn.color),
              borderColor: standingIn.color,
            }}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-card transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            <DoorOpen size={15} aria-hidden="true" />
            <Trans>Enter {standingRoom.name}</Trans>
          </button>
        </div>
      )}

      {/* ---- controls hint ---- */}
      <p className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 font-mono text-[10px] text-ktip-sand-400">
        <Move size={11} aria-hidden="true" />
        <Trans>arrows / WASD to walk · click a room to go in</Trans>
      </p>

      {/* ---- entry veil ---- */}
      <div
        className="pointer-events-none absolute inset-0 bg-ktip-ocean-700"
        style={{ opacity: veil * 0.92, transition: 'opacity 80ms linear' }}
        aria-hidden={veil < 0.02}
      >
        {veil > 0.35 && enteringRoomId && phase === 'zooming' && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-display text-lg font-bold text-white">
            <Trans>Entering {roomsById.get(enteringRoomId)?.name}…</Trans>
          </p>
        )}
      </div>
      </div>
    </div>
  )
}
