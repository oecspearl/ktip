import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uniqueTopic } from '../lib/realtime'
import { keys } from '../queries/keys'

/**
 * The room tools of migration 212: the Hardware Bench's kit, bookable slots,
 * the event library, and one announcement to every room.
 *
 * Every read reports `available: false` when its table is not there yet, so a
 * room switched on before the migration says so instead of erroring.
 */

const rpc = async (name: string, args: Record<string, unknown>) => {
  const { data, error } = await (supabase as any).rpc(name, args)
  if (error) throw error
  return data
}

/** Refetch a query whenever its table changes, filtered to one room or event. */
function useLive(table: string, filter: string | null, key: readonly unknown[]) {
  const queryClient = useQueryClient()
  const keyText = JSON.stringify(key)
  useEffect(() => {
    if (!filter) return
    const channel = supabase
      .channel(uniqueTopic(`${table}:${filter}`))
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () =>
        queryClient.invalidateQueries({ queryKey: JSON.parse(keyText) })
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, filter, keyText, queryClient])
}

// ---------------------------------------------------------------- kit

export interface KitItem {
  id: string
  name: string
  total: number
  taken: number
  mine: boolean
}

export function useKit(roomId: string | undefined, eventId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'kit', roomId)
  const query = useQuery({
    queryKey: key,
    enabled: !!roomId,
    retry: false,
    queryFn: async (): Promise<{ available: boolean; rows: any[] }> => {
      const { data, error } = await (supabase as any)
        .from('venue_kit_items')
        .select('id, name, total, sort_order, reservations:venue_kit_reservations(user_id)')
        .eq('room_id', roomId)
        .order('sort_order')
      if (error) return { available: false, rows: [] }
      return { available: true, rows: data || [] }
    },
  })
  useLive('venue_kit_items', roomId ? `room_id=eq.${roomId}` : null, key)
  useLive('venue_kit_reservations', eventId ? `event_id=eq.${eventId}` : null, key)

  const items: KitItem[] = (query.data?.rows ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    total: row.total,
    taken: (row.reservations ?? []).length,
    mine: !!userId && (row.reservations ?? []).some((r: any) => r.user_id === userId),
  }))
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })

  return {
    items,
    loading: query.isPending,
    available: query.data?.available ?? true,
    reserve: useMutation({
      mutationFn: ({ id, on }: { id: string; on: boolean }) => rpc('reserve_kit_item', { p_item_id: id, p_on: on }),
      onSuccess: refresh,
    }),
    save: useMutation({
      mutationFn: ({ id, name, total }: { id: string | null; name: string; total: number }) =>
        rpc('save_kit_item', { p_room_id: roomId, p_id: id, p_name: name, p_total: total }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => rpc('remove_kit_item', { p_id: id }),
      onSuccess: refresh,
    }),
  }
}

// ---------------------------------------------------------------- booking slots

export interface BookingSlot {
  id: string
  host_id: string
  starts_at: string
  minutes: number
  booked_by: string | null
  host: { id: string; display_name: string | null; avatar_url: string | null } | null
}

export function useBookingSlots(roomId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'slots', roomId)
  const query = useQuery({
    queryKey: key,
    enabled: !!roomId,
    retry: false,
    queryFn: async (): Promise<{ available: boolean; rows: BookingSlot[] }> => {
      const { data, error } = await (supabase as any)
        .from('venue_booking_slots')
        .select('id, host_id, starts_at, minutes, booked_by, host:profiles!venue_booking_slots_host_id_fkey(id, display_name, avatar_url)')
        .eq('room_id', roomId)
        // Slots that ended more than a few minutes ago are history.
        .gte('starts_at', new Date(Date.now() - 30 * 60_000).toISOString())
        .order('starts_at')
        .limit(60)
      if (error) return { available: false, rows: [] }
      return { available: true, rows: data || [] }
    },
  })
  useLive('venue_booking_slots', roomId ? `room_id=eq.${roomId}` : null, key)
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })

  return {
    slots: query.data?.rows ?? [],
    loading: query.isPending,
    available: query.data?.available ?? true,
    book: useMutation({
      mutationFn: ({ id, on }: { id: string; on: boolean }) => rpc('book_slot', { p_slot_id: id, p_on: on }),
      onSuccess: refresh,
    }),
    offer: useMutation({
      mutationFn: ({ hostId, startsAt, minutes }: { hostId: string; startsAt: string; minutes: number }) =>
        rpc('offer_booking_slot', { p_room_id: roomId, p_host_id: hostId, p_starts_at: startsAt, p_minutes: minutes }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => rpc('remove_booking_slot', { p_slot_id: id }),
      onSuccess: refresh,
    }),
  }
}

// ---------------------------------------------------------------- library

export type LibraryKind = 'dataset' | 'api' | 'starter' | 'guide'

export interface LibraryItem {
  id: string
  title: string
  detail: string | null
  kind: LibraryKind
  format: string | null
  languages: string[]
  url: string | null
}

export function useLibrary(eventId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'library', eventId)
  const query = useQuery({
    queryKey: key,
    enabled: !!eventId,
    retry: false,
    queryFn: async (): Promise<{ available: boolean; rows: LibraryItem[] }> => {
      const { data, error } = await (supabase as any)
        .from('venue_library_items')
        .select('id, title, detail, kind, format, languages, url, sort_order')
        .eq('event_id', eventId)
        .order('sort_order')
      if (error) return { available: false, rows: [] }
      return { available: true, rows: data || [] }
    },
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })

  return {
    items: query.data?.rows ?? [],
    loading: query.isPending,
    available: query.data?.available ?? true,
    save: useMutation({
      mutationFn: (item: Omit<LibraryItem, 'id'> & { id: string | null }) =>
        rpc('save_library_item', {
          p_event_id: eventId,
          p_id: item.id,
          p_title: item.title,
          p_detail: item.detail,
          p_kind: item.kind,
          p_format: item.format,
          p_languages: item.languages,
          p_url: item.url,
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => rpc('remove_library_item', { p_id: id }),
      onSuccess: refresh,
    }),
  }
}

// ---------------------------------------------------------------- announce

export function useAnnounceAll(eventId: string | undefined) {
  return useMutation({
    mutationFn: (body: string): Promise<number> => rpc('venue_broadcast_all', { p_event_id: eventId, p_body: body }),
  })
}
