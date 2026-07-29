import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { VENUE } from '../lib/constants'
import {
  mergeRoster,
  occupancyByRoom,
  presenceToOccupants,
  resolveAvailability,
  shouldHeartbeat,
  type RawPresenceState,
} from '../lib/venue-presence'
import type {
  EventVenueMember,
  VenueAvailability,
  VenueOccupant,
  VenuePresencePayload,
} from '../types'

type ManualAvailability = Exclude<VenueAvailability, 'offline'>

interface UseVenuePresenceArgs {
  eventId: string | undefined
  /** Null until the venue session resolves; the hook stays dormant until then. */
  me:
    | {
        user_id: string
        display_name: string | null
        avatar_url: string | null
        role: VenuePresencePayload['role']
        team_id: string | null
      }
    | null
  /** The room this client is currently inside, or null for the floorplan. */
  roomId: string | null
  /** DB roster, used only for members with no live presence entry. */
  roster?: EventVenueMember[]
}

/**
 * The venue's single presence channel.
 *
 * ONE channel per event (`venue:{eventId}`), not one per room. Supabase Presence
 * hands every subscriber the complete state, so a floorplan with nine rooms
 * needs one subscription and a client-side groupBy rather than nine
 * subscriptions. Room channels exist too, but only for chat, and only while you
 * are actually inside the room (see useVenueRoomMessages).
 *
 * The channel is `private: true`, which routes every subscribe through the RLS
 * policy on `realtime.messages` added in migration 070. Without that, the anon
 * key plus an event UUID would be enough to watch a venue you were never
 * admitted to.
 *
 * Availability is written twice on purpose: the tracked payload is the hot path
 * (sub-second, drives every dot) and `venue_heartbeat` is a throttled cold
 * mirror for first paint, for teammates who are not on this channel, and for
 * the organizer's after-the-fact view. All the conflict resolution lives in
 * src/lib/venue-presence.ts, which is where it can be tested.
 */
export function useVenuePresence({ eventId, me, roomId, roster }: UseVenuePresenceArgs) {
  const queryClient = useQueryClient()

  const [raw, setRaw] = useState<RawPresenceState>({})
  const [connected, setConnected] = useState(false)
  const [manual, setManual] = useState<ManualAvailability | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  )
  const [nowTick, setNowTick] = useState(() => Date.now())

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastInteractionRef = useRef<number>(Date.now())
  const lastHeartbeatRef = useRef<number | null>(null)
  const lastSentRef = useRef<string>('')

  // Resolved from the manual choice plus idle state. A manual 'busy' or
  // 'help_wanted' is sticky; only the default 'working' may be auto-downgraded.
  const availability = resolveAvailability({
    manual,
    hidden,
    lastInteractionMs: lastInteractionRef.current,
    nowMs: nowTick,
  })

  // ----- idle + visibility ------------------------------------------------

  useEffect(() => {
    if (typeof document === 'undefined') return

    const touch = () => {
      lastInteractionRef.current = Date.now()
    }
    const onVisibility = () => {
      setHidden(document.visibilityState === 'hidden')
      if (document.visibilityState === 'visible') touch()
    }

    window.addEventListener('pointerdown', touch, { passive: true })
    window.addEventListener('keydown', touch)
    document.addEventListener('visibilitychange', onVisibility)

    // Re-evaluate idle on a slow tick rather than on every event: the only
    // thing that changes without input is the passage of time.
    const interval = window.setInterval(() => setNowTick(Date.now()), 30_000)

    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [])

  // ----- the channel ------------------------------------------------------

  const userId = me?.user_id
  useEffect(() => {
    if (!eventId || !userId) return

    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const sync = () => {
      if (!channel || cancelled) return
      setRaw(channel.presenceState() as RawPresenceState)
    }

    const start = async () => {
      // Private channels are authorized against realtime.messages RLS, which
      // needs the caller's JWT on the realtime socket.
      try {
        await (supabase.realtime as any).setAuth()
      } catch {
        // Older client, or already set. Subscribe anyway and let it fail loudly.
      }
      if (cancelled) return

      channel = supabase.channel(`venue:${eventId}`, {
        config: { private: true, presence: { key: userId } },
      })
      channelRef.current = channel

      channel
        .on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        .subscribe((status) => {
          if (cancelled) return
          setConnected(status === 'SUBSCRIBED')
          if (status === 'SUBSCRIBED') {
            // Force the first track by clearing the dedupe key.
            lastSentRef.current = ''
          }
        })
    }

    void start()

    return () => {
      cancelled = true
      setConnected(false)
      if (channel) {
        void channel.untrack()
        supabase.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [eventId, userId])

  // ----- track the payload, and mirror it to the DB -----------------------

  useEffect(() => {
    if (!connected || !eventId || !me) return

    const payload: VenuePresencePayload = {
      user_id: me.user_id,
      display_name: me.display_name,
      avatar_url: me.avatar_url,
      role: me.role,
      availability,
      status_note: statusNote,
      room_id: roomId,
      team_id: me.team_id,
      // Reserved. A walking map fills this in and needs no migration; v:1
      // readers ignore what they do not know.
      pos: null,
      v: 1,
    }

    const fingerprint = `${availability}|${statusNote ?? ''}|${roomId ?? ''}`
    const changed = fingerprint !== lastSentRef.current
    if (!changed) return
    lastSentRef.current = fingerprint

    void channelRef.current?.track(payload)

    // Cold mirror. Throttled, because 100 participants writing a row on every
    // tick is 100 pointless UPDATEs a second.
    const nowMs = Date.now()
    if (shouldHeartbeat({ lastWriteMs: lastHeartbeatRef.current, nowMs, changed: true })) {
      lastHeartbeatRef.current = nowMs
      void (supabase as any)
        .rpc('venue_heartbeat', {
          p_event_id: eventId,
          p_room_id: roomId,
          p_availability: availability,
          p_status_note: statusNote,
        })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'roster', eventId) })
        })
        .catch(() => {
          // A missed mirror write costs a stale dot for someone not on this
          // channel. Never worth surfacing an error over.
        })
    }
  }, [connected, eventId, me, availability, statusNote, roomId, queryClient])

  // Keep-alive for the mirror while nothing changes, so `last_seen_at` does not
  // age past the staleness cutoff and make an active member render offline.
  useEffect(() => {
    if (!connected || !eventId) return

    const interval = window.setInterval(() => {
      const nowMs = Date.now()
      if (!shouldHeartbeat({ lastWriteMs: lastHeartbeatRef.current, nowMs, changed: false })) return
      lastHeartbeatRef.current = nowMs
      void (supabase as any)
        .rpc('venue_heartbeat', { p_event_id: eventId, p_room_id: roomId })
        .catch(() => {})
    }, VENUE.HEARTBEAT_THROTTLE_MS)

    return () => window.clearInterval(interval)
  }, [connected, eventId, roomId])

  // ----- derived ----------------------------------------------------------

  const occupants: VenueOccupant[] = useMemo(() => {
    const live = presenceToOccupants(raw)
    return mergeRoster(live, roster, nowTick)
    // nowTick is a dependency so staleness is re-evaluated on the slow tick.
  }, [raw, roster, nowTick])

  const occupancy = useMemo(() => occupancyByRoom(occupants), [occupants])

  const setAvailability = useCallback((next: ManualAvailability) => {
    lastInteractionRef.current = Date.now()
    setManual(next)
  }, [])

  return {
    occupants,
    occupancy,
    connected,
    /** What this client is reporting right now, idle rules applied. */
    availability,
    /** What the member explicitly chose, or null if they never chose. */
    manual,
    setAvailability,
    statusNote,
    setStatusNote,
  }
}
