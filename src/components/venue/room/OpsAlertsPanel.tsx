import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { supabase } from '../../../lib/supabase'
import { keys } from '../../../queries/keys'
import { useStageLineup } from '../../../hooks/useStageLineup'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'
import type { VenueOccupant } from '../../../types'

type Tone = 'warn' | 'info' | 'ok'
interface Alert {
  key: string
  tone: Tone
  text: string
  detail: string
}

/**
 * What an organiser should look at now, worked out from the venue's own data:
 * a long help line, kit that has run out, a stage running late, nobody
 * mentoring. Nothing is stored; every line is true at the moment it shows.
 * Each source is optional, so a venue without 211, 212 or 213 simply has fewer.
 */
export function OpsAlertsPanel({ eventId, occupants }: { eventId: string; occupants: VenueOccupant[] }) {
  const { t, i18n } = useLingui()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const { data: waiting = [] } = useQuery({
    queryKey: keys.sub('venue', 'ops-help', eventId),
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<Array<{ created_at: string }>> => {
      const { data, error } = await (supabase as any)
        .from('venue_help_requests')
        .select('created_at')
        .eq('event_id', eventId)
        .eq('status', 'waiting')
      return error ? [] : data || []
    },
  })

  const { data: kitOut = [] } = useQuery({
    queryKey: keys.sub('venue', 'ops-kit', eventId),
    refetchInterval: 60_000,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from('venue_kit_items')
        .select('name, total, reservations:venue_kit_reservations(user_id)')
        .eq('event_id', eventId)
      if (error) return []
      return (data || [])
        .filter((row: any) => (row.reservations ?? []).length >= row.total)
        .map((row: any) => row.name as string)
    },
  })

  const { lineup } = useStageLineup(eventId)

  const alerts: Alert[] = []
  if (waiting.length > 0) {
    const longest = Math.max(...waiting.map((w) => now - Date.parse(w.created_at)))
    const minutes = Math.max(1, Math.round(longest / 60_000))
    const count = waiting.length
    alerts.push({
      key: 'help',
      tone: count >= 4 || minutes >= 10 ? 'warn' : 'info',
      text: t`Help Desk has ${count} waiting`,
      detail: t`Longest wait ${minutes} min`,
    })
  }
  const mentorsOn = occupants.filter((o) => o.role === 'mentor' && o.availability !== 'offline').length
  if (mentorsOn === 0) {
    alerts.push({ key: 'mentors', tone: 'warn', text: t`No mentors in the venue`, detail: t`The help line has nobody to pick it up` })
  }
  for (const name of kitOut) {
    alerts.push({ key: `kit-${name}`, tone: 'info', text: t`${name} are all reserved`, detail: t`Hardware Bench` })
  }
  const live = lineup.find((item) => item.status === 'live')
  if (live) {
    const over = now - (Date.parse(live.starts_at) + live.minutes * 60_000)
    if (over > 60_000) {
      const late = Math.round(over / 60_000)
      alerts.push({ key: 'stage', tone: 'warn', text: t`The stage is running ${late} min late`, detail: live.title })
    }
  }

  return (
    <RoomPanel title={t`Alerts`} meta={alerts.length || undefined}>
      {alerts.length === 0 ? (
        <RoomPanelEmpty>
          <Trans>All quiet. Nothing needs you right now.</Trans>
        </RoomPanelEmpty>
      ) : (
        <ul className="divide-y divide-ktip-sand-100">
          {alerts.map((alert) => (
            <li key={alert.key} className="flex items-start gap-3 px-4 py-2.5">
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  alert.tone === 'warn' ? 'bg-ktip-sun-500' : alert.tone === 'ok' ? 'bg-ktip-tropical-600' : 'bg-ktip-ocean-600'
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-bold text-ktip-sand-900">{alert.text}</span>
                <span className="block break-words text-xs text-ktip-sand-500">{alert.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-ktip-sand-100 px-4 py-2.5 text-xs text-ktip-sand-500">
        <Trans>Checked at {i18n.date(new Date(now), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</Trans>
      </p>
    </RoomPanel>
  )
}
