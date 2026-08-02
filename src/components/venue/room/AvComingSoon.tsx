import { Video } from 'lucide-react'
import { VENUE_AUDIO_MODE_LABELS } from '../../../lib/constants'
import type { VenueRoom } from '../../../types'

/**
 * Where the call goes.
 *
 * Phase 2 replaces the inside of this with a LiveKit room. Saying so is better
 * than a silent empty box: a room with no audio looks broken otherwise. The
 * room's audio policy is named here because it is already set, already
 * enforced at the door, and tells the reader what the call will be when it
 * arrives.
 */
export function AvComingSoon({ room }: { room: VenueRoom }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ktip-sand-200 bg-ktip-cream px-6 py-10 text-center">
      <Video size={26} className="text-ktip-sand-400" aria-hidden="true" />
      <p className="font-display text-base font-bold text-ktip-sand-800">
        Audio and video are coming to this room
      </p>
      <p className="max-w-md text-sm text-ktip-sand-600">
        Presence and chat are live now. Voice, screen sharing and host controls arrive with the next
        release. Until then, use the chat below and the panels beside it.
      </p>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-ktip-sand-400">
        {VENUE_AUDIO_MODE_LABELS[room.audio_mode] || room.audio_mode}
      </p>
    </div>
  )
}
