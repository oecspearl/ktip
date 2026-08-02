import { ExternalLink } from 'lucide-react'
import { isSafeHref } from '../../../lib/venue-room-sections'
import type { VenueRoom } from '../../../types'

/**
 * Who is hosting this room.
 *
 * Lifted out of EventVenueRoomPage unchanged in substance, with one addition:
 * the link is checked before it becomes an href. `sponsor_url` is free text
 * typed by a host, and `javascript:` in an anchor is the oldest trick there is.
 */
export function SponsorHero({ room }: { room: VenueRoom }) {
  if (!room.sponsor_name) return null
  const link = room.sponsor_url && isSafeHref(room.sponsor_url) ? room.sponsor_url : null

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ktip-sun-200 bg-ktip-sun-50 p-3">
      {room.sponsor_logo_url && (
        <img src={room.sponsor_logo_url} alt="" className="h-9 w-9 rounded-lg object-contain" />
      )}
      <p className="text-sm text-ktip-sun-800">
        Hosted by <strong>{room.sponsor_name}</strong>
        {link && (
          <>
            {' — '}
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              visit
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </>
        )}
      </p>
    </div>
  )
}
