import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { CornerDownRight, Send } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { useMarkAdminNotesRead, useSendAdminNote, useTargetAdminNotes } from '../../hooks/useAdminNotes'
import { unreadIdsFor } from '../../lib/admin-note-threads'
import { formatDate } from '../../lib/utils'
import type { AdminNoteTargetType } from '../../types'

interface AdminNoteModalProps {
  open: boolean
  onClose: () => void
  targetType: AdminNoteTargetType
  targetId: string | null
  /** What the target is called, for the header. */
  targetTitle: string
}

const textareaClass =
  'w-full px-3 py-2.5 border border-ktip-sand-200 bg-ktip-cream rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

/**
 * "Send feedback" from the console to whoever is behind a piece of content
 * (migration 182).
 *
 * Shows the threads already open about the target, so an administrator sees
 * what was said before writing again, and lets them start a new note or
 * answer a reply. The recipient is worked out by send_admin_note(); this
 * component never names a person.
 */
export function AdminNoteModal({ open, onClose, targetType, targetId, targetTitle }: AdminNoteModalProps) {
  const { t } = useLingui()
  const toast = useToast()
  const { threads, loading, error } = useTargetAdminNotes(targetType, open && targetId ? targetId : undefined)
  const { send, loading: sending } = useSendAdminNote()
  const { markRead } = useMarkAdminNotesRead()

  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBody('')
      setReplyTo(null)
    }
  }, [open])

  // Opening the thread is reading it.
  const unreadIds = useMemo(() => unreadIdsFor(threads, 'admin'), [threads])
  useEffect(() => {
    if (open && unreadIds.length) void markRead(unreadIds).catch(() => {})
  }, [open, unreadIds, markRead])

  const trimmed = body.trim()

  const submit = async () => {
    if (!targetId || !trimmed) return
    try {
      await send(
        replyTo
          ? { parentId: replyTo, body: trimmed }
          : { targetType, targetId, body: trimmed }
      )
      toast.success(t`Note sent`)
      setBody('')
      setReplyTo(null)
    } catch (err: any) {
      toast.error(err?.message || t`Could not send the note`)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t`Send feedback`} description={t`About ${targetTitle}`} size="lg">
      <div className="space-y-5">
        {loading ? (
          <div className="h-16 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
        ) : error ? null : threads.length === 0 ? (
          <p className="text-sm text-ktip-sand-500">
            <Trans>No notes about this yet.</Trans>
          </p>
        ) : (
          <div className="space-y-4 max-h-[40dvh] overflow-y-auto">
            {threads.map((thread) => (
              <div key={thread.root.id} className="rounded-xl border border-ktip-sand-200 p-3 space-y-2">
                {thread.messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.from_admin
                        ? 'rounded-lg bg-ktip-sand-50 p-3'
                        : 'rounded-lg bg-ktip-tropical-50 border border-ktip-tropical-200 p-3'
                    }
                  >
                    <p className="text-xs font-medium text-ktip-sand-600">
                      {message.from_admin ? <Trans>KTIP</Trans> : <Trans>Reply from the owner</Trans>}
                      <span className="font-normal"> · {formatDate(message.created_at)}</span>
                    </p>
                    <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap mt-1">{message.body}</p>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setReplyTo(thread.root.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
                >
                  <CornerDownRight size={12} />
                  <Trans>Reply in this thread</Trans>
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label htmlFor="admin-note-body" className="block text-sm font-medium text-ktip-sand-700 mb-1">
            {replyTo ? <Trans>Your reply</Trans> : <Trans>New note</Trans>}
          </label>
          <textarea
            id="admin-note-body"
            rows={5}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            placeholder={t`What should they change?`}
            className={textareaClass}
          />
          <p className="mt-1 text-xs text-ktip-sand-500">
            <Trans>They get a notification and an email, and can reply from their feedback page.</Trans>
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {replyTo && (
            <Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
              <Trans>Start a new note instead</Trans>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button size="sm" icon={<Send size={14} />} loading={sending} disabled={!trimmed} onClick={submit}>
            <Trans>Send note</Trans>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
