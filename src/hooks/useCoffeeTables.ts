import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { EMPTY_COFFEE, parseCoffeeState, type CoffeeState } from '../lib/coffee-tables'

/**
 * Coffee tables in one networking room (migration 200).
 *
 * coffee_state() also runs the matcher, so polling is what seats a table of
 * three once the oldest person has waited long enough. Fast while waiting,
 * slow otherwise. Waiting ends when the panel unmounts: walking out of the
 * lounge should not seat you at a table you will never see.
 */
export function useCoffeeTables(roomId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'coffee', roomId)

  const query = useQuery({
    queryKey: key,
    enabled: !!roomId,
    queryFn: async (): Promise<CoffeeState> => {
      const { data, error } = await (supabase as any).rpc('coffee_state', { p_room_id: roomId })
      if (error) throw error
      return parseCoffeeState(data)
    },
    refetchInterval: (q) => (q.state.data?.inQueue ? 5_000 : 15_000),
    retry: false,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: key })

  const join = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc('join_coffee_queue', { p_room_id: roomId })
      if (error) throw error
    },
    onSettled: refresh,
  })

  /** Take a free seat at one table (215), instead of waiting for the roulette. */
  const sit = useMutation({
    mutationFn: async (tableId: string) => {
      const { error } = await (supabase as any).rpc('sit_at_coffee_table', { p_table_id: tableId })
      if (error) throw error
    },
    onSettled: refresh,
  })

  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc('leave_coffee', { p_room_id: roomId })
      if (error) throw error
    },
    onSettled: refresh,
  })

  const inQueue = !!query.data?.inQueue
  const inQueueRef = useRef(inQueue)
  inQueueRef.current = inQueue
  useEffect(() => {
    if (!roomId) return
    return () => {
      if (inQueueRef.current) {
        void (supabase as any).rpc('leave_coffee', { p_room_id: roomId }).then(
          () => {},
          () => {}
        )
      }
    }
  }, [roomId])

  return {
    state: query.data ?? EMPTY_COFFEE,
    loading: query.isPending,
    error: query.error as Error | null,
    join,
    sit,
    leave,
  }
}
