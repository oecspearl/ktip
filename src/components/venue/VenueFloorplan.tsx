import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { Map as MapIcon } from 'lucide-react'
import { RoomZone } from './RoomZone'
import { clusterForRoom } from '../../lib/venue-presence'
import type { VenueOccupant, VenueRoom } from '../../types'

interface VenueFloorplanProps {
  rooms: VenueRoom[]
  occupants: VenueOccupant[]
  currentRoomId: string | null
  floorplanUrl: string | null
  onEnter: (room: VenueRoom) => void
}

type ZoneRect = { left: number; top: number; width: number; height: number }

/**
 * The venue map.
 *
 * Two renderings of the same data, and the fallback is not a consolation prize:
 *
 * - **No floorplan SVG** (the common case, and the default for a new event):
 *   a responsive grid of room cards. Fully functional — occupancy, avatars,
 *   entry. A host who never uploads a map still has a working venue.
 * - **Floorplan SVG uploaded**: the SVG is inlined and each room's
 *   `svg_zone_id` is matched to an element id inside it. Chips are then pinned
 *   over the measured position of each zone.
 *
 * Zones are *measured*, not stored. There is no x/y column, and that is
 * deliberate: the host draws the map in a real tool, and the only thing the
 * database needs to know is which shape is which room.
 */
export function VenueFloorplan({
  rooms,
  occupants,
  currentRoomId,
  floorplanUrl,
  onEnter,
}: VenueFloorplanProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [svgFailed, setSvgFailed] = useState(false)
  const [zones, setZones] = useState<Record<string, ZoneRect>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  // ----- fetch + sanitize -------------------------------------------------

  useEffect(() => {
    if (!floorplanUrl) {
      setSvg(null)
      setSvgFailed(false)
      return
    }

    let cancelled = false
    setSvgFailed(false)

    fetch(floorplanUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (cancelled) return
        // The floorplan is host-uploaded content going into innerHTML. Sanitize
        // it with the SVG profile: a map is not a place to accept a <script>.
        setSvg(
          DOMPurify.sanitize(text, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_ATTR: ['id'],
          })
        )
      })
      .catch(() => {
        if (!cancelled) setSvgFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [floorplanUrl])

  // ----- measure the zones ------------------------------------------------

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!svg || !container) return

    const measure = () => {
      const base = container.getBoundingClientRect()
      const next: Record<string, ZoneRect> = {}

      for (const room of rooms) {
        if (!room.svg_zone_id) continue
        // Ids come from the host's SVG, so escape before querying.
        const el = container.querySelector(`#${CSS.escape(room.svg_zone_id)}`)
        if (!el) continue
        const r = el.getBoundingClientRect()
        next[room.id] = {
          left: r.left - base.left + r.width / 2,
          top: r.top - base.top + r.height / 2,
          width: r.width,
          height: r.height,
        }
      }
      setZones(next)
    }

    measure()

    // The SVG scales with the container, so every resize invalidates every
    // measurement.
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [svg, rooms])

  const useSvg = !!svg && !svgFailed

  // ----- fallback grid ----------------------------------------------------

  if (!useSvg) {
    return (
      <div>
        {svgFailed && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-ktip-sun-200 bg-ktip-sun-50 px-3 py-2 text-sm text-ktip-sun-800">
            <MapIcon size={15} aria-hidden="true" />
            The floorplan image could not be loaded. Showing the room list instead.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const cluster = clusterForRoom(occupants, room.id)
            return (
              <RoomZone
                key={room.id}
                room={room}
                occupants={cluster.shown}
                overflow={cluster.overflow}
                total={cluster.total}
                isCurrent={room.id === currentRoomId}
                onEnter={onEnter}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // ----- floorplan --------------------------------------------------------

  const unpinned = rooms.filter((room) => !zones[room.id])

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl border border-ktip-sand-100 bg-ktip-canvas shadow-card [&_svg]:h-auto [&_svg]:w-full"
      >
        <div dangerouslySetInnerHTML={{ __html: svg as string }} />

        {rooms.map((room) => {
          const rect = zones[room.id]
          if (!rect) return null
          const cluster = clusterForRoom(occupants, room.id)
          return (
            <div
              key={room.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: rect.left, top: rect.top }}
            >
              <RoomZone
                room={room}
                occupants={cluster.shown}
                overflow={cluster.overflow}
                total={cluster.total}
                isCurrent={room.id === currentRoomId}
                onEnter={onEnter}
                variant="chip"
              />
            </div>
          )
        })}
      </div>

      {/*
        A room whose svg_zone_id does not match anything in the uploaded map
        would otherwise be unreachable. Surfacing it is how a host discovers the
        id is wrong, rather than wondering where the Help Desk went.
      */}
      {unpinned.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            Not on the map
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unpinned.map((room) => {
              const cluster = clusterForRoom(occupants, room.id)
              return (
                <RoomZone
                  key={room.id}
                  room={room}
                  occupants={cluster.shown}
                  overflow={cluster.overflow}
                  total={cluster.total}
                  isCurrent={room.id === currentRoomId}
                  onEnter={onEnter}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
