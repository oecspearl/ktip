import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../hooks/useMessages'
import { useMyConnections } from '../../hooks/useConnections'
import { RESOURCE_SPECS } from '../../hooks/useCollabInvites'
import { supabase } from '../../lib/supabase'
import { sendNotification } from '../../lib/notify'
import { keys } from '../../queries/keys'
import { debounce, getInitials, generateAvatarColor, isValidEmail } from '../../lib/utils'
import { Search, X, Send, Check, Eye, Pencil, Users, Mail, Loader2 } from 'lucide-react'
import type { CollabResourceType, Profile, SharePermission } from '../../types'

type Tab = 'connections' | 'search' | 'email'

const NOTIFICATION_TYPE: Record<CollabResourceType, string> = {
  whiteboard: 'whiteboard_share',
  document: 'document_share',
  snippet: 'snippet_share',
}

const LABEL: Record<CollabResourceType, string> = {
  whiteboard: 'whiteboard',
  document: 'document',
  snippet: 'snippet',
}

interface ShareEntityModalProps {
  open: boolean
  onClose: () => void
  resourceType: CollabResourceType
  resourceId?: string
  resourceTitle?: string
}

/**
 * One invitation modal for whiteboards, documents and snippets — replaces the
 * near-identical ShareWhiteboardModal and ShareDocumentModal.
 *
 * Two behavioural changes from those: your accepted connections are offered
 * first (no typing required), and the share row lands as `pending`, so the
 * recipient accepts or declines it from /invitations rather than being handed
 * access unannounced.
 */
export function ShareEntityModal({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
}: ShareEntityModalProps) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation } = useCreateConversation()
  const { sendMessage } = useSendMessage()
  const { connections, loading: connectionsLoading } = useMyConnections(auth.user?.id)

  const [tab, setTab] = useState<Tab>('connections')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile[]>([])
  const [permissions, setPermissions] = useState<Record<string, SharePermission>>({})
  const [showDropdown, setShowDropdown] = useState(false)
  const [email, setEmail] = useState('')
  const [emailPermission, setEmailPermission] = useState<SharePermission>('view')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const spec = RESOURCE_SPECS[resourceType]
  const label = LABEL[resourceType]

  const displayName = () => {
    const profile = auth.profile
    if (profile?.display_name) return profile.display_name
    const emailAddr = auth.user?.email
    if (emailAddr) return emailAddr.split('@')[0]
    return 'Someone'
  }

  // The other party of each accepted connection, minus anyone already picked.
  const connectionProfiles = useMemo(() => {
    const myId = auth.user?.id
    const selectedIds = new Set(selected.map((u) => u.id))
    return (connections || [])
      .map((c) => (c.requester_id === myId ? c.addressee : c.requester))
      .filter((p): p is Profile => !!p && !selectedIds.has(p.id))
  }, [connections, auth.user?.id, selected])

  // Refs keep the debounced callback (created once) reading fresh values.
  const authRef = useRef(auth)
  authRef.current = auth
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const searchUsersRef = useRef(searchUsers)
  searchUsersRef.current = searchUsers

  const debouncedSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        const userId = authRef.current.user?.id
        if (!q.trim() || !userId) {
          setResults([])
          setShowDropdown(false)
          return
        }
        try {
          const res = await searchUsersRef.current(q, userId)
          const selectedIds = new Set(selectedRef.current.map((u) => u.id))
          setResults(res.filter((r) => !selectedIds.has(r.id)))
          setShowDropdown(true)
        } catch {
          setResults([])
        }
      }, 300),
    []
  )

  const handleInput = (value: string) => {
    setQuery(value)
    debouncedSearch(value)
  }

  const selectUser = (user: Profile) => {
    setSelected((prev) => [...prev, user])
    setPermissions((prev) => ({ ...prev, [user.id]: 'view' }))
    setResults((prev) => prev.filter((r) => r.id !== user.id))
    setQuery('')
    setShowDropdown(false)
  }

  const removeUser = (userId: string) => {
    setSelected((prev) => prev.filter((u) => u.id !== userId))
    setPermissions((prev) => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }

  const togglePermission = (userId: string) => {
    setPermissions((prev) => ({ ...prev, [userId]: prev[userId] === 'edit' ? 'view' : 'edit' }))
  }

  const closeAndReset = () => {
    setSelected([])
    setPermissions({})
    setQuery('')
    setEmail('')
    setResults([])
    setSuccess(null)
    setError(null)
    onClose()
  }

  const handleShare = async () => {
    const currentUserId = auth.user?.id
    if (!currentUserId || selected.length === 0) return
    if (!resourceId) {
      setError(`Save this ${label} before inviting anyone.`)
      return
    }

    setSending(true)
    setError(null)

    try {
      const link = `${window.location.origin}${spec.href(resourceId)}`
      const titleText = resourceTitle || `a ${label}`

      for (const user of selected) {
        const perm = permissions[user.id] || 'view'

        // Re-inviting someone who already accepted must not knock them back to
        // pending — that would revoke live access — so an accepted row only
        // has its permission adjusted.
        const { data: existing } = await (supabase.from(spec.shareTable) as any)
          .select('id, status')
          .eq(spec.fkColumn, resourceId)
          .eq('shared_with', user.id)
          .maybeSingle()

        const { error: shareError } = await (supabase.from(spec.shareTable) as any).upsert(
          {
            [spec.fkColumn]: resourceId,
            shared_with: user.id,
            shared_by: currentUserId,
            permission: perm,
            // Pending until the recipient accepts in /invitations.
            status: existing?.status === 'accepted' ? 'accepted' : 'pending',
          },
          { onConflict: `${spec.fkColumn},shared_with` }
        )
        if (shareError) throw shareError

        const message =
          `${displayName()} invited you to collaborate on the ${label} "${titleText}" ` +
          `(${perm === 'edit' ? 'can edit' : 'view only'}).\n\n` +
          `Accept the invitation: ${window.location.origin}/invitations\n${link}`

        const conversationId = await createConversation(currentUserId, user.id)
        await sendMessage({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: message,
        })

        sendNotification({
          userId: user.id,
          type: NOTIFICATION_TYPE[resourceType],
          title: 'Collaboration invitation',
          body: `${displayName()} invited you to "${titleText}"`,
          link: '/invitations',
        })
      }

      queryClient.invalidateQueries({ queryKey: keys.all('collab-invites') })
      setSuccess(`Invitation sent to ${selected.length} ${selected.length > 1 ? 'people' : 'person'}.`)
      setSelected([])
      setPermissions({})
    } catch (err: any) {
      setError(err?.message || `Failed to invite collaborators.`)
    } finally {
      setSending(false)
    }
  }

  const handleEmailInvite = async () => {
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    if (!resourceId) {
      setError(`Save this ${label} before inviting anyone.`)
      return
    }

    setSending(true)
    setError(null)

    try {
      const token = auth.session?.access_token
      if (!token) throw new Error('Your session expired — sign in again.')

      const res = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: trimmed,
          resource_type: resourceType,
          resource_id: resourceId,
          resource_title: resourceTitle || `Untitled ${label}`,
          permission: emailPermission,
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Failed to send the invitation.')

      queryClient.invalidateQueries({ queryKey: keys.all('collab-invites') })
      setSuccess(
        payload.existing_user
          ? `${trimmed} already has a KTIP account — we sent them an in-app invitation instead.`
          : `Invitation emailed to ${trimmed}. It expires in 14 days.`
      )
      setEmail('')
    } catch (err: any) {
      setError(err?.message || 'Failed to send the invitation.')
    } finally {
      setSending(false)
    }
  }

  const tabClass = (t: Tab) =>
    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-ktip-ocean-600 text-ktip-ocean-700'
        : 'border-transparent text-ktip-sand-500 hover:text-ktip-sand-800'
    }`

  const personRow = (user: Profile, onClick: () => void) => (
    <button
      key={user.id}
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ktip-sand-50 transition-colors text-left"
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${generateAvatarColor(
          user.display_name || user.id
        )}`}
      >
        {getInitials(user.display_name || 'U')}
      </div>
      <span className="text-sm text-ktip-sand-800 truncate flex-1">
        {user.display_name || 'Unnamed User'}
      </span>
    </button>
  )

  return (
    <Modal open={open} onClose={closeAndReset} title={`Invite to this ${label}`} size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-ktip-sand-200">
          <button type="button" className={tabClass('connections')} onClick={() => setTab('connections')}>
            <Users size={14} /> My connections
          </button>
          <button type="button" className={tabClass('search')} onClick={() => setTab('search')}>
            <Search size={14} /> All members
          </button>
          <button type="button" className={tabClass('email')} onClick={() => setTab('email')}>
            <Mail size={14} /> By email
          </button>
        </div>

        {tab === 'connections' && (
          <div className="border border-ktip-sand-200 rounded-lg bg-ktip-cream max-h-52 overflow-y-auto">
            {connectionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-ktip-sand-500">
                <Loader2 size={14} className="animate-spin" /> Loading connections…
              </div>
            ) : connectionProfiles.length === 0 ? (
              <p className="px-3 py-6 text-sm text-ktip-sand-500 text-center">
                No connections available. Try the All members tab, or invite someone by email.
              </p>
            ) : (
              connectionProfiles.map((user) => personRow(user, () => selectUser(user)))
            )}
          </div>
        )}

        {tab === 'search' && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
            <input
              type="text"
              placeholder="Search members by name..."
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 size={16} className="animate-spin text-ktip-ocean-400" />
              </div>
            )}
            {showDropdown && results.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 border border-ktip-sand-200 rounded-lg bg-ktip-cream shadow-medium max-h-40 overflow-y-auto">
                {results.map((user) => personRow(user, () => selectUser(user)))}
              </div>
            )}
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-3">
            <p className="text-sm text-ktip-sand-600">
              Invite someone who isn't on KTIP yet. They'll get an email with a link that grants
              access to this {label} once they sign up.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="partner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
              />
              <button
                type="button"
                onClick={() => setEmailPermission(emailPermission === 'edit' ? 'view' : 'edit')}
                className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-md text-xs font-medium transition-colors shrink-0 ${
                  emailPermission === 'edit'
                    ? 'bg-ktip-ocean-100 text-ktip-ocean-700 hover:bg-ktip-ocean-200'
                    : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
                }`}
              >
                {emailPermission === 'edit' ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> View</>}
              </button>
            </div>
            <button
              type="button"
              onClick={handleEmailInvite}
              disabled={sending || !email.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              {sending ? 'Sending…' : 'Send email invitation'}
            </button>
          </div>
        )}

        {/* Selected people (shared by the connections and search tabs) */}
        {tab !== 'email' && selected.length > 0 && (
          <div className="space-y-2">
            {selected.map((user) => {
              const perm = permissions[user.id] || 'view'
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-ktip-sand-50 border border-ktip-sand-200"
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${generateAvatarColor(
                      user.display_name || user.id
                    )}`}
                  >
                    {getInitials(user.display_name || 'U')}
                  </div>
                  <span className="text-sm text-ktip-sand-800 flex-1 truncate">
                    {user.display_name || 'User'}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePermission(user.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      perm === 'edit'
                        ? 'bg-ktip-ocean-100 text-ktip-ocean-700 hover:bg-ktip-ocean-200'
                        : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
                    }`}
                    title={perm === 'edit' ? 'Can edit — click for view only' : 'View only — click to allow editing'}
                  >
                    {perm === 'edit' ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> View</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeUser(user.id)}
                    className="text-ktip-sand-400 hover:text-red-500 transition-colors p-0.5"
                    aria-label={`Remove ${user.display_name || 'user'}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}

            <button
              type="button"
              onClick={handleShare}
              disabled={sending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sending
                ? 'Sending…'
                : `Invite ${selected.length} ${selected.length > 1 ? 'people' : 'person'}`}
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 text-sm text-ktip-tropical-700">
            <Check size={16} className="mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <X size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-ktip-sand-400">
          Invitations stay pending until the recipient accepts them from their invitations page.
        </p>
      </div>
    </Modal>
  )
}
