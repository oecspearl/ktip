import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { Bold, Code, Heading2, Italic, List, ListOrdered, Plus } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { useAuth } from '../../../../contexts/AuthContext'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'
import { cn } from '../../../../lib/utils'
import { fromB64, toB64 } from '../../../../lib/homebase-sync'

/** One message on the team channel, event 'doc'. */
export interface DocMessage {
  /** u: an incremental update. req: "send me your copy". state: a whole copy. */
  t: 'u' | 'req' | 'state'
  doc: string
  d?: string
}

interface Props {
  teamId: string
  send: (event: string, payload: unknown) => void
  connected: boolean
  onRemote: (apply: ((msg: DocMessage) => void) | null) => void
}

interface DocRow {
  id: string
  title: string
  updated_at: string
}

/**
 * Shared documents for a Homebase (migration 194): the pitch outline, the
 * README draft, meeting notes. Several people type at once and see each other's
 * words appear.
 *
 * The document is a Yjs CRDT bound to TipTap. Updates travel on the team's
 * channel; a newcomer asks the others for their copy, and Yjs merges whatever
 * comes back, so nobody's edits are lost to a race. The latest merged state is
 * saved to team_docs for whoever opens the doc when nobody else is online.
 */
export function TeamDocs({ teamId, send, connected, onRemote }: Props) {
  const { t } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const listKey = keys.sub('venue', 'team-docs', teamId)
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: docs = [], isPending } = useQuery({
    queryKey: listKey,
    queryFn: async (): Promise<DocRow[]> => {
      const { data, error } = await (supabase as any)
        .from('team_docs')
        .select('id, title, updated_at')
        .eq('team_id', teamId)
        .order('updated_at', { ascending: false })
      if (error) return []
      return data || []
    },
  })

  useEffect(() => {
    if (!openId && docs.length) setOpenId(docs[0].id)
  }, [docs, openId])

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any)
        .from('team_docs')
        .insert({ team_id: teamId, title: t`Untitled`, created_by: user?.id, updated_by: user?.id })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: listKey })
      setOpenId(id)
      send('docs', {})
    },
    onError: (err: any) => toast.error(err?.message || t`Could not create the doc`),
  })

  if (isPending) return <div className="h-80 animate-pulse-soft rounded-xl bg-ktip-sand-100" />

  return (
    <div className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label={t`Team docs`} className="flex flex-col gap-1">
        {docs.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setOpenId(d.id)}
            aria-current={openId === d.id}
            className={cn(
              'truncate rounded-lg px-2.5 py-2 text-left text-sm',
              openId === d.id ? 'bg-ktip-ocean-50 font-semibold text-ktip-ocean-800' : 'text-ktip-sand-700 hover:bg-ktip-sand-50'
            )}
          >
            {d.title}
          </button>
        ))}
        <Button size="sm" variant="outline" icon={<Plus size={14} aria-hidden="true" />} loading={create.isPending} onClick={() => create.mutate()}>
          <Trans>New doc</Trans>
        </Button>
      </nav>
      <div className="min-w-0">
        {openId ? (
          <DocEditor key={openId} teamId={teamId} docId={openId} send={send} connected={connected} onRemote={onRemote} />
        ) : (
          <p className="rounded-xl border border-ktip-sand-200 p-6 text-center text-sm text-ktip-sand-500">
            <Trans>No docs yet. Start one for your pitch outline or README.</Trans>
          </p>
        )}
      </div>
    </div>
  )
}

const SAVE_AFTER_MS = 2000

function DocEditor({ teamId, docId, send, connected, onRemote }: Props & { docId: string }) {
  const { t } = useLingui()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const ydoc = useMemo(() => new Y.Doc(), [])
  const [title, setTitle] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<number | null>(null)
  const sendRef = useRef(send)
  sendRef.current = send

  // ---- load the saved copy ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any).from('team_docs').select('title, ydoc_state').eq('id', docId).maybeSingle()
      if (cancelled) return
      if (data?.ydoc_state) {
        try {
          Y.applyUpdate(ydoc, fromB64(data.ydoc_state), 'load')
        } catch {
          // A damaged save: start from what teammates send instead.
        }
      }
      setTitle(data?.title || '')
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [docId, ydoc])

  // ---- save the merged state ----
  const save = async () => {
    setStatus('saving')
    const { error } = await (supabase as any)
      .from('team_docs')
      .update({ ydoc_state: toB64(Y.encodeStateAsUpdate(ydoc)), updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq('id', docId)
    setStatus(error ? 'error' : 'saved')
  }
  const saveRef = useRef(save)
  saveRef.current = save

  // ---- local edits out, remote edits in ----
  useEffect(() => {
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'load') return
      sendRef.current('doc', { t: 'u', doc: docId, d: toB64(update) } satisfies DocMessage)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        saveRef.current()
      }, SAVE_AFTER_MS)
    }
    ydoc.on('update', onUpdate)
    onRemote((msg) => {
      if (msg.doc !== docId) return
      if ((msg.t === 'u' || msg.t === 'state') && msg.d) {
        try {
          Y.applyUpdate(ydoc, fromB64(msg.d), 'remote')
        } catch {
          // A malformed message: ignore it, the next one carries the same edits.
        }
      } else if (msg.t === 'req') {
        sendRef.current('doc', { t: 'state', doc: docId, d: toB64(Y.encodeStateAsUpdate(ydoc)) } satisfies DocMessage)
      }
    })
    return () => {
      ydoc.off('update', onUpdate)
      onRemote(null)
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
        saveRef.current()
      }
    }
  }, [docId, ydoc, onRemote])

  // Once loaded and connected, ask anyone already in this doc for their copy.
  useEffect(() => {
    if (loaded && connected) send('doc', { t: 'req', doc: docId } satisfies DocMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, connected, docId])

  useEffect(() => () => ydoc.destroy(), [ydoc])

  const editor = useEditor({
    extensions: [
      // Yjs keeps its own history; TipTap's would fight it.
      StarterKit.configure({ undoRedo: false }),
      Placeholder.configure({ placeholder: t`Start writing. Your team sees every word as you type it.` }),
      Collaboration.configure({ document: ydoc }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[22rem] px-4 py-3 focus:outline-none',
      },
    },
  })

  const rename = async (next: string) => {
    const clean = next.trim().slice(0, 120)
    if (!clean) return
    await (supabase as any).from('team_docs').update({ title: clean }).eq('id', docId)
    queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'team-docs', teamId) })
    send('docs', {})
  }

  const tool = (label: string, on: boolean, run: () => void, Icon: typeof Bold) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={run}
      className={cn('rounded p-1.5', on ? 'bg-ktip-ocean-100 text-ktip-ocean-800' : 'text-ktip-sand-600 hover:bg-ktip-sand-100')}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-ktip-sand-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-ktip-sand-100 px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => rename(e.target.value)}
          aria-label={t`Doc title`}
          maxLength={120}
          className="min-w-0 flex-1 rounded px-1 py-0.5 font-display text-lg font-bold text-ktip-sand-900 focus:bg-ktip-sand-50 focus:outline-none"
        />
        <span className="text-xs text-ktip-sand-500" aria-live="polite">
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
      {editor && (
        <div className="flex gap-0.5 border-b border-ktip-sand-100 px-2 py-1">
          {tool(t`Heading`, editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
          {tool(t`Bold`, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold)}
          {tool(t`Italic`, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic)}
          {tool(t`Bulleted list`, editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), List)}
          {tool(t`Numbered list`, editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
          {tool(t`Code block`, editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), Code)}
        </div>
      )}
      {loaded ? <EditorContent editor={editor} /> : <div className="h-[22rem] animate-pulse-soft bg-ktip-sand-50" />}
    </div>
  )
}
