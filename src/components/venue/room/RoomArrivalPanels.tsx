import { Link } from 'react-router'
import { Check, CircleDashed, TicketCheck } from 'lucide-react'
import { useToast } from '../../../contexts/ToastContext'
import { useMyEventRsvp, useVenueCheckIn } from '../../../hooks/useVenueCheckIn'
import { entityPath } from '../../../lib/slug'
import { Button } from '../../ui/Button'
import { RoomPanel } from './RoomPanel'
import type { Event, EventVenueMember } from '../../../types'

/**
 * Check in, from the room you walked into.
 *
 * An organizer marking four hundred people present by hand is the reason
 * check-in data is usually missing, and 'checked_in' is what the `showed_up`
 * achievement and every attendance number downstream are counted from. The
 * write goes through venue_check_in() (091) because event_rsvps has no
 * self-update policy — see the note on that function.
 */
export function CheckInCard({ event }: { event: Pick<Event, 'id' | 'title'> }) {
  const toast = useToast()
  const { rsvp, loading } = useMyEventRsvp(event.id)
  const { checkIn, loading: saving } = useVenueCheckIn()

  // A spectator with no registration has nothing to check in to, and saying so
  // in a card is worse than not drawing the card.
  if (loading || !rsvp) return null

  if (rsvp.status === 'checked_in') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-ktip-tropical-200 bg-ktip-tropical-50 px-4 py-3 text-sm text-ktip-tropical-800">
        <TicketCheck size={16} aria-hidden="true" />
        You are checked in.
      </div>
    )
  }

  if (rsvp.status !== 'confirmed') {
    return (
      <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-sand-50 px-4 py-3 text-sm text-ktip-sand-600">
        Your registration is {rsvp.status}. An organizer has to confirm it before you can check in.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ktip-sun-200 bg-ktip-sun-50 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm text-ktip-sun-800">
        You are registered for <strong>{event.title}</strong> but not checked in yet.
      </p>
      <Button
        size="sm"
        loading={saving}
        onClick={async () => {
          try {
            await checkIn(event.id)
            toast.success('Checked in')
          } catch (err: any) {
            toast.error(err?.message || 'Could not check you in')
          }
        }}
      >
        Check in
      </Button>
    </div>
  )
}

/**
 * The four things a new arrival has not done yet.
 *
 * Every step is derived from state that already exists, so nothing has to be
 * stored to know whether it is done, and the panel disappears on its own once
 * they all are — a checklist that stays after it is finished is clutter.
 */
export function OnboardingChecklist({
  event,
  membership,
}: {
  event: Pick<Event, 'id' | 'slug' | 'title'>
  membership: EventVenueMember
}) {
  const steps = [
    {
      key: 'entered',
      label: 'Walk into a room',
      done: !!membership.current_room_id,
      hint: null as string | null,
    },
    {
      key: 'status',
      label: 'Set your status',
      done: !!membership.status_note,
      hint: 'Use the pill in the top bar — it tells people whether to interrupt you.',
    },
    {
      key: 'skills',
      label: 'List a skill or two',
      done: (membership.skills || []).length > 0,
      hint: 'It is how anyone looking for a teammate finds you.',
    },
    {
      key: 'team',
      label: 'Say whether you need a team',
      // Either answer counts as answered: is_discoverable starts true, so
      // turning it off is as much a decision as ticking "looking for a team".
      done: membership.looking_for_team || !membership.is_discoverable,
      hint: 'Tick “looking for a team” to appear on the discovery panel.',
    },
  ].filter((step) => step.key !== 'team' || membership.role === 'participant')

  const outstanding = steps.filter((s) => !s.done)
  if (!outstanding.length) return null

  return (
    <RoomPanel title="Getting started" meta={`${steps.length - outstanding.length}/${steps.length}`}>
      <ul className="divide-y divide-ktip-sand-100">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-2.5 px-4 py-2.5">
            {step.done ? (
              <Check size={15} className="mt-0.5 shrink-0 text-ktip-tropical-600" aria-hidden="true" />
            ) : (
              <CircleDashed size={15} className="mt-0.5 shrink-0 text-ktip-sand-400" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span
                className={`block text-sm ${
                  step.done ? 'text-ktip-sand-400 line-through' : 'text-ktip-sand-800'
                }`}
              >
                {step.label}
              </span>
              {!step.done && step.hint && (
                <span className="block text-[11px] leading-snug text-ktip-sand-500">{step.hint}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Link
        to={entityPath('event', event)}
        className="block border-t border-ktip-sand-100 px-4 py-2 text-xs font-semibold text-ktip-ocean-600 hover:bg-ktip-sand-50"
      >
        Read the event brief →
      </Link>
    </RoomPanel>
  )
}
