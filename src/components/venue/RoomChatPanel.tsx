import { useEffect, useRef, useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
import {
  useRealtimeRoomMessages,
  useRemoveRoomMessage,
  useSendRoomMessage,
  useVenueRoomMessages,
} from '../../hooks/useVenueRoomMessages'
import type { VenueRoom } from '../../types'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { EmojiPickerButton, insertAtCaret } from '../ui/EmojiPicker'
import { LinkedText } from '../ui/LinkedText'

interface RoomChatPanelProps {
  room: VenueRoom
  /** Spectators may read but not post. */
  canPost: boolean
  /** Hosts may remove anyone's message. */
  canModerate?: boolean
  className?: string
}

/**
 * Chat for one room.
 *
 * Room-scoped, always — there is no 1:1 shape in venue_room_messages, which is
 * how student participation stays inside the safeguarding model without a
 * policy check on every send.
 */
export function RoomChatPanel({
  room,
  canPost,
  canModerate = false,
  className,
}: RoomChatPanelProps) {
  const auth = useAuth()
  const toast = useToast()
  const { openMember } = useMemberPanel()
  const { messages, loading } = useVenueRoomMessages(room.id)
  const { sendMessage, loading: sending } = useSendRoomMessage()
  const { removeMessage } = useRemoveRoomMessage()
  useRealtimeRoomMessages(room.id)

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  // So the emoji picker can insert at the caret, not on the end of the line.
  const inputRef = useRef<HTMLInputElement>(null)

  // Stick to the bottom as messages arrive. Chat that does not is broken chat.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    try {
      await sendMessage(room.id, body)
    } catch (err: any) {
      setDraft(body)
      toast.error(err?.message || 'Could not send that message')
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border border-ktip-sand-100 bg-ktip-cream shadow-card',
        className
      )}
    >
      <div className="border-b border-ktip-sand-100 px-4 py-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
          {room.name} chat
        </h2>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {loading ? (
          <>
            <div className="h-10 rounded-xl bg-ktip-sand-100 animate-pulse-soft" />
            <div className="h-10 w-3/4 rounded-xl bg-ktip-sand-100 animate-pulse-soft" />
          </>
        ) : !messages || messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-ktip-sand-500">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => {
            const name = m.author?.display_name || 'Member'
            const mine = m.author_id === auth.user?.id

            if (m.kind === 'system') {
              return (
                <p key={m.id} className="text-center text-xs italic text-ktip-sand-500">
                  {m.body}
                </p>
              )
            }

            return (
              <div key={m.id} className="group flex items-start gap-2.5">
                <DiamondAvatar src={m.author?.avatar_url} name={name} size={28} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <button
                      type="button"
                      onClick={() => m.author_id && openMember(m.author_id)}
                      className="text-xs font-semibold text-ktip-sand-800 hover:text-ktip-ocean-600 hover:underline"
                    >
                      {name}
                    </button>
                    <span className="text-[10px] text-ktip-sand-400">
                      {formatRelativeTime(m.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-ktip-sand-700">
                    <LinkedText text={m.body} linkClassName="text-ktip-ocean-600" />
                  </p>
                </div>

                {(mine || canModerate) && (
                  <button
                    type="button"
                    onClick={() => removeMessage({ messageId: m.id, roomId: room.id })}
                    aria-label="Remove message"
                    title="Remove"
                    className="shrink-0 rounded-lg p-1 text-ktip-sand-400 opacity-0 transition-opacity hover:bg-ktip-sand-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {canPost ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="flex items-center gap-2 border-t border-ktip-sand-100 px-3 py-2.5"
        >
          <label htmlFor={`room-chat-${room.id}`} className="sr-only">
            Message {room.name}
          </label>
          <EmojiPickerButton
            className="shrink-0"
            onPick={(emoji) => setDraft((value) => insertAtCaret(inputRef.current, value, emoji))}
          />
          <input
            id={`room-chat-${room.id}`}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${room.name}…`}
            maxLength={4000}
            className="flex-1 rounded-lg border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-200"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send"
            className="rounded-lg bg-brand-navy p-2 text-white transition-colors hover:bg-brand-green hover:text-brand-navy disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <p className="border-t border-ktip-sand-100 px-4 py-3 text-xs text-ktip-sand-500">
          You are watching this room. Spectators can read chat but not post.
        </p>
      )}
    </div>
  )
}
