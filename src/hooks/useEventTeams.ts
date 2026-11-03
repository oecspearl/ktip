import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { freshChannel, releaseChannel } from '../lib/realtime'
import { keys } from '../queries/keys'

/**
 * Teams in an event and who is on them (migration 188).
 *
 * Every venue member can read this: it is what a team finder and a Homebase
 * door both need. Before 188 is applied the table does not exist and this
 * returns an empty list rather than an error, so the venue keeps working.
 */
export interface EventTeamMember {
  user_id: string
  role: 'captain' | 'member'
  display_name: string | null
  avatar_url: string | null
}

export interface EventTeam {
  id: string
  event_id: string
  name: string
  tagline: string | null
  max_size: number
  homebase_room_id: string | null
  members: EventTeamMember[]
}

export function useEventTeams(eventId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'teams', eventId),
    enabled: !!eventId,
    queryFn: async (): Promise<EventTeam[]> => {
      const { data, error } = await (supabase as any)
        .from('event_teams')
        .select(
          'id, event_id, name, tagline, max_size, homebase_room_id, event_team_members(user_id, role, profiles!event_team_members_user_id_fkey(display_name, avatar_url))'
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })
      if (error) return []
      return ((data as any[]) || []).map((t) => ({
        id: t.id,
        event_id: t.event_id,
        name: t.name,
        tagline: t.tagline,
        max_size: t.max_size,
        homebase_room_id: t.homebase_room_id,
        members: (t.event_team_members || []).map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          display_name: m.profiles?.display_name ?? null,
          avatar_url: m.profiles?.avatar_url ?? null,
        })),
      }))
    },
  })
  return { teams: query.data ?? [], loading: query.isPending, refetch: query.refetch }
}

/** The team that owns a room, and whether the viewer may use that room. */
export function homebaseAccess(
  teams: EventTeam[],
  roomId: string,
  userId: string | undefined,
  isHost: boolean,
  /** Teams whose Homebase the viewer's team may visit over an open bridge (197). */
  guestOf?: Set<string>
): { team: EventTeam | null; mine: boolean; guest: boolean; canUse: boolean } {
  const team = teams.find((t) => t.homebase_room_id === roomId) ?? null
  const mine = !!team && !!userId && team.members.some((m) => m.user_id === userId)
  const guest = !!team && !mine && !!guestOf?.has(team.id)
  // Mirrors can_access_venue_room() (190, 197): an unclaimed room is open.
  return { team, mine, guest, canUse: !team || mine || isHost || guest }
}

export function useCreateTeam(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { name: string; tagline?: string }) => {
      const { data, error } = await (supabase as any).rpc('create_event_team', {
        p_event_id: eventId,
        p_name: args.name,
        p_tagline: args.tagline || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'teams', eventId) })
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'rooms', eventId) })
    },
  })
}

/**
 * The team's own realtime channel, ydoc:team:<team id> (migration 190).
 *
 * One channel per team carries everything live in the Homebase workspace:
 * whiteboard edits and "the task board changed" pings. Private, so only the
 * team and the hosts can join; can_use_ydoc_channel() decides.
 */
export function useTeamChannel(
  teamId: string | undefined,
  handlers: Record<string, (payload: any) => void>
) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    let ch: RealtimeChannel | null = null
    const start = async () => {
      try {
        await (supabase.realtime as any).setAuth()
      } catch {
        // Already set, or an older client.
      }
      if (cancelled) return
      ch = await freshChannel(`ydoc:team:${teamId}`, {
        config: { private: true, broadcast: { self: false } },
      })
      if (cancelled) {
        releaseChannel(ch)
        return
      }
      ch.on('broadcast', { event: '*' }, (msg: any) => {
        handlersRef.current[msg.event]?.(msg.payload)
      })
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED' && !cancelled) setChannel(ch)
      })
    }
    start()
    return () => {
      cancelled = true
      setChannel(null)
      if (ch) releaseChannel(ch)
    }
  }, [teamId])

  const send = (event: string, payload: unknown) => {
    channel?.send({ type: 'broadcast', event, payload })
  }
  return { connected: !!channel, send }
}
