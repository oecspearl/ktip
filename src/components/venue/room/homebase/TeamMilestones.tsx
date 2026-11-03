import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { useAuth } from '../../../../contexts/AuthContext'
import { useToast } from '../../../../contexts/ToastContext'
import { useEventCriteria } from '../../../../hooks/useEventCriteria'

interface Milestone {
  id: string
  title: string
  due_at: string | null
  done_at: string | null
  position: number
}

interface Props {
  eventId: string
  teamId: string
  ping: () => void
}

/**
 * Milestones and the challenge checklist (migration 194).
 *
 * Milestones are the team's own benchmarks ("working prototype by Saturday
 * 6pm"). The checklist is the challenge's objectives and deliverables from
 * the brief, so the team can tick off what the Submission Desk will ask for
 * long before the deadline.
 */
export function TeamMilestones({ eventId, teamId, ping }: Props) {
  const { t, i18n } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const msKey = keys.sub('venue', 'team-milestones', teamId)
  const ckKey = keys.sub('venue', 'team-checklist', teamId)
  const { criteria } = useEventCriteria(eventId)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  const { data: milestones = [] } = useQuery({
    queryKey: msKey,
    queryFn: async (): Promise<Milestone[]> => {
      const { data, error } = await (supabase as any)
        .from('team_milestones')
        .select('id, title, due_at, done_at, position')
        .eq('team_id', teamId)
        .order('position')
      if (error) return []
      return data || []
    },
  })

  const { data: ticks = {} } = useQuery({
    queryKey: ckKey,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await (supabase as any).from('team_checklist').select('criterion_id, done').eq('team_id', teamId)
      if (error) return {}
      return Object.fromEntries((data || []).map((r: any) => [r.criterion_id, r.done]))
    },
  })

  const refresh = (key: readonly unknown[]) => {
    queryClient.invalidateQueries({ queryKey: key })
    ping()
  }
  const fail = (err: any) => toast.error(err?.message || t`Could not save`)

  const add = useMutation({
    mutationFn: async () => {
      const d = due ? new Date(due) : null
      const { error } = await (supabase as any).from('team_milestones').insert({
        team_id: teamId,
        title: title.trim(),
        due_at: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
        position: (milestones[milestones.length - 1]?.position ?? 0) + 1,
        created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setTitle('')
      setDue('')
      refresh(msKey)
    },
    onError: fail,
  })

  const toggle = useMutation({
    mutationFn: async (m: Milestone) => {
      const { error } = await (supabase as any)
        .from('team_milestones')
        .update({ done_at: m.done_at ? null : new Date().toISOString() })
        .eq('id', m.id)
      if (error) throw error
    },
    onSuccess: () => refresh(msKey),
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('team_milestones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => refresh(msKey),
    onError: fail,
  })

  const tick = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await (supabase as any)
        .from('team_checklist')
        .upsert({ team_id: teamId, criterion_id: id, done, updated_by: user?.id })
      if (error) throw error
    },
    onMutate: ({ id, done }) => queryClient.setQueryData(ckKey, (prev: any) => ({ ...(prev || {}), [id]: done })),
    onSuccess: () => refresh(ckKey),
    onError: (err) => {
      fail(err)
      queryClient.invalidateQueries({ queryKey: ckKey })
    },
  })

  const brief = (criteria || []).filter((c: any) => c.kind === 'objective' || c.kind === 'deliverable')
  const doneCount = brief.filter((c: any) => ticks[c.id]).length
  const msDone = milestones.filter((m) => m.done_at).length

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h4 className="font-display text-base font-bold text-ktip-sand-900">
            <Trans>Milestones</Trans>
          </h4>
          <span className="text-xs text-ktip-sand-500">
            {msDone}/{milestones.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ktip-sand-100">
          <div
            className="h-full rounded-full bg-ktip-tropical-600 transition-all"
            style={{ width: `${milestones.length ? (msDone / milestones.length) * 100 : 0}%` }}
          />
        </div>
        <ul className="space-y-1.5">
          {milestones.map((m) => {
            const late = !m.done_at && m.due_at && new Date(m.due_at).getTime() < Date.now()
            return (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border border-ktip-sand-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={!!m.done_at}
                  onChange={() => toggle.mutate(m)}
                  aria-label={t`Done: ${m.title}`}
                  className="h-4 w-4 accent-ktip-tropical-600"
                />
                <span className={`min-w-0 flex-1 truncate text-sm ${m.done_at ? 'text-ktip-sand-400 line-through' : 'text-ktip-sand-900'}`}>
                  {m.title}
                </span>
                {m.due_at && (
                  <span className={`shrink-0 text-xs ${late ? 'font-semibold text-red-600' : 'text-ktip-sand-500'}`}>
                    {i18n.date(m.due_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={t`Remove ${m.title}`}
                  onClick={() => remove.mutate(m.id)}
                  className="rounded p-1 text-ktip-sand-400 hover:text-red-600"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) add.mutate()
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t`e.g. Working prototype`}
            aria-label={t`Milestone`}
            maxLength={120}
            className="min-w-[10rem] flex-1 rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
          />
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label={t`Due`}
            className="rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
          />
          <button type="submit" aria-label={t`Add milestone`} className="rounded-lg bg-ktip-ocean-600 px-2.5 text-white hover:bg-ktip-ocean-700">
            <Plus size={16} aria-hidden="true" />
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h4 className="font-display text-base font-bold text-ktip-sand-900">
            <Trans>Challenge checklist</Trans>
          </h4>
          <span className="text-xs text-ktip-sand-500">
            {doneCount}/{brief.length}
          </span>
        </div>
        {brief.length === 0 ? (
          <p className="text-sm text-ktip-sand-500">
            <Trans>This event has no objectives or deliverables in its brief yet.</Trans>
          </p>
        ) : (
          <ul className="space-y-1.5">
            {brief.map((c: any) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-ktip-sand-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={!!ticks[c.id]}
                    onChange={(e) => tick.mutate({ id: c.id, done: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-ktip-tropical-600"
                  />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium text-ktip-sand-900">{c.title}</span>
                    <span className="ml-1.5 text-xs text-ktip-sand-500">
                      {c.kind === 'deliverable' ? t`Deliverable` : t`Objective`}
                      {c.is_required ? ` · ${t`Required`}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
