import type { AdminNote } from '../types'

/**
 * One conversation in admin_notes (migration 182): the note that started it
 * and every reply to it, oldest first.
 */
export interface AdminNoteThread {
  root: AdminNote
  /** The root followed by its replies, in the order they were written. */
  messages: AdminNote[]
  /** When the thread last moved. Threads sort on this, newest first. */
  lastAt: string
  /** Messages from the other side that this reader has not opened yet. */
  unread: number
}

/**
 * Which side of a thread is reading it.
 *
 * 'member' is the recipient (or somebody who runs their organisation) and
 * cares about what KTIP wrote. 'admin' is the console and cares about the
 * replies.
 */
export type AdminNoteSide = 'member' | 'admin'

/** True when `note` was written by the other side and has not been read. */
export function isUnreadFor(note: AdminNote, side: AdminNoteSide): boolean {
  if (note.read_at) return false
  return side === 'member' ? note.from_admin : !note.from_admin
}

/**
 * Groups flat rows into threads.
 *
 * send_admin_note() always attaches a reply to the thread's first note, so
 * one level is all there is. A reply whose root is missing from `notes` (the
 * caller filtered it out, or it was deleted) is dropped rather than shown
 * without the message it answers.
 */
export function groupAdminNoteThreads(notes: readonly AdminNote[], side: AdminNoteSide): AdminNoteThread[] {
  const roots = new Map<string, AdminNote>()
  const replies = new Map<string, AdminNote[]>()

  for (const note of notes) {
    if (note.parent_id) {
      const list = replies.get(note.parent_id) ?? []
      list.push(note)
      replies.set(note.parent_id, list)
    } else {
      roots.set(note.id, note)
    }
  }

  const byTime = (a: AdminNote, b: AdminNote) => a.created_at.localeCompare(b.created_at)

  const threads: AdminNoteThread[] = []
  for (const root of roots.values()) {
    const messages = [root, ...(replies.get(root.id) ?? []).sort(byTime)]
    const last = messages[messages.length - 1]
    threads.push({
      root,
      messages,
      lastAt: last.created_at,
      unread: messages.filter((m) => isUnreadFor(m, side)).length,
    })
  }

  return threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

/** Ids worth sending to mark_admin_notes_read() for this reader. */
export function unreadIdsFor(threads: readonly AdminNoteThread[], side: AdminNoteSide): string[] {
  return threads.flatMap((t) => t.messages.filter((m) => isUnreadFor(m, side)).map((m) => m.id))
}
