import { type EventSpeaker } from '../../types'
import { Mic, Globe } from 'lucide-react'
import { DiamondAvatar } from '../ui/DiamondAvatar'

interface EventSpeakerGridProps {
  speakers: EventSpeaker[]
}

export function EventSpeakerGrid({ speakers }: EventSpeakerGridProps) {
  return (
    <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6">
      <h2 className="text-xl font-display font-bold text-ktip-sand-900 mb-4 flex items-center gap-2">
        <Mic className="text-ktip-ocean-600" size={20} />
        Speakers
      </h2>

      {speakers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {speakers.map((speaker) => (
            <div key={speaker.id} className="flex flex-col items-center text-center">
              <DiamondAvatar
                src={speaker.photo_url}
                name={speaker.name}
                size={80}
                className="mb-3"
              />

              <span className="font-semibold text-ktip-sand-900">
                {speaker.name}
              </span>

              {speaker.title && (
                <span className="text-sm text-ktip-sand-500 mt-0.5">
                  {speaker.title}
                </span>
              )}

              {speaker.bio && (
                <p className="text-sm text-ktip-sand-600 mt-2 line-clamp-3">
                  {speaker.bio}
                </p>
              )}

              {speaker.website && (
                <a
                  href={speaker.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 mt-2"
                >
                  <Globe size={12} />
                  Website
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ktip-sand-500">
          Speakers will be announced soon.
        </p>
      )}
    </div>
  )
}
