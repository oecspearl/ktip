import { useState } from 'react'
import { Check, Flame, Plus, Trophy, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../ui/Button'
import { useEventTeams } from '../../../hooks/useEventTeams'
import { useMyStreak, useQuests } from '../../../hooks/useQuests'

interface Props {
  eventId: string
  isHost: boolean
}

/**
 * The Quest Board (migration 196): a team leaderboard, the side quests the
 * organisers have set, and the viewer's own streak.
 *
 * Points come from approved quests and finished milestones only. Judging is
 * separate and never feeds this board.
 */
export function QuestBoardPanel({ eventId, isHost }: Props) {
  const { t } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const { teams } = useEventTeams(eventId)
  const { quests, claims, leaderboard, loading, claim, decide, save } = useQuests(eventId)
  const { data: streak } = useMyStreak(user?.id)
  const [evidence, setEvidence] = useState<Record<string, string>>({})
  const [openClaim, setOpenClaim] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: '', description: '', points: 20 })

  const myTeam = teams.find((x) => x.members.some((m) => m.user_id === user?.id))
  const myClaim = (questId: string) => claims.find((c) => c.quest_id === questId && c.team_id === myTeam?.id)
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name ?? t`A team`
  const pending = claims.filter((c) => c.status === 'pending')
  const top = Math.max(1, ...leaderboard.map((r) => r.total))
  const fail = (err: any) => toast.error(err?.message || t`That didn't work`)

  if (loading) return <div className="h-64 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-ktip-sand-200 bg-white p-4" aria-label={t`Quest Board`}>
      {/* ---- leaderboard: after the quests on the page, first in the source ---- */}
      <div className="order-2 space-y-3 border-t border-ktip-sand-100 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ktip-sand-900">
            <Trophy size={18} aria-hidden="true" />
            <Trans>Leaderboard</Trans>
          </h3>
          {streak != null && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              <Flame size={13} aria-hidden="true" />
              {t`Your streak: ${streak} days`}
            </span>
          )}
        </div>
        <p className="text-xs text-ktip-sand-500">
          <Trans>Points for quests and finished milestones. Judging scores are separate.</Trans>
        </p>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-ktip-sand-500">
            <Trans>No teams yet.</Trans>
          </p>
        ) : (
          <ol className="space-y-1.5">
            {leaderboard.map((r, i) => (
              <li
                key={r.team_id}
                className={`grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(4rem,2fr)_3rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                  r.team_id === myTeam?.id ? 'bg-ktip-tropical-50' : ''
                }`}
              >
                <span className="font-display font-bold text-ktip-sand-500">{i + 1}</span>
                <span className="truncate font-semibold text-ktip-sand-900">{r.team_name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-ktip-sand-100">
                  <span className="block h-full rounded-full bg-ktip-tropical-600" style={{ width: `${(r.total / top) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-sm font-bold tabular-nums">{r.total}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ---- quests ---- */}
      <div className="order-1 space-y-3">
        <h3 className="font-display text-lg font-bold text-ktip-sand-900">
          <Trans>Side quests</Trans>
        </h3>
        {quests.filter((q) => q.is_active).length === 0 && (
          <p className="text-sm text-ktip-sand-500">
            <Trans>No quests yet. Organisers add them here.</Trans>
          </p>
        )}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quests
            .filter((q) => q.is_active)
            .map((q) => {
              const c = myClaim(q.id)
              return (
                <li key={q.id} className="rounded-xl border border-ktip-sand-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ktip-sand-900">{q.title}</p>
                      {q.description && <p className="text-sm text-ktip-sand-600">{q.description}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">+{q.points}</span>
                  </div>
                  <div className="mt-2">
                    {c?.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ktip-tropical-700">
                        <Check size={13} aria-hidden="true" /> <Trans>Done</Trans>
                      </span>
                    ) : c?.status === 'pending' ? (
                      <span className="text-xs font-semibold text-ktip-sand-600">
                        <Trans>Claimed. Waiting for an organiser.</Trans>
                      </span>
                    ) : !myTeam ? (
                      <span className="text-xs text-ktip-sand-500">
                        <Trans>Join a team to claim quests.</Trans>
                      </span>
                    ) : openClaim === q.id ? (
                      <form
                        className="flex flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          claim.mutate(
                            { p_quest_id: q.id, p_evidence: evidence[q.id] || null },
                            {
                              onSuccess: () => {
                                setOpenClaim(null)
                                toast.success(t`Claimed. An organiser will check it.`)
                              },
                              onError: fail,
                            }
                          )
                        }}
                      >
                        <input
                          value={evidence[q.id] || ''}
                          onChange={(e) => setEvidence((v) => ({ ...v, [q.id]: e.target.value }))}
                          placeholder={t`Link or a line of proof`}
                          maxLength={500}
                          className="min-w-[10rem] flex-1 rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
                        />
                        <Button type="submit" size="sm" loading={claim.isPending}>
                          <Trans>Send claim</Trans>
                        </Button>
                      </form>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setOpenClaim(q.id)}>
                        {c?.status === 'rejected' ? <Trans>Try again</Trans> : <Trans>Claim</Trans>}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
        </ul>

        {isHost && (
          <div className="space-y-3 rounded-xl border border-dashed border-ktip-sand-300 p-3">
            <p className="text-sm font-semibold text-ktip-sand-800">
              <Trans>Organiser</Trans>
            </p>
            {pending.length > 0 && (
              <ul className="space-y-1.5">
                {pending.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <b>{teamName(c.team_id)}</b> · {quests.find((q) => q.id === c.quest_id)?.title}
                      {c.evidence && <span className="block truncate text-xs text-ktip-sand-500">{c.evidence}</span>}
                    </span>
                    <button
                      type="button"
                      aria-label={t`Approve`}
                      onClick={() => decide.mutate({ p_claim_id: c.id, p_approve: true }, { onError: fail })}
                      className="rounded-lg bg-ktip-tropical-600 p-1.5 text-white hover:bg-ktip-tropical-700"
                    >
                      <Check size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t`Reject`}
                      onClick={() => decide.mutate({ p_claim_id: c.id, p_approve: false }, { onError: fail })}
                      className="rounded-lg border border-ktip-sand-200 p-1.5 text-ktip-sand-600 hover:text-red-600"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (draft.title.trim().length < 2) return
                save.mutate(
                  {
                    p_event_id: eventId,
                    p_id: null,
                    p_title: draft.title.trim(),
                    p_description: draft.description.trim() || null,
                    p_points: draft.points,
                    p_active: true,
                  },
                  {
                    onSuccess: () => setDraft({ title: '', description: '', points: 20 }),
                    onError: fail,
                  }
                )
              }}
            >
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder={t`New quest, e.g. Help another team`}
                maxLength={120}
                className="min-w-[10rem] flex-1 rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
              />
              <input
                type="number"
                min={1}
                max={500}
                value={draft.points}
                onChange={(e) => setDraft((d) => ({ ...d, points: Number(e.target.value) || 1 }))}
                aria-label={t`Points`}
                className="w-20 rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
              />
              <Button type="submit" size="sm" icon={<Plus size={14} aria-hidden="true" />} loading={save.isPending}>
                <Trans>Add quest</Trans>
              </Button>
            </form>
          </div>
        )}
      </div>
    </section>
  )
}
