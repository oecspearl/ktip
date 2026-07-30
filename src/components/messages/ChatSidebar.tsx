import { useState } from 'react'
import { MessageSquare, Plus, Search, Sparkles, Users } from 'lucide-react'
import { Button } from '../ui/Button'
import { useMyConnections } from '../../hooks/useConnections'
import type { Conversation, Profile } from '../../types'
import {
  ASSISTANT_CONVERSATION_ID,
  ASSISTANT_NAME,
  ASSISTANT_TAGLINE,
} from '../../lib/assistant'
import { cn, formatRelativeTime, generateAvatarColor, getInitials } from '../../lib/utils'

interface ChatSidebarProps {
  conversations: Conversation[] | undefined
  activeConversationId: string | null
  currentUserId: string
  onSelect: (id: string) => void
  onNewChat: () => void
  onNewGroup: () => void
  onStartDm: (userId: string) => void
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  currentUserId,
  onSelect,
  onNewChat,
  onNewGroup,
  onStartDm,
}: ChatSidebarProps) {
  const [tab, setTab] = useState<'chats' | 'contacts'>('chats')
  const [search, setSearch] = useState('')
  const { connections } = useMyConnections(currentUserId)

  const query = search.trim().toLowerCase()

  const conversationName = (conversation: Conversation) => {
    if (conversation.is_group) return conversation.name || 'Group'
    const other = conversation.participants?.find((p) => p.user_id !== currentUserId)
    return other?.user?.display_name || 'Unknown User'
  }

  const filtered = (conversations || []).filter(
    (c) => !query || conversationName(c).toLowerCase().includes(query)
  )
  const groups = filtered.filter((c) => c.is_group)
  const direct = filtered.filter((c) => !c.is_group)

  const contacts: Profile[] = (connections || [])
    .map((conn) => (conn.requester_id === currentUserId ? conn.addressee : conn.requester))
    .filter((p): p is Profile => !!p)
    .filter((p) => !query || (p.display_name || '').toLowerCase().includes(query))

  const renderConversationRow = (conversation: Conversation) => {
    const displayName = conversationName(conversation)
    const isActive = activeConversationId === conversation.id

    return (
      <button
        key={conversation.id}
        className={cn(
          'w-full text-left p-3 border-b border-ktip-sand-100 hover:bg-ktip-sand-50 transition-colors',
          isActive && 'bg-ktip-ocean-50 border-l-2 border-l-ktip-ocean-500'
        )}
        onClick={() => onSelect(conversation.id)}
      >
        <div className="flex items-center gap-3">
          {conversation.is_group ? (
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white shrink-0">
              <Users size={16} />
            </div>
          ) : (
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0',
                generateAvatarColor(displayName)
              )}
            >
              {getInitials(displayName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-ktip-sand-900 text-sm truncate">{displayName}</span>
              <span className="text-[10px] text-ktip-sand-400 shrink-0 ml-2">
                {formatRelativeTime(conversation.updated_at)}
              </span>
            </div>
            {conversation.is_group && (
              <p className="text-xs text-ktip-sand-400">
                {conversation.participants?.length || 0} members
              </p>
            )}
          </div>
        </div>
      </button>
    )
  }

  // Pinned above every real conversation. Not a database row — the thread is
  // client-side, so it has no timestamp and cannot be left or deleted.
  const assistantMatchesSearch = !query || ASSISTANT_NAME.toLowerCase().includes(query)

  const renderAssistantRow = () => (
    <button
      className={cn(
        'w-full text-left p-3 border-b border-ktip-sand-100 hover:bg-ktip-sand-50 transition-colors',
        activeConversationId === ASSISTANT_CONVERSATION_ID &&
          'bg-ktip-ocean-50 border-l-2 border-l-ktip-ocean-500'
      )}
      onClick={() => onSelect(ASSISTANT_CONVERSATION_ID)}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white shrink-0">
          <Sparkles size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ktip-sand-900 text-sm truncate">
              {ASSISTANT_NAME}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-ktip-ocean-100 text-ktip-ocean-700 shrink-0">
              AI
            </span>
          </div>
          <p className="text-xs text-ktip-sand-400 truncate">{ASSISTANT_TAGLINE}</p>
        </div>
      </div>
    </button>
  )

  const sectionHeader = (label: string) => (
    <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ktip-sand-400">
      {label}
    </p>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Chats / Contacts slide toggle */}
      <div className="p-2 shrink-0">
        <div className="relative grid grid-cols-2 rounded-full bg-ktip-sand-100 p-1 text-xs font-medium">
          <span
            className={cn(
              'absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-ktip-cream shadow',
              'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              tab === 'contacts' && 'translate-x-full'
            )}
          />
          <button
            className={cn('relative z-10 py-1.5 rounded-full transition-colors', tab === 'chats' ? 'text-ktip-sand-900' : 'text-ktip-sand-500')}
            aria-pressed={tab === 'chats'}
            onClick={() => setTab('chats')}
          >
            Chats
          </button>
          <button
            className={cn('relative z-10 py-1.5 rounded-full transition-colors', tab === 'contacts' ? 'text-ktip-sand-900' : 'text-ktip-sand-500')}
            aria-pressed={tab === 'contacts'}
            onClick={() => setTab('contacts')}
          >
            Contacts
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 pb-2 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder={tab === 'chats' ? 'Search chats...' : 'Search contacts...'}
            aria-label={tab === 'chats' ? 'Search chats' : 'Search contacts'}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-ktip-sand-200 bg-ktip-sand-50 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'chats' ? (
          <>
            {assistantMatchesSearch && renderAssistantRow()}
            {groups.length > 0 && (
              <div>
                {sectionHeader('Groups')}
                {groups.map(renderConversationRow)}
              </div>
            )}
            {direct.length > 0 && (
              <div>
                {sectionHeader('Direct')}
                {direct.map(renderConversationRow)}
              </div>
            )}
            {!groups.length && !direct.length && (
              <div className="text-center py-12 px-4 text-ktip-sand-500">
                <MessageSquare size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">{query ? 'No chats match.' : 'No conversations yet.'}</p>
                {!query && <p className="text-xs mt-1">Start a new conversation!</p>}
              </div>
            )}
          </>
        ) : contacts.length ? (
          contacts.map((contact) => {
            const name = contact.display_name || 'Unknown User'
            return (
              <button
                key={contact.id}
                className="w-full text-left p-3 border-b border-ktip-sand-100 hover:bg-ktip-sand-50 transition-colors"
                onClick={() => onStartDm(contact.id)}
              >
                <div className="flex items-center gap-3">
                  {contact.avatar_url ? (
                    <img src={contact.avatar_url} alt={name} loading="lazy" decoding="async" width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0',
                        generateAvatarColor(name)
                      )}
                    >
                      {getInitials(name)}
                    </div>
                  )}
                  <span className="font-medium text-ktip-sand-900 text-sm truncate">{name}</span>
                </div>
              </button>
            )
          })
        ) : (
          <div className="text-center py-12 px-4 text-ktip-sand-500">
            <Users size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{query ? 'No contacts match.' : 'No connections yet.'}</p>
            {!query && <p className="text-xs mt-1">Connect with members in the Directory.</p>}
          </div>
        )}
      </div>

      {/* New chat / New group */}
      <div className="p-2 border-t border-ktip-sand-200 grid grid-cols-2 gap-2 shrink-0">
        <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={onNewChat} className="text-xs">
          New chat
        </Button>
        <Button size="sm" variant="outline" icon={<Users size={14} />} onClick={onNewGroup} className="text-xs">
          New group
        </Button>
      </div>
    </div>
  )
}
