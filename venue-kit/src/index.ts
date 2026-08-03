export { VenueProvider, useVenue } from './VenueProvider'
export type { VenueProviderProps, VenueContextValue } from './VenueProvider'
export { useVenuePresence } from './useVenuePresence'
export type { VenuePresence, PeerPosition, UseVenuePresenceArgs } from './useVenuePresence'
export {
  strongerAvailability,
  normalizePos,
  presenceToOccupants,
  mergeRoster,
  occupancyByRoom,
  occupantsInRoom,
  occupantsUnassigned,
  sortOccupants,
  resolveAvailability,
  shouldHeartbeat,
} from './presence-logic'
export type { RawPresenceState } from './presence-logic'
export {
  AvailabilityDot,
  AvailabilityPicker,
  ConnectionChip,
  OccupantList,
  RoomGrid,
  AVAILABILITY_LABELS,
} from './components'
export { VENUE } from './constants'
export type {
  VenueRole,
  VenueAvailability,
  VenueAudioMode,
  VenueCameraMode,
  VenueRoom,
  VenueMember,
  VenuePosition,
  VenuePresencePayload,
  VenueOccupant,
} from './types'
