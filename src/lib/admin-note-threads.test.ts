import { describe, it, expect } from 'vitest'
import { groupAdminNoteThreads, isUnreadFor, unreadIdsFor } from './admin-note-threads'
import type { AdminNote } from '../types'

const note = (over: Partial<AdminNote> & Pick<AdminNote, 'id' | 'created_at'>): AdminNote => ({
  target_type: 'grant',
  target_id: 'g1',
  subject: 'Blue Economy Fund',
  recipient_user_id: 'member',
  employer_id: null,
  parent_id: null,
  kind: 'note',
  body: 'text',
  from_admin: true,
  created_by: 'admin',
  read_at: null,
  ...over,
})

describe('groupAdminNoteThreads', () => {
  const rows: AdminNote[] = [
    note({ id: 'a', created_at: '2026-11-01T10:00:00Z' }),
    note({ id: 'a2', parent_id: 'a', from_admin: false, created_by: 'member', created_at: '2026-11-01T12:00:00Z' }),
    note({ id: 'a1', parent_id: 'a', created_at: '2026-11-01T11:00:00Z', read_at: '2026-11-01T11:30:00Z' }),
    note({ id: 'b', created_at: '2026-11-02T09:00:00Z' }),
    // A reply whose root is not in the list is dropped, not shown on its own.
    note({ id: 'orphan', parent_id: 'gone', created_at: '2026-11-03T09:00:00Z' }),
  ]

  it('puts each reply under its root, oldest first', () => {
    const threads = groupAdminNoteThreads(rows, 'member')
    const a = threads.find((t) => t.root.id === 'a')!
    expect(a.messages.map((m) => m.id)).toEqual(['a', 'a1', 'a2'])
    expect(threads.flatMap((t) => t.messages.map((m) => m.id))).not.toContain('orphan')
  })

  it('sorts threads by their latest message, newest first', () => {
    const threads = groupAdminNoteThreads(rows, 'member')
    expect(threads.map((t) => t.root.id)).toEqual(['b', 'a'])
    expect(threads[1].lastAt).toBe('2026-11-01T12:00:00Z')
  })

  it('counts unread messages from the other side only', () => {
    const member = groupAdminNoteThreads(rows, 'member').find((t) => t.root.id === 'a')!
    const admin = groupAdminNoteThreads(rows, 'admin').find((t) => t.root.id === 'a')!
    // The member has not read root 'a'; a1 is read; a2 is their own reply.
    expect(member.unread).toBe(1)
    // The console has one unread reply.
    expect(admin.unread).toBe(1)
  })
})

describe('isUnreadFor / unreadIdsFor', () => {
  it('never counts a message that has been read', () => {
    expect(isUnreadFor(note({ id: 'x', created_at: 'z', read_at: 'y' }), 'member')).toBe(false)
  })

  it('lists the ids a reader should mark', () => {
    const threads = groupAdminNoteThreads(
      [
        note({ id: 'r', created_at: '1' }),
        note({ id: 'm', parent_id: 'r', from_admin: false, created_at: '2' }),
      ],
      'member'
    )
    expect(unreadIdsFor(threads, 'member')).toEqual(['r'])
    expect(unreadIdsFor(threads, 'admin')).toEqual(['m'])
  })
})
