import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Mic, Radio } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useEventTeams } from '../../../hooks/useEventTeams'
import { useStageLineup, type LineupItem } from '../../../hooks/useStageLineup'
import { venueRoomPath } from '../../../lib/event-slug'
import { Button } from '../../ui/Button'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'
import type { Event, VenueRoom } from '../../../types'

/**
 * The stage's running order, with a chip on whoever is on now (migration 213).
 * An organiser moves the stage on from here: "Put on" any slot.
 */
export function LineupPanel({ event, room, isHost }: { event: Event; room: VenueRoom; isHost: boolean }) {
  const { t, i18n } = useLingui()
  const toast = useToast()
  const { lineup, loading, available, setLive } = useStageLineup(event.id)
  const { teams } = useEventTeams(event.id)
  const mine = lineup.filter((item) => item.room_id === room.id)
  const fail = (err: any) => toast.error(err?.message || t`Could not save that`)
  const teamName = (id: string | null) => (id ? teams.find((x) => x.id === id)?.name : null)

  return (
    <RoomPanel title={t`Lineup`}>
      {!available ? (
        <RoomPanelEmpty>
          <Trans>This is not switched on for this venue yet.</Trans>
        </RoomPanelEmpty>
      ) : loading ? (
        <div className="m-4 h-24 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
      ) : mine.length === 0 ? (
        <RoomPanelEmpty>
          <Trans>No running order yet.</Trans>
        </RoomPanelEmpty>
      ) : (
        <ul className="divide-y divide-ktip-sand-100">
          {mine.map((item) => (
            <li key={item.id} className={cn('flex items-center gap-3 px-4 py-2.5', item.status === 'done' && 'opacity-60')}>
              <time dateTime={item.starts_at} className="w-14 shrink-0 text-xs font-bold tabular-nums text-ktip-sand-600">
                {i18n.date(new Date(item.starts_at), { hour: '2-digit', minute: '2-digit' })}
              </time>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-bold text-ktip-sand-900">{teamName(item.team_id) || item.title}</span>
                <span className="block break-words text-xs text-ktip-sand-500">
                  {teamName(item.team_id) ? item.title : item.detail}
                </span>
              </span>
              {item.status === 'live' ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-micro font-extrabold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />
                  <Trans>Now</Trans>
                </span>
              ) : (
                isHost &&
                item.status === 'upcoming' && (
                  <Button size="sm" variant="secondary" onClick={() => setLive.mutate({ roomId: room.id, id: item.id }, { onError: fail })}>
                    <Trans>Put on</Trans>
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {available && isHost && mine.some((item) => item.status === 'live') && (
        <div className="border-t border-ktip-sand-100 px-4 py-3">
          <Button size="sm" variant="ghost" onClick={() => setLive.mutate({ roomId: room.id, id: null }, { onError: fail })}>
            <Trans>Take the stage off air</Trans>
          </Button>
        </div>
      )}
    </RoomPanel>
  )
}

/** "You are on next": the viewer's own coming slot, on any stage, with a countdown. */
export function OnNextPanel({ event, rooms }: { event: Event; rooms: VenueRoom[] | undefined }) {
  const { t } = useLingui()
  const auth = useAuth()
  const me = auth.user?.id
  const { lineup, available } = useStageLineup(event.id)
  const { teams } = useEventTeams(event.id)
  const myTeam = teams.find((x) => x.members.some((m) => m.user_id === me))?.id ?? null

  const isMine = (item: LineupItem) => item.speaker_id === me || (!!myTeam && item.team_id === myTeam)
  const next = lineup.find((item) => item.status === 'upcoming' && isMine(item)) ?? null
  if (!available || !next) return null

  // Who goes on before me, on the same stage.
  const sameStage = lineup.filter((item) => item.room_id === next.room_id)
  const before = sameStage.filter((item) => item.position < next.position).at(-1) ?? null
  const beforeName = before ? teams.find((x) => x.id === before.team_id)?.name || before.title : null
  const stage = rooms?.find((r) => r.id === next.room_id) ?? null
  const minutes = next.minutes
  const stageName = stage?.name ?? t`the stage`

  return (
    <section className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-surface bg-brand-navy p-4 text-white shadow-card" aria-label={t`You are on next`}>
      <Countdown to={next.starts_at} />
      <span className="min-w-0 flex-1">
        <b className="block text-base">
          {beforeName ? <Trans>You are on next, after {beforeName}</Trans> : <Trans>You open the stage</Trans>}
        </b>
        <span className="block text-sm text-white/70">
          <Trans>{stageName} · {minutes} minutes</Trans>
        </span>
      </span>
      {stage && (
        <Link
          to={venueRoomPath(event, stage.key)}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand-green px-3.5 text-sm font-bold text-brand-navy hover:brightness-95"
        >
          <Mic size={15} aria-hidden="true" />
          <Trans>Go to the stage</Trans>
        </Link>
      )}
    </section>
  )
}

function Countdown({ to }: { to: string }) {
  const end = Date.parse(to)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const left = Math.max(0, Math.floor((end - now) / 1000))
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span role="timer" className="inline-flex items-center gap-2 font-display text-4xl font-bold leading-none tabular-nums text-ktip-sun-400">
      <Radio size={20} className="shrink-0 text-white/60" aria-hidden="true" />
      {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
    </span>
  )
}
