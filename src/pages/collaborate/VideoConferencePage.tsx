import { createSignal, Show, For } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { JitsiVideoCall } from '../../components/collaboration/JitsiVideoCall'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../contexts/AuthContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../hooks/useMessages'
import { supabase } from '../../lib/supabase'
import { debounce, getInitials, generateAvatarColor } from '../../lib/utils'
import { ChevronRight, Hash, Copy, Check, Shuffle, Search, X, UserPlus, Send } from 'lucide-solid'
import type { Profile } from '../../types'

function generateRoomName(): string {
  const adjectives = ['swift', 'bright', 'bold', 'calm', 'keen', 'warm', 'vivid', 'crisp']
  const nouns = ['coral', 'wave', 'reef', 'tide', 'palm', 'shell', 'breeze', 'island']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `ktip-${adj}-${noun}-${num}`
}

export default function VideoConferencePage() {
  usePageTitle(() => 'Video Conference')
  const auth = useAuth()
  const [roomName, setRoomName] = createSignal('')
  const [copied, setCopied] = createSignal(false)

  // Invite participants state
  const [inviteQuery, setInviteQuery] = createSignal('')
  const [searchResults, setSearchResults] = createSignal<Profile[]>([])
  const [selectedUsers, setSelectedUsers] = createSignal<Profile[]>([])
  const [inviting, setInviting] = createSignal(false)
  const [inviteSuccess, setInviteSuccess] = createSignal(false)
  const [inviteError, setInviteError] = createSignal<string | null>(null)
  const [showDropdown, setShowDropdown] = createSignal(false)
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation } = useCreateConversation()
  const { sendMessage } = useSendMessage()

  const displayName = () => {
    const profile = auth.profile()
    if (profile?.display_name) return profile.display_name
    const email = auth.user()?.email
    if (email) return email.split('@')[0]
    return 'Guest'
  }

  const handleGenerate = () => {
    setRoomName(generateRoomName())
  }

  const copyRoomLink = async () => {
    const name = roomName().trim()
    if (!name) return
    const link = `${window.location.origin}/collaborate/video?room=${encodeURIComponent(name)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = link
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Debounced user search
  const debouncedSearch = debounce(async (query: string) => {
    const userId = auth.user()?.id
    if (!query.trim() || !userId) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    try {
      const results = await searchUsers(query, userId)
      // Filter out already-selected users
      const selectedIds = new Set(selectedUsers().map((u) => u.id))
      setSearchResults(results.filter((r) => !selectedIds.has(r.id)))
      setShowDropdown(true)
    } catch {
      setSearchResults([])
    }
  }, 300)

  const handleSearchInput = (value: string) => {
    setInviteQuery(value)
    debouncedSearch(value)
  }

  const selectUser = (user: Profile) => {
    setSelectedUsers((prev) => [...prev, user])
    setSearchResults((prev) => prev.filter((r) => r.id !== user.id))
    setInviteQuery('')
    setShowDropdown(false)
  }

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  const handleInviteAndStart = async () => {
    const currentUserId = auth.user()?.id
    const room = roomName().trim()
    if (!currentUserId || !room || selectedUsers().length === 0) return

    setInviting(true)
    setInviteError(null)
    try {
      const roomLink = `${window.location.origin}/collaborate/video?room=${encodeURIComponent(room)}`
      const inviteMessage = `📹 You've been invited to a video conference!\n\nRoom: ${room}\nJoin here: ${roomLink}\n\nClick the link above to join the call.`

      for (const user of selectedUsers()) {
        const conversationId = await createConversation(currentUserId, user.id)
        await sendMessage({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: inviteMessage,
        })
        // Send in-app notification
        await (supabase.from('notifications') as any).insert({
          user_id: user.id,
          type: 'video_invite',
          title: 'Video Conference Invitation',
          body: `${displayName()} invited you to join room "${room}"`,
          link: `/collaborate/video?room=${encodeURIComponent(room)}`,
        }).then(() => {}, () => {}) // Silently ignore if table doesn't exist yet
      }
      setInviteSuccess(true)
      setSelectedUsers([])
      setTimeout(() => setInviteSuccess(false), 3000)
    } catch (err: any) {
      setInviteError(err?.message || 'Failed to send invitations. Please try again.')
    } finally {
      setInviting(false)
    }
  }

  // Auto-fill room name from URL query param
  const urlParams = new URLSearchParams(window.location.search)
  const roomParam = urlParams.get('room')
  if (roomParam) {
    setRoomName(roomParam)
  }

  return (
    <MainLayout>
      {/* Dark Hero Band */}
      <div class="bg-gray-800 min-h-[140px] flex items-center">
        <div class="max-w-5xl mx-auto px-4 w-full flex items-center justify-between">
          <div>
            <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Collaboration Tools</p>
            <h1 class="text-3xl md:text-4xl font-display font-bold text-white">Video Conference</h1>
          </div>
          <nav class="hidden md:flex items-center gap-1 text-sm text-gray-400">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} />
            <A href="/collaborate" class="hover:text-white transition-colors">Collaborate</A>
            <ChevronRight size={14} />
            <span class="text-gray-200">Video Conference</span>
          </nav>
        </div>
      </div>

      {/* Content Section */}
      <div class="bg-white py-8">
        <div class="max-w-5xl mx-auto px-4">
          {/* Room Name Input */}
          <div class="border border-gray-200 p-6 mb-6">
            <label class="block text-sm font-medium text-ktip-sand-700 mb-2">
              Room Name
            </label>
            <div class="flex gap-3">
              <div class="relative flex-1">
                <Hash
                  size={18}
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
                />
                <input
                  type="text"
                  placeholder="e.g. ktip-team-standup"
                  value={roomName()}
                  onInput={(e) => setRoomName(e.currentTarget.value)}
                  class="w-full pl-10 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                class="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-200 rounded-lg hover:bg-ktip-sand-50 text-ktip-sand-600 transition-colors"
                title="Generate a random room name"
              >
                <Shuffle size={16} />
                <span class="text-sm font-medium">Generate</span>
              </button>
              <button
                type="button"
                onClick={copyRoomLink}
                disabled={!roomName().trim()}
                class="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-200 rounded-lg hover:bg-ktip-sand-50 text-ktip-sand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy shareable link"
              >
                {copied() ? <Check size={16} class="text-green-600" /> : <Copy size={16} />}
                <span class="text-sm font-medium">{copied() ? 'Copied!' : 'Share'}</span>
              </button>
            </div>
            <p class="mt-2 text-xs text-ktip-sand-400">
              Enter a room name or generate one. Anyone with the same room name joins the same call.
              Use the Share button to copy a direct link for your team.
            </p>
          </div>

          {/* Invite Participants */}
          <div class="border border-gray-200 p-6 mb-6">
            <div class="flex items-center gap-2 mb-4">
              <UserPlus size={18} class="text-ktip-ocean-600" />
              <h2 class="text-sm font-semibold text-ktip-sand-800">Invite Participants</h2>
            </div>

            {/* Search Input */}
            <div class="relative">
              <Search
                size={16}
                class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
              />
              <input
                type="text"
                placeholder="Search users to invite..."
                value={inviteQuery()}
                onInput={(e) => handleSearchInput(e.currentTarget.value)}
                onFocus={() => {
                  if (searchResults().length > 0) setShowDropdown(true)
                }}
                onBlur={() => {
                  // Delay to allow click on dropdown item
                  setTimeout(() => setShowDropdown(false), 200)
                }}
                class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
              <Show when={searchLoading()}>
                <div class="absolute right-3 top-1/2 -translate-y-1/2">
                  <div class="w-4 h-4 border-2 border-ktip-ocean-300 border-t-transparent rounded-full animate-spin" />
                </div>
              </Show>
            </div>

            {/* Search Results Dropdown */}
            <Show when={showDropdown() && searchResults().length > 0}>
              <div class="mt-1 border border-ktip-sand-200 rounded-lg bg-white shadow-medium max-h-48 overflow-y-auto">
                <For each={searchResults()}>
                  {(user) => {
                    const color = generateAvatarColor(user.display_name || user.id)
                    const initials = getInitials(user.display_name || 'U')
                    return (
                      <button
                        type="button"
                        onClick={() => selectUser(user)}
                        class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-ktip-sand-50 transition-colors text-left"
                      >
                        <div
                          class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ "background-color": color }}
                        >
                          {initials}
                        </div>
                        <div class="min-w-0 flex-1">
                          <p class="text-sm font-medium text-ktip-sand-800 truncate">
                            {user.display_name || 'Unnamed User'}
                          </p>
                          <Show when={user.country}>
                            <p class="text-xs text-ktip-sand-500">{user.country}</p>
                          </Show>
                        </div>
                        <Show when={user.roles?.length}>
                          <span class="text-[10px] px-1.5 py-0.5 bg-ktip-ocean-50 text-ktip-ocean-600 rounded font-medium">
                            {user.roles![0]}
                          </span>
                        </Show>
                      </button>
                    )
                  }}
                </For>
              </div>
            </Show>

            {/* No results message */}
            <Show when={showDropdown() && searchResults().length === 0 && inviteQuery().trim() && !searchLoading()}>
              <div class="mt-1 border border-ktip-sand-200 rounded-lg bg-white shadow-medium px-3 py-3">
                <p class="text-sm text-ktip-sand-500 text-center">No users found</p>
              </div>
            </Show>

            {/* Selected Users Chips */}
            <Show when={selectedUsers().length > 0}>
              <div class="flex flex-wrap gap-2 mt-3">
                <For each={selectedUsers()}>
                  {(user) => {
                    const color = generateAvatarColor(user.display_name || user.id)
                    return (
                      <span
                        class="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-medium text-white"
                        style={{ "background-color": color }}
                      >
                        <span class="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                          {getInitials(user.display_name || 'U')}
                        </span>
                        {user.display_name || 'User'}
                        <button
                          type="button"
                          onClick={() => removeUser(user.id)}
                          class="ml-0.5 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )
                  }}
                </For>
              </div>
            </Show>

            {/* Invite & Start Call Button */}
            <Show when={selectedUsers().length > 0}>
              <button
                type="button"
                onClick={handleInviteAndStart}
                disabled={!roomName().trim() || inviting()}
                class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Show when={inviting()} fallback={<Send size={16} />}>
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </Show>
                {inviting()
                  ? 'Sending invites...'
                  : `Invite ${selectedUsers().length} user${selectedUsers().length > 1 ? 's' : ''} & Start Call`}
              </button>
            </Show>

            {/* Success message */}
            <Show when={inviteSuccess()}>
              <div class="mt-3 flex items-center gap-2 text-sm text-green-600">
                <Check size={16} />
                <span>Invitations sent! Users will receive a message with the room link.</span>
              </div>
            </Show>

            {/* Error message */}
            <Show when={inviteError()}>
              <div class="mt-3 flex items-center gap-2 text-sm text-red-600">
                <X size={16} />
                <span>{inviteError()}</span>
              </div>
            </Show>

            <p class="mt-3 text-xs text-ktip-sand-400">
              Search for users to invite. They'll receive a direct message with a link to join the call.
            </p>
          </div>

          {/* Video Call Container */}
          <JitsiVideoCall roomName={roomName()} displayName={displayName()} />
        </div>
      </div>
    </MainLayout>
  )
}
