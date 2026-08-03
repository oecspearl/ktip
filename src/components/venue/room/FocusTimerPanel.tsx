import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'

const LENGTHS = [
  { label: msg`25 min`, ms: 25 * 60 * 1000 },
  { label: msg`50 min`, ms: 50 * 60 * 1000 },
  { label: msg`90 min`, ms: 90 * 60 * 1000 },
]

/**
 * A timer for a room whose whole purpose is that nothing happens in it.
 *
 * Entirely local — no channel, no row, nobody else sees it. A shared timer
 * would make a quiet room a coordinated activity, which is the opposite of
 * what someone entering one wants. It survives a tab switch because the
 * deadline is a timestamp rather than a decrementing counter; it does not
 * survive a refresh, and does not need to.
 */
export function FocusTimerPanel() {
  const { t, i18n } = useLingui()
  const [length, setLength] = useState(LENGTHS[0].ms)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [paused, setPaused] = useState<number | null>(null)
  const [, tick] = useState(0)
  const doneRef = useRef(false)

  useEffect(() => {
    if (endsAt === null || paused !== null) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [endsAt, paused])

  const left = paused ?? (endsAt === null ? length : Math.max(0, endsAt - Date.now()))
  const running = endsAt !== null && paused === null && left > 0
  const finished = endsAt !== null && left <= 0

  if (finished && !doneRef.current) doneRef.current = true

  const start = () => {
    doneRef.current = false
    setEndsAt(Date.now() + (paused ?? length))
    setPaused(null)
  }

  const reset = () => {
    setEndsAt(null)
    setPaused(null)
    doneRef.current = false
  }

  return (
    <div className="rounded-2xl border border-ktip-sand-100 bg-ktip-cream p-6 text-center shadow-card">
      <p className="font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
        <Trans>Focus</Trans>
      </p>

      <p
        className={`mt-2 font-mono text-5xl font-bold tabular-nums ${
          finished ? 'text-ktip-tropical-600' : 'text-ktip-sand-900'
        }`}
        aria-live="polite"
      >
        {clock(left)}
      </p>
      <p className="mt-1 text-sm text-ktip-sand-500">
        {finished ? t`Done. Take a break.` : running ? t`Heads down.` : t`Nobody is speaking in here.`}
      </p>

      {endsAt === null && (
        <div className="mt-4 flex justify-center gap-1.5">
          {LENGTHS.map((option) => (
            <button
              key={option.ms}
              type="button"
              onClick={() => setLength(option.ms)}
              aria-pressed={length === option.ms}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                length === option.ms
                  ? 'border-ktip-ocean-300 bg-ktip-ocean-50 text-ktip-ocean-700'
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-sand-300'
              }`}
            >
              {i18n._(option.label)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-center gap-2">
        {running ? (
          <button
            type="button"
            onClick={() => setPaused(Math.max(0, (endsAt as number) - Date.now()))}
            className="flex items-center gap-1.5 rounded-xl border border-ktip-sand-200 px-3 py-1.5 text-sm font-semibold text-ktip-sand-700 hover:border-ktip-ocean-300"
          >
            <Pause size={14} aria-hidden="true" />
            <Trans>Pause</Trans>
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1.5 rounded-xl border border-ktip-ocean-300 bg-ktip-ocean-50 px-3 py-1.5 text-sm font-semibold text-ktip-ocean-700 hover:border-ktip-ocean-500"
          >
            <Play size={14} aria-hidden="true" />
            {paused !== null ? t`Resume` : t`Start`}
          </button>
        )}
        {endsAt !== null && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 rounded-xl border border-ktip-sand-200 px-3 py-1.5 text-sm font-semibold text-ktip-sand-600 hover:border-ktip-sand-300"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <Trans>Reset</Trans>
          </button>
        )}
      </div>
    </div>
  )
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
