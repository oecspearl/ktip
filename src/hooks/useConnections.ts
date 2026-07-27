import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
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
        link: `/profile/${params.requesterId}`,
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
          link: `/profile/${params.myId}`,
        })
      }
      return data
    },
    onSuccess: invalidate,
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
