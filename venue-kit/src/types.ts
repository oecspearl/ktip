/** Roles the server may assign. The client never chooses one. */
export type VenueRole =
  | 'organizer'
  | 'speaker'
  | 'mentor'
  | 'judge'
  | 'participant'
  | 'spectator'

/** `offline` is derived (stale mirror row), never stored or reported. */
export type VenueAvailability = 'working' | 'away' | 'busy' | 'help_wanted' | 'offline'

export type VenueAudioMode = 'open' | 'moderated' | 'listen_only'
export type VenueCameraMode = 'spotlight' | 'grid' | 'huddle' | 'off'

export interface VenueRoom {
  id: string
  event_id: string
  key: string
  name: string
  description: string | null
  kind: string
  is_open: boolean
  capacity: number | null
  audio_mode: VenueAudioMode
  camera_mode: VenueCameraMode
  max_publishers: number
  recording_enabled: boolean
  sort_order: number
}

/** A row of the cold mirror (`venue_members`). */
export interface VenueMember {
  id: string
  event_id: string
  user_id: string
  role: VenueRole
  availability: Exclude<VenueAvailability, 'offline'>
  status_note: string | null
  current_room_id: string | null
  last_seen_at: string
  meta: Record<string, unknown> | null
  /** Optional profile join, if your roster query includes one. */
  user?: { display_name: string | null; avatar_url: string | null } | null
}

/** Optional map position, for venues that draw a walkable floorplan. */
export interface VenuePosition {
  x: number
  y: number
  /** Floor index, 0-based. */
  f?: number
}

/** What each client tracks on the presence channel. Versioned from day one. */
export interface VenuePresencePayload {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  role: VenueRole
  availability: Exclude<VenueAvailability, 'offline'>
  status_note: string | null
  room_id: string | null
  pos: VenuePosition | null
  v: 1
}

/** One person as the UI sees them: live presence merged with the mirror. */
export interface VenueOccupant {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  role: VenueRole
  availability: VenueAvailability
  status_note: string | null
  room_id: string | null
  pos: VenuePosition | null
  /** True when this entry came from the live channel rather than the mirror. */
  is_live: boolean
}
