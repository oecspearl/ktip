import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Circle, EyeOff, ExternalLink, FileText, Gavel, ShieldAlert } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'
import { Textarea } from '../../../ui/Textarea'
import { Switch } from '../../../ui/Toggle'
import { AiUseBadge } from '../../../legal/AiDeclaration'
import { cn } from '../../../../lib/utils'
import {
  useDeclareConflicts,
  useJudgingConsole,
  useSaveScores,
  type JudgeEntry,
  type JudgingConsoleState,
} from '../../../../hooks/useJudging'
import { deckFileName, openDeck } from '../../../../hooks/useSubmissions'
import {
  MAX_SCORE,
  MIN_SCORE,
  formatScore,
  isComplete,
  isValidScore,
  judgingProgress,
  weightedTotal,
  type ScoreMap,
} from '../../../../lib/judging-math'
import { formatDuration, isHttpUrl } from '../../../../lib/submission-checklist'
import { DemoThumb } from './DemoThumb'
import type { Event } from '../../../../types'

const SCORES = Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, i) => MIN_SCORE + i)

const blindKey = (eventId: string) => `ktip.judging.blind.${eventId}`

function readBlind(eventId: string): boolean {
  try {
    return window.localStorage.getItem(blindKey(eventId)) !== '0'
  } catch {
    return false
  }
}

function writeBlind(eventId: string, on: boolean) {
  try {
    window.localStorage.setItem(blindKey(eventId), on ? '1' : '0')
  } catch {
    // A preference, not data. It still applies for this visit.
  }
}

/**
 * The judge's desk (migration 192).
 *
 * Conflicts first: the queue stays closed until the judge has been through the
 * team list, even if the answer is "none". The queue never contains an entry
 * the judge declared a conflict with; the database leaves it out, and refuses
 * a score for it if one is sent anyway.
 */
export function JudgingConsolePanel({ event }: { event: Event }) {
  const { console: state, loading } = useJudgingConsole(event.id)
  const [editingConflicts, setEditingConflicts] = useState(false)

  if (loading) return <div className="h-64 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />

  if (!state) {
    return (
      <Shell>
        <p className="text-sm text-ktip-sand-600">
          <Trans>Judging is not set up for this event yet.</Trans>
        </p>
      </Shell>
    )
  }
  if (!state.allowed) return null

  if (!state.declared_at || editingConflicts) {
    return (
      <Shell>
        <ConflictForm
          eventId={event.id}
          state={state}
          onDone={() => setEditingConflicts(false)}
          onCancel={state.declared_at ? () => setEditingConflicts(false) : undefined}
        />
      </Shell>
    )
  }

  return (
    <Shell
      action={
        !state.results_published_at ? (
          <Button variant="ghost" size="sm" icon={<ShieldAlert size={14} aria-hidden="true" />} onClick={() => setEditingConflicts(true)}>
            <Trans>Conflicts</Trans>
          </Button>
        ) : null
      }
    >
      <Queue event={event} state={state} />
    </Shell>
  )
}

function Shell({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { t } = useLingui()
  return (
    <section
      className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-ktip-sand-200 bg-white p-4"
      aria-label={t`Judging console`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-xl font-bold text-ktip-sand-900">
          <Gavel size={18} aria-hidden="true" className="text-ktip-ocean-600" />
          <Trans>Judging</Trans>
        </h3>
        {action}
      </header>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// conflicts
// ---------------------------------------------------------------------------

function ConflictForm({
  eventId,
  state,
  onDone,
  onCancel,
}: {
  eventId: string
  state: JudgingConsoleState
  onDone: () => void
  onCancel?: () => void
}) {
  const { t } = useLingui()
  const toast = useToast()
  const declare = useDeclareConflicts(eventId)
  const [teams, setTeams] = useState<Set<string>>(() => new Set(state.conflicts.team_ids))
  const [solos, setSolos] = useState<Set<string>>(() => new Set(state.conflicts.solution_ids))

  const toggle = (set: Set<string>, id: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }

  const count = teams.size + solos.size
  const nothingToDeclare = !state.teams.length && !state.solo_entries.length

  const confirm = () =>
    declare.mutate(
      { teamIds: [...teams], solutionIds: [...solos] },
      {
        onSuccess: () => {
          toast.success(count ? t`Conflicts saved` : t`Thanks. No conflicts recorded.`)
          onDone()
        },
        onError: (err: any) => toast.error(err?.message || t`Could not save your conflicts.`),
      }
    )

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-semibold text-ktip-sand-900">
          <Trans>Before you score, declare any conflicts of interest</Trans>
        </p>
        <p className="mt-1 text-sm text-ktip-sand-600">
          <Trans>Tick a team if you work with, mentor, manage or are related to anyone on it. You will not see or score its entry. Scores you already gave it are removed.</Trans>
        </p>
      </div>

      {nothingToDeclare ? (
        <p className="text-sm text-ktip-sand-500">
          <Trans>No teams have formed yet.</Trans>
        </p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl border border-ktip-sand-200 p-2">
          {state.teams.map((team) => (
            <li key={team.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-ktip-sand-50">
                <input
                  type="checkbox"
                  checked={teams.has(team.id)}
                  onChange={() => toggle(teams, team.id, setTeams)}
                  className="mt-1 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ktip-sand-900">{team.name}</span>
                  <span className="block truncate text-xs text-ktip-sand-500">{team.members.join(', ')}</span>
                </span>
              </label>
            </li>
          ))}
          {state.solo_entries.map((entry) => (
            <li key={entry.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-ktip-sand-50">
                <input
                  type="checkbox"
                  checked={solos.has(entry.id)}
                  onChange={() => toggle(solos, entry.id, setSolos)}
                  className="mt-1 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ktip-sand-900">{entry.title}</span>
                  <span className="block truncate text-xs text-ktip-sand-500">
                    <Trans>Solo entry by {entry.author}</Trans>
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={confirm} loading={declare.isPending}>
          {count ? <Trans>Save conflicts</Trans> : <Trans>I have no conflicts</Trans>}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={declare.isPending}>
            <Trans>Cancel</Trans>
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// the queue
// ---------------------------------------------------------------------------

function Queue({ event, state }: { event: Event; state: JudgingConsoleState }) {
  const { t } = useLingui()
  const [blind, setBlind] = useState(() => readBlind(event.id))
  const [selectedId, setSelectedId] = useState<string | null>(state.entries[0]?.id ?? null)

  useEffect(() => {
    if (!state.entries.some((e) => e.id === selectedId)) setSelectedId(state.entries[0]?.id ?? null)
  }, [state.entries, selectedId])

  const progress = judgingProgress(
    state.criteria,
    state.entries.map((e) => ({ id: e.id, scores: e.my_scores }))
  )
  const selected = state.entries.find((e) => e.id === selectedId) ?? null
  const index = selected ? state.entries.indexOf(selected) : -1
  const scored = progress.scored
  const total = progress.total

  const nameOf = (entry: JudgeEntry, i: number) =>
    blind ? t`Entry ${i + 1}` : entry.team_name || t`Solo entry`

  if (!state.criteria.length) {
    return (
      <p className="text-sm text-ktip-sand-600">
        <Trans>The brief has no judging criteria yet. Organisers add them to the event's challenge brief.</Trans>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ktip-sand-800" aria-live="polite">
          <Trans>{scored} of {total} scored</Trans>
        </p>
        <label className="flex items-center gap-2 text-sm text-ktip-sand-700">
          <EyeOff size={14} aria-hidden="true" />
          <Trans>Blind mode</Trans>
          <Switch
            checked={blind}
            onChange={(on) => {
              setBlind(on)
              writeBlind(event.id, on)
            }}
            label={t`Hide team names`}
          />
        </label>
      </div>

      {state.results_published_at ? (
        <p className="rounded-lg bg-ktip-sand-50 px-3 py-2 text-sm text-ktip-sand-700">
          <Trans>Results are published. Scores are final.</Trans>
        </p>
      ) : !state.locked ? (
        <p className="rounded-lg bg-ktip-sun-50 px-3 py-2 text-sm text-ktip-sun-900">
          <Trans>Entries are still open, so teams may change what you see until the deadline.</Trans>
        </p>
      ) : null}

      {!state.entries.length ? (
        <p className="text-sm text-ktip-sand-600">
          <Trans>No entries to score yet. Submitted entries appear here.</Trans>
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[14rem_1fr]">
          <ol className="flex gap-1 overflow-x-auto lg:max-h-[36rem] lg:flex-col lg:overflow-y-auto" aria-label={t`Entries`}>
            {state.entries.map((entry, i) => {
              const done = isComplete(state.criteria, entry.my_scores)
              return (
                <li key={entry.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    aria-current={entry.id === selectedId ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                      entry.id === selectedId ? 'bg-ktip-ocean-50 text-ktip-sand-900' : 'hover:bg-ktip-sand-50'
                    )}
                  >
                    {done ? (
                      <CheckCircle2 size={15} className="shrink-0 text-ktip-tropical-600" aria-label={t`Scored`} />
                    ) : (
                      <Circle size={15} className="shrink-0 text-ktip-sand-300" aria-label={t`Not scored`} />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{entry.title}</span>
                      <span className="block truncate text-xs text-ktip-sand-500">{nameOf(entry, i)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          {selected && (
            <EntryScorer
              key={selected.id}
              eventId={event.id}
              entry={selected}
              teamLabel={nameOf(selected, index)}
              state={state}
              onNext={() => {
                const next = state.entries.find((e, i) => i > index && !isComplete(state.criteria, e.my_scores))
                if (next) setSelectedId(next.id)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function EntryScorer({
  eventId,
  entry,
  teamLabel,
  state,
  onNext,
}: {
  eventId: string
  entry: JudgeEntry
  teamLabel: string
  state: JudgingConsoleState
  onNext: () => void
}) {
  const { t } = useLingui()
  const toast = useToast()
  const save = useSaveScores(eventId)
  const [scores, setScores] = useState<ScoreMap>(() => ({ ...entry.my_scores }))
  const [comment, setComment] = useState(entry.my_comment ?? '')
  const readOnly = !!state.results_published_at

  const live = useMemo(() => weightedTotal(state.criteria, scores), [state.criteria, scores])
  const complete = isComplete(state.criteria, scores)
  const totalText = live === null ? formatScore(live) : (live * 10).toFixed(1)
  const weightSum = state.criteria.reduce((sum, c) => sum + Math.max(0, c.weight ?? 1), 0)

  const onSave = () => {
    const payload: Record<string, number | null> = {}
    for (const c of state.criteria) payload[c.id] = isValidScore(scores[c.id]) ? (scores[c.id] as number) : null
    save.mutate(
      { solutionId: entry.id, scores: payload, comment },
      {
        onSuccess: () => {
          toast.success(t`Scores saved`)
          if (complete) onNext()
        },
        onError: (err: any) => toast.error(err?.message || t`Could not save your scores.`),
      }
    )
  }

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-ktip-sand-200 p-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-ktip-sand-500">{teamLabel}</p>
        <h4 className="font-display text-lg font-bold text-ktip-sand-900">{entry.title}</h4>
        {entry.summary && <p className="mt-1 whitespace-pre-wrap text-sm text-ktip-sand-700">{entry.summary}</p>}
      </header>

      {entry.demo_video_url && (
        <DemoThumb
          index={0}
          href={entry.demo_video_url}
          seconds={entry.demo_video_seconds}
          title={entry.title}
          className="max-w-md rounded-surface"
        />
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {entry.repo_url && (
          <li>
            <ExtLink href={entry.repo_url}>
              <Trans>Code</Trans>
            </ExtLink>
          </li>
        )}
        {entry.demo_video_url && (
          <li>
            <ExtLink href={entry.demo_video_url}>
              {entry.demo_video_seconds ? (
                <Trans>Demo video ({formatDuration(entry.demo_video_seconds)})</Trans>
              ) : (
                <Trans>Demo video</Trans>
              )}
            </ExtLink>
          </li>
        )}
        {entry.pitch_deck_url && (
          <li>
            <ExtLink href={entry.pitch_deck_url}>
              <Trans>Pitch deck</Trans>
            </ExtLink>
          </li>
        )}
        {entry.pitch_deck_path && (
          <li>
            <button
              type="button"
              onClick={() => openDeck(entry.pitch_deck_path!).catch(() => toast.error(t`Could not open the file.`))}
              className="inline-flex items-center gap-1 font-semibold text-ktip-ocean-700 hover:underline"
            >
              <FileText size={13} aria-hidden="true" />
              {deckFileName(entry.pitch_deck_path)}
            </button>
          </li>
        )}
        {entry.link_url && (
          <li>
            <ExtLink href={entry.link_url}>
              <Trans>More</Trans>
            </ExtLink>
          </li>
        )}
      </ul>

      {(entry.ai_use === 'assisted' || entry.ai_use === 'drafted') && (
        <div className="flex flex-col gap-1">
          <AiUseBadge value={entry.ai_use} size="sm" className="self-start" />
          {entry.ai_tools && <p className="text-sm text-ktip-sand-700">{entry.ai_tools}</p>}
        </div>
      )}

      {entry.evidence.length > 0 && (
        <details className="rounded-lg bg-ktip-sand-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-ktip-sand-800">
            <Trans>Evidence against the brief</Trans>
          </summary>
          <dl className="mt-2 flex flex-col gap-2 text-sm">
            {entry.evidence.map((ev) => (
              <div key={ev.criterion_id}>
                <dt className="font-semibold text-ktip-sand-800">{ev.title}</dt>
                {ev.note && <dd className="whitespace-pre-wrap text-ktip-sand-700">{ev.note}</dd>}
                {ev.url && (
                  <dd>
                    <ExtLink href={ev.url}>{ev.url}</ExtLink>
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </details>
      )}

      <div className="flex flex-col gap-3">
        {state.criteria.map((c) => {
          const share = weightSum > 0 ? Math.round((Math.max(0, c.weight ?? 1) / weightSum) * 100) : 0
          return (
            <fieldset key={c.id} disabled={readOnly}>
              <legend className="text-sm font-semibold text-ktip-sand-900">
                {c.title}
                <span className="ml-2 text-xs font-normal text-ktip-sand-500">
                  {share}%
                </span>
              </legend>
              {c.description && <p className="text-xs text-ktip-sand-500">{c.description}</p>}
              {/* A slider, as in the design. Until it is moved the criterion
                  has no score, and the number beside it says so with a dash. */}
              <div className="mt-1.5 flex items-center gap-3">
                <output
                  htmlFor={`score-${entry.id}-${c.id}`}
                  className={cn(
                    'w-8 shrink-0 text-center font-display text-2xl font-bold tabular-nums',
                    isValidScore(scores[c.id]) ? 'text-ktip-sand-900' : 'text-ktip-sand-400'
                  )}
                >
                  {isValidScore(scores[c.id]) ? scores[c.id] : '–'}
                </output>
                <input
                  id={`score-${entry.id}-${c.id}`}
                  type="range"
                  min={SCORES[0]}
                  max={SCORES[SCORES.length - 1]}
                  step={1}
                  value={isValidScore(scores[c.id]) ? (scores[c.id] as number) : SCORES[0]}
                  aria-label={c.title}
                  aria-valuetext={isValidScore(scores[c.id]) ? String(scores[c.id]) : t`Not scored`}
                  onChange={(e) => setScores((s) => ({ ...s, [c.id]: Number(e.target.value) }))}
                  // A press on an unscored slider at its resting place moves nothing,
                  // so it would not count. Take the press itself as the first score.
                  onPointerUp={(e) => {
                    const value = Number((e.target as HTMLInputElement).value)
                    setScores((s) => (isValidScore(s[c.id]) ? s : { ...s, [c.id]: value }))
                  }}
                  className={cn(
                    'h-11 min-w-0 flex-1 cursor-pointer accent-ktip-ocean-600 disabled:cursor-not-allowed',
                    !isValidScore(scores[c.id]) && 'opacity-60'
                  )}
                />
                {isValidScore(scores[c.id]) && !readOnly && (
                  <button
                    type="button"
                    onClick={() => setScores((s) => ({ ...s, [c.id]: null }))}
                    className="min-h-8 shrink-0 rounded-control px-2 text-xs font-bold text-ktip-sand-500 hover:text-ktip-sand-900"
                  >
                    <Trans>Clear</Trans>
                  </button>
                )}
              </div>
            </fieldset>
          )
        })}
      </div>

      <Textarea
        label={t`Comment for the organisers`}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        disabled={readOnly}
        fullWidth
      />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ktip-sand-100 pt-3">
        <p className="text-sm text-ktip-sand-700" aria-live="polite">
          <Trans>Weighted total</Trans>{' '}
          <span className="font-display text-xl font-bold text-ktip-sand-900">{totalText}</span>
          <span className="text-ktip-sand-500"> / 100</span>
          {!complete && live !== null && (
            <span className="ml-2 text-xs text-ktip-sand-500">
              <Trans>so far</Trans>
            </span>
          )}
        </p>
        {!readOnly && (
          <Button onClick={onSave} loading={save.isPending}>
            {complete ? <Trans>Save and next</Trans> : <Trans>Save</Trans>}
          </Button>
        )}
      </footer>
    </article>
  )
}

/**
 * Team-supplied links. 192's CHECKs keep its own columns to http(s), but
 * link_url predates them, so every href is checked here too: a javascript:
 * link in an entry must never become a click for a judge.
 */
function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  if (!isHttpUrl(href)) return <span className="break-all text-ktip-sand-700">{children}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 break-all font-semibold text-ktip-ocean-700 hover:underline"
    >
      <ExternalLink size={13} aria-hidden="true" className="shrink-0" />
      {children}
    </a>
  )
}
