import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { VENUE } from './constants'
import {
  mergeRoster,
  normalizePos,
  occupancyByRoom,
  presenceToOccupants,
  resolveAvailability,
  shouldHeartbeat,
  type RawPresenceState,
} from './presence-logic'
import type {
  VenueAvailability,
  VenueMember,
  VenueOccupant,
  VenuePosition,
  VenuePresencePayload,
} from './types'

/** A peer's last movement packet, with the arrival time used for staleness. */
export type PeerPosition = VenuePosition & { at: number }

type ManualAvailability = Exclude<VenueAvailability, 'offline'>

export interface UseVenuePresenceArgs {
  client: SupabaseClient
  eventId: string | undefined
  /** Null until the venue session resolves; the hook stays dormant until then. */
  me: {
    user_id: string
    display_name: string | null
    avatar_url: string | null
    role: VenuePresencePayload['role']
  } | null
  /** The room this client is currently inside, or null for the floorplan. */
  roomId: string | null
  /** DB roster (cold mirror), used only for members with no live entry. */
  roster?: VenueMember[]
  /** Called after each successful mirror write — refresh your roster here. */
  onHeartbeat?: () => void
}

/**
 * The venue's single presence channel.
 *
 * Mount ONCE per venue visit (via VenueProvider in a layout that wraps the
 * floorplan and every room page) — never per page. A page-level mount tears
 * the channel down on every navigation and pays auth + join + presence sync
 * each time, which reads as "Reconnecting…" at exactly the moment the user
 * expects to see who is in the room.
 *
 * ONE channel per event (`venue:{eventId}`), not one per room. Presence hands
 * every subscriber the complete state, so per-room occupancy is a client-side
 * groupBy. The channel is `private: true`; authorize the topic server-side
 * (see sql/001_venue.sql §6).
 *
 * Availability is written twice on purpose: the tracked payload is the hot
 * path (sub-second, drives every dot) and `venue_heartbeat` is a throttled
 * cold mirror for first paint and for viewers off the channel. All conflict
 * resolution lives in presence-logic.ts, where it can be tested.
 */
export function useVenuePresence({
  client,
  eventId,
  me,
  roomId,
  roster,
  onHeartbeat,
}: UseVenuePresenceArgs) {
  const [raw, setRaw] = useState<RawPresenceState>({})
  const [connected, setConnected] = useState(false)
  const [manual, setManual] = useState<ManualAvailability | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  )
  const [nowTick, setNowTick] = useState(() => Date.now())

  const channelRef = useRef<ReturnType<SupabaseClient['channel']> | null>(null)
  const lastInteractionRef = useRef<number>(Date.now())
  const lastHeartbeatRef = useRef<number | null>(null)
  const lastSentRef = useRef<string>('')
  const onHeartbeatRef = useRef(onHeartbeat)
  useEffect(() => {
    onHeartbeatRef.current = onHeartbeat
  })

  // ----- walking map (optional) -------------------------------------------
  // Positions live in refs: a moving avatar is ~8 packets a second per
  // person, and putting that through setState would re-render the whole venue
  // 8×N times a second to move two circles. Read these from your own
  // animation frame.
  const posRef = useRef<VenuePosition | null>(null)
  const peersRef = useRef<Map<string, PeerPosition>>(new Map())
  const payloadRef = useRef<VenuePresencePayload | null>(null)
  const lastBroadcastRef = useRef(0)
  const lastCellRef = useRef('')

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
    let channel: ReturnType<SupabaseClient['channel']> | null = null
    let retryTimer = 0
    let attempt = 0

    const sync = () => {
      if (!channel || cancelled) return
      setRaw(channel.presenceState() as RawPresenceState)
    }

    // Recovery, and the one rule that keeps it from oscillating: NEVER fight
    // the library. supabase-realtime retries CHANNEL_ERROR and TIMED_OUT by
    // itself (the join push arms the channel's rejoin timer, with backoff)
    // and rejoins every channel after a socket drop. A manual retry on those
    // states puts two reconnect loops on one topic — and because
    // client.channel() returns the existing instance per topic, and a
    // half-torn-down instance still holds an armed rejoin timer that
    // unsubscribes whichever channel owns the topic when it fires, the two
    // loops kill each other's joins forever. On screen: presence blinking in
    // and out every second or two.
    //
    // Only CLOSED is terminal to the library, so only CLOSED is restarted
    // here — and only after the dead instance is disposed of COMPLETELY.
    const dispose = async (ch: NonNullable<typeof channel>) => {
      try {
        await client.removeChannel(ch)
      } catch {
        // The leave can time out; teardown below still retires the instance.
      }
      // removeChannel only delists after a clean leave. teardown() disarms
      // the rejoin timer and drops the bindings either way, so this instance
      // can never come back from the dead and unsubscribe its replacement.
      try {
        ;(ch as unknown as { teardown?: () => void }).teardown?.()
      } catch {
        // Internal API; removeChannel above is still the documented path.
      }
    }

    const scheduleRestart = () => {
      if (cancelled || retryTimer) return
      const delay = Math.min(15_000, 1_000 * 2 ** attempt++)
      retryTimer = window.setTimeout(() => {
        retryTimer = 0
        if (cancelled) return
        const old = channel
        channel = null
        channelRef.current = null
        void (async () => {
          // Disposed BEFORE start(), and awaited: creating the successor
          // while the old instance is still listed would hand back the dying
          // instance itself (client.channel() reuses by topic).
          if (old) await dispose(old)
          if (cancelled) return
          void start()
        })()
      }, delay)
    }

    const makeChannel = () =>
      client.channel(`venue:${eventId}`, {
        config: { private: true, presence: { key: userId }, broadcast: { self: false } },
      })

    const start = async () => {
      // Private channels are authorized against realtime.messages RLS, which
      // needs the caller's JWT on the realtime socket.
      try {
        await (client.realtime as unknown as { setAuth: () => Promise<void> }).setAuth()
      } catch {
        // Older client, or already set. Subscribe anyway and let it fail loudly.
      }
      if (cancelled) return

      let ch = makeChannel()
      // client.channel() returns the existing instance when the topic is
      // already known. One that has lived before cannot be subscribed again,
      // and binding presence handlers onto it while joined forces the library
      // into an unsubscribe/resubscribe cycle. Retire it and take a fresh one.
      if ((ch as unknown as { joinedOnce?: boolean }).joinedOnce) {
        await dispose(ch)
        if (cancelled) return
        ch = makeChannel()
      }
      channel = ch
      channelRef.current = ch

      ch
        .on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        // Movement. Same channel, same server-side authorization — a client
        // that cannot read the venue's presence cannot see walkers either.
        .on('broadcast', { event: 'move' }, ({ payload }: { payload?: Record<string, unknown> }) => {
          const from = payload?.user_id
          if (typeof from !== 'string' || from === userId) return
          const pos = normalizePos(payload)
          if (!pos) return
          peersRef.current.set(from, { ...pos, at: Date.now() })
        })
        .subscribe((status: string) => {
          // A superseded channel still reports CLOSED as it is torn down
          // during a restart; reacting to it would loop the restart forever.
          if (cancelled || ch !== channel) return
          setConnected(status === 'SUBSCRIBED')
          if (status === 'SUBSCRIBED') {
            attempt = 0
            // Force a re-track by clearing the dedupe key — both on the first
            // join and after the library's own rejoin, which lands back here.
            lastSentRef.current = ''
          } else if (status === 'CLOSED') {
            scheduleRestart()
          }
          // CHANNEL_ERROR / TIMED_OUT: deliberately NOT handled. The
          // library's rejoin timer is already running and re-fires this
          // callback with SUBSCRIBED when the join lands.
        })
    }

    void start()

    return () => {
      cancelled = true
      setConnected(false)
      if (retryTimer) window.clearTimeout(retryTimer)
      if (channel) {
        void channel.untrack()
        void client.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [client, eventId, userId])

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
      // Coarse position, so someone who joins mid-session paints everyone in
      // the right place before the first movement packet arrives.
      pos: posRef.current,
      v: 1,
    }
    payloadRef.current = payload

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
      void client
        .rpc('venue_heartbeat', {
          p_event_id: eventId,
          p_room_id: roomId,
          p_availability: availability,
          p_status_note: statusNote,
          p_meta: posRef.current ? { pos: posRef.current } : null,
        })
        .then(() => onHeartbeatRef.current?.())
        .then(undefined, () => {
          // A missed mirror write costs a stale dot for someone not on this
          // channel. Never worth surfacing an error over.
        })
    }
  }, [client, connected, eventId, me, availability, statusNote, roomId])

  // Keep-alive for the mirror while nothing changes, so `last_seen_at` does
  // not age past the staleness cutoff and make an active member look offline.
  useEffect(() => {
    if (!connected || !eventId) return

    const interval = window.setInterval(() => {
      const nowMs = Date.now()
      if (!shouldHeartbeat({ lastWriteMs: lastHeartbeatRef.current, nowMs, changed: false }))
        return
      lastHeartbeatRef.current = nowMs
      void client
        .rpc('venue_heartbeat', {
          p_event_id: eventId,
          p_room_id: roomId,
          p_meta: posRef.current ? { pos: posRef.current } : null,
        })
        .then(undefined, () => {})
    }, VENUE.HEARTBEAT_THROTTLE_MS)

    return () => window.clearInterval(interval)
  }, [client, connected, eventId, roomId])

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

  /**
   * Report where this client is standing (walkable floorplans only). Safe to
   * call every animation frame: broadcast is throttled to POS_BROADCAST_MS,
   * and the presence payload is re-tracked only on crossing a grid cell.
   */
  const setPosition = useCallback(
    (next: VenuePosition | null) => {
      posRef.current = next
      const channel = channelRef.current
      if (!channel || !next || !userId) return

      const nowMs = Date.now()
      // Only over the joined socket — before the join completes, the client
      // library ships each broadcast as an HTTP POST fallback, one request
      // per tick. A move dropped during that window costs nothing; the
      // presence track carries the position anyway.
      if (
        channel.state === 'joined' &&
        nowMs - lastBroadcastRef.current >= VENUE.POS_BROADCAST_MS
      ) {
        lastBroadcastRef.current = nowMs
        void channel.send({
          type: 'broadcast',
          event: 'move',
          payload: { user_id: userId, x: next.x, y: next.y, f: next.f ?? 0 },
        })
      }

      const cell = `${Math.floor(next.x)},${Math.floor(next.y)},${next.f ?? 0}`
      if (cell !== lastCellRef.current && payloadRef.current) {
        lastCellRef.current = cell
        void channel.track({ ...payloadRef.current, pos: next })
      }
    },
    [userId]
  )

  /** Live positions, as refs — see the note where they are declared. */
  const positions = useMemo(() => ({ peers: peersRef, self: posRef }), [])

  return {
    occupants,
    occupancy,
    connected,
    setPosition,
    positions,
    /** What this client is reporting right now, idle rules applied. */
    availability,
    /** What the member explicitly chose, or null if they never chose. */
    manual,
    setAvailability,
    statusNote,
    setStatusNote,
  }
}

export type VenuePresence = ReturnType<typeof useVenuePresence>
