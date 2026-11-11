import { useEffect, useId, useRef, useState } from 'react'
import { Pause, Play, Timer } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import { cn } from '../../../lib/utils'
import { useVenuePresenceContext } from '../../../contexts/VenuePresenceContext'
import { Button } from '../../ui/Button'

const LENGTHS = [
  { label: msg`25 min`, ms: 25 * 60 * 1000 },
  { label: msg`50 min`, ms: 50 * 60 * 1000 },
  { label: msg`90 min`, ms: 90 * 60 * 1000 },
]

const GOAL_KEY = 'ktip.room.focus.goal'

function readGoal(): string {
  try {
    return localStorage.getItem(GOAL_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * A timer for a room whose whole purpose is that nothing happens in it: a ring
 * that empties, and a line for the one thing you are finishing.
 *
 * Entirely local. No channel, no row; the only thing anyone else sees is your
 * status line, which says when you are back. A shared timer would make a quiet
 * room a coordinated activity, the opposite of what someone entering one wants.
 * It survives a tab switch because the deadline is a timestamp, not a counter
 * that ticks down; it does not survive a refresh, and does not need to. The
 * goal is kept on this device.
 */
export function FocusTimerPanel() {
  const { t, i18n } = useLingui()
  const goalId = useId()
  const [length, setLength] = useState(LENGTHS[0].ms)
  // The whole session, with any minutes added, so the ring knows what full is.
  const [span, setSpan] = useState(LENGTHS[0].ms)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [paused, setPaused] = useState<number | null>(null)
  const [goal, setGoal] = useState(readGoal)
  const [, tick] = useState(0)
  const doneRef = useRef(false)
  // Your status line says when you are back, so the room's people list shows
  // how long everyone has left. Cleared when the timer stops.
  const { presence } = useVenuePresenceContext()
  const setNote = presence.setStatusNote
  const until = endsAt !== null && paused === null ? endsAt : null
  useEffect(() => {
    if (until === null) {
      setNote(null)
      return
    }
    const time = i18n.date(new Date(until), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    setNote(t`Heads down until ${time}`)
  }, [until, setNote, t, i18n])
  useEffect(() => () => setNote(null), [setNote])

  useEffect(() => {
    if (endsAt === null || paused !== null) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [endsAt, paused])

  const left = paused ?? (endsAt === null ? length : Math.max(0, endsAt - Date.now()))
  const running = endsAt !== null && paused === null && left > 0
  const finished = endsAt !== null && left <= 0
  const started = endsAt !== null

  if (finished && !doneRef.current) doneRef.current = true

  const start = () => {
    doneRef.current = false
    if (!started) setSpan(length)
    setEndsAt(Date.now() + (paused ?? length))
    setPaused(null)
  }

  const addFive = () => {
    const extra = 5 * 60 * 1000
    if (paused !== null) setPaused(paused + extra)
    else if (endsAt !== null) setEndsAt(Math.max(endsAt, Date.now()) + extra)
    setSpan((current) => current + extra)
    doneRef.current = false
  }

  const reset = () => {
    setEndsAt(null)
    setPaused(null)
    doneRef.current = false
  }

  const saveGoal = (value: string) => {
    setGoal(value)
    try {
      localStorage.setItem(GOAL_KEY, value)
    } catch {
      // Blocked storage: the goal lasts for this visit.
    }
  }

  // How much of the session is still ahead, as the ring's filled share.
  const full = started ? span : length
  const share = finished ? 0 : Math.max(0, Math.min(100, (left / full) * 100))
  const totalMinutes = Math.round(full / 60_000)

  return (
    <section className="overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card" aria-label={t`Focus timer`}>
      <header className="flex items-center gap-3 border-b border-ktip-sand-100 px-4 py-3">
        <Timer size={20} className="shrink-0 text-ktip-sand-600" aria-hidden="true" />
        <h2 className="text-sm font-extrabold text-ktip-sand-900">
          <Trans>Focus timer</Trans>
        </h2>
      </header>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-5 p-5">
        <div
          className="grid h-44 w-44 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--color-ktip-ocean-600) ${share}%, var(--color-ktip-sand-100) 0)`,
          }}
        >
          <div className="grid h-36 w-36 place-items-center rounded-full bg-ktip-cream text-center">
            <div>
              <b
                className={cn(
                  'block font-display text-4xl font-bold leading-none tabular-nums',
                  finished ? 'text-ktip-tropical-700' : 'text-ktip-sand-900'
                )}
                role="timer"
                aria-live="off"
              >
                {clock(left)}
              </b>
              <span className="mt-1 block text-xs text-ktip-sand-500">
                {finished ? <Trans>Done. Take a break.</Trans> : <Trans>Left of {totalMinutes}</Trans>}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={goalId} className="text-xs font-bold text-ktip-sand-700">
              <Trans>What you are finishing</Trans>
            </label>
            <input
              id={goalId}
              value={goal}
              onChange={(e) => saveGoal(e.target.value)}
              maxLength={120}
              autoComplete="off"
              placeholder={t`One thing, small enough to finish`}
              className="w-full rounded-control border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm pointer-coarse:text-body text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-200"
            />
          </div>

          {!started && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t`How long`}>
              {LENGTHS.map((option) => (
                <button
                  key={option.ms}
                  type="button"
                  onClick={() => setLength(option.ms)}
                  aria-pressed={length === option.ms}
                  className={cn(
                    'min-h-8 rounded-control border px-2.5 text-xs font-bold transition-colors',
                    length === option.ms
                      ? 'border-ktip-ocean-300 bg-ktip-ocean-50 text-ktip-ocean-700'
                      : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-sand-300'
                  )}
                >
                  {i18n._(option.label)}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button size="sm" icon={<Pause size={14} aria-hidden="true" />} onClick={() => setPaused(Math.max(0, (endsAt as number) - Date.now()))}>
                <Trans>Pause</Trans>
              </Button>
            ) : finished ? null : (
              <Button size="sm" icon={<Play size={14} aria-hidden="true" />} onClick={start}>
                {paused !== null ? t`Resume` : t`Start`}
              </Button>
            )}
            {started && (
              <Button size="sm" variant="secondary" onClick={addFive}>
                <Trans>Add 5 minutes</Trans>
              </Button>
            )}
            {started && (
              <Button size="sm" variant="ghost" onClick={reset}>
                {finished ? <Trans>Reset</Trans> : <Trans>End early</Trans>}
              </Button>
            )}
          </div>

          <p className="text-xs text-ktip-sand-500">
            <Trans>Your status shows Heads down until the timer ends. Teammates can still reach you from your Homebase.</Trans>
          </p>
        </div>
      </div>
    </section>
  )
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
