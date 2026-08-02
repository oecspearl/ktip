import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * The two things a room needs to say that are not worth a row.
 *
 * A raised hand and a clap are true for a few seconds and then they are not.
 * Writing them to venue_room_messages would mean a table that grows by a row
 * per clap and a chat scrollback full of 👏, so both ride broadcast on
 * `room:{roomId}` — the channel migration 070 already authorizes through
 * can_use_room_channel(). No migration, no cleanup, and a member who cannot
 * read the room cannot see its hands either.
 *
 * The cost of that choice, stated plainly: nothing survives a refresh. Someone
 * who joins late does not see the hand you raised before they arrived. That is
 * the right trade for a queue that turns over every couple of minutes, and the
 * wrong one for anything that needs to be true tomorrow — which is why nothing
 * durable goes through here.
 *
 * Note can_use_room_channel() denies kind='team' rooms and closed rooms. Both
 * degrade to a panel that never receives anything rather than an error.
 */

/** A reaction is drawn for this long, then forgotten. */
const REACTION_TTL_MS = 4000
/** A hand goes down on its own after this, so a closed tab does not hold a slot. */
const HAND_TTL_MS = 5 * 60 * 1000
/** Most simultaneous floating reactions. Past this it is not a room, it is weather. */
const MAX_REACTIONS = 24

export const ROOM_REACTIONS = ['👏', '🔥', '❤️', '😂', '🎉', '🤔'] as const
export type RoomReaction = (typeof ROOM_REACTIONS)[number]

export interface FloatingReaction {
  id: string
  emoji: string
  userId: string
  /** 0–1 across the strip, so two claps at once do not overlap exactly. */
  offset: number
  at: number
}

export interface RaisedHand {
  userId: string
  name: string
  avatarUrl: string | null
  at: number
}

interface UseRoomSignalsArgs {
  roomId: string | undefined
  me: { userId: string; name: string; avatarUrl: string | null } | null
  enabled?: boolean
}

export function useRoomSignals({ roomId, me, enabled = true }: UseRoomSignalsArgs) {
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const [hands, setHands] = useState<RaisedHand[]>([])
  const [connected, setConnected] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const seqRef = useRef(0)

  const active = enabled && !!roomId && !!me

  useEffect(() => {
    if (!active) {
      setConnected(false)
      setReactions([])
      setHands([])
      return
    }

    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const start = async () => {
      // Same reason as the venue channel: a private channel is authorized
      // against realtime.messages RLS, which needs the JWT on the socket.
      try {
        await (supabase.realtime as any).setAuth()
      } catch {
        // Older client, or already set. Subscribe anyway and let it fail loudly.
      }
      if (cancelled) return

      // self: true — the person who clapped should see their own clap. The
      // move channel deliberately does the opposite, because you already know
      // where you are standing.
      channel = supabase.channel(`room:${roomId}`, {
        config: { private: true, broadcast: { self: true } },
      })
      channelRef.current = channel

      channel
        .on('broadcast', { event: 'react' }, ({ payload }: any) => {
          const emoji = typeof payload?.emoji === 'string' ? payload.emoji : ''
          const userId = typeof payload?.user_id === 'string' ? payload.user_id : ''
          if (!emoji || !userId) return
          if (!(ROOM_REACTIONS as readonly string[]).includes(emoji)) return

          seqRef.current += 1
          const entry: FloatingReaction = {
            id: `${userId}-${seqRef.current}`,
            emoji,
            userId,
            // Derived from the id rather than random: the same reaction placed
            // twice must land in the same spot on every screen.
            offset: (seqRef.current * 0.37) % 1,
            at: Date.now(),
          }
          setReactions((prev) => [...prev, entry].slice(-MAX_REACTIONS))
        })
        .on('broadcast', { event: 'hand' }, ({ payload }: any) => {
          const userId = typeof payload?.user_id === 'string' ? payload.user_id : ''
          if (!userId) return
          const up = payload?.up !== false

          setHands((prev) => {
            const without = prev.filter((h) => h.userId !== userId)
            if (!up) return without
            return [
              ...without,
              {
                userId,
                name: typeof payload?.name === 'string' ? payload.name : 'Member',
                avatarUrl: typeof payload?.avatar_url === 'string' ? payload.avatar_url : null,
                // The sender's clock is not trusted for ordering — a device an
                // hour fast would jump the queue for ever.
                at: Date.now(),
              },
            ]
          })
        })
        .subscribe((status) => {
          if (!cancelled) setConnected(status === 'SUBSCRIBED')
        })
    }

    void start()

    return () => {
      cancelled = true
      setConnected(false)
      if (channel) supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [active, roomId])

  // Expiry. One timer for both lists — two intervals to drop emoji would be two
  // renders a second in a room where nothing is happening.
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const now = Date.now()
      setReactions((prev) => {
        const next = prev.filter((r) => now - r.at < REACTION_TTL_MS)
        return next.length === prev.length ? prev : next
      })
      setHands((prev) => {
        const next = prev.filter((h) => now - h.at < HAND_TTL_MS)
        return next.length === prev.length ? prev : next
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [active])

  const react = useCallback(
    (emoji: RoomReaction) => {
      const channel = channelRef.current
      if (!channel || !me) return
      void channel.send({
        type: 'broadcast',
        event: 'react',
        payload: { emoji, user_id: me.userId },
      })
    },
    [me]
  )

  const setHand = useCallback(
    (up: boolean) => {
      const channel = channelRef.current
      if (!channel || !me) return
      void channel.send({
        type: 'broadcast',
        event: 'hand',
        payload: { up, user_id: me.userId, name: me.name, avatar_url: me.avatarUrl },
      })
    },
    [me]
  )

  const myHandUp = !!me && hands.some((h) => h.userId === me.userId)

  return {
    reactions,
    hands: [...hands].sort((a, b) => a.at - b.at),
    myHandUp,
    connected,
    react,
    setHand,
  }
}
