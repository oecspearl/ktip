import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import {
  drainLocalNotes,
  makeGroup,
  makeNote,
  MAX_NOTES,
  readLocalGroups,
  readLocalNotes,
  writeLocalGroups,
  writeLocalNotes,
  type StickyGroupRecord,
  type StickyNoteRecord,
} from '../lib/sticky-notes'

export type StickyNotePatch = Partial<Omit<StickyNoteRecord, 'id' | 'created_at'>>
export type StickyGroupPatch = Partial<Omit<StickyGroupRecord, 'id' | 'created_at'>>

/** Trailing delay for keystrokes. Long enough that a sentence is one write,
 *  short enough that closing the tab mid-thought rarely loses anything. */
const TYPING_DEBOUNCE_MS = 700

const DOMAIN = 'sticky_notes'

const NOTE_COLUMNS =
  'id, title, content, color, pinned, page_path, x, y, width, height, minimized, group_id, created_at'
const GROUP_COLUMNS = 'id, title, color, pinned, page_path, x, y, minimized, created_at'

interface StickyState {
  notes: StickyNoteRecord[]
  groups: StickyGroupRecord[]
}

function rowToNote(row: any): StickyNoteRecord {
  return {
    id: row.id,
    title: row.title ?? '',
    content: row.content ?? '',
    color: row.color,
    pinned: !!row.pinned,
    page_path: row.page_path ?? null,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    minimized: !!row.minimized,
    group_id: row.group_id ?? null,
    created_at: row.created_at,
  }
}

function rowToGroup(row: any): StickyGroupRecord {
  return {
    id: row.id,
    title: row.title ?? '',
    color: row.color,
    pinned: !!row.pinned,
    page_path: row.page_path ?? null,
    x: Number(row.x),
    y: Number(row.y),
    minimized: !!row.minimized,
    created_at: row.created_at,
  }
}

/** What actually goes over the wire. `id` and `created_at` are the server's to
 *  decide, and sending them back on an update is how a row gets its own id
 *  written over itself. */
function notePayload(patch: StickyNotePatch) {
  const { ...rest } = patch
  return rest
}

/**
 * Sticky notes and their folders for the signed-in member, or localStorage for
 * everyone else.
 *
 * Both branches present the same two lists and the same actions, so no
 * component asks who is looking. Signing in merges whatever was written while
 * signed out — the alternative is notes vanishing at the moment someone logs
 * in, which reads as data loss.
 *
 * Every mutation writes the cache first and the server second: notes are
 * dragged, resized and typed continuously, and a round trip per pointer event
 * would leave the note lagging behind the cursor.
 */
export function useStickyNotes() {
  const auth = useAuth()
  const userId = auth.user?.id
  const queryClient = useQueryClient()
  const queryKey = keys.list(DOMAIN, userId ?? 'local')
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((id) => window.clearTimeout(id))
      pending.clear()
    }
  }, [])

  const fetchState = async (): Promise<StickyState> => {
    if (!userId) return { notes: readLocalNotes(), groups: readLocalGroups() }

    // Adopt anything written while signed out, exactly once. A failure here
    // puts it back in localStorage and lets the fetch continue — the member's
    // existing notes should still load.
    const pending = drainLocalNotes()
    if (pending.notes.length > 0) {
      const { error } = await syncLocalToServer(userId, pending)
      if (error) {
        writeLocalNotes(pending.notes)
        writeLocalGroups(pending.groups)
        console.error('Could not merge offline sticky notes:', error)
      }
    }

    const [notesRes, groupsRes] = await Promise.all([
      (supabase as any).from('sticky_notes').select(NOTE_COLUMNS).order('created_at', { ascending: true }),
      (supabase as any)
        .from('sticky_note_groups')
        .select(GROUP_COLUMNS)
        .order('created_at', { ascending: true }),
    ])

    if (notesRes.error) throw notesRes.error
    if (groupsRes.error) throw groupsRes.error

    return {
      notes: ((notesRes.data as any[]) || []).map(rowToNote),
      groups: ((groupsRes.data as any[]) || []).map(rowToGroup),
    }
  }

  const query = useQuery({ queryKey, queryFn: fetchState })

  /** Single writer for the cache, so the localStorage mirror can never drift
   *  from what is on screen. */
  const setState = useCallback(
    (update: (prev: StickyState) => StickyState) => {
      const prev = queryClient.getQueryData<StickyState>(queryKey) ?? { notes: [], groups: [] }
      const next = update(prev)
      queryClient.setQueryData(queryKey, next)
      if (!userId) {
        writeLocalNotes(next.notes)
        writeLocalGroups(next.groups)
      }
      return next
    },
    [queryClient, queryKey, userId]
  )

  // ----- server writes -------------------------------------------------

  const createNoteMutation = useMutation({
    mutationFn: async (note: StickyNoteRecord) => {
      const { id: _id, created_at: _created, ...fields } = note
      const { data, error } = await (supabase as any)
        .from('sticky_notes')
        .insert({ ...fields, user_id: userId })
        .select(NOTE_COLUMNS)
        .single()
      if (error) throw error
      return rowToNote(data)
    },
    onSuccess: (saved, local) => {
      // Swap the optimistic id for the real one, or later edits address a row
      // that does not exist.
      setState((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === local.id ? saved : n)),
      }))
    },
    onError: (err, local) => {
      console.error('Could not save sticky note:', err)
      setState((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== local.id) }))
    },
  })

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: StickyNotePatch }) => {
      const { error } = await (supabase as any)
        .from('sticky_notes')
        .update(notePayload(patch))
        .eq('id', id)
      if (error) throw error
    },
    onError: (err) => console.error('Could not update sticky note:', err),
  })

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('sticky_notes').delete().eq('id', id)
      if (error) throw error
    },
    onError: (err) => console.error('Could not delete sticky note:', err),
  })

  const createGroupMutation = useMutation({
    mutationFn: async ({ group, noteIds }: { group: StickyGroupRecord; noteIds: string[] }) => {
      const { id: _id, created_at: _created, ...fields } = group
      const { data, error } = await (supabase as any)
        .from('sticky_note_groups')
        .insert({ ...fields, user_id: userId })
        .select(GROUP_COLUMNS)
        .single()
      if (error) throw error

      const saved = rowToGroup(data)
      // Filing the notes is what makes the folder real — a folder with no
      // members is reaped by the trigger in 094.
      const { error: linkError } = await (supabase as any)
        .from('sticky_notes')
        .update({ group_id: saved.id })
        .in('id', noteIds)
      if (linkError) throw linkError

      return { saved, noteIds }
    },
    onSuccess: ({ saved, noteIds }, { group }) => {
      setState((prev) => ({
        groups: prev.groups.map((g) => (g.id === group.id ? saved : g)),
        notes: prev.notes.map((n) =>
          noteIds.includes(n.id) || n.group_id === group.id ? { ...n, group_id: saved.id } : n
        ),
      }))
    },
    onError: (err, { group }) => {
      console.error('Could not create folder:', err)
      setState((prev) => ({
        groups: prev.groups.filter((g) => g.id !== group.id),
        notes: prev.notes.map((n) => (n.group_id === group.id ? { ...n, group_id: null } : n)),
      }))
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: StickyGroupPatch }) => {
      const { error } = await (supabase as any).from('sticky_note_groups').update(patch).eq('id', id)
      if (error) throw error
    },
    onError: (err) => console.error('Could not update folder:', err),
  })

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('sticky_note_groups').delete().eq('id', id)
      if (error) throw error
    },
    onError: (err) => console.error('Could not delete folder:', err),
  })

  // ----- actions -------------------------------------------------------

  const createNote = useCallback(
    (seed: Partial<StickyNoteRecord> & { x: number; y: number }) => {
      const note = makeNote(seed)
      // Oldest-first eviction, matching the cap the table is sized for. The
      // evicted note is deleted server-side too, or it would reappear on the
      // next fetch and the cap would only ever be cosmetic.
      let evicted: StickyNoteRecord | undefined
      setState((prev) => {
        const notes = [...prev.notes, note]
        if (notes.length > MAX_NOTES) evicted = notes.shift()
        return { ...prev, notes }
      })
      if (userId) {
        createNoteMutation.mutate(note)
        if (evicted) deleteNoteMutation.mutate(evicted.id)
      }
      return note
    },
    [createNoteMutation, deleteNoteMutation, setState, userId]
  )

  const updateNote = useCallback(
    (id: string, patch: StickyNotePatch) => {
      setState((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }))
      if (!userId) return
      const timer = timers.current.get(id)
      if (timer) {
        // A pending keystroke write is superseded by this one, which carries
        // the same content — firing both would write the older text last.
        window.clearTimeout(timer)
        timers.current.delete(id)
      }
      updateNoteMutation.mutate({ id, patch })
    },
    [setState, updateNoteMutation, userId]
  )

  /** For keystrokes: shows instantly, saves once the typing stops. */
  const updateNoteSoon = useCallback(
    (id: string, patch: StickyNotePatch) => {
      setState((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }))
      if (!userId) return

      const existing = timers.current.get(id)
      if (existing) window.clearTimeout(existing)

      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id)
          // Read the note back rather than closing over `patch`: several
          // keystrokes collapse into one write of the latest text.
          const current = queryClient
            .getQueryData<StickyState>(queryKey)
            ?.notes.find((n) => n.id === id)
          if (current) {
            updateNoteMutation.mutate({
              id,
              patch: { title: current.title, content: current.content },
            })
          }
        }, TYPING_DEBOUNCE_MS)
      )
    },
    [queryClient, queryKey, setState, updateNoteMutation, userId]
  )

  const deleteNote = useCallback(
    (id: string) => {
      const timer = timers.current.get(id)
      if (timer) {
        window.clearTimeout(timer)
        timers.current.delete(id)
      }
      setState((prev) => {
        const notes = prev.notes.filter((n) => n.id !== id)
        return {
          notes,
          // Mirrors the 094 trigger: a folder nobody is in stops existing.
          groups: prev.groups.filter((g) => notes.some((n) => n.group_id === g.id)),
        }
      })
      if (userId) deleteNoteMutation.mutate(id)
    },
    [deleteNoteMutation, setState, userId]
  )

  const createGroup = useCallback(
    (seed: Partial<StickyGroupRecord> & { x: number; y: number }, noteIds: string[]) => {
      const group = makeGroup(seed)
      setState((prev) => ({
        groups: [...prev.groups, group],
        notes: prev.notes.map((n) => (noteIds.includes(n.id) ? { ...n, group_id: group.id } : n)),
      }))
      if (userId) createGroupMutation.mutate({ group, noteIds })
      return group
    },
    [createGroupMutation, setState, userId]
  )

  const updateGroup = useCallback(
    (id: string, patch: StickyGroupPatch) => {
      setState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      }))
      if (userId) updateGroupMutation.mutate({ id, patch })
    },
    [setState, updateGroupMutation, userId]
  )

  /** Deleting the folder alone leaves the notes; the caller decides whether
   *  they are freed or deleted with it. */
  const deleteGroup = useCallback(
    (id: string) => {
      setState((prev) => ({
        groups: prev.groups.filter((g) => g.id !== id),
        notes: prev.notes.map((n) => (n.group_id === id ? { ...n, group_id: null } : n)),
      }))
      if (userId) deleteGroupMutation.mutate(id)
    },
    [deleteGroupMutation, setState, userId]
  )

  return {
    notes: query.data?.notes ?? [],
    groups: query.data?.groups ?? [],
    loading: query.isPending,
    error: query.error,
    createNote,
    updateNote,
    updateNoteSoon,
    deleteNote,
    createGroup,
    updateGroup,
    deleteGroup,
  }
}

/** Push a signed-out session's notes and folders up in one go, keeping the
 *  folder membership: the local ids are client-side and cannot be reused, so
 *  each folder is inserted first and its new id mapped onto its members. */
async function syncLocalToServer(
  userId: string,
  local: { notes: StickyNoteRecord[]; groups: StickyGroupRecord[] }
): Promise<{ error: unknown }> {
  const idMap = new Map<string, string>()

  for (const group of local.groups) {
    const { id: _id, created_at: _created, ...fields } = group
    const { data, error } = await (supabase as any)
      .from('sticky_note_groups')
      .insert({ ...fields, user_id: userId })
      .select('id')
      .single()
    if (error) return { error }
    idMap.set(group.id, data.id)
  }

  const { error } = await (supabase as any).from('sticky_notes').insert(
    local.notes.map((note) => {
      const { id: _id, created_at: _created, group_id, ...fields } = note
      return {
        ...fields,
        group_id: group_id ? (idMap.get(group_id) ?? null) : null,
        user_id: userId,
      }
    })
  )

  return { error }
}
