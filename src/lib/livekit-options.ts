import { VideoPresets, type RoomOptions } from 'livekit-client'

/**
 * Room options every LiveKit call in the app connects with.
 *
 * The free Build plan caps downstream data at 50 GB a month, and video sent to
 * people who cannot see it is most of what a careless call spends. These three
 * settings are the cheap fixes:
 *
 * - adaptiveStream: each subscriber asks for the resolution its tile is drawn
 *   at, and pauses video for tiles that are hidden or off screen.
 * - dynacast: a publisher stops encoding simulcast layers nobody subscribes to.
 * - 540p capture: enough for a face in a grid tile; a screen share is a
 *   separate track and keeps its own resolution.
 *
 * A module constant on purpose. LiveKitRoom builds its Room from `options`, so
 * an object literal in a render would be a new Room every render.
 */
export const LIVEKIT_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: {
    resolution: VideoPresets.h540.resolution,
  },
  publishDefaults: {
    simulcast: true,
  },
}
