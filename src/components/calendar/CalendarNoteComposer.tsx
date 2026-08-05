import { useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CALENDAR_CHROME_CLASS, CALENDAR_NOTE_KINDS, CALENDAR_NOTE_KIND_LABELS } from '../../lib/constants'
import type { CalendarAccent, CalendarNoteKind } from '../../lib/constants'
import { CalendarAccentPicker } from './CalendarAccentPicker'
import { resolveCopy } from '../../i18n/copy'
import type { CalendarNoteDraft } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface CalendarNoteComposerProps {
  /** The day the composer opened on — the note lands here by default */
  date: Date
  saving?: boolean
  onCancel: () => void
  onSubmit: (draft: CalendarNoteDraft) => void | Promise<void>
}

const FIELD =
  'w-full rounded-control bg-ktip-sand-50 px-3 py-2 text-caption text-ktip-sand-900 shadow-neu-sm-inset placeholder:text-ktip-sand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500'

/**
 * The panel's second face: write a note, task or reminder onto the selected day.
 *
 * Deliberately small. This is for the things that have no event and no project
 * behind them — "call the registrar", "grant panel is Thursday" — so asking for
 * anything past a title, a time and a colour would be asking for a project.
 */
export function CalendarNoteComposer({
  date,
  saving,
  onCancel,
  onSubmit,
}: CalendarNoteComposerProps) {
  const { t, i18n } = useLingui()
  const [kind, setKind] = useState<CalendarNoteKind>('note')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [time, setTime] = useState('09:00')
  const [accent, setAccent] = useState<CalendarAccent>('sand')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setError(t`Give it a title first.`)
      return
    }
    setError('')
    // Local wall clock, like every other date the calendar reads
    const startsAt = allDay
      ? new Date(`${format(date, 'yyyy-MM-dd')}T00:00:00`)
      : new Date(`${format(date, 'yyyy-MM-dd')}T${time}:00`)

    await onSubmit({
      kind,
      title: trimmed,
      body: body.trim() || null,
      starts_at: startsAt.toISOString(),
      all_day: allDay,
      accent_color: accent,
    })
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-ktip-sand-200 p-4">
        <div className="min-w-0">
          <p className={cn(CALENDAR_CHROME_CLASS, 'text-ktip-sand-500')}>
            {format(date, 'EEEE, MMMM d')}
          </p>
          <h3 className="mt-1 animate-none font-display text-title-sm font-bold tracking-tight text-ktip-sand-900">
            <Trans>Add to this day</Trans>
          </h3>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div
          role="radiogroup"
          aria-label={t`What kind`}
          className="flex items-center gap-0.5 rounded-neu-sm bg-ktip-sand-100 p-0.5 shadow-neu-sm-inset"
        >
          {CALENDAR_NOTE_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => setKind(option)}
              className={cn(
                'flex-1 rounded-neu-sm px-2 py-1 text-micro font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
                kind === option
                  ? 'bg-ktip-cream text-ktip-ocean-700 shadow-neu-sm'
                  : 'text-ktip-sand-600 hover:text-ktip-ocean-700'
              )}
            >
              {resolveCopy(i18n, CALENDAR_NOTE_KIND_LABELS[option])}
            </button>
          ))}
        </div>

        <div>
          <label
            htmlFor="note-title"
            className={cn(CALENDAR_CHROME_CLASS, 'mb-1 block text-ktip-sand-500')}
          >
            <Trans>Title</Trans>
          </label>
          <input
            id="note-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t`What is it?`}
            maxLength={200}
            className={FIELD}
          />
          {error && <p className="mt-1 text-caption text-red-600">{error}</p>}
        </div>

        <div>
          <p className={cn(CALENDAR_CHROME_CLASS, 'mb-1 text-ktip-sand-500')}>
            <Trans>When</Trans>
          </p>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              disabled={allDay}
              onChange={(event) => setTime(event.target.value)}
              className={cn(FIELD, 'w-auto font-mono disabled:opacity-50')}
            />
            <button
              type="button"
              onClick={() => setAllDay((on) => !on)}
              aria-pressed={allDay}
              className={cn(
                'rounded-neu-sm px-2.5 py-2 text-micro font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
                allDay
                  ? 'bg-ktip-sand-100 text-ktip-ocean-700 shadow-neu-sm-inset'
                  : 'text-ktip-sand-600 shadow-neu-sm hover:text-ktip-ocean-700'
              )}
            >
              <Trans>All day</Trans>
            </button>
          </div>
        </div>

        <div>
          <p className={cn(CALENDAR_CHROME_CLASS, 'mb-1 text-ktip-sand-500')}>
            <Trans>Colour</Trans>
          </p>
          <CalendarAccentPicker value={accent} onChange={(next) => setAccent(next ?? 'sand')} />
        </div>

        <div>
          <label
            htmlFor="note-body"
            className={cn(CALENDAR_CHROME_CLASS, 'mb-1 block text-ktip-sand-500')}
          >
            <Trans>Details</Trans>
          </label>
          <textarea
            id="note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t`Anything you need to remember (optional)`}
            rows={4}
            maxLength={4000}
            className={cn(FIELD, 'resize-y leading-relaxed')}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-ktip-sand-200 p-4">
        <button
          type="submit"
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-neu-sm bg-brand-navy px-3 py-2 text-micro font-bold uppercase tracking-wider text-white shadow-neu transition-all hover:bg-brand-green hover:text-brand-navy active:translate-y-px active:shadow-neu-inset disabled:shadow-neu-flat dark:bg-brand-green dark:text-brand-navy"
        >
          {saving ? <Trans>Saving…</Trans> : <Trans>Add</Trans>}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-neu-sm px-3 py-2 text-micro font-bold uppercase tracking-wider text-ktip-sand-600 transition-all hover:text-ktip-ocean-700 hover:shadow-neu-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
        >
          <ArrowLeft size={14} />
          <Trans>Cancel</Trans>
        </button>
      </div>
    </form>
  )
}
