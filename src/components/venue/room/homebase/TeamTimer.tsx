import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { secondsLeft, type TimerState } from '../../../../lib/homebase-sync'

export type { TimerState }

const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

interface Props {
  teamId: string
  send: (event: string, payload: unknown) => void
  /** Latest timer pushed by a teammate, if any. */
  remote: TimerState | null
}

/**
 * The team's shared focus timer (migration 194, team_state).
 *
 * Anyone on the team starts, pauses or resets it, and it runs the same on
 * every screen: the state is a start time plus seconds left, so each browser
 * counts down from the same clock rather than from a ticking message.
 */
export function TeamTimer({ teamId, send, remote }: Props) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'team-timer', teamId)
  const [now, setNow] = useState(Date.now())

  const { data: stored } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TimerState> => {
      const { data, error } = await (supabase as any).from('team_state').select('timer').eq('team_id', teamId).maybeSingle()
      if (error) return {}
      return data?.timer || {}
    },
  })

  useEffect(() => {
    if (remote) queryClient.setQueryData(key, remote)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote])

  const state: TimerState = stored || {}
  const running = !!state.started_at
  const left = secondsLeft(state, now)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const set = async (next: TimerState) => {
    queryClient.setQueryData(key, next)
    send('timer', next)
    await (supabase as any).from('team_state').upsert({ team_id: teamId, timer: next, updated_at: new Date().toISOString() })
  }

  const duration = state.duration_s || 25 * 60
  const start = () => set({ ...state, duration_s: duration, left_s: left > 0 ? left : duration, started_at: new Date().toISOString() })
  const pause = () => set({ ...state, left_s: left, started_at: null })
  const reset = (mins?: number) => {
    const d = mins ? mins * 60 : duration
    set({ ...state, duration_s: d, left_s: d, started_at: null })
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 px-2.5 py-1.5">
      <Timer size={16} className="text-ktip-sand-500" aria-hidden="true" />
      <span className={`font-mono text-lg font-bold tabular-nums ${left === 0 && state.duration_s ? 'text-red-600' : 'text-ktip-sand-900'}`} aria-live="off">
        {fmt(state.duration_s ? left : duration)}
      </span>
      {running ? (
        <button type="button" onClick={pause} aria-label={t`Pause team timer`} className="rounded p-1 hover:bg-ktip-sand-100">
          <Pause size={15} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={start} aria-label={t`Start team timer`} className="rounded p-1 hover:bg-ktip-sand-100">
          <Play size={15} aria-hidden="true" />
        </button>
      )}
      <button type="button" onClick={() => reset()} aria-label={t`Reset team timer`} className="rounded p-1 hover:bg-ktip-sand-100">
        <RotateCcw size={14} aria-hidden="true" />
      </button>
      <select
        aria-label={t`Timer length`}
        value={Math.round(duration / 60)}
        onChange={(e) => reset(Number(e.target.value))}
        className="rounded border border-ktip-sand-200 bg-white px-1 py-0.5 text-xs"
      >
        {[10, 25, 45, 60, 90].map((m) => (
          <option key={m} value={m}>
            {t`${m} min`}
          </option>
        ))}
      </select>
    </div>
  )
}
