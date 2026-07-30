import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
import { useAchievementTrigger } from '../contexts/AchievementContext'
import type { Connection } from '../types'

export type ConnectionState =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'connected'

/** Relationship between the current user and another user (checks both directions). */
export function useConnectionStatus(myId: string | undefined, otherId: string | undefined) {
  const fetchStatus = async (
    uid: string,
    oid: string
  ): Promise<{ state: ConnectionState; connection: Connection | null }> => {
    const { data, error } = await (supabase as any)
      .from('connections')
      .select('*')
      .or(
        `and(requester_id.eq.${uid},addressee_id.eq.${oid}),and(requester_id.eq.${oid},addressee_id.eq.${uid})`
      )
      .neq('status', 'declined')
      .maybeSingle()

    if (error) throw error
    if (!data) return { state: 'none', connection: null }

    const conn = data as Connection
    if (conn.status === 'accepted') return { state: 'connected', connection: conn }
    return {
      state: conn.requester_id === uid ? 'pending_sent' : 'pending_received',
      connection: conn,
    }
  }

  const query = useQuery({
    queryKey: keys.sub('connections', 'status', myId && otherId ? `${myId}:${otherId}` : undefined),
    queryFn: () => fetchStatus(myId as string, otherId as string),
    enabled: !!myId && !!otherId && myId !== otherId,
  })

  return {
    state: query.data?.state ?? 'none',
    connection: query.data?.connection ?? null,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export interface ConnectionStatus {
  state: ConnectionState
  connection: Connection | null
}

/**
 * Batch variant of useConnectionStatus for the directory grid: one query per
 * 50 members instead of one per card. No RPC needed — connections RLS already
 * limits reads to rows the viewer is party to, which is exactly this set.
 */
export function useConnectionStatuses(myId: string | undefined, otherIds: string[] | undefined) {
  const ids = (otherIds || []).filter((id) => id !== myId)
  const idKey = ids.join(',')

  const fetchStatuses = async (): Promise<Record<string, ConnectionStatus>> => {
    const map: Record<string, ConnectionStatus> = {}
    for (let i = 0; i < ids.length; i += 50) {
      const inList = `(${ids.slice(i, i + 50).join(',')})`
      const { data, error } = await (supabase as any)
        .from('connections')
        .select('*')
        .or(
          `and(requester_id.eq.${myId},addressee_id.in.${inList}),and(addressee_id.eq.${myId},requester_id.in.${inList})`
        )
        .neq('status', 'declined')
      if (error) throw error
      for (const row of ((data as Connection[]) || [])) {
        const otherId = row.requester_id === myId ? row.addressee_id : row.requester_id
        map[otherId] = {
          state:
            row.status === 'accepted'
              ? 'connected'
              : row.requester_id === myId
                ? 'pending_sent'
                : 'pending_received',
          connection: row,
        }
      }
    }
    return map
  }

  const query = useQuery({
    queryKey: keys.sub('connections', 'statuses', myId ? `${myId}:${idKey}` : undefined),
    queryFn: fetchStatuses,
    enabled: !!myId && ids.length > 0,
  })

  return { statuses: query.data, loading: query.isPending, error: query.error }
}

/** All accepted connections for a user, with the other party's profile joined. */
export function useMyConnections(userId: string | undefined) {
  const fetchConnections = async (uid: string): Promise<Connection[]> => {
    const { data, error } = await (supabase as any)
      .from('connections')
      .select('*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('connections', 'mine', userId),
    queryFn: () => fetchConnections(userId as string),
    enabled: !!userId,
  })

  return { connections: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * Accepted-connection count for any user, via the
 * get_connection_count RPC. Returns null when the viewer is not
 * allowed to see it (target's connection_count_visibility), which
 * is deliberately distinct from a count of 0.
 */
export function useConnectionCount(userId: string | undefined) {
  const fetchCount = async (uid: string): Promise<number | null> => {
    const { data, error } = await (supabase as any).rpc('get_connection_count', {
      p_user_id: uid,
    })
    if (error) throw error
    return data === null || data === undefined ? null : Number(data)
  }

  const query = useQuery({
    queryKey: keys.sub('connections', 'count', userId),
    queryFn: () => fetchCount(userId as string),
    enabled: !!userId,
  })

  return {
    count: query.data ?? null,
    hidden: query.isSuccess && query.data === null,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Batch counts for a list of users (member directory). Users whose
 * count is hidden from the viewer are absent from the map.
 */
export function useConnectionCounts(userIds: string[] | undefined) {
  const ids = userIds || []
  const idKey = ids.join(',')

  const fetchCounts = async (): Promise<Record<string, number>> => {
    const map: Record<string, number> = {}

    // The RPC caps each call at 200 ids; the directory is unbounded.
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await (supabase as any).rpc('get_connection_counts', {
        p_user_ids: ids.slice(i, i + 200),
      })
      if (error) throw error
      for (const row of (data as any[]) || []) {
        map[row.user_id] = Number(row.connection_count)
      }
    }
    return map
  }

  const query = useQuery({
    queryKey: keys.sub('connections', 'counts', idKey),
    queryFn: fetchCounts,
    enabled: ids.length > 0,
  })

  return { counts: query.data, loading: query.isPending, error: query.error }
}

/** Incoming pending requests for the current user. */
export function usePendingRequests(userId: string | undefined) {
  const fetchPending = async (uid: string): Promise<Connection[]> => {
    const { data, error } = await (supabase as any)
      .from('connections')
      .select('*, requester:profiles!requester_id(*)')
      .eq('addressee_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('connections', 'pending', userId),
    queryFn: () => fetchPending(userId as string),
    enabled: !!userId,
  })

  return { requests: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useConnectionMutations() {
  const queryClient = useQueryClient()
  const triggerCheck = useAchievementTrigger()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('connections') })
  }

  const requestMutation = useMutation({
    mutationFn: async (params: { requesterId: string; requesterName: string; addresseeId: string }) => {
      const { data, error } = await (supabase as any)
        .from('connections')
        .insert({ requester_id: params.requesterId, addressee_id: params.addresseeId })
        .select()
        .single()

      if (error) throw error

      sendNotification({
        userId: params.addresseeId,
        type: 'connection_request',
        title: 'New connection request',
        body: `${params.requesterName} wants to connect with you`,
        link: `/directory?member=${params.requesterId}`,
      })
      return data
    },
    onSuccess: invalidate,
  })

  const respondMutation = useMutation({
    mutationFn: async (params: {
      connectionId: string
      accept: boolean
      myId: string
      myName: string
      requesterId: string
    }) => {
      const { data, error } = await (supabase as any)
        .from('connections')
        .update({ status: params.accept ? 'accepted' : 'declined' })
        .eq('id', params.connectionId)
        .select()
        .single()

      if (error) throw error

      if (params.accept) {
        sendNotification({
          userId: params.requesterId,
          type: 'connection_accepted',
          title: 'Connection accepted',
          body: `${params.myName} accepted your connection request`,
          link: `/directory?member=${params.myId}`,
        })
      }
      return data
    },
    // Acceptance is the moment a connection actually counts, for the
    // accepter as much as the requester — 039's trigger awards both parties.
    onSuccess: () => {
      invalidate()
      triggerCheck()
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await (supabase as any)
        .from('connections')
        .delete()
        .eq('id', connectionId)

      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    sendRequest: requestMutation.mutateAsync,
    respondToRequest: respondMutation.mutateAsync,
    removeConnection: removeMutation.mutateAsync,
    loading: requestMutation.isPending || respondMutation.isPending || removeMutation.isPending,
    error: requestMutation.error || respondMutation.error || removeMutation.error,
  }
}
