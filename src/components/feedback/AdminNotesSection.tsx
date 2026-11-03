import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { CornerDownRight, Inbox, Send } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useMarkAdminNotesRead, useMyAdminNotes, useSendAdminNote } from '../../hooks/useAdminNotes'
import { unreadIdsFor, type AdminNoteThread } from '../../lib/admin-note-threads'
import { formatDate } from '../../lib/utils'
import type { AdminNote } from '../../types'

const textareaClass =
  'w-full px-3 py-2.5 border border-ktip-sand-200 bg-ktip-cream rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

/**
 * "Notes from KTIP": threads an administrator started about something this
 * member (or an organisation they run) posted, with a reply box on each.
 *
 * Renders nothing when there are no notes, and nothing when they could not be
 * read: until migration 182 is applied the RPC does not exist, and the
 * feedback list below must not suffer for it.
 */
export function AdminNotesSection() {
  const auth = useAuth()
  const { threads, error } = useMyAdminNotes(auth.user?.id)
  const { markRead } = useMarkAdminNotesRead()

  // Seeing the section is reading it.
  const unreadIds = useMemo(() => unreadIdsFor(threads, 'member'), [threads])
  useEffect(() => {
    if (unreadIds.length) void markRead(unreadIds).catch(() => {})
  }, [unreadIds, markRead])

  if (error || threads.length === 0) return null

  return (
    <section aria-labelledby="notes-from-ktip" className="space-y-4">
      <div>
        <h2 id="notes-from-ktip" className="text-lg font-semibold text-ktip-sand-900 flex items-center gap-2">
          <Inbox size={18} className="text-ktip-ocean-600" />
          <Trans>Notes from KTIP</Trans>
        </h2>
        <p className="text-sm text-ktip-sand-500 mt-0.5">
          <Trans>Messages from the KTIP team about things you posted. You can reply to each one.</Trans>
        </p>
      </div>

      {threads.map((thread) => (
        <NoteThread key={thread.root.id} thread={thread} userId={auth.user?.id} />
      ))}
    </section>
  )
}

function NoteThread({ thread, userId }: { thread: AdminNoteThread; userId: string | undefined }) {
  const { t } = useLingui()
  const toast = useToast()
  const { send, loading } = useSendAdminNote()
  const [reply, setReply] = useState('')
  const trimmed = reply.trim()

  const author = (note: AdminNote) => {
    if (note.from_admin) return t`KTIP`
    if (note.created_by && note.created_by === userId) return t`You`
    return t`Your organisation`
  }

  const submit = async () => {
    if (!trimmed) return
    try {
      await send({ parentId: thread.root.id, body: trimmed })
      setReply('')
      toast.success(t`Reply sent`)
    } catch (err: any) {
      toast.error(err?.message || t`Could not send your reply`)
    }
  }

  const isNew = thread.unread > 0

  return (
    <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ktip-sand-900">
            {thread.root.kind === 'suspension' ? (
              <Trans>Suspended: {thread.root.subject ?? ''}</Trans>
            ) : (
              thread.root.subject || <Trans>A note from KTIP</Trans>
            )}
          </h3>
          <p className="text-xs text-ktip-sand-500 mt-0.5">{formatDate(thread.root.created_at)}</p>
        </div>
        {isNew && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200 shrink-0">
            <Trans>New</Trans>
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {thread.messages.map((note) => (
          <div
            key={note.id}
            className={
              note.from_admin
                ? 'rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 p-3'
                : 'rounded-xl border border-ktip-tropical-200 bg-ktip-tropical-50 p-3 ml-6'
            }
          >
            <p className="text-xs font-medium text-ktip-sand-700 flex items-center gap-1.5">
              {!note.from_admin && <CornerDownRight size={12} />}
              {author(note)}
              <span className="font-normal">· {formatDate(note.created_at)}</span>
            </p>
            <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap mt-1">{note.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <label htmlFor={`note-reply-${thread.root.id}`} className="sr-only">
          <Trans>Your reply</Trans>
        </label>
        <textarea
          id={`note-reply-${thread.root.id}`}
          rows={3}
          maxLength={4000}
          value={reply}
          onChange={(e) => setReply(e.currentTarget.value)}
          placeholder={t`Write a reply`}
          className={textareaClass}
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" icon={<Send size={14} />} loading={loading} disabled={!trimmed} onClick={submit}>
            <Trans>Reply</Trans>
          </Button>
        </div>
      </div>
    </div>
  )
}
