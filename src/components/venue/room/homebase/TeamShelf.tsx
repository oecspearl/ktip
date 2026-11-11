import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Flag } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { cn } from '../../../../lib/utils'
import { useEventCriteria } from '../../../../hooks/useEventCriteria'
import { useEventTeams } from '../../../../hooks/useEventTeams'
import { RoomPanel } from '../RoomPanel'
import type { Event, VenueRoom } from '../../../../types'

interface Milestone {
  id: string
  title: string
  done_at: string | null
}

/**
 * Under a Homebase's workspace: how far the team has got, and what is left
 * before the deadline.
 *
 * Read-only on purpose. Milestones are edited in the workspace's Milestones
 * tab and the entry is filled in at the Submission card; this is the glance
 * that says where things stand. Both queries share their keys with those
 * editors, so a tick there shows here without a second request.
 */
export function TeamShelf({ event, room }: { event: Event; room: VenueRoom }) {
  const { t } = useLingui()
  const { teams } = useEventTeams(event.id)
  const team = teams.find((x) => x.homebase_room_id === room.id) ?? null
  const teamId = team?.id
  const { criteria } = useEventCriteria(event.id)

  const { data: milestones = [] } = useQuery({
    queryKey: keys.sub('venue', 'team-milestones', teamId),
    enabled: !!teamId,
    queryFn: async (): Promise<Milestone[]> => {
      const { data, error } = await (supabase as any)
        .from('team_milestones')
        .select('id, title, due_at, done_at, position')
        .eq('team_id', teamId)
        .order('position')
      if (error) return []
      return data || []
    },
  })

  const { data: ticks = {} } = useQuery({
    queryKey: keys.sub('venue', 'team-checklist', teamId),
    enabled: !!teamId,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await (supabase as any)
        .from('team_checklist')
        .select('criterion_id, done')
        .eq('team_id', teamId)
      if (error) return {}
      return Object.fromEntries((data || []).map((r: any) => [r.criterion_id, r.done]))
    },
  })

  const deliverables = (criteria || []).filter((c: any) => c.kind === 'deliverable')
  const firstOpen = milestones.findIndex((m) => !m.done_at)
  const deadline = event.submission_deadline ? Date.parse(event.submission_deadline) : NaN
  const hasDeadline = Number.isFinite(deadline)

  if (!team || (!milestones.length && !hasDeadline)) return null

  const openSubmission = () => {
    const el = document.querySelector('[data-room-section="submission_desk"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4', hasDeadline && milestones.length > 0 && 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]')}>
      {milestones.length > 0 && (
        <RoomPanel title={t`Milestones`} meta={<Flag size={14} aria-hidden="true" />}>
          <ol className="flex flex-wrap gap-x-2 gap-y-4 p-4">
            {milestones.map((m, i) => {
              const done = !!m.done_at
              const current = i === firstOpen
              return (
                <li key={m.id} className="flex min-w-20 flex-1 flex-col items-center gap-2 text-center">
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-extrabold tabular-nums',
                      done
                        ? 'border-ktip-tropical-600 bg-ktip-tropical-600 text-white'
                        : current
                          ? 'border-ktip-ocean-600 text-ktip-ocean-700'
                          : 'border-ktip-sand-200 text-ktip-sand-500'
                    )}
                  >
                    {done ? <Check size={15} aria-hidden="true" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'break-words text-micro font-bold',
                      done || current ? 'text-ktip-sand-900' : 'text-ktip-sand-500'
                    )}
                  >
                    {m.title}
                    {done && <span className="sr-only"> <Trans>(done)</Trans></span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </RoomPanel>
      )}

      {hasDeadline && (
        // Fixed navy in both themes, like the countdown chip in the top bar.
        <section className="flex min-w-0 flex-col rounded-surface bg-brand-navy text-white shadow-card">
          <header className="flex min-h-11.5 flex-wrap items-center justify-between gap-2 border-b border-white/12 px-4 py-2">
            <h2 className="text-micro font-extrabold uppercase tracking-[0.08em] text-white/70">
              <Trans>Submission</Trans>
            </h2>
            <DeadlineLabel deadline={deadline} />
          </header>
          <div className="flex flex-1 flex-col gap-3.5 p-4">
            <DeadlineClock deadline={deadline} />
            {deliverables.length > 0 && (
              <ul className="flex flex-col gap-2">
                {deliverables.map((c: any) => {
                  const on = !!ticks[c.id]
                  return (
                    <li key={c.id} className="flex items-center gap-2.5 text-sm text-white/85">
                      <span
                        className={cn(
                          'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border',
                          on ? 'border-brand-green bg-brand-green text-brand-navy' : 'border-white/40'
                        )}
                      >
                        {on && <Check size={12} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 break-words">{c.title}</span>
                      <span className="sr-only">{on ? t`(done)` : t`(not done)`}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            <button
              type="button"
              onClick={openSubmission}
              className="mt-auto inline-flex h-9 items-center justify-center self-start rounded-control bg-brand-green px-3.5 text-sm font-bold text-brand-navy hover:brightness-95"
            >
              <Trans>Open submission</Trans>
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function DeadlineLabel({ deadline }: { deadline: number }) {
  const { i18n } = useLingui()
  const time = i18n.date(new Date(deadline), { timeStyle: 'short' })
  return (
    <span className="text-xs font-medium text-white/60">
      {deadline > Date.now() ? <Trans>Closes {time}</Trans> : <Trans>Closed {time}</Trans>}
    </span>
  )
}

/** Ticks each second in here only, so the shelf around it does not re-render. */
function DeadlineClock({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline <= Date.now()) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  const left = deadline - now
  if (left <= 0) {
    return (
      <p className="font-display text-3xl font-bold text-white/70">
        <Trans>Closed</Trans>
      </p>
    )
  }
  const total = Math.floor(left / 1000)
  const days = Math.floor(total / 86_400)
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
  return (
    <p role="timer" className="font-display text-4xl font-bold leading-none tabular-nums text-ktip-sun-400">
      {days > 0 && <span className="mr-2 text-2xl">{days}d</span>}
      {clock}
    </p>
  )
}
