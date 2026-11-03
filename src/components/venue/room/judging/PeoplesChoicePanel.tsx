import type { ReactNode } from 'react'
import { Award, ExternalLink, Heart } from 'lucide-react'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'
import { cn } from '../../../../lib/utils'
import { isHttpUrl } from '../../../../lib/submission-checklist'
import { useCastVote, useEventResults, usePeoplesChoice, type BallotEntry } from '../../../../hooks/useJudging'
import type { Event } from '../../../../types'

/**
 * People's Choice, and the results once they are out (migration 192).
 *
 * Anyone in the venue gets one vote per event, and can move it until results
 * are published. Their own team's entry is on the list but cannot be picked;
 * the database refuses that vote too. The count stays hidden from everyone but
 * the organisers until publishing, when this panel also shows the judges'
 * ranking.
 */
export function PeoplesChoicePanel({ event }: { event: Event }) {
  const { t } = useLingui()
  const toast = useToast()
  const { ballot, loading } = usePeoplesChoice(event.id)
  const { results } = useEventResults(event.id)
  const vote = useCastVote(event.id)

  if (loading) return <div className="h-48 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
  if (!ballot) {
    return (
      <Shell>
        <p className="text-sm text-ktip-sand-600">
          <Trans>People's Choice is not set up for this event yet.</Trans>
        </p>
      </Shell>
    )
  }
  if (!ballot.allowed) return null

  const published = !!ballot.results_published_at
  const ranking = published && results?.visible ? results.ranking.filter((r) => r.place !== null).slice(0, 3) : []

  const onVote = (entry: BallotEntry) =>
    vote.mutate(entry.id, {
      onSuccess: () => toast.success(t`Vote saved. You can change it until results are out.`),
      onError: (err: any) => toast.error(err?.message || t`Could not save your vote.`),
    })

  const byVotes = [...ballot.entries].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
  const showTally = ballot.total_votes !== null

  return (
    <Shell>
      {ranking.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
            <Award size={14} aria-hidden="true" />
            <Trans>Judges' ranking</Trans>
          </h4>
          <ol className="flex flex-col gap-1.5">
            {ranking.map((r) => (
              <li key={r.solution_id} className="flex items-baseline gap-3">
                <span className="w-6 shrink-0 font-display text-lg font-bold text-ktip-ocean-700">{r.place}</span>
                <span className="min-w-0">
                  <span className="font-semibold text-ktip-sand-900">{r.title}</span>
                  {r.team_name && <span className="text-sm text-ktip-sand-500"> · {r.team_name}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!ballot.entries.length ? (
        <p className="text-sm text-ktip-sand-600">
          {ballot.open ? (
            <Trans>No entries were submitted.</Trans>
          ) : (
            <Trans>Voting opens when entries close. Every submitted entry will be listed here.</Trans>
          )}
        </p>
      ) : (
        <div>
          <p className="mb-2 text-sm text-ktip-sand-600">
            {published ? (
              <Trans>Voting has closed. Here is how the room voted.</Trans>
            ) : ballot.open ? (
              <Trans>Pick the entry you liked most. One vote each, and you can change it until results are out.</Trans>
            ) : (
              <Trans>Voting has not opened yet. Organisers see the list early.</Trans>
            )}
          </p>
          <ul className="flex flex-col gap-2">
            {(showTally ? byVotes : ballot.entries).map((entry) => {
              const mine = ballot.my_vote === entry.id
              const votes = entry.votes ?? 0
              return (
                <li
                  key={entry.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3',
                    mine ? 'border-ktip-ocean-300 bg-ktip-ocean-50' : 'border-ktip-sand-200'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ktip-sand-900">{entry.title}</p>
                    {entry.team_name && <p className="text-xs text-ktip-sand-500">{entry.team_name}</p>}
                    {entry.summary && <p className="mt-1 line-clamp-2 text-sm text-ktip-sand-700">{entry.summary}</p>}
                    {entry.demo_video_url && isHttpUrl(entry.demo_video_url) && (
                      <a
                        href={entry.demo_video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-ktip-ocean-700 hover:underline"
                      >
                        <ExternalLink size={13} aria-hidden="true" />
                        <Trans>Watch the demo</Trans>
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {showTally && (
                      <span className="text-sm font-semibold tabular-nums text-ktip-sand-800">
                        {plural(votes, { one: '# vote', other: '# votes' })}
                      </span>
                    )}
                    {ballot.open &&
                      (entry.is_mine ? (
                        <span className="text-xs text-ktip-sand-500">
                          <Trans>Your team</Trans>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant={mine ? 'primary' : 'outline'}
                          pressed={mine}
                          loading={vote.isPending && vote.variables === entry.id}
                          disabled={mine}
                          icon={<Heart size={14} aria-hidden="true" />}
                          onClick={() => onVote(entry)}
                        >
                          {mine ? <Trans>Your vote</Trans> : <Trans>Vote</Trans>}
                        </Button>
                      ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const { t } = useLingui()
  return (
    <section
      className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-ktip-sand-200 bg-white p-4"
      aria-label={t`People's Choice`}
    >
      <h3 className="flex items-center gap-2 font-display text-xl font-bold text-ktip-sand-900">
        <Heart size={18} aria-hidden="true" className="text-ktip-ocean-600" />
        <Trans>People's Choice</Trans>
      </h3>
      {children}
    </section>
  )
}
