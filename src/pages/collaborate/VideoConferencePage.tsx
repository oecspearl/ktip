import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { JitsiVideoCall } from '../../components/collaboration/JitsiVideoCall'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../contexts/AuthContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../hooks/useMessages'
import { useMyConnections } from '../../hooks/useConnections'
import { sendNotification } from '../../lib/notify'
import { debounce, generateAvatarColor } from '../../lib/utils'
import { Hash, Copy, Check, Shuffle, Search, X, UserPlus, Send, ArrowLeft, Pen, FileText, Code, Users } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import type { Profile } from '../../types'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'

function generateRoomName(): string {
  const adjectives = ['swift', 'bright', 'bold', 'calm', 'keen', 'warm', 'vivid', 'crisp']
  const nouns = ['coral', 'wave', 'reef', 'tide', 'palm', 'shell', 'breeze', 'island']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `ktip-${adj}-${noun}-${num}`
}

export default function VideoConferencePage() {
  usePageTitle('Video Conference')
  const auth = useAuth()

  // Auto-fill room name from URL query param (runs once, at mount)
  const [roomName, setRoomName] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('room') || ''
  })
  const [copied, setCopied] = useState(false)

  // Invite participants state
  const [inviteQuery, setInviteQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([])
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation } = useCreateConversation()
  const { sendMessage } = useSendMessage()
  const { connections } = useMyConnections(auth.user?.id)

  // Your accepted connections, offered up front so inviting the people you
  // actually work with doesn't require typing their name.
  const connectionProfiles = useMemo(() => {
    const myId = auth.user?.id
    const selectedIds = new Set(selectedUsers.map((u) => u.id))
    return (connections || [])
      .map((c) => (c.requester_id === myId ? c.addressee : c.requester))
      .filter((p): p is Profile => !!p && !selectedIds.has(p.id))
  }, [connections, auth.user?.id, selectedUsers])

  const displayName = () => {
    const profile = auth.profile
    if (profile?.display_name) return profile.display_name
    const email = auth.user?.email
    if (email) return email.split('@')[0]
    return 'Guest'
  }

  const handleGenerate = () => {
    setRoomName(generateRoomName())
  }

  const copyRoomLink = async () => {
    const name = roomName.trim()
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

  // Refs keep the debounced search callback (created once) reading fresh values.
  const authRef = useRef(auth)
  authRef.current = auth
  const selectedUsersRef = useRef(selectedUsers)
  selectedUsersRef.current = selectedUsers
  const searchUsersRef = useRef(searchUsers)
  searchUsersRef.current = searchUsers

  // Debounced user search
  const debouncedSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        const userId = authRef.current.user?.id
        if (!query.trim() || !userId) {
          setSearchResults([])
          setShowDropdown(false)
          return
        }
        try {
          const results = await searchUsersRef.current(query, userId)
          // Filter out already-selected users
          const selectedIds = new Set(selectedUsersRef.current.map((u) => u.id))
          setSearchResults(results.filter((r) => !selectedIds.has(r.id)))
          setShowDropdown(true)
        } catch {
          setSearchResults([])
        }
      }, 300),
    []
  )

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
    const currentUserId = auth.user?.id
    const room = roomName.trim()
    if (!currentUserId || !room || selectedUsers.length === 0) return

    setInviting(true)
    setInviteError(null)
    try {
      const roomLink = `${window.location.origin}/collaborate/video?room=${encodeURIComponent(room)}`
      const inviteMessage = `📹 You've been invited to a video conference!\n\nRoom: ${room}\nJoin here: ${roomLink}\n\nClick the link above to join the call.`

      for (const user of selectedUsers) {
        const conversationId = await createConversation(currentUserId, user.id)
        await sendMessage({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: inviteMessage,
        })
        // Send in-app notification (RPC enforces recipient preferences)
        sendNotification({
          userId: user.id,
          type: 'video_invite',
          title: 'Video Conference Invitation',
          body: `${displayName()} invited you to join room "${room}"`,
          link: `/collaborate/video?room=${encodeURIComponent(room)}`,
        })
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

  return (
    <>
      <PageHero
        eyebrow="Collaboration Tools"
        title="Video Conference"
        imageSeed="video"
        compact
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Collaborate', href: '/collaborate' },
          { label: 'Video Conference' },
        ]}
      />

      {/* Content Section */}
      <div className="bg-ktip-sand-50 py-8">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {/* Back to hub + cross-links */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm">
            <Link
              to="/collaborate"
              className="inline-flex items-center gap-1.5 text-ktip-sand-600 hover:text-ktip-ocean-600 transition-colors font-medium"
            >
              <ArrowLeft size={14} />
              Back to Collaborate Hub
            </Link>
            <span className="text-ktip-sand-300">|</span>
            <Link to="/collaborate/whiteboards" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <Pen size={14} />
              Whiteboards
            </Link>
            <Link to="/collaborate/documents" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <FileText size={14} />
              Documents
            </Link>
            <Link to="/collaborate/snippets" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <Code size={14} />
              Code
            </Link>
          </div>

          {/* Room Name Input */}
          <div className="border border-ktip-sand-200 p-6 mb-6">
            <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
              Room Name
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Hash
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
                />
                <input
                  type="text"
                  placeholder="e.g. ktip-team-standup"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-200 rounded-lg hover:bg-ktip-sand-50 text-ktip-sand-600 transition-colors"
                title="Generate a random room name"
              >
                <Shuffle size={16} />
                <span className="text-sm font-medium">Generate</span>
              </button>
              <button
                type="button"
                onClick={copyRoomLink}
                disabled={!roomName.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-200 rounded-lg hover:bg-ktip-sand-50 text-ktip-sand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy shareable link"
              >
                {copied ? <Check size={16} className="text-ktip-tropical-700" /> : <Copy size={16} />}
                <span className="text-sm font-medium">{copied ? 'Copied!' : 'Share'}</span>
              </button>
            </div>
            <p className="mt-2 text-xs text-ktip-sand-400">
              Enter a room name or generate one. Anyone with the same room name joins the same call.
              Use the Share button to copy a direct link for your team.
            </p>
          </div>

          {/* Invite Participants */}
          <div className="border border-ktip-sand-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus size={18} className="text-ktip-ocean-600" />
              <h2 className="text-sm font-semibold text-ktip-sand-800">Invite Participants</h2>
            </div>

            {/* Connections quick-pick */}
            {connectionProfiles.length > 0 && (
              <div className="mb-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-ktip-sand-500 mb-2">
                  <Users size={12} />
                  My connections
                </p>
                <div className="flex flex-wrap gap-2">
                  {connectionProfiles.slice(0, 12).map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => selectUser(user)}
                      className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-ktip-sand-200 bg-ktip-cream hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/40 text-xs font-medium text-ktip-sand-700 transition-colors"
                    >
                      <DiamondAvatar name={user.display_name || 'User'} size={20} />
                      {user.display_name || 'User'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
              />
              <input
                type="text"
                placeholder="Search all members..."
                value={inviteQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true)
                }}
                onBlur={() => {
                  // Delay to allow click on dropdown item
                  setTimeout(() => setShowDropdown(false), 200)
                }}
                className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-ktip-ocean-300 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="mt-1 border border-ktip-sand-200 rounded-lg bg-ktip-cream shadow-medium max-h-48 overflow-y-auto">
                {searchResults.map((user) => {
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => selectUser(user)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-ktip-sand-50 transition-colors text-left"
                    >
                      <DiamondAvatar name={user.display_name || 'User'} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ktip-sand-800 truncate">
                          {user.display_name || 'Unnamed User'}
                        </p>
                        {user.country && (
                          <p className="text-xs text-ktip-sand-500">{user.country}</p>
                        )}
                      </div>
                      {user.roles?.length ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-ktip-ocean-50 text-ktip-ocean-600 rounded font-medium">
                          {user.roles[0]}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}

            {/* No results message */}
            {showDropdown && searchResults.length === 0 && inviteQuery.trim() && !searchLoading && (
              <div className="mt-1 border border-ktip-sand-200 rounded-lg bg-ktip-cream shadow-medium px-3 py-3">
                <p className="text-sm text-ktip-sand-500 text-center">No users found</p>
              </div>
            )}

            {/* Selected Users Chips */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {selectedUsers.map((user) => {
                  const color = generateAvatarColor(user.display_name || user.id)
                  return (
                    <span
                      key={user.id}
                      className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-medium text-white ${color}`}
                    >
                      <DiamondAvatar
                        name={user.display_name || 'User'}
                        size={20}
                        colorClass="bg-white/20"
                      />
                      {user.display_name || 'User'}
                      <button
                        type="button"
                        onClick={() => removeUser(user.id)}
                        className="ml-0.5 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Invite & Start Call Button */}
            {selectedUsers.length > 0 && (
              <button
                type="button"
                onClick={handleInviteAndStart}
                disabled={!roomName.trim() || inviting}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 btn-brand rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {inviting
                  ? 'Sending invites...'
                  : `Invite ${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} & Start Call`}
              </button>
            )}

            {/* Success message */}
            {inviteSuccess && (
              <div className="mt-3 flex items-center gap-2 text-sm text-ktip-tropical-700">
                <Check size={16} />
                <span>Invitations sent! Users will receive a message with the room link.</span>
              </div>
            )}

            {/* Error message */}
            {inviteError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                <X size={16} />
                <span>{inviteError}</span>
              </div>
            )}

            <p className="mt-3 text-xs text-ktip-sand-400">
              Search for users to invite. They'll receive a direct message with a link to join the call.
            </p>
          </div>

          {/* Video Call Container */}
          <JitsiVideoCall roomName={roomName} displayName={displayName()} />
        </div>
      </div>
    </>
  )
}
