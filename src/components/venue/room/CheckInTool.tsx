import { Link } from 'react-router'
import { Check, IdCard, Map as MapIcon } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useLanguage } from '../../../i18n/LanguageContext'
import { UI_LANGS, type UiLang } from '../../../lib/i18n/protocol'
import { useMyEventRsvp, useVenueCheckIn } from '../../../hooks/useVenueCheckIn'
import { useEventTeams } from '../../../hooks/useEventTeams'
import { venueRoomPath } from '../../../lib/event-slug'
import { VENUE_ROLE_LABELS } from '../../../lib/constants'
import { floorLabel, type VenueMapFloor } from '../../../lib/venue-map'
import { Button } from '../../ui/Button'
import { Segmented } from '../../ui/Segmented'
import type { Event, EventVenueMember, VenueRoom } from '../../../types'

const ENDONYM: Record<UiLang, string> = { en: 'English', fr: 'Français', es: 'Español' }

/**
 * Check in at the Registration Desk, as the room design draws it: your badge
 * on the left, three steps on the right.
 *
 *   1. House rules   done once you have checked in
 *   2. Your language the site's own language, which calls and chat follow
 *   3. Find your team and the way to its Homebase
 *
 * The write is still venue_check_in() (091). Someone with no registration
 * (a host looking around) sees the badge and the steps without the button.
 */
export function CheckInTool({
  event,
  membership,
  rooms,
  floors,
}: {
  event: Event
  membership: EventVenueMember
  rooms: VenueRoom[] | undefined
  floors: VenueMapFloor[]
}) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { uiLang, setLang } = useLanguage()
  const { rsvp } = useMyEventRsvp(event.id)
  const { checkIn, loading: saving } = useVenueCheckIn()
  const { teams } = useEventTeams(event.id)

  const me = auth.user?.id
  const name = auth.profile?.display_name || t`Member`
  const team = teams.find((x) => x.members.some((m) => m.user_id === me)) ?? null
  const homebase = team?.homebase_room_id ? rooms?.find((r) => r.id === team.homebase_room_id) ?? null : null
  const level = homebase ? floors[homebase.floor]?.name || floorLabel(homebase.floor) : null
  const checkedIn = rsvp?.status === 'checked_in'
  const canCheckIn = rsvp?.status === 'confirmed'
  const year = new Date(event.start_date).getFullYear()
  const teamName = team?.name ?? ''

  const pickLanguage = async (next: UiLang) => {
    setLang(next)
    // A chat-language override moves with it, so chat and calls agree.
    const override = auth.profile?.content_language
    if (!override || override === next) return
    try {
      await auth.updateProfile({ content_language: next })
    } catch (err: any) {
      toast.error(err?.message || t`Could not save your language`)
    }
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card" aria-label={t`Check in`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ktip-sand-100 px-4 py-3">
        <IdCard size={20} className="shrink-0 text-ktip-sun-700" aria-hidden="true" />
        <h2 className="mr-auto text-sm font-extrabold text-ktip-sand-900">
          <Trans>Check in</Trans>
        </h2>
        {checkedIn ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ktip-tropical-50 px-2.5 py-1 text-micro font-extrabold text-ktip-tropical-700">
            <Check size={13} aria-hidden="true" />
            <Trans>Checked in</Trans>
          </span>
        ) : (
          canCheckIn && (
            <Button
              size="sm"
              loading={saving}
              onClick={async () => {
                try {
                  await checkIn(event.id)
                  toast.success(t`Checked in`)
                } catch (err: any) {
                  toast.error(err?.message || t`Could not check you in`)
                }
              }}
            >
              <Trans>Finish check-in</Trans>
            </Button>
          )
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 p-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* ---- the badge: fixed navy in both themes, like a printed pass ---- */}
        <div className="flex min-w-0 flex-col gap-3 rounded-surface bg-brand-navy p-5 text-white">
          <span className="break-words text-micro font-extrabold uppercase tracking-[0.08em] text-white/70">
            {event.title} · {year}
          </span>
          <span className="break-words font-display text-3xl font-bold leading-none">{name}</span>
          <span className="self-start rounded-sm bg-brand-green px-2 py-0.5 text-micro font-extrabold uppercase tracking-[0.06em] text-brand-navy">
            {VENUE_ROLE_LABELS[membership.role] || membership.role}
          </span>
          <span className="text-sm text-white/70">
            <Trans>
              Speaks <b className="text-white">{ENDONYM[uiLang]}</b>
            </Trans>
          </span>
          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
            <BadgeCode seed={me ?? name} />
            {team && (
              <span className="min-w-0 break-words text-right text-xs text-white/70">
                {team.name}
                {level && (
                  <>
                    <br />
                    <Trans>Homebase, {level}</Trans>
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        {/* ---- the steps ---- */}
        <ol className="flex min-w-0 flex-col gap-1">
          <Step n={1} done={checkedIn} title={t`House rules`}>
            {checkedIn ? (
              <Trans>Agreed when you checked in.</Trans>
            ) : (
              <Trans>Be kind, credit what you borrow, and keep keys and passwords out of chat. Checking in means you agree.</Trans>
            )}
          </Step>

          <Step n={2} current title={t`Your language`}>
            <Trans>Talks, subtitles and chat come to you in this language. When someone speaks another one, the call translates them for you.</Trans>
            <div className="mt-2.5">
              <Segmented
                value={uiLang}
                options={UI_LANGS.map((code) => ({ value: code, label: ENDONYM[code] }))}
                onChange={pickLanguage}
                label={t`Your language`}
                radius="sm"
              />
            </div>
          </Step>

          <Step n={3} title={t`Find your team`}>
            {team ? (
              homebase && level ? (
                <Trans>You are in {teamName}. Your Homebase is on {level}.</Trans>
              ) : (
                <Trans>You are in {teamName}.</Trans>
              )
            ) : (
              <Trans>You are not in a team yet. The Networking Lounge is where teams form.</Trans>
            )}
            {homebase && (
              <div className="mt-2.5">
                <Link
                  to={venueRoomPath(event, homebase.key)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control border border-ktip-sand-200 bg-ktip-cream px-3 text-sm font-bold text-ktip-sand-900 hover:border-ktip-ocean-400"
                >
                  <MapIcon size={15} aria-hidden="true" />
                  <Trans>Go to your Homebase</Trans>
                </Link>
              </div>
            )}
          </Step>
        </ol>
      </div>
    </section>
  )
}

function Step({
  n,
  title,
  done,
  current,
  children,
}: {
  n: number
  title: string
  done?: boolean
  current?: boolean
  children: React.ReactNode
}) {
  return (
    <li className={cn('flex gap-3.5 rounded-surface p-3', current && !done && 'bg-ktip-ocean-50')}>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold',
          done
            ? 'border-ktip-tropical-600 bg-ktip-tropical-600 text-white'
            : current
              ? 'border-ktip-ocean-600 text-ktip-ocean-700'
              : 'border-ktip-sand-200 text-ktip-sand-500'
        )}
      >
        {done ? <Check size={15} aria-hidden="true" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-extrabold text-ktip-sand-900">{title}</h3>
        <div className="mt-0.5 text-sm text-ktip-sand-700">{children}</div>
      </div>
    </li>
  )
}

/**
 * The square on the badge. A pattern drawn from the member's id, so each badge
 * looks like its own. It is decoration: nothing scans it, and it carries nothing.
 */
function BadgeCode({ seed }: { seed: string }) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const cells = Array.from({ length: 49 }, (_, i) => {
    const x = i % 7
    const y = Math.floor(i / 7)
    // A solid frame, as a code has, and the member's own pattern inside it.
    if (x === 0 || y === 0 || x === 6 || y === 6) return true
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h >>> 16) & 1) === 1
  })
  return (
    <span className="grid h-18 w-18 shrink-0 grid-cols-7 gap-px rounded-sm bg-white p-1.5" aria-hidden="true">
      {cells.map((on, i) => (
        <i key={i} className={on ? 'bg-brand-navy' : 'bg-white'} />
      ))}
    </span>
  )
}
