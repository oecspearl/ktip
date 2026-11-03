import { supabase } from './supabase'
import { emailAdminNote } from '../hooks/useAdminNotes'
import type { AdminNote, AdminNoteTargetType } from '../types'

/**
 * Tells the owner why something of theirs was suspended or restored, through
 * the notes thread 182 adds. The RPC resolves the recipient and rings the bell;
 * the email follows through api/admin/note-notify.ts.
 *
 * Never throws. A note is the explanation, not the action: the suspension has
 * already happened by the time this runs, and failing it because 182 is not
 * applied yet (or the note was refused) would report a success as an error.
 * Returns whether the note went.
 */
export async function sendAdminNote(
  targetType: AdminNoteTargetType,
  targetId: string,
  body: string,
  kind: AdminNote['kind'] = 'suspension'
): Promise<boolean> {
  const text = body.trim()
  if (!text) return false
  try {
    const { data, error } = await (supabase as any).rpc('send_admin_note', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_body: text,
      p_parent: null,
      p_kind: kind,
    })
    if (error) {
      console.warn(`[admin-notes] note to ${targetType} ${targetId} not sent:`, error.message ?? error)
      return false
    }
    const note = data as AdminNote | null
    if (note?.id && note.from_admin) emailAdminNote(note.id)
    return true
  } catch (err) {
    console.warn(`[admin-notes] note to ${targetType} ${targetId} not sent:`, err)
    return false
  }
}
