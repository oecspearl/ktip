import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { parseVideoCallInfo, type VideoCallInfo } from '../lib/video-calls'

/**
 * Calls started from /collaborate/video (migration 202).
 *
 * Every rule lives in the database: who may start a call (signed in, not
 * suspended, not a student), who may join (anyone with the link unless it is
 * locked or over), and who may lock or end it (the creator). These hooks only
 * carry requests and answers.
 */

const infoKey = (callId: string | undefined) => keys.sub('video-call', 'info', callId)

export function useVideoCallInfo(callId: string | undefined) {
  return useQuery({
    queryKey: infoKey(callId),
    enabled: !!callId,
    queryFn: async (): Promise<VideoCallInfo> => {
      const { data, error } = await (supabase as any).rpc('video_call_info', { p_call_id: callId })
      if (error) throw new Error(error.message)
      const info = parseVideoCallInfo(data)
      if (!info) throw new Error('call not found')
      return info
    },
    // Locked or ended by the host while someone waits in the lobby.
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useCreateVideoCall() {
  return useMutation({
    mutationFn: async (title: string): Promise<string> => {
      const { data, error } = await (supabase as any).rpc('create_video_call', {
        p_title: title.trim() || null,
      })
      if (error) throw new Error(error.message)
      if (typeof data !== 'string') throw new Error('The call could not be created')
      return data
    },
  })
}

export function useSetVideoCallLock(callId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (locked: boolean): Promise<VideoCallInfo | null> => {
      const { data, error } = await (supabase as any).rpc('set_video_call_state', {
        p_call_id: callId,
        p_locked: locked,
        p_end: false,
      })
      if (error) throw new Error(error.message)
      return parseVideoCallInfo(data)
    },
    onSuccess: (info) => {
      if (info) queryClient.setQueryData(infoKey(callId), info)
    },
  })
}

/**
 * End the call for everyone. Goes through api/call/end.ts rather than the RPC
 * alone, because only the server can close the LiveKit room and disconnect
 * the people already in it.
 */
export function useEndVideoCall(callId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ disconnected: boolean }> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('not signed in')
      const res = await fetch('/api/call/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ callId }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; disconnected?: boolean }
      if (!res.ok) throw new Error(body.error || 'The call could not be ended')
      return { disconnected: body.disconnected === true }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: infoKey(callId) }),
  })
}
