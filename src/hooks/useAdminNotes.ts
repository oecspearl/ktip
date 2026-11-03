import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { groupAdminNoteThreads, type AdminNoteThread } from '../lib/admin-note-threads'
import type { AdminNote, AdminNoteTargetType } from '../types'

/**
 * Notes between KTIP and the owner of a piece of content (migration 182).
 *
 * Every call goes through `(supabase as any)`: admin_notes and its RPCs are
 * newer than the generated Database type, as with decide_grant_application.
 *
 * Reads never throw into the page. Until 182 is applied the table does not
 * exist, and a missing section is better than a broken feedback page — so
 * the hooks return `threads: []` plus the error, and callers render nothing.
 */

const DOMAIN = 'admin-notes'

/** The caller's own threads: addressed to them, or to an organisation they run. */
export function useMyAdminNotes(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'mine', userId),
    enabled: !!userId,
    queryFn: async (): Promise<AdminNote[]> => {
      const { data, error } = await (supabase as any).rpc('my_admin_notes')
      if (error) throw error
      return (data as AdminNote[]) ?? []
    },
    retry: false,
  })

  const threads: AdminNoteThread[] = query.data ? groupAdminNoteThreads(query.data, 'member') : []

  return {
    threads,
    unread: threads.reduce((n, t) => n + t.unread, 0),
    loading: !!userId && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Every thread about one target, for the console. RLS admits the platform side. */
export function useTargetAdminNotes(targetType: AdminNoteTargetType, targetId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, `${targetType}:${targetId ?? ''}`),
    enabled: !!targetId,
    queryFn: async (): Promise<AdminNote[]> => {
      const { data, error } = await (supabase as any)
        .from('admin_notes')
        .select('*')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as AdminNote[]) ?? []
    },
    retry: false,
  })

  const threads: AdminNoteThread[] = query.data ? groupAdminNoteThreads(query.data, 'admin') : []

  return { threads, loading: !!targetId && query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * Asks the server to email a platform-side note to its recipient.
 *
 * Fire-and-forget, like the feedback reply email: the note and the bell entry
 * already exist, so a mail failure must not make a sent note look unsent. The
 * endpoint re-reads everything from the row; the browser only names it.
 */
export function emailAdminNote(noteId: string): void {
  void (async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch('/api/admin/note-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ note_id: noteId }),
    })
  })().catch(() => {})
}

export interface SendAdminNoteInput {
  /** Required for a new thread; ignored on a reply, which follows its thread. */
  targetType?: AdminNoteTargetType
  targetId?: string
  body: string
  /** Any note in the thread being answered. */
  parentId?: string
  kind?: AdminNote['kind']
}

/** Start a thread (platform side) or reply to one (either side). */
export function useSendAdminNote() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: SendAdminNoteInput): Promise<AdminNote> => {
      const { data, error } = await (supabase as any).rpc('send_admin_note', {
        p_target_type: input.targetType ?? null,
        p_target_id: input.targetId ?? null,
        p_body: input.body,
        p_parent: input.parentId ?? null,
        p_kind: input.kind ?? 'note',
      })
      if (error) throw error
      return data as AdminNote
    },
    onSuccess: (note) => {
      if (note?.from_admin) emailAdminNote(note.id)
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { send: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/** Marks notes from the other side as read. A no-op for an empty list. */
export function useMarkAdminNotesRead() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      if (!ids.length) return 0
      const { data, error } = await (supabase as any).rpc('mark_admin_notes_read', { p_ids: ids })
      if (error) throw error
      return (data as number) ?? 0
    },
    onSuccess: (count) => {
      if (count > 0) queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { markRead: mutation.mutateAsync, loading: mutation.isPending }
}
