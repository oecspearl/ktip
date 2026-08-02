import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare, Pin, X } from 'lucide-react'
import { ChatSidebar } from './ChatSidebar'
import { ChatWindow } from './ChatWindow'
import { AssistantChatWindow } from './AssistantChatWindow'
import { NewConversationModal } from './NewConversationModal'
import { useConversations, useUnreadMessageCount } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { isAssistantConversation } from '../../lib/assistant'
import {
  useDisclosureAnimation,
  type DisclosureState,
} from '../ui/useDisclosureAnimation'
import { cn } from '../../lib/utils'

/**
 * Docked messaging panel, anchored above the FAB (bottom-right). Non-modal:
 * no backdrop, the page stays usable; closes via X, Escape, or FAB toggle.
 * z-40 keeps it under Modal (z-50) so NewConversationModal/GroupSettingsModal
 * overlay it, and under the FAB (z-[9999]) which stays visible as the toggle.
 */
export function MessagingPanel() {
  // Thin gate so the conversations query (and everything else in the panel)
  // only runs once the panel is actually opened — not on every page view.
  //
  // The gate itself is always mounted, which is what lets the open/close
  // transition run: the animation state lives out here and survives the
  // content being unmounted at the end of the exit.
  const auth = useAuth()
  const { isOpen } = useMessagingPanel()
  const { mounted, state } = useDisclosureAnimation(isOpen, {
    enterMs: PANEL_ENTER_MS,
    exitMs: PANEL_EXIT_MS,
  })

  if (!auth.user || !mounted) return null
  return <MessagingPanelContent state={state} />
}

/** Must match the .messaging-panel timings in index.css. */
const PANEL_ENTER_MS = 260
const PANEL_EXIT_MS = 200

function MessagingPanelContent({ state }: { state: DisclosureState }) {
  const auth = useAuth()
  const { isOpen, activeConversationId, closePanel, setActiveConversation, openPanel } =
    useMessagingPanel()

  const { conversations, refetch } = useConversations(auth.user?.id)
  const { unreadCount } = useUnreadMessageCount(auth.user?.id)
  const threadCount = conversations?.length ?? 0
  const [showNewModal, setShowNewModal] = useState(false)
  const [newModalMode, setNewModalMode] = useState<'dm' | 'group'>('dm')
  const [showChat, setShowChat] = useState(false) // mobile toggle
  const [pinned, setPinned] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  // Deep-linked / contact-initiated DMs land straight in the chat view on mobile
  useEffect(() => {
    if (activeConversationId) setShowChat(true)
  }, [activeConversationId])

  // Escape closes the panel — unless an open Modal (role="dialog") owns the key.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      closePanel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closePanel])

  // Unpinned: clicking outside the panel closes it. Ignores clicks inside
  // modals (role="dialog") and on the FAB (its own toggle would reopen it).
  useEffect(() => {
    if (!isOpen || pinned) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element
      if (panelRef.current?.contains(target)) return
      if (target.closest('[role="dialog"]')) return
      if (target.closest('[data-fab]')) return
      closePanel()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isOpen, pinned, closePanel])

  if (!auth.user) return null

  const activeConversation = conversations?.find((c) => c.id === activeConversationId)

  const getOtherUserName = () => {
    const conv = activeConversation
    if (!conv?.participants) return undefined
    if (conv.is_group) return conv.name || 'Group'
    const other = conv.participants.find((p) => p.user_id !== auth.user?.id)
    return other?.user?.display_name || 'Unknown User'
  }

  const handleLeftGroup = () => {
    setActiveConversation(null)
    setShowChat(false)
    refetch()
  }

  const openNewModal = (mode: 'dm' | 'group') => {
    setNewModalMode(mode)
    setShowNewModal(true)
  }

  return (
    <section
      ref={panelRef}
      role="complementary"
      aria-label="Messages panel"
      data-state={state}
      className={cn(
        'fixed z-40 inset-x-2 top-20 bottom-24',
        'lg:inset-auto lg:right-6 lg:bottom-24 lg:w-[min(900px,calc(100vw-3rem))] lg:h-[min(70vh,44rem)]',
        'bg-ktip-cream rounded-2xl shadow-hard border border-ktip-sand-200',
        // Transition-driven, not @keyframes: a keyframe cannot run backwards,
        // which is why closing used to be a hard cut while opening eased in.
        'overflow-hidden flex flex-col messaging-panel origin-bottom-right'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ktip-sand-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-display font-bold text-ktip-sand-900 text-sm">Messages</h2>
          {/* Same number the FAB carries, kept on the panel itself: the badge
              on the trigger is hidden behind the panel once it is open, and
              "how many am I behind on" is the reason the panel was opened. */}
          {unreadCount > 0 && (
            <span
              className="min-w-[1.25rem] rounded-full bg-red-500 px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none text-white tabular-nums"
              aria-label={`${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          {threadCount > 0 && (
            <span className="text-xs text-ktip-sand-500 tabular-nums">
              {threadCount} {threadCount === 1 ? 'conversation' : 'conversations'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPinned(!pinned)}
            aria-label={pinned ? 'Unpin panel' : 'Pin panel open'}
            aria-pressed={pinned}
            title={pinned ? 'Unpin — clicking outside closes' : 'Pin — stays open when clicking outside'}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              pinned
                ? 'bg-ktip-ocean-50 text-ktip-ocean-600 hover:bg-ktip-ocean-100'
                : 'hover:bg-ktip-sand-100 text-ktip-sand-500'
            )}
          >
            <Pin size={16} className={cn('transition-transform', pinned && 'rotate-45')} fill={pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={closePanel}
            aria-label="Close messages"
            className="p-1.5 rounded-lg hover:bg-ktip-sand-100 text-ktip-sand-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body: sidebar 20% / chat 80% */}
      <div className="flex flex-1 min-h-0">
        <div
          className={cn(
            'w-full lg:w-[20%] lg:min-w-[210px] lg:border-r border-ktip-sand-200 lg:block',
            showChat ? 'hidden' : 'block'
          )}
        >
          <ChatSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            currentUserId={auth.user.id}
            onSelect={(id) => {
              setActiveConversation(id)
              setShowChat(true)
            }}
            onNewChat={() => openNewModal('dm')}
            onNewGroup={() => openNewModal('group')}
            onStartDm={(userId) => openPanel({ userId })}
          />
        </div>

        <div className={cn('flex-1 min-w-0 flex-col lg:flex', showChat ? 'flex' : 'hidden')}>
          {activeConversationId ? (
            <>
              {/* Mobile back button */}
              <div className="lg:hidden p-2 border-b border-ktip-sand-200 shrink-0">
                <button
                  onClick={() => setShowChat(false)}
                  className="flex items-center gap-2 text-ktip-sand-600 hover:text-ktip-sand-900 text-sm"
                >
                  <ArrowLeft size={18} />
                  Back
                </button>
              </div>
              {isAssistantConversation(activeConversationId) ? (
                <AssistantChatWindow />
              ) : (
                <ChatWindow
                  conversationId={activeConversationId}
                  otherUserName={getOtherUserName()}
                  conversation={activeConversation}
                  onLeftGroup={handleLeftGroup}
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-ktip-sand-500">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm mt-1">Or start a new one!</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <NewConversationModal
        open={showNewModal}
        mode={newModalMode}
        onClose={() => setShowNewModal(false)}
        onCreated={(id) => {
          setShowNewModal(false)
          setActiveConversation(id)
          setShowChat(true)
          refetch()
        }}
      />
    </section>
  )
}
