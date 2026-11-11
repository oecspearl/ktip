import { ExternalLink } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { isSafeHref } from '../../../lib/venue-room-sections'
import { useTranslated } from '../../../hooks/useTranslated'
import type { VenueRoom } from '../../../types'

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/**
 * Who is hosting this room, and what they put up.
 *
 * The sponsor's name as a wordmark with a line about them, and beside it the
 * prize, when the host has written one into this section's config:
 * `blurb`, `prize_amount`, `prize_label`, `prize_note`. All of it is typed by a
 * host, so it is rendered as text and the link is checked before it becomes an
 * href (`javascript:` in an anchor is the oldest trick there is).
 */
export function SponsorHero({ room, config = {} }: { room: VenueRoom; config?: Record<string, unknown> }) {
  const blurb = useTranslated(text(config.blurb, 240))
  const prizeLabel = useTranslated(text(config.prize_label, 80))
  const prizeNote = useTranslated(text(config.prize_note, 200))
  const prizeAmount = text(config.prize_amount, 24)
  if (!room.sponsor_name) return null
  const link = room.sponsor_url && isSafeHref(room.sponsor_url) ? room.sponsor_url : null
  const hasPrize = !!(prizeAmount || prizeLabel)

  return (
    <section className="grid grid-cols-1 overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2.5 p-5">
        <p className="flex min-w-0 items-center gap-2.5">
          {room.sponsor_logo_url ? (
            <img src={room.sponsor_logo_url} alt="" className="h-9 w-9 shrink-0 rounded-control object-contain" />
          ) : (
            <span className="h-5 w-5 shrink-0 rotate-45 rounded-[3px] bg-ktip-ocean-600" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words font-display text-2xl font-bold leading-none text-ktip-sand-900">{room.sponsor_name}</span>
        </p>
        {blurb && <p className="max-w-[60ch] text-sm text-ktip-sand-700">{blurb}</p>}
        <p className="text-xs text-ktip-sand-500">
          <Trans>Hosting this room</Trans>
          {link && (
            <>
              {' · '}
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-ktip-ocean-700 underline">
                <Trans>Visit their site</Trans>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </>
          )}
        </p>
      </div>
      {hasPrize && (
        <div className="flex min-w-0 flex-col justify-center gap-2 bg-brand-navy p-5 text-white">
          {prizeAmount && <b className="font-display text-4xl font-bold leading-none text-ktip-sun-400">{prizeAmount}</b>}
          {prizeLabel && <span className="break-words text-sm font-bold">{prizeLabel}</span>}
          {prizeNote && <p className="break-words text-micro text-white/70">{prizeNote}</p>}
        </div>
      )}
    </section>
  )
}
