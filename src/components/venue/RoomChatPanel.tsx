import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuarantineNotice } from '../moderation/QuarantineNotice'
import { Languages, Pin, Send, Trash2, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
import { useContentLanguage } from '../../i18n/useContentLanguage'
import { LANGUAGE_NAMES } from '../../i18n/language'
import { prefersReducedMotionNow } from '../../a11y/store'
import { useVenueRoster } from '../../hooks/useVenue'
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
import { firstVisibleRow, newestHostId, pickHostPin, type PinRow } from '../../lib/chat-host-pin'
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
  /**
   * Mark the organisers' posts and pin the latest one. Off for the
   * announcements feed, where only hosts can post and every row would carry
   * the badge.
   */
  highlightHosts?: boolean
  className?: string
}

/** Within this many px of the end counts as "at the bottom". */
const BOTTOM_SLACK = 48
/** Room the pin bar takes over the top of the list, so a jump clears it. */
const PIN_CLEARANCE = 64
const FLASH_MS = 1_600

/** Fixed navy/green in both themes, flipped at night like the send button. */
function HostBadge() {
  return (
    <span className="shrink-0 rounded-full bg-brand-navy px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-brand-green dark:bg-brand-green dark:text-brand-navy">
      <Trans>Host</Trans>
    </span>
  )
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
  host,
  flash,
  canModerate,
  onOpenMember,
  onRemove,
}: {
  message: VenueRoomMessage
  mine: boolean
  /** Posted by one of the event's venue organisers. */
  host: boolean
  /** Briefly ringed after a jump from the pin. */
  flash: boolean
  canModerate: boolean
  onOpenMember: (userId: string) => void
  onRemove: () => void
}) {
  const { t } = useLingui()
  const [showSource, setShowSource] = useState(false)
  const { text, source, translated, pending, from } = useTranslatedContent(
    message.body,
    message.lang,
    { meter: { surface: 'chat', roomId: message.room_id } }
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
    <div
      className={cn(
        'group flex items-start gap-2.5',
        // A tinted card with a green rule: findable at a glance in a busy
        // room, and the tokens flip with the theme so it reads in both.
        host &&
          '-mx-2 rounded-xl border-l-3 border-ktip-tropical-500 bg-ktip-tropical-50 p-2 transition-shadow duration-500',
        flash && 'ring-2 ring-ktip-sun-400'
      )}
    >
      <DiamondAvatar src={message.author?.avatar_url} name={name} size={28} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => message.author_id && onOpenMember(message.author_id)}
            className={cn(
              'min-w-0 truncate text-xs font-semibold hover:text-ktip-ocean-600 hover:underline',
              host ? 'text-ktip-sand-900' : 'text-ktip-sand-800'
            )}
          >
            {name}
          </button>
          {host && <HostBadge />}
          <span className="shrink-0 text-[10px] text-ktip-sand-400">
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
          className="icon-hit shrink-0 rounded-lg p-1 text-ktip-sand-400 opacity-0 transition-opacity hover:bg-ktip-sand-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 no-hover:opacity-100"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/**
 * The host post pinned over the top of the list: the newest one that has
 * scrolled out of view above. One line, translated like the row it points at
 * (the prefetch has already warmed it), and a click takes the reader there.
 */
function PinnedHostMessage({
  message,
  onJump,
  onDismiss,
}: {
  message: VenueRoomMessage
  onJump: () => void
  onDismiss: () => void
}) {
  const { t } = useLingui()
  const { text } = useTranslatedContent(message.body, message.lang, {
    meter: { surface: 'chat', roomId: message.room_id },
  })
  const name = message.author?.display_name || t`Host`

  return (
    <div className="absolute inset-x-2 top-2 z-raised flex items-center rounded-xl border border-ktip-tropical-200 border-l-3 border-l-ktip-tropical-500 bg-ktip-tropical-50 shadow-card">
      <button
        type="button"
        onClick={onJump}
        title={t`Go to this message`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-l-xl py-2 pl-3 pr-1 text-left"
      >
        <Pin size={13} className="shrink-0 text-ktip-tropical-700" aria-hidden="true" />
        <span className="sr-only">
          <Trans>Pinned host message.</Trans>
        </span>
        <span className="max-w-[40%] shrink-0 truncate text-xs font-semibold text-ktip-sand-900">
          {name}
        </span>
        <HostBadge />
        <span className="min-w-0 flex-1 truncate text-xs text-ktip-sand-700">{text}</span>
        <span className="shrink-0 text-[10px] text-ktip-sand-500">
          {formatRelativeTime(message.created_at)}
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t`Hide pinned message`}
        title={t`Hide`}
        className="icon-hit mr-1 shrink-0 rounded-lg p-1 text-ktip-sand-500 hover:bg-ktip-tropical-100 hover:text-ktip-sand-900"
      >
        <X size={13} aria-hidden="true" />
      </button>
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
  highlightHosts = true,
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

  // Who the hosts are. Messages carry no role, so it comes from the roster,
  // which the venue layout has already fetched under the same key: this is a
  // cache read, not a request. `live` matches the layout's slower refetch.
  const { roster } = useVenueRoster(highlightHosts ? room.event_id : undefined, { live: true })
  const hostIds = useMemo(
    () => new Set((roster ?? []).filter((m) => m.role === 'organizer').map((m) => m.user_id)),
    [roster]
  )
  const isHostMessage = useCallback(
    (m: VenueRoomMessage) =>
      highlightHosts &&
      m.kind !== 'system' &&
      (!m.status || m.status === 'active') &&
      !!m.author_id &&
      hostIds.has(m.author_id),
    [highlightHosts, hostIds]
  )
  const pinRows = useMemo<PinRow[]>(
    () => (messages ?? []).map((m) => ({ id: m.id, host: isHostMessage(m) })),
    [messages, isHostMessage]
  )

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  // So the emoji picker can insert at the caret, not on the end of the line.
  const inputRef = useRef<HTMLInputElement>(null)

  // Where the reader is. Only "at the bottom" decides whether new messages
  // pull the list down; the first visible row decides the pin.
  const atBottomRef = useRef(true)
  const [firstVisible, setFirstVisible] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)

  // A binary search over the rows' rects: a handful of reads per frame, however
  // long the thread. Rows are the scroll container's direct children.
  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK
    const rows = el.children
    const top = el.getBoundingClientRect().top
    setFirstVisible(
      firstVisibleRow(rows.length, (i) => rows[i].getBoundingClientRect().bottom, top)
    )
  }, [])

  const frameRef = useRef(0)
  const onScroll = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      measure()
    })
  }, [measure])
  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  // Stick to the bottom as messages arrive, but only for a reader who is
  // already there: someone scrolled up to reread a host post should not be
  // yanked away from it. Their own message always brings them down.
  const lastIdRef = useRef<string | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const last = messages?.[messages.length - 1]
    const sentByMe = !!last && last.id !== lastIdRef.current && last.author_id === auth.user?.id
    lastIdRef.current = last?.id ?? null
    if (atBottomRef.current || sentByMe) el.scrollTop = el.scrollHeight
    measure()
  }, [messages, measure, auth.user?.id])

  // Rows grow after they paint (a translation lands, a link wraps). Keep a
  // reader at the bottom there, and keep the pin honest.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight
      measure()
    })
    observer.observe(el)
    for (const row of Array.from(el.children)) observer.observe(row)
    return () => observer.disconnect()
  }, [messages, measure])

  useEffect(() => {
    if (!flashId) return
    const id = window.setTimeout(() => setFlashId(null), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [flashId])

  const pinnedId = pickHostPin(pinRows, firstVisible, dismissedAt)
  const pinned = pinnedId ? messages?.find((m) => m.id === pinnedId) : undefined

  const jumpTo = (id: string) => {
    const el = scrollRef.current
    if (!el) return
    const row = Array.from(el.children).find(
      (child) => (child as HTMLElement).dataset.msgId === id
    ) as HTMLElement | undefined
    if (!row) return
    // Centred, or just below the pin bar for a post taller than the panel.
    const offset = Math.max(PIN_CLEARANCE, (el.clientHeight - row.offsetHeight) / 2)
    el.scrollTo({
      top: Math.max(0, row.offsetTop - offset),
      behavior: prefersReducedMotionNow() ? 'auto' : 'smooth',
    })
    setFlashId(id)
  }

  // One pass over the whole thread before it paints, so a roomful of messages
  // is a single request rather than one per bubble.
  // Metered against this room, so the organiser can see what chat costs.
  const meter = { surface: 'chat' as const, roomId: room.id }
  usePrefetchTranslatedContent(
    (messages ?? []).map((m) => ({ text: m.body, lang: m.lang })),
    { meter }
  )

  const submit = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    try {
      await sendMessage(room.id, body, { lang: contentLang })
      // The sender pays for the other languages while they are still looking at
      // their own message, so it reaches everyone else already translated.
      warm(body, contentLang, { meter })
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        {pinned && (
          <PinnedHostMessage
            message={pinned}
            onJump={() => jumpTo(pinned.id)}
            onDismiss={() => setDismissedAt(newestHostId(pinRows))}
          />
        )}

        {/* relative: the rows' offsetTop is measured from here when jumping. */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
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
            messages.map((m, i) => (
              // One wrapper per message, so child i is message i for the pin.
              <div key={m.id} data-msg-id={m.id}>
                <RoomChatMessage
                  message={m}
                  mine={m.author_id === auth.user?.id}
                  host={pinRows[i]?.host ?? false}
                  flash={flashId === m.id}
                  canModerate={canModerate}
                  onOpenMember={openMember}
                  onRemove={() => removeMessage({ messageId: m.id, roomId: room.id })}
                />
              </div>
            ))
          )}
        </div>
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
            // 16px on touch: iOS zooms the page into any smaller field on focus.
            className="flex-1 rounded-lg border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm pointer-coarse:text-body text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-200"
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
