import { useQuery } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
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

const SIGNED_OUT = msg`Your sign-in has ended. Sign out and back in to join the call.`

/** The one request both hooks make. The route asks Postgres; this only carries the answer. */
async function fetchVenueToken(
  target: { roomId: string } | { coffeeTableId: string } | { callId: string }
): Promise<VenueRoomToken> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error(i18n._(SIGNED_OUT))

  const ask = (accessToken: string) =>
    fetch('/api/venue/room-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(target),
    })

  let res = await ask(session.access_token)
  // 401 means the sign-in server no longer knows this session, while the page
  // can still read for up to an hour on the key it has. Signing out on another
  // device does this. One refresh, then say so plainly.
  if (res.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (!refreshed.session) throw new Error(i18n._(SIGNED_OUT))
    res = await ask(refreshed.session.access_token)
    if (res.status === 401) throw new Error(i18n._(SIGNED_OUT))
  }

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
}

export function useVenueRoomToken(roomId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'livekit-token', roomId),
    queryFn: () => fetchVenueToken({ roomId: roomId as string }),
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

/**
 * A token for one coffee table's call (migration 200). Same route, same
 * refresh, but granted by coffee_table_grant(): seated people and organisers.
 */
export function useCoffeeTableToken(tableId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'coffee-token', tableId),
    queryFn: () => fetchVenueToken({ coffeeTableId: tableId as string }),
    enabled: Boolean(tableId) && enabled && isVenueVideoConfigured(),
    staleTime: 25 * 60 * 1000,
    retry: false,
  })
  return {
    token: query.data?.token,
    grant: query.data?.grant,
    error: query.error as Error | null,
  }
}

/**
 * A token for a call started from /collaborate/video (migration 202). Same
 * route and refresh as a venue room, granted by video_call_grant(): any
 * signed-in member holding the link, unless the call is locked or over.
 */
export function useCallToken(callId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: keys.sub('video-call', 'livekit-token', callId),
    queryFn: () => fetchVenueToken({ callId: callId as string }),
    enabled: Boolean(callId) && enabled && isVenueVideoConfigured(),
    staleTime: 25 * 60 * 1000,
    refetchInterval: 25 * 60 * 1000,
    retry: false,
  })
  return {
    token: query.data?.token,
    grant: query.data?.grant,
    loading: query.isFetching && !query.data,
    error: query.error as Error | null,
  }
}
