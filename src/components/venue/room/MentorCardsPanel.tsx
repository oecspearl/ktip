import { useMemo } from 'react'
import { Star } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useVenueRoster } from '../../../hooks/useVenue'
import { useBookingSlots, type BookingSlot } from '../../../hooks/useRoomTools'
import { Button } from '../../ui/Button'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import type { VenueOccupant, VenueRoom } from '../../../types'

/**
 * The people you can book, one card each: who they are, what they know, the
 * language they read, and one button that takes their next free time.
 *
 * The same slots as the plain booking panel (migration 212), drawn per person.
 * Skills come from the venue roster and the language from live presence, so a
 * card says only what the person has told the venue themselves.
 */
export function MentorCardsPanel({
  room,
  canPost,
  occupants,
  title,
}: {
  room: VenueRoom
  canPost: boolean
  occupants: VenueOccupant[]
  title?: string
}) {
  const { t, i18n } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const me = auth.user?.id
  const { slots, loading, available, book } = useBookingSlots(room.id)
  const { roster } = useVenueRoster(room.event_id)
  const fail = (err: any) => toast.error(err?.message || t`Could not save that`)

  const hosts = useMemo(() => {
    const byHost = new Map<string, BookingSlot[]>()
    for (const slot of slots) byHost.set(slot.host_id, [...(byHost.get(slot.host_id) ?? []), slot])
    return [...byHost.values()]
  }, [slots])
  const live = useMemo(() => new Map(occupants.map((o) => [o.user_id, o])), [occupants])
  const skillsOf = (id: string) => (roster || []).find((member) => member.user_id === id)?.skills ?? []
  const clock = (iso: string) => i18n.date(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  return (
    <section className="overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card" aria-label={title || t`Mentors`}>
      <header className="flex items-center gap-3 border-b border-ktip-sand-100 px-4 py-3">
        <Star size={20} className="shrink-0 text-ktip-tropical-700" aria-hidden="true" />
        <h2 className="text-sm font-extrabold text-ktip-sand-900">{title || t`Mentors`}</h2>
      </header>
      {!available ? (
        <p className="px-4 py-6 text-sm text-ktip-sand-500">
          <Trans>This is not switched on for this venue yet.</Trans>
        </p>
      ) : loading ? (
        <div className="m-4 h-28 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
      ) : hosts.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ktip-sand-500">
          <Trans>No times on offer right now.</Trans>
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {hosts.map((list) => {
            const host = list[0].host
            const id = list[0].host_id
            const name = host?.display_name || t`Member`
            const skills = skillsOf(id).slice(0, 3).join(', ')
            const lang = live.get(id)?.lang
            const mine = list.find((slot) => slot.booked_by === me) ?? null
            const next = list.find((slot) => !slot.booked_by) ?? null
            const own = id === me
            const mineTime = mine ? clock(mine.starts_at) : ''
            const nextTime = next ? clock(next.starts_at) : ''
            return (
              <li key={id} className="flex min-w-0 flex-col gap-3 rounded-surface border border-ktip-sand-200 p-3.5">
                <span className="flex min-w-0 items-center gap-3">
                  <DiamondAvatar src={host?.avatar_url} name={name} size={40} />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-extrabold text-ktip-sand-900">{name}</span>
                    {skills && <span className="block break-words text-xs text-ktip-sand-500">{skills}</span>}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {lang && (
                    <span className="rounded border border-ktip-sand-200 px-1.5 text-micro font-extrabold uppercase text-ktip-sand-600">{lang}</span>
                  )}
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-micro font-bold',
                      next ? 'bg-ktip-tropical-50 text-ktip-tropical-700' : 'bg-ktip-sun-50 text-ktip-sun-800'
                    )}
                  >
                    {next ? <Trans>Free at {nextTime}</Trans> : <Trans>Booked up</Trans>}
                  </span>
                </span>
                {mine ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    loading={book.isPending}
                    onClick={() => book.mutate({ id: mine.id, on: false }, { onError: fail })}
                  >
                    <Trans>Yours at {mineTime}. Give it back</Trans>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    disabled={!next || own || !canPost}
                    loading={book.isPending}
                    onClick={() => next && book.mutate({ id: next.id, on: true }, { onError: fail })}
                  >
                    <Trans>Book 15 minutes</Trans>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
