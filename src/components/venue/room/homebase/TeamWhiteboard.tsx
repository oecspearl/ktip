import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { useAuth } from '../../../../contexts/AuthContext'
import { TldrawWrapper } from '../../../collaboration/TldrawWrapper'

interface Props {
  teamId: string
  /** The team channel lives in the workspace panel; one channel per team per tab. */
  send: (event: string, payload: unknown) => void
  connected: boolean
  /** Gives the panel a function to call with each remote whiteboard diff. */
  onRemote: (apply: ((diff: any) => void) | null) => void
}

/** Above this, a change is saved but not broadcast (pasted images, mostly). */
const MAX_BROADCAST_CHARS = 180_000
const SAVE_AFTER_MS = 1500

/**
 * The Homebase whiteboard: tldraw, shared live with the team (migration 190).
 *
 * Sticky notes, text, arrows, shapes, images and drawing are all tldraw's own
 * tools. Sync is the simple kind that suits a team of five:
 *
 *   - every local change to the document is sent on ydoc:team:<id> as a diff
 *     (added, updated, removed records)
 *   - every remote diff is merged into the local store as a remote change, so
 *     it is not sent back out
 *   - a debounced snapshot of the document goes to team_boards, which is what
 *     a teammate who opens the board later loads
 *
 * Two people moving the same sticky in the same second: the later move wins,
 * which is what anyone in the room would expect.
 */
export function TeamWhiteboard({ teamId, send, connected, onRemote }: Props) {
  const { t } = useLingui()
  const { user } = useAuth()
  const editorRef = useRef<any>(null)
  const saveTimer = useRef<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading')

  const { data: snapshot, isPending } = useQuery({
    queryKey: keys.sub('venue', 'team-board', teamId),
    // Loaded once per visit. After that the channel keeps it current; a
    // refetch mid-session would replace the editor's state under the user.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('team_boards')
        .select('snapshot')
        .eq('team_id', teamId)
        .maybeSingle()
      if (error) throw error
      const snap = data?.snapshot
      return snap && Object.keys(snap).length ? snap : null
    },
  })

  useEffect(() => {
    onRemote((diff: any) => {
      const editor = editorRef.current
      if (!editor || !diff) return
      editor.store.mergeRemoteChanges(() => {
        const put = [...Object.values(diff.added || {}), ...Object.values(diff.updated || {})]
        if (put.length) editor.store.put(put)
        const removed = Object.keys(diff.removed || {}).filter((id) => editor.store.has(id))
        if (removed.length) editor.store.remove(removed)
      })
    })
    return () => onRemote(null)
  }, [onRemote])
  const sendRef = useRef(send)
  sendRef.current = send

  const save = async () => {
    const editor = editorRef.current
    if (!editor) return
    setStatus('saving')
    const snap = editor.store.getStoreSnapshot('document')
    const { error } = await (supabase as any)
      .from('team_boards')
      .upsert({ team_id: teamId, snapshot: snap, updated_by: user?.id, updated_at: new Date().toISOString() })
    setStatus(error ? 'error' : 'saved')
  }
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(
    () => () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
        // Leaving with unsaved edits: save now rather than drop them.
        saveRef.current()
      }
    },
    []
  )

  const onEditorReady = (editor: any) => {
    editorRef.current = editor
    setStatus('ready')
    editor.store.listen(
      (entry: any) => {
        const { added, updated, removed } = entry.changes
        // updated is { id: [before, after] }; send only the after.
        const diff = {
          added,
          updated: Object.fromEntries(Object.entries(updated).map(([id, pair]: any) => [id, pair[1]])),
          removed,
        }
        const body = JSON.stringify(diff)
        if (body.length <= MAX_BROADCAST_CHARS) sendRef.current('wb', diff)
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null
          saveRef.current()
        }, SAVE_AFTER_MS)
      },
      { source: 'user', scope: 'document' }
    )
  }

  if (isPending) {
    return <div className="h-[32rem] animate-pulse-soft rounded-xl bg-ktip-sand-100" />
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ktip-sand-600">
        <p>
          <Trans>Press N for a sticky note. Paste images, draw, write, add arrows. Everyone on the team sees it live.</Trans>
        </p>
        <span aria-live="polite" className={status === 'error' ? 'text-red-600' : ''}>
          {status === 'saving'
            ? t`Saving…`
            : status === 'saved'
              ? t`Saved`
              : status === 'error'
                ? t`Not saved. Check your connection.`
                : connected
                  ? t`Live with your team`
                  : t`Connecting…`}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-ktip-sand-200">
        <TldrawWrapper snapshot={snapshot ?? null} onEditorReady={onEditorReady} />
      </div>
    </div>
  )
}
