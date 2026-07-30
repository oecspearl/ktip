import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { VENUE } from '../lib/constants'
import type { VenueRoomMessage } from '../types'

/**
 * Chat for one venue room.
 *
 * Room-scoped by construction: `venue_room_messages` has a room_id and no
 * second participant column, so there is no shape here that could become a 1:1
 * DM. That matters because migration 064 hard-blocks 1:1 DMs for the student
 * role inside has_permission(), and a venue full of new chat surfaces is
 * exactly how that safeguard gets routed around by accident.
 *
 * Transport is `postgres_changes`, not broadcast — same pattern as
 * useMessages.ts. Chat volume is low, durability matters, and a message that
 * arrives 200ms late is fine, unlike a CRDT delta.
 */
export function useVenueRoomMessages(roomId: string | undefined) {
  const fetchMessages = async (id: string): Promise<VenueRoomMessage[]> => {
    const { data, error } = await (supabase as any)
      .from('venue_room_messages')
      .select('*, author:profiles(id, display_name, avatar_url)')
      .eq('room_id', id)
      .eq('is_removed', false)
      .order('created_at', { ascending: false })
      .limit(VENUE.MESSAGE_PAGE_SIZE)

    if (error) throw error
    // Fetched newest-first so the LIMIT takes the newest page, rendered
    // oldest-first.
    return ((data as any[]) || []).reverse()
  }

  const query = useQuery({
    queryKey: keys.sub('venue', 'messages', roomId),
    queryFn: () => fetchMessages(roomId as string),
    enabled: !!roomId,
  })

  return {
    messages: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useRealtimeRoomMessages(roomId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const rid = roomId
    if (!rid) return

    const threadKey = keys.sub('venue', 'messages', rid)

    const channel = supabase
      .channel(`venue_room_messages:${rid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'venue_room_messages',
          filter: `room_id=eq.${rid}`,
        },
        async (payload) => {
          const { data, error } = await (supabase as any)
            .from('venue_room_messages')
            .select('*, author:profiles(id, display_name, avatar_url)')
            .eq('id', (payload.new as any).id)
            .single()
          if (error || !data) return

          const msg = data as VenueRoomMessage

          // Dedupe by id — StrictMode double-mounts effects in dev, and the
          // optimistic append below can race the WAL event.
          queryClient.setQueryData<VenueRoomMessage[]>(threadKey, (old) => {
            if (!old) return [msg]
            if (old.some((m) => m.id === msg.id)) return old
            return [...old, msg]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, queryClient])
}

export function useSendRoomMessage() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      roomId,
      body,
      replyTo,
    }: {
      roomId: string
      body: string
      replyTo?: string | null
    }) => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) throw new Error('Not signed in')

      const trimmed = body.trim()
      if (!trimmed) throw new Error('Message is empty')

      // event_id is filled by a trigger from the room, so it is not sent here.
      const { data, error } = await (supabase as any)
        .from('venue_room_messages')
        .insert({ room_id: roomId, author_id: uid, body: trimmed, reply_to: replyTo ?? null })
        .select('*, author:profiles(id, display_name, avatar_url)')
        .single()

      if (error) throw error
      return data as VenueRoomMessage
    },
    onSuccess: (msg, variables) => {
      // Optimistic-ish: append immediately so the sender does not wait on the
      // WAL round trip. The realtime handler dedupes by id.
      queryClient.setQueryData<VenueRoomMessage[]>(
        keys.sub('venue', 'messages', variables.roomId),
        (old) => {
          if (!old) return [msg]
          if (old.some((m) => m.id === msg.id)) return old
          return [...old, msg]
        }
      )
    },
  })

  const sendMessage = (roomId: string, body: string, replyTo?: string | null) =>
    mutation.mutateAsync({ roomId, body, replyTo })

  return { sendMessage, loading: mutation.isPending, error: mutation.error }
}

/** Soft delete. Authors can remove their own; hosts can remove anyone's. */
export function useRemoveRoomMessage() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ messageId, roomId: _roomId }: { messageId: string; roomId: string }) => {
      const { error } = await (supabase as any)
        .from('venue_room_messages')
        .update({ is_removed: true })
        .eq('id', messageId)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.setQueryData<VenueRoomMessage[]>(
        keys.sub('venue', 'messages', v.roomId),
        (old) => (old || []).filter((m) => m.id !== v.messageId)
      )
    },
  })

  return { removeMessage: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
