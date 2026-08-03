import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

/**
 * Starting and stopping a room's recording, for hosts.
 *
 * State is not stored anywhere in this app — `/api/venue/room-recording` asks
 * LiveKit which egresses are running and reports that. A `recording_in_progress`
 * column would be a second source of truth that drifts the first time a browser
 * closes mid-recording, and the recovery from that drift is worse than the
 * round trip it saves.
 */

export interface ActiveEgress {
  egressId: string
  status: number
}

async function post(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch('/api/venue/room-recording', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string
  }
  // The server's message is the useful one — "Recording is not enabled for this
  // room", "Recording storage is not configured", or LiveKit's own complaint.
  // Each points at a different place to go and fix it.
  if (!res.ok) throw new Error(json.error || 'Recording request failed')
  return json
}

export function useRoomRecording(roomId: string | undefined, isHost: boolean) {
  const queryClient = useQueryClient()
  const queryKey = keys.sub('venue', 'recording', roomId)

  const status = useQuery({
    queryKey,
    queryFn: async (): Promise<ActiveEgress[]> => {
      const json = await post({ roomId, action: 'status' })
      return (json.active as ActiveEgress[]) ?? []
    },
    // Only hosts may ask, so only hosts do. A participant learns a room is being
    // recorded from `recording_enabled` and the consent gate, not from polling.
    enabled: Boolean(roomId) && isHost,
    // Egress takes a few seconds to come up, and a host who pressed Record wants
    // the button to stop lying reasonably soon.
    refetchInterval: 15_000,
    retry: false,
  })

  const start = useMutation({
    mutationFn: () => post({ roomId, action: 'start' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const stop = useMutation({
    mutationFn: (egressId: string) => post({ roomId, action: 'stop', egressId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const active = status.data?.[0]

  return {
    /** The running egress, if any. */
    active,
    recording: Boolean(active),
    startRecording: start.mutateAsync,
    stopRecording: () => (active ? stop.mutateAsync(active.egressId) : Promise.resolve(null)),
    busy: start.isPending || stop.isPending,
    error: (start.error || stop.error || status.error) as Error | null,
  }
}
