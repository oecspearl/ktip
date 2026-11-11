import { useMessagingPanel } from '../../../contexts/MessagingPanelContext'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cable, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { supabase } from '../../../lib/supabase'
import { keys } from '../../../queries/keys'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../ui/Button'
import { useEventTeams } from '../../../hooks/useEventTeams'
import { isLive, useBridges } from '../../../hooks/useBridges'

type Col = 'offers' | 'needs' | 'data'
const COLS: Array<{ id: Col; label: MessageDescriptor; hint: MessageDescriptor }> = [
  { id: 'offers', label: msg`Offering`, hint: msg`Skills or time your team can lend` },
  { id: 'needs', label: msg`Looking for`, hint: msg`What your team is stuck on` },
  { id: 'data', label: msg`Shared data`, hint: msg`Datasets and APIs anyone can use` },
]

interface Note {
  id: string
  team_id: string | null
  author_id: string | null
  column_key: Col
  body: string
  created_at: string
}

/**
 * The Collab Commons (migration 197): a public board where teams post what
 * they can offer, what they need, and data anyone can use, plus the bridges
 * open between teams right now. The place teams find each other before they
 * knock on a Homebase door.
 */
export function CollabCommonsPanel({ eventId, isHost }: { eventId: string; isHost: boolean }) {
  const { t, i18n } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'commons', eventId)
  const { teams } = useEventTeams(eventId)
  const { bridges } = useBridges(eventId)
  const myTeam = teams.find((x) => x.members.some((m) => m.user_id === user?.id))
  const [col, setCol] = useState<Col>('offers')
  const [body, setBody] = useState('')

  const { data: notes = [] } = useQuery({
    queryKey: key,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await (supabase as any)
        .from('event_commons_notes')
        .select('id, team_id, author_id, column_key, body, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(200)
      return error ? [] : data || []
    },
  })

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('event_commons_notes').insert({
        event_id: eventId,
        team_id: myTeam?.id ?? null,
        author_id: user?.id,
        column_key: col,
        body: body.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (err: any) => toast.error(err?.message || t`Could not post`),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('event_commons_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  const { openPanel } = useMessagingPanel()
  const nameOf = (id: string | null) => (id ? teams.find((x) => x.id === id)?.name : null) ?? t`Someone`
  const live = bridges.filter((b) => isLive(b))
  // Offers and needs side by side, so a match is easy to spot. Shared data is
  // still a place to post; its column appears once somebody has.
  const shownCols = COLS.filter((c) => c.id !== 'data' || notes.some((n) => n.column_key === 'data'))

  return (
    <section className="space-y-4 rounded-2xl border border-ktip-sand-200 bg-white p-4" aria-label={t`Collab Commons`}>
      <div className={shownCols.length > 2 ? 'grid gap-3 md:grid-cols-3' : 'grid gap-3 md:grid-cols-2'}>
        {shownCols.map((c) => (
          <div key={c.id} className="flex min-h-[12rem] flex-col gap-2 rounded-xl bg-ktip-sand-100 p-2.5">
            <h4 className="px-1 font-display text-sm font-bold text-ktip-sand-800">{i18n._(c.label)}</h4>
            <p className="px-1 text-xs text-ktip-sand-500">{i18n._(c.hint)}</p>
            {notes
              .filter((n) => n.column_key === c.id)
              .map((n) => (
                <article key={n.id} className="rounded-lg bg-amber-100 p-2.5 text-sm text-ktip-sand-900 shadow-sm">
                  <p className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-ktip-sand-600">
                    {nameOf(n.team_id)}
                    {(n.author_id === user?.id || isHost) && (
                      <button
                        type="button"
                        aria-label={t`Remove note`}
                        onClick={() => remove.mutate(n.id)}
                        className="rounded p-0.5 text-ktip-sand-400 hover:text-red-600"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    )}
                  </p>
                  <span className="block break-words">{n.body}</span>
                  {n.author_id && n.author_id !== user?.id && (
                    <button
                      type="button"
                      onClick={() => openPanel({ userId: n.author_id as string })}
                      className="mt-2 inline-flex h-7 items-center rounded-control border border-ktip-sand-300 bg-white px-2.5 text-xs font-bold text-ktip-sand-800 hover:border-ktip-ocean-400"
                    >
                      <Trans>Reply</Trans>
                    </button>
                  )}
                </article>
              ))}
          </div>
        ))}
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim().length >= 2) post.mutate()
        }}
      >
        <select
          value={col}
          onChange={(e) => setCol(e.target.value as Col)}
          aria-label={t`Column`}
          className="rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
        >
          {COLS.map((c) => (
            <option key={c.id} value={c.id}>
              {i18n._(c.label)}
            </option>
          ))}
        </select>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={280}
          placeholder={myTeam ? t`Post as ${myTeam.name}` : t`Post a note`}
          className="min-w-[12rem] flex-1 rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
        />
        <Button type="submit" size="sm" loading={post.isPending}>
          <Trans>Post</Trans>
        </Button>
      </form>

      <div>
        <h4 className="mb-1.5 flex items-center gap-1.5 font-display text-sm font-bold text-ktip-sand-800">
          <Cable size={14} aria-hidden="true" />
          <Trans>Open bridges</Trans>
        </h4>
        {live.length === 0 ? (
          <p className="text-sm text-ktip-sand-500">
            <Trans>None right now. Knock on another team's Homebase to ask for one.</Trans>
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {live.map((b) => (
              <li key={b.id}>
                {t`${nameOf(b.from_team_id)} is visiting ${nameOf(b.to_team_id)} until ${i18n.date(b.expires_at!, { hour: '2-digit', minute: '2-digit' })}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
