import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { useAuth } from '../../../../contexts/AuthContext'
import { useToast } from '../../../../contexts/ToastContext'
import { DiamondAvatar } from '../../../ui/DiamondAvatar'
import type { EventTeam } from '../../../../hooks/useEventTeams'

type Status = 'todo' | 'doing' | 'review' | 'done'

interface Task {
  id: string
  team_id: string
  title: string
  status: Status
  assignee_id: string | null
  position: number
  /** When it is due (214). Absent before the migration. */
  due_at?: string | null
}

const COLUMNS: Array<{ id: Status; label: MessageDescriptor }> = [
  { id: 'todo', label: msg`To do` },
  { id: 'doing', label: msg`Doing` },
  { id: 'review', label: msg`Review` },
  { id: 'done', label: msg`Done` },
]

interface Props {
  team: EventTeam
  /** Tells teammates the board changed (ydoc:team channel). */
  ping: () => void
}

/**
 * The Homebase task board (migration 190, team_tasks).
 *
 * Drag a card between columns, or use the arrow on it, which also works by
 * keyboard and on a phone. Positions are fractional: a card dropped at the end
 * of a column takes the last position plus one, so a move is one row write.
 * Teammates refetch when the team channel says the board changed.
 */
export function TeamTaskBoard({ team, ping }: Props) {
  const { t, i18n } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'team-tasks', team.id)
  const [drafts, setDrafts] = useState<Partial<Record<Status, string>>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | null>(null)

  const { data: tasks = [] } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await (supabase as any)
        .from('team_tasks')
        .select('*') // * so due_at (214) comes when it exists and nothing breaks before
        .eq('team_id', team.id)
        .order('position', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  const byCol = useMemo(() => {
    const out: Record<Status, Task[]> = { todo: [], doing: [], review: [], done: [] }
    for (const task of tasks) out[task.status]?.push(task)
    return out
  }, [tasks])

  const done = () => {
    queryClient.invalidateQueries({ queryKey: key })
    ping()
  }
  const fail = (err: any) => toast.error(err?.message || t`Could not update the board`)

  const add = useMutation({
    mutationFn: async ({ status, title }: { status: Status; title: string }) => {
      const last = byCol[status][byCol[status].length - 1]
      const { error } = await (supabase as any).from('team_tasks').insert({
        team_id: team.id,
        title,
        status,
        position: (last?.position ?? 0) + 1,
        created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: done,
    onError: fail,
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await (supabase as any).from('team_tasks').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, patch }) => {
      // Move the card at once; the refetch confirms it.
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData<Task[]>(key, (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...patch } : x)))
    },
    onSuccess: done,
    onError: (err) => {
      fail(err)
      queryClient.invalidateQueries({ queryKey: key })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('team_tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
    onError: fail,
  })

  const moveTo = (task: Task, status: Status) => {
    if (task.status === status) return
    const last = byCol[status][byCol[status].length - 1]
    update.mutate({ id: task.id, patch: { status, position: (last?.position ?? 0) + 1 } })
  }
  const nextOf = (s: Status): Status | null => {
    const i = COLUMNS.findIndex((c) => c.id === s)
    return COLUMNS[i + 1]?.id ?? null
  }
  const nameOf = (id: string | null) => team.members.find((m) => m.user_id === id)?.display_name || t`Unassigned`

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => (
        <section
          key={col.id}
          aria-label={i18n._(col.label)}
          onDragOver={(e) => {
            e.preventDefault()
            setOverCol(col.id)
          }}
          onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
          onDrop={(e) => {
            e.preventDefault()
            setOverCol(null)
            const task = tasks.find((x) => x.id === dragId)
            if (task) moveTo(task, col.id)
            setDragId(null)
          }}
          className={`flex min-h-[16rem] min-w-0 flex-col gap-2 rounded-xl bg-ktip-sand-100 p-2.5 ${
            overCol === col.id ? 'outline-dashed outline-2 outline-ktip-ocean-500' : ''
          }`}
        >
          <h4 className="flex items-center justify-between px-1 font-display text-sm font-bold text-ktip-sand-800">
            {i18n._(col.label)}
            <span className="text-xs font-medium text-ktip-sand-500">{byCol[col.id].length}</span>
          </h4>

          {byCol[col.id].map((task) => {
            const next = nextOf(task.status)
            return (
              <article
                key={task.id}
                draggable
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => setDragId(null)}
                className={`group flex cursor-grab flex-col gap-2 rounded-lg border border-ktip-sand-200 bg-white p-2.5 shadow-sm ${
                  dragId === task.id ? 'opacity-40' : ''
                }`}
              >
                <p className="text-sm font-semibold text-ktip-sand-900">{task.title}</p>
                {task.due_at && (
                  <p className="text-xs font-bold text-ktip-sand-500">
                    <Trans>Due {i18n.date(new Date(task.due_at), { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</Trans>
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label={t`Assign ${task.title}`}
                    value={task.assignee_id ?? ''}
                    onChange={(e) => update.mutate({ id: task.id, patch: { assignee_id: e.target.value || null } })}
                    className="min-w-0 flex-1 rounded-md border border-ktip-sand-200 bg-white px-1.5 py-1 text-xs text-ktip-sand-700"
                  >
                    <option value="">{t`Unassigned`}</option>
                    {team.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name || t`Teammate`}
                      </option>
                    ))}
                  </select>
                  {task.assignee_id && (
                    <DiamondAvatar
                      size={24}
                      name={nameOf(task.assignee_id)}
                      src={team.members.find((m) => m.user_id === task.assignee_id)?.avatar_url}
                    />
                  )}
                  <button
                    type="button"
                    aria-label={t`Delete ${task.title}`}
                    onClick={() => remove.mutate(task.id)}
                    className="rounded p-1 text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-red-600"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                  {next && (
                    <button
                      type="button"
                      aria-label={t`Move ${task.title} to the next column`}
                      onClick={() => moveTo(task, next)}
                      className="rounded p-1 text-ktip-sand-500 hover:bg-ktip-ocean-50 hover:text-ktip-ocean-700"
                    >
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            )
          })}

          <form
            className="mt-auto flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              const title = (drafts[col.id] || '').trim()
              if (!title) return
              add.mutate({ status: col.id, title })
              setDrafts((d) => ({ ...d, [col.id]: '' }))
            }}
          >
            <input
              value={drafts[col.id] || ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [col.id]: e.target.value }))}
              placeholder={t`Add a card`}
              aria-label={t`Add a card to ${i18n._(col.label)}`}
              maxLength={200}
              className="min-w-0 flex-1 rounded-md border border-ktip-sand-200 bg-white px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              aria-label={t`Add`}
              className="rounded-md bg-ktip-ocean-600 px-2 text-white hover:bg-ktip-ocean-700"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      ))}
      <p className="text-xs text-ktip-sand-500 sm:col-span-2 xl:col-span-4">
        <Trans>Drag cards between columns, or use the arrow. Your team sees changes as they happen.</Trans>
      </p>
    </div>
  )
}
