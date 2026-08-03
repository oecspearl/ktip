import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

/**
 * A LiveKit join token for one venue room.
 *
 * The token IS the permission — what it says about publishing is what the media
 * server enforces, so nothing here decides anything. `/api/venue/room-token`
 * asks `venue_room_grant()` (migration 101) and signs the answer; this hook only
 * carries it, and re-asks before it expires.
 *
 * The grant comes back alongside it so the UI can explain itself. "This room is
 * listen-only" reads very differently from a camera button that silently does
 * nothing, and the difference is the whole reason `audio_mode` was a column
 * rather than a client-side convention.
 */

export interface VenueRoomGrant {
  room: string
  identity: string
  can_subscribe: boolean
  can_publish: boolean
  can_publish_data: boolean
  is_host: boolean
  recording: boolean
  audio_mode: string
  max_publishers: number
}

export interface VenueRoomToken {
  token: string
  grant: VenueRoomGrant
  expiresIn: number
}

/** `undefined` when unset, which is the "video is not configured" state. */
export const LIVEKIT_URL: string | undefined = import.meta.env.VITE_LIVEKIT_URL || undefined

/**
 * Is venue video switched on at all?
 *
 * A deployment with no LiveKit project is a supported state, not an error — the
 * venue still works, the rooms still have doors, and AvStage falls back to the
 * placeholder tiles it drew before any of this existed. Checked in one place so
 * the answer cannot drift between the hook and the component.
 */
export function isVenueVideoConfigured(): boolean {
  return typeof LIVEKIT_URL === 'string' && LIVEKIT_URL.startsWith('wss://')
}

export function useVenueRoomToken(roomId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'livekit-token', roomId),
    queryFn: async (): Promise<VenueRoomToken> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')

      const res = await fetch('/api/venue/room-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ roomId }),
      })

      const body = (await res.json().catch(() => ({}))) as Partial<VenueRoomToken> & {
        error?: string
      }
      if (!res.ok) {
        // Every 403 message is one of the room's real rules, raised by
        // venue_room_grant() — "this room is closed", "not a member of this
        // venue". Surfacing it beats a generic failure, and it is safe: none of
        // them say anything the member could not read off the venue map.
        throw new Error(body.error || 'Could not join this room')
      }
      return body as VenueRoomToken
    },
    enabled: Boolean(roomId) && enabled && isVenueVideoConfigured(),
    // The token lasts 30 minutes and is refreshed at 25, so nobody is dropped
    // mid-sentence. Not 30: a token that expires while the request for its
    // replacement is in flight disconnects the call, which is the one failure
    // this whole refresh exists to avoid.
    staleTime: 25 * 60 * 1000,
    refetchInterval: 25 * 60 * 1000,
    // A refused grant is a rule, not a network blip. Retrying a "this room is
    // closed" three times just delays telling the member why.
    retry: false,
  })

  return {
    token: query.data?.token,
    grant: query.data?.grant,
    loading: query.isPending,
    error: query.error as Error | null,
  }
}
