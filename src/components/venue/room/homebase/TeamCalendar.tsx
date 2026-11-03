import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Download, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { useAuth } from '../../../../contexts/AuthContext'
import { useToast } from '../../../../contexts/ToastContext'
import { useEventSchedule } from '../../../../hooks/useEventSchedule'
import { Button } from '../../../ui/Button'

interface Item {
  id: string
  title: string
  starts_at: string
  ends_at: string
  kind: 'event' | 'team'
}

interface Props {
  eventId: string
  teamId: string
  teamName: string
  ping: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')
/** iCalendar UTC timestamp, e.g. 20261107T140000Z. */
const icsTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
}
const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

/**
 * The team's calendar (migration 194): the event's schedule and the team's own
 * blocks in one agenda, grouped by day. "Add to my calendar" downloads an .ics
 * file with both, which every calendar app imports.
 */
export function TeamCalendar({ eventId, teamId, teamName, ping }: Props) {
  const { t, i18n } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'team-calendar', teamId)
  const { schedule } = useEventSchedule(eventId)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [minutes, setMinutes] = useState(60)

  const { data: own = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('team_calendar_items')
        .select('id, title, starts_at, ends_at')
        .eq('team_id', teamId)
        .order('starts_at')
      if (error) return []
      return data || []
    },
  })

  const items: Item[] = useMemo(() => {
    const ev = (schedule || [])
      .filter((s: any) => s.start_time)
      .map((s: any) => ({
        id: `ev-${s.id}`,
        title: s.title,
        starts_at: s.start_time,
        ends_at: s.end_time || s.start_time,
        kind: 'event' as const,
      }))
    const mine = own.map((x: any) => ({ ...x, kind: 'team' as const }))
    return [...ev, ...mine].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  }, [schedule, own])

  const byDay = useMemo(() => {
    const out = new Map<string, Item[]>()
    for (const it of items) {
      const day = new Date(it.starts_at).toDateString()
      out.set(day, [...(out.get(day) || []), it])
    }
    return [...out.entries()]
  }, [items])

  const add = useMutation({
    mutationFn: async () => {
      const s = new Date(start)
      if (!title.trim() || Number.isNaN(s.getTime())) throw new Error(t`Give the block a title and a start time.`)
      const e = new Date(s.getTime() + minutes * 60000)
      const { error } = await (supabase as any).from('team_calendar_items').insert({
        team_id: teamId,
        title: title.trim(),
        starts_at: s.toISOString(),
        ends_at: e.toISOString(),
        created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setTitle('')
      queryClient.invalidateQueries({ queryKey: key })
      ping()
    },
    onError: (err: any) => toast.error(err?.message || t`Could not add the block`),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('team_calendar_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      ping()
    },
  })

  const exportIcs = () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KTIP//Homebase//EN', `X-WR-CALNAME:${icsText(teamName)}`]
    for (const it of items) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${it.id}@ktip`,
        `DTSTAMP:${icsTime(new Date().toISOString())}`,
        `DTSTART:${icsTime(it.starts_at)}`,
        `DTEND:${icsTime(it.ends_at)}`,
        `SUMMARY:${icsText(it.title)}`,
        'END:VEVENT'
      )
    }
    lines.push('END:VCALENDAR')
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${teamName.replace(/[^\w-]+/g, '-').toLowerCase()}-calendar.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  const time = (iso: string) => i18n.date(iso, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <label className="min-w-[12rem] flex-1 text-xs font-medium text-ktip-sand-700">
          <Trans>Team block</Trans>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t`e.g. Mentor call with Priya`}
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-ktip-sand-700">
          <Trans>Starts</Trans>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-ktip-sand-700">
          <Trans>Length</Trans>
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mt-1 block rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
          >
            {[15, 30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? t`${m} min` : t`${m / 60} h`}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" icon={<CalendarPlus size={14} aria-hidden="true" />} loading={add.isPending}>
          <Trans>Add</Trans>
        </Button>
        <Button type="button" size="sm" variant="outline" icon={<Download size={14} aria-hidden="true" />} onClick={exportIcs}>
          <Trans>Add to my calendar</Trans>
        </Button>
      </form>

      {byDay.length === 0 ? (
        <p className="rounded-xl border border-ktip-sand-200 p-4 text-center text-sm text-ktip-sand-500">
          <Trans>Nothing scheduled yet.</Trans>
        </p>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, list]) => (
            <section key={day}>
              <h4 className="mb-1.5 font-display text-sm font-bold text-ktip-sand-800">
                {i18n.date(list[0].starts_at, { weekday: 'long', day: 'numeric', month: 'short' })}
              </h4>
              <ul className="space-y-1">
                {list.map((it) => (
                  <li
                    key={it.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      it.kind === 'event' ? 'bg-ktip-ocean-50 text-ktip-ocean-900' : 'border-l-4 border-ktip-tropical-600 bg-white text-ktip-sand-900'
                    }`}
                  >
                    <span className="w-24 shrink-0 font-mono text-xs">
                      {time(it.starts_at)}–{time(it.ends_at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{it.title}</span>
                    <span className="shrink-0 text-xs opacity-70">{it.kind === 'event' ? t`Event` : t`Team`}</span>
                    {it.kind === 'team' && (
                      <button
                        type="button"
                        aria-label={t`Remove ${it.title}`}
                        onClick={() => remove.mutate(it.id)}
                        className="rounded p-1 text-ktip-sand-400 hover:text-red-600"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
