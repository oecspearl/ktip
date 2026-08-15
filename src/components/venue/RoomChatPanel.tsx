import { useEffect, useRef, useState } from 'react'
import { QuarantineNotice } from '../moderation/QuarantineNotice'
import { Languages, Send, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
import { useContentLanguage } from '../../i18n/useContentLanguage'
import { LANGUAGE_NAMES } from '../../i18n/language'
import {
  useRealtimeRoomMessages,
  useRemoveRoomMessage,
  useSendRoomMessage,
  useVenueRoomMessages,
} from '../../hooks/useVenueRoomMessages'
import {
  usePrefetchTranslatedContent,
  useTranslatedContent,
  useWarmContentTranslations,
} from '../../hooks/useTranslatedContent'
import type { VenueRoom, VenueRoomMessage } from '../../types'
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
 * One message.
 *
 * A component rather than an inline `.map()` body because each row now holds
 * state of its own — whether this reader has asked to see the original — and
 * because translating needs a hook, which cannot be called in a loop.
 *
 * The original is always one click away, deliberately. Machine translation of
 * casual speech is wrong often enough that hiding what was actually typed is not
 * defensible, and it matters most in exactly the situation this feature exists
 * for: a mentor reading a student's second language.
 */
function RoomChatMessage({
  message,
  mine,
  canModerate,
  onOpenMember,
  onRemove,
}: {
  message: VenueRoomMessage
  mine: boolean
  canModerate: boolean
  onOpenMember: (userId: string) => void
  onRemove: () => void
}) {
  const { t } = useLingui()
  const [showSource, setShowSource] = useState(false)
  const { text, source, translated, pending, from } = useTranslatedContent(
    message.body,
    message.lang
  )

  const name = message.author?.display_name || t`Member`

  if (message.kind === 'system') {
    return (
      <p className="text-center text-xs italic text-ktip-sand-500">{message.body}</p>
    )
  }

  // RLS keeps a withheld message out of every other attendee's subscription,
  // so the only person who can reach this branch is its author (or a
  // moderator). Saying nothing would leave them watching a room where their
  // own message simply never appeared.
  if (message.status && message.status !== 'active') {
    return <QuarantineNotice isAuthor={mine} isModerator={!mine && canModerate} />
  }

  return (
    <div className="group flex items-start gap-2.5">
      <DiamondAvatar src={message.author?.avatar_url} name={name} size={28} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button
            type="button"
            onClick={() => message.author_id && onOpenMember(message.author_id)}
            className="text-xs font-semibold text-ktip-sand-800 hover:text-ktip-ocean-600 hover:underline"
          >
            {name}
          </button>
          <span className="text-[10px] text-ktip-sand-400">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>
        {/* aria-busy plus a slight fade while the translation is in flight —
            never a skeleton. The reader already has legible text on screen, and
            replacing it with a grey box to swap one language for another is a
            worse experience than a moment of the original. */}
        <p
          aria-busy={pending || undefined}
          className={cn(
            'whitespace-pre-wrap break-words text-sm text-ktip-sand-700 transition-opacity',
            pending && 'opacity-60'
          )}
          // So a screen reader pronounces a French message with a French voice
          // rather than reading it as mangled English.
          lang={showSource ? from : undefined}
        >
          <LinkedText
            text={showSource ? source : text}
            linkClassName="text-ktip-ocean-600"
          />
        </p>

        {translated && (
          <button
            type="button"
            onClick={() => setShowSource((value) => !value)}
            className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-ktip-sand-400 hover:text-ktip-ocean-600 hover:underline"
          >
            <Languages size={11} aria-hidden="true" />
            {showSource ? (
              <Trans>Show translation</Trans>
            ) : (
              // The endonym, not "French": it is the one label a reader who
              // cannot read the surrounding language will still recognise.
              <Trans>Translated from {LANGUAGE_NAMES[from]} · Show original</Trans>
            )}
          </button>
        )}
      </div>

      {(mine || canModerate) && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t`Remove message`}
          title={t`Remove`}
          className="shrink-0 rounded-lg p-1 text-ktip-sand-400 opacity-0 transition-opacity hover:bg-ktip-sand-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  )
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
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { openMember } = useMemberPanel()
  const { messages, loading } = useVenueRoomMessages(room.id)
  const { sendMessage, loading: sending } = useSendRoomMessage()
  const { removeMessage } = useRemoveRoomMessage()
  useRealtimeRoomMessages(room.id)
  // What this member writes IN, recorded on the row so readers know which way to
  // translate. Their own reading preference is the best available answer, and a
  // far better one than detecting it from two words of chat.
  const { lang: contentLang } = useContentLanguage()
  const warm = useWarmContentTranslations()

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  // So the emoji picker can insert at the caret, not on the end of the line.
  const inputRef = useRef<HTMLInputElement>(null)

  // Stick to the bottom as messages arrive. Chat that does not is broken chat.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // One pass over the whole thread before it paints, so a roomful of messages
  // is a single request rather than one per bubble.
  usePrefetchTranslatedContent(
    (messages ?? []).map((m) => ({ text: m.body, lang: m.lang }))
  )

  const submit = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    try {
      await sendMessage(room.id, body, { lang: contentLang })
      // The sender pays for the other languages while they are still looking at
      // their own message, so it reaches everyone else already translated.
      warm(body, contentLang)
    } catch (err: any) {
      setDraft(body)
      toast.error(err?.message || t`Could not send that message`)
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
          <Trans>{room.name} chat</Trans>
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
            <Trans>No messages yet. Say hello.</Trans>
          </p>
        ) : (
          messages.map((m) => (
            <RoomChatMessage
              key={m.id}
              message={m}
              mine={m.author_id === auth.user?.id}
              canModerate={canModerate}
              onOpenMember={openMember}
              onRemove={() => removeMessage({ messageId: m.id, roomId: room.id })}
            />
          ))
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
            <Trans>Message {room.name}</Trans>
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
            placeholder={t`Message ${room.name}…`}
            maxLength={4000}
            className="flex-1 rounded-lg border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-200"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label={t`Send`}
            className="rounded-lg bg-brand-navy p-2 text-white transition-colors hover:bg-brand-green hover:text-brand-navy disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <p className="border-t border-ktip-sand-100 px-4 py-3 text-xs text-ktip-sand-500">
          <Trans>You are watching this room. Spectators can read chat but not post.</Trans>
        </p>
      )}
    </div>
  )
}
