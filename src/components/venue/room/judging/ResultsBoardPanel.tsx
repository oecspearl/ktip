import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { BarChart3, Eye, EyeOff, Heart } from 'lucide-react'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'
import { ConfirmModal } from '../../../admin/ConfirmModal'
import {
  useEventResults,
  usePeoplesChoice,
  usePublishResults,
  type JudgingResults,
} from '../../../../hooks/useJudging'
import { formatScore, formatZ, judgeTotals, type JudgeTotal } from '../../../../lib/judging-math'
import type { Event } from '../../../../types'

/**
 * The organisers' view of judging (migration 192).
 *
 * The ranking comes from the database, the same numbers participants see once
 * published. The per-judge breakdown underneath is worked out here from the
 * raw scores with judging-math.ts, which applies the same rules, so an
 * organiser can see why an entry sits where it does: which judges scored it,
 * what each gave, and how that compares with the judge's own average.
 */
export function ResultsBoardPanel({ event }: { event: Event }) {
  const { t } = useLingui()
  const toast = useToast()
  const { results, loading } = useEventResults(event.id)
  const { ballot } = usePeoplesChoice(event.id)
  const publish = usePublishResults(event.id)
  const [confirming, setConfirming] = useState<null | 'publish' | 'hide'>(null)
  const [open, setOpen] = useState<string | null>(null)

  const totals = useMemo<JudgeTotal[]>(() => {
    if (!results?.is_host) return []
    return judgeTotals(
      results.criteria.map((c) => ({ id: c.id, weight: c.weight })),
      results.scores.map((s) => ({
        judgeId: s.judge_id,
        entryId: s.solution_id,
        criterionId: s.criterion_id,
        score: s.score,
      }))
    )
  }, [results])

  if (loading) return <div className="h-64 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
  if (!results) {
    return (
      <Shell>
        <p className="text-sm text-ktip-sand-600">
          <Trans>Results are not available for this event yet.</Trans>
        </p>
      </Shell>
    )
  }
  if (!results.visible || !results.is_host) return null

  const published = results.published_at
  const judgeName = (id: string) => results.judges.find((j) => j.id === id)?.name || t`A judge`

  const doPublish = (on: boolean) =>
    publish.mutate(on, {
      onSuccess: () => {
        toast.success(on ? t`Results published` : t`Results hidden again`)
        setConfirming(null)
      },
      onError: (err: any) => toast.error(err?.message || t`Could not change the results.`),
    })

  const publishedAt = published ? format(new Date(published), 'd MMM, HH:mm') : ''

  return (
    <Shell
      action={
        published ? (
          <Button variant="outline" size="sm" icon={<EyeOff size={14} aria-hidden="true" />} onClick={() => setConfirming('hide')}>
            <Trans>Hide results</Trans>
          </Button>
        ) : (
          <Button size="sm" icon={<Eye size={14} aria-hidden="true" />} onClick={() => setConfirming('publish')}>
            <Trans>Publish results</Trans>
          </Button>
        )
      }
    >
      <p className="text-sm text-ktip-sand-600">
        {published ? (
          <Trans>Published {publishedAt}. Everyone in the venue can see the ranking.</Trans>
        ) : (
          <Trans>Only organisers can see this until you publish.</Trans>
        )}
      </p>

      <Ranking results={results} totals={totals} open={open} onToggle={(id) => setOpen((o) => (o === id ? null : id))} judgeName={judgeName} />

      <Judges results={results} totals={totals} />

      {ballot?.entries?.length ? (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
            <Heart size={14} aria-hidden="true" />
            <Trans>People's Choice</Trans>
            <span className="font-normal normal-case tracking-normal text-ktip-sand-500">
              {plural(ballot.total_votes ?? 0, { one: '# vote', other: '# votes' })}
            </span>
          </h4>
          <ol className="flex flex-col gap-1 text-sm">
            {[...ballot.entries]
              .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
              .slice(0, 5)
              .map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {e.title}
                    {e.team_name && <span className="text-ktip-sand-500"> · {e.team_name}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{e.votes ?? 0}</span>
                </li>
              ))}
          </ol>
        </div>
      ) : null}

      <ConfirmModal
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => doPublish(confirming === 'publish')}
        loading={publish.isPending}
        title={confirming === 'publish' ? t`Publish the results?` : t`Hide the results?`}
        message={
          confirming === 'publish'
            ? t`Everyone in the venue will see the ranking and the People's Choice count. While results are out, nothing can be edited or voted on.`
            : t`Participants will stop seeing the ranking. Judges can change scores again.`
        }
        confirmLabel={confirming === 'publish' ? t`Publish` : t`Hide`}
      />
    </Shell>
  )
}

function Shell({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { t } = useLingui()
  return (
    <section
      className="flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-ktip-sand-200 bg-white p-4"
      aria-label={t`Results board`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-xl font-bold text-ktip-sand-900">
          <BarChart3 size={18} aria-hidden="true" className="text-ktip-ocean-600" />
          <Trans>Results</Trans>
        </h3>
        {action}
      </header>
      {children}
    </section>
  )
}

function Ranking({
  results,
  totals,
  open,
  onToggle,
  judgeName,
}: {
  results: JudgingResults
  totals: JudgeTotal[]
  open: string | null
  onToggle: (id: string) => void
  judgeName: (id: string) => string
}) {
  const { t } = useLingui()

  if (!results.ranking.length) {
    return (
      <p className="text-sm text-ktip-sand-600">
        <Trans>No entries have been submitted yet.</Trans>
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[24rem] text-sm">
        <caption className="sr-only">{t`Ranking`}</caption>
        <thead>
          <tr className="border-b border-ktip-sand-200 text-left text-xs uppercase tracking-wide text-ktip-sand-500">
            <th scope="col" className="py-2 pr-2">#</th>
            <th scope="col" className="py-2 pr-2">{t`Entry`}</th>
            <th scope="col" className="py-2 pr-2 text-right">{t`Judges`}</th>
            <th scope="col" className="py-2 pr-2 text-right" title={t`Mean of each judge's weighted total, out of 10`}>
              {t`Weighted`}
            </th>
            <th
              scope="col"
              className="py-2 text-right"
              title={t`Mean z-score. Each judge's totals are measured against that judge's own average, so a harsh or generous judge counts the same as any other.`}
            >
              {t`Normalised`}
            </th>
          </tr>
        </thead>
        <tbody>
          {results.ranking.map((row) => {
            const isOpen = open === row.solution_id
            const mine = totals.filter((x) => x.entryId === row.solution_id)
            const comments = results.comments.filter((c) => c.solution_id === row.solution_id)
            return (
              <Fragment key={row.solution_id}>
                <tr className="border-b border-ktip-sand-100">
                  <td className="py-2 pr-2 font-display font-bold text-ktip-sand-900">{row.place ?? '–'}</td>
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => onToggle(row.solution_id)}
                      aria-expanded={isOpen}
                      className="text-left font-semibold text-ktip-sand-900 hover:text-ktip-ocean-700"
                    >
                      {row.title}
                    </button>
                    {row.team_name && <span className="block text-xs text-ktip-sand-500">{row.team_name}</span>}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{row.judges}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatScore(row.weighted)}</td>
                  <td className="py-2 text-right tabular-nums">{formatZ(row.normalised)}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-ktip-sand-100 bg-ktip-sand-50">
                    <td />
                    <td colSpan={4} className="py-2 pr-2">
                      {mine.length === 0 && comments.length === 0 ? (
                        <p className="text-xs text-ktip-sand-500">
                          <Trans>No judge has finished scoring this entry.</Trans>
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1.5 text-xs">
                          {mine.map((x) => (
                            <li key={x.judgeId} className="flex flex-wrap gap-x-3">
                              <span className="font-semibold text-ktip-sand-800">{judgeName(x.judgeId)}</span>
                              <span className="tabular-nums">{formatScore(x.total)}</span>
                              <span className="tabular-nums text-ktip-sand-500">z {formatZ(x.z)}</span>
                            </li>
                          ))}
                          {comments.map((c) => (
                            <li key={`c-${c.judge_id}`} className="text-ktip-sand-700">
                              <span className="font-semibold">{judgeName(c.judge_id)}:</span> {c.comment}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Judges({ results, totals }: { results: JudgingResults; totals: JudgeTotal[] }) {
  const { t } = useLingui()
  if (!results.judges.length) {
    return (
      <p className="text-sm text-ktip-sand-600">
        <Trans>No judges yet. Give people the judge role from the venue roster.</Trans>
      </p>
    )
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
        <Trans>Judges</Trans>
      </h4>
      <ul className="flex flex-col gap-1.5 text-sm">
        {results.judges.map((j) => {
          const own = totals.filter((x) => x.judgeId === j.id)
          const conflicts = results.conflicts.filter((c) => c.judge_id === j.id).length
          const average = own.length ? own.reduce((a, b) => a + b.total, 0) / own.length : null
          const name = j.name || t`A judge`
          const scored = own.length
          return (
            <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold text-ktip-sand-900">{name}</span>
              <span className="text-xs text-ktip-sand-600">
                {!j.declared_at ? (
                  <Trans>Has not declared conflicts</Trans>
                ) : (
                  <>
                    {plural(scored, { one: '# entry scored', other: '# entries scored' })}
                    {conflicts > 0 && (
                      <>
                        {' · '}
                        {plural(conflicts, { one: '# conflict', other: '# conflicts' })}
                      </>
                    )}
                    {average !== null && (
                      <>
                        {' · '}
                        <Trans>gives {formatScore(average)} on average</Trans>
                      </>
                    )}
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
