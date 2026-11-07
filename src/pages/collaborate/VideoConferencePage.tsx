import { Suspense, lazy, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { LocalUserChoices } from '@livekit/components-react'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../hooks/useMessages'
import { useMyConnections } from '../../hooks/useConnections'
import { isVenueVideoConfigured, useCallToken } from '../../hooks/useVenueRoomToken'
import {
  useCreateVideoCall,
  useEndVideoCall,
  useSetVideoCallLock,
  useVideoCallInfo,
} from '../../hooks/useVideoCalls'
import { callLink, callRefusal, isCallId, type CallRefusal, type VideoCallInfo } from '../../lib/video-calls'
import { sendNotification } from '../../lib/notify'
import { debounce, generateAvatarColor } from '../../lib/utils'
import {
  Check,
  Copy,
  Search,
  X,
  UserPlus,
  Send,
  ArrowLeft,
  Pen,
  FileText,
  Code,
  Users,
  Video,
  Lock,
  LockOpen,
  PhoneOff,
} from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { Button } from '../../components/ui/Button'
import type { Profile } from '../../types'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { Plural, Trans, useLingui } from '@lingui/react/macro'

// LiveKit is over 600 kB. Loaded only once someone is about to join a call,
// not for the start screen or a refusal notice.
const MeetingCall = lazy(() =>
  import('../../components/collaboration/MeetingCall').then((m) => ({ default: m.MeetingCall }))
)
const MeetingPreJoin = lazy(() =>
  import('../../components/collaboration/MeetingCall').then((m) => ({ default: m.MeetingPreJoin }))
)

const callSkeleton = <div className="h-[70svh] min-h-80 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />

/**
 * Video calls on LiveKit (migration 202).
 *
 * `?call=<id>` is a call. Without it the page offers to start one. The old
 * Jitsi page used `?room=<name>`, and those links still sit in people's
 * messages, so they get a short note instead of a dead end.
 *
 * Students are kept out here, in the database as well as on this page: a call
 * opened by link can shrink to two people, and safeguarding (064) never lets
 * a student into a one-to-one thread.
 */
export default function VideoConferencePage() {
  const { t } = useLingui()
  usePageTitle(t`Video Conference`)
  const auth = useAuth()
  const [params, setParams] = useSearchParams()

  const rawCall = params.get('call')
  const callId = isCallId(rawCall) ? rawCall : undefined
  const legacyRoom = !callId && (params.get('room') || rawCall)
  const isStudent = auth.roles.includes('student')

  let body: React.ReactNode
  if (!isVenueVideoConfigured()) {
    body = (
      <Notice icon={<Video size={18} />} title={t`Video calls are not switched on yet`}>
        <Trans>The video service has not been connected to this site. Calls will appear here once it is.</Trans>
      </Notice>
    )
  } else if (auth.profileLoading) {
    body = <div className="h-40 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
  } else if (isStudent) {
    body = (
      <Notice icon={<Lock size={18} />} title={t`Calls are not open to student accounts`}>
        <Trans>
          Calls started here can end up as one-to-one, so they are for other members only. You can still use video in an
          event venue, where every room has a host.
        </Trans>
      </Notice>
    )
  } else if (callId) {
    body = <CallView key={callId} callId={callId} onStartNew={() => setParams({})} />
  } else {
    body = <StartCall legacy={!!legacyRoom} onStarted={(id) => setParams({ call: id })} />
  }

  return (
    <>
      <PageHero
        eyebrow={t`Collaboration Tools`}
        title={t`Video Conference`}
        imageSeed="video"
        compact
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Collaborate`, href: '/collaborate' },
          { label: t`Video Conference` },
        ]}
      />

      <div className="bg-ktip-sand-50 py-8">
        <div className="max-w-page-narrow mx-auto px-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm">
            <Link
              to="/collaborate"
              className="inline-flex items-center gap-1.5 text-ktip-sand-600 hover:text-ktip-ocean-600 transition-colors font-medium"
            >
              <ArrowLeft size={14} />
              <Trans>Back to Collaborate Hub</Trans>
            </Link>
            <span className="text-ktip-sand-300">|</span>
            <Link to="/collaborate/whiteboards" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <Pen size={14} />
              <Trans>Whiteboards</Trans>
            </Link>
            <Link to="/collaborate/documents" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <FileText size={14} />
              <Trans>Documents</Trans>
            </Link>
            <Link to="/collaborate/snippets" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <Code size={14} />
              <Trans>Code</Trans>
            </Link>
          </div>

          {body}
        </div>
      </div>
    </>
  )
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-ktip-sand-200 bg-ktip-cream rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-2 text-ktip-sand-800">
        <span className="text-ktip-ocean-600">{icon}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="text-sm text-ktip-sand-600">{children}</div>
    </div>
  )
}

/** The words for each refusal 202's functions can raise. */
function useRefusalText() {
  const { t } = useLingui()
  return (reason: CallRefusal): string => {
    switch (reason) {
      case 'student':
        return t`Calls are not open to student accounts.`
      case 'suspended':
        return t`Your account is suspended, so you cannot use calls.`
      case 'not_found':
        return t`There is no call at this link. Check the link, or start a new call.`
      case 'ended':
        return t`This call has ended.`
      case 'locked':
        return t`The host has locked this call. Ask them to open it again.`
      case 'too_many':
        return t`You have started 30 calls today. You can start more tomorrow.`
      case 'not_host':
        return t`Only the person who started this call can change it.`
      case 'not_signed_in':
        return t`Sign in to join this call.`
      default:
        return t`Something went wrong. Try again.`
    }
  }
}

function StartCall({ legacy, onStarted }: { legacy: boolean; onStarted: (callId: string) => void }) {
  const { t } = useLingui()
  const toast = useToast()
  const refusalText = useRefusalText()
  const create = useCreateVideoCall()
  const [title, setTitle] = useState('')

  const start = () => {
    create.mutate(title, {
      onSuccess: onStarted,
      onError: (err) => toast.error(refusalText(callRefusal(err))),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {legacy && (
        <Notice icon={<Video size={18} />} title={t`This link is for the old video tool`}>
          <Trans>That tool has been retired. Start a new call below and share its link instead.</Trans>
        </Notice>
      )}
      <div className="border border-ktip-sand-200 bg-ktip-cream rounded-2xl p-6">
        <h2 className="text-base font-semibold text-ktip-sand-800 mb-3">
          <Trans>Start a call</Trans>
        </h2>
        <label htmlFor="call-title" className="block text-sm font-medium text-ktip-sand-700 mb-2">
          <Trans>Call name (optional)</Trans>
        </label>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            start()
          }}
        >
          <input
            id="call-title"
            type="text"
            maxLength={80}
            placeholder={t`e.g. Weekly team check-in`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 px-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-hidden transition-colors"
          />
          <Button type="submit" loading={create.isPending} icon={<Video size={16} />}>
            <Trans>Start call</Trans>
          </Button>
        </form>
        <p className="mt-2 text-xs text-ktip-sand-500">
          <Trans>
            You get a link to share. Anyone signed in who has it can join until you end the call, or for seven days.
          </Trans>
        </p>
      </div>
    </div>
  )
}

function CallView({ callId, onStartNew }: { callId: string; onStartNew: () => void }) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const refusalText = useRefusalText()
  const info = useVideoCallInfo(callId)
  const [choices, setChoices] = useState<LocalUserChoices | null>(null)
  const [left, setLeft] = useState(false)

  const open = !!info.data && !info.data.ended && (!info.data.locked || info.data.isHost)
  const token = useCallToken(callId, open && !!choices && !left)

  const displayName =
    auth.profile?.display_name || auth.user?.email?.split('@')[0] || t`Guest`

  if (info.isPending) {
    return <div className="h-40 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
  }

  if (info.error || !info.data) {
    return (
      <Notice icon={<Video size={18} />} title={t`Cannot open this call`}>
        <p>{refusalText(callRefusal(info.error))}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onStartNew}>
          <Trans>Start a new call</Trans>
        </Button>
      </Notice>
    )
  }

  const call = info.data

  if (call.ended) {
    return (
      <Notice icon={<PhoneOff size={18} />} title={t`This call has ended`}>
        <Button variant="outline" size="sm" className="mt-1" onClick={onStartNew}>
          <Trans>Start a new call</Trans>
        </Button>
      </Notice>
    )
  }

  if (call.locked && !call.isHost) {
    return (
      <Notice icon={<Lock size={18} />} title={t`This call is locked`}>
        <Trans>The host has stopped new people joining. Ask them to open it again, then reload this page.</Trans>
      </Notice>
    )
  }

  let stage: React.ReactNode
  if (left) {
    stage = (
      <div className="border border-ktip-sand-200 bg-ktip-cream rounded-2xl p-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ktip-sand-700">
          <Trans>You left the call.</Trans>
        </p>
        <Button size="sm" onClick={() => setLeft(false)}>
          <Trans>Rejoin</Trans>
        </Button>
      </div>
    )
  } else if (!choices) {
    stage = <MeetingPreJoin displayName={displayName} onJoin={setChoices} />
  } else if (token.error) {
    stage = (
      <Notice icon={<Video size={18} />} title={t`Cannot join this call`}>
        <p>{refusalText(callRefusal(token.error))}</p>
      </Notice>
    )
  } else if (!token.token) {
    stage = (
      <div className="h-[70svh] min-h-80 rounded-2xl bg-ktip-sand-900 flex items-center justify-center text-sm text-ktip-sand-200">
        <Trans>Connecting…</Trans>
      </div>
    )
  } else {
    stage = (
      <MeetingCall
        token={token.token}
        choices={choices}
        onLeave={() => {
          setLeft(true)
          // Ended by the host shows as "This call has ended" on the next read.
          void info.refetch()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <CallHeader call={call} onError={(err) => toast.error(refusalText(callRefusal(err)))} />
      <Suspense fallback={callSkeleton}>{stage}</Suspense>
      <InvitePanel call={call} />
    </div>
  )
}

function CallHeader({ call, onError }: { call: VideoCallInfo; onError: (err: unknown) => void }) {
  const { t } = useLingui()
  const lock = useSetVideoCallLock(call.id)
  const end = useEndVideoCall(call.id)
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(callLink(window.location.origin, call.id))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onError(new Error('copy failed'))
    }
  }

  const endForEveryone = () => {
    if (!confirm(t`End this call for everyone? Nobody will be able to rejoin it.`)) return
    end.mutate(undefined, { onError })
  }

  const hostName = call.hostName || t`a member`

  return (
    <div className="border border-ktip-sand-200 bg-ktip-cream rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ktip-sand-900 truncate">{call.title || t`Untitled call`}</h2>
        <p className="text-xs text-ktip-sand-500">
          {call.isHost ? <Trans>You started this call</Trans> : <Trans>Started by {hostName}</Trans>}
          {call.locked && (
            <>
              {' · '}
              <Trans>Locked: nobody new can join</Trans>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={copyLink}
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
        >
          {copied ? t`Copied` : t`Copy link`}
        </Button>
        {call.isHost && (
          <>
            <Button
              variant="outline"
              size="sm"
              loading={lock.isPending}
              onClick={() => lock.mutate(!call.locked, { onError })}
              icon={call.locked ? <LockOpen size={14} /> : <Lock size={14} />}
            >
              {call.locked ? t`Reopen` : t`Lock`}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={end.isPending}
              onClick={endForEveryone}
              icon={<PhoneOff size={14} />}
            >
              <Trans>End for everyone</Trans>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

const isStudentProfile = (p: Profile) => (p.roles ?? []).includes('student')

/**
 * Invite people by direct message and notification. Students are left out of
 * the pickers: they cannot join (202), and a DM to one would be refused (064).
 */
function InvitePanel({ call }: { call: VideoCallInfo }) {
  const { t } = useLingui()
  const auth = useAuth()
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
      .filter((p): p is Profile => !!p && !selectedIds.has(p.id) && !isStudentProfile(p))
  }, [connections, auth.user?.id, selectedUsers])

  // Refs keep the debounced search callback (created once) reading fresh values.
  const authRef = useRef(auth)
  authRef.current = auth
  const selectedUsersRef = useRef(selectedUsers)
  selectedUsersRef.current = selectedUsers
  const searchUsersRef = useRef(searchUsers)
  searchUsersRef.current = searchUsers

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
          if (!results) return
          const selectedIds = new Set(selectedUsersRef.current.map((u) => u.id))
          setSearchResults(results.filter((r) => !selectedIds.has(r.id) && !isStudentProfile(r)))
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

  const handleInvite = async () => {
    const currentUserId = auth.user?.id
    if (!currentUserId || selectedUsers.length === 0) return

    setInviting(true)
    setInviteError(null)
    try {
      const link = callLink(window.location.origin, call.id)
      const path = `/collaborate/video?call=${encodeURIComponent(call.id)}`
      const inviterName = auth.profile?.display_name || auth.user?.email?.split('@')[0] || t`A member`
      const callName = call.title || t`a video call`
      const inviteMessage = t`📹 ${inviterName} invited you to ${callName}.\n\nJoin here: ${link}`

      for (const user of selectedUsers) {
        const conversationId = await createConversation(currentUserId, user.id)
        await sendMessage({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: inviteMessage,
        })
        // In-app notification (the RPC enforces recipient preferences).
        sendNotification({
          userId: user.id,
          type: 'video_invite',
          title: t`Video call invitation`,
          body: t`${inviterName} invited you to ${callName}`,
          link: path,
        })
      }
      setInviteSuccess(true)
      setSelectedUsers([])
      setTimeout(() => setInviteSuccess(false), 3000)
    } catch (err: any) {
      setInviteError(err?.message || t`Failed to send invitations. Please try again.`)
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="border border-ktip-sand-200 bg-ktip-cream rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus size={18} className="text-ktip-ocean-600" />
        <h2 className="text-sm font-semibold text-ktip-sand-800"><Trans>Invite Participants</Trans></h2>
      </div>

      {connectionProfiles.length > 0 && (
        <div className="mb-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ktip-sand-500 mb-2">
            <Users size={12} />
            <Trans>My connections</Trans>
          </p>
          <div className="flex flex-wrap gap-2">
            {connectionProfiles.slice(0, 12).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => selectUser(user)}
                className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-ktip-sand-200 bg-ktip-cream hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/40 text-xs font-medium text-ktip-sand-700 transition-colors"
              >
                <DiamondAvatar name={user.display_name || t`User`} size={20} />
                {user.display_name || t`User`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
        <input
          type="text"
          placeholder={t`Search all members...`}
          value={inviteQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          onFocus={() => {
            if (searchResults.length > 0) setShowDropdown(true)
          }}
          onBlur={() => {
            // Delay to allow click on dropdown item
            setTimeout(() => setShowDropdown(false), 200)
          }}
          className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-hidden transition-colors text-sm"
        />
        {searchLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-ktip-ocean-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showDropdown && searchResults.length > 0 && (
        <div className="mt-1 border border-ktip-sand-200 rounded-lg bg-ktip-cream shadow-medium max-h-48 overflow-y-auto">
          {searchResults.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => selectUser(user)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-ktip-sand-50 transition-colors text-left"
            >
              <DiamondAvatar name={user.display_name || t`User`} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ktip-sand-800 truncate">
                  {user.display_name || t`Unnamed User`}
                </p>
                {user.country && <p className="text-xs text-ktip-sand-500">{user.country}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && searchResults.length === 0 && inviteQuery.trim() && !searchLoading && (
        <div className="mt-1 border border-ktip-sand-200 rounded-lg bg-ktip-cream shadow-medium px-3 py-3">
          <p className="text-sm text-ktip-sand-500 text-center"><Trans>No users found</Trans></p>
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedUsers.map((user) => {
            const color = generateAvatarColor(user.display_name || user.id)
            return (
              <span
                key={user.id}
                className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-medium text-white ${color}`}
              >
                <DiamondAvatar name={user.display_name || t`User`} size={20} colorClass="bg-white/20" />
                {user.display_name || t`User`}
                <button
                  type="button"
                  onClick={() => removeUser(user.id)}
                  aria-label={t`Remove`}
                  className="ml-0.5 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {selectedUsers.length > 0 && (
        <Button className="mt-4" onClick={handleInvite} loading={inviting} disabled={inviting} icon={<Send size={16} />}>
          {inviting ? (
            t`Sending invites...`
          ) : (
            <Plural value={selectedUsers.length} one="Invite # person" other="Invite # people" />
          )}
        </Button>
      )}

      {inviteSuccess && (
        <div className="mt-3 flex items-center gap-2 text-sm text-ktip-tropical-700">
          <Check size={16} />
          <span><Trans>Invitations sent. Each person gets a message with the call link.</Trans></span>
        </div>
      )}

      {inviteError && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
          <X size={16} />
          <span>{inviteError}</span>
        </div>
      )}

      <p className="mt-3 text-xs text-ktip-sand-400">
        <Trans>Search for users to invite. They'll receive a direct message with a link to join the call.</Trans>
      </p>
    </div>
  )
}
