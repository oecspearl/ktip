import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  useMyCollabInvites,
  useSentCollabInvites,
  useSentEmailInvites,
  useCollabInviteMutations,
  RESOURCE_SPECS,
} from '../hooks/useCollabInvites'
import { useMyProjectInvites, useProjectMemberMutations } from '../hooks/useProjectMembers'
import {
  useIncomingJoinRequests,
  useProjectJoinRequestMutations,
} from '../hooks/useProjectJoinRequests'
import {
  useIncomingEventRegistrations,
  useEventRegistrationDecision,
} from '../hooks/useEventRegistrationRequests'
import { usePendingRequests, useConnectionMutations } from '../hooks/useConnections'
import { PageHero } from '../components/layout/PageHero'
import { formatRelativeTime } from '../lib/utils'
import { ATTENDANCE_TYPE_LABELS } from '../lib/constants'
import {
  Check,
  X,
  Inbox,
  Pen,
  FileText,
  Code2,
  FolderKanban,
  CalendarCheck,
  UserPlus,
  Mail,
  Send,
  Eye,
  Pencil,
} from 'lucide-react'
import type { CollabInvite, CollabResourceType, Profile } from '../types'
import { DiamondAvatar } from '../components/ui/DiamondAvatar'

const RESOURCE_ICON: Record<CollabResourceType, typeof Pen> = {
  whiteboard: Pen,
  document: FileText,
  snippet: Code2,
}

function Avatar({ profile }: { profile?: Profile | null }) {
  const name = profile?.display_name || 'User'
  return (
    <DiamondAvatar name={name} size={36} />
  )
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Inbox
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ktip-sand-800 mb-3">
        <Icon size={18} className="text-ktip-sand-400" />
        {title}
        <span className="text-sm font-normal text-ktip-sand-500">({count})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-ktip-sand-200 bg-ktip-cream">
      {children}
    </div>
  )
}

function AcceptDecline({
  onAccept,
  onDecline,
  disabled,
  acceptLabel = 'Accept',
  declineLabel = 'Decline',
}: {
  onAccept: () => void
  onDecline: () => void
  disabled?: boolean
  acceptLabel?: string
  declineLabel?: string
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-brand text-sm font-medium disabled:opacity-50"
      >
        <Check size={14} />
        {acceptLabel}
      </button>
      <button
        type="button"
        onClick={onDecline}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ktip-sand-600 hover:bg-ktip-sand-100 text-sm font-medium transition-colors disabled:opacity-50"
      >
        <X size={14} />
        {declineLabel}
      </button>
    </div>
  )
}

/**
 * One inbox for every kind of pending invitation. Before this page existed,
 * project invites had no UI at all (useMyProjectInvites was unused) and
 * collaboration shares were only ever announced by a notification.
 */
export default function InvitationsPage() {
  usePageTitle('Invitations')
  const auth = useAuth()
  const navigate = useNavigate()
  const myId = auth.user?.id
  const myName = auth.profile?.display_name || auth.user?.email?.split('@')[0] || 'Someone'

  const collab = useMyCollabInvites(myId)
  const sent = useSentCollabInvites(myId)
  const emailInvites = useSentEmailInvites(myId)
  const projectInvites = useMyProjectInvites(myId)
  // The other direction: people asking to join projects I own (migration 079).
  const joinRequests = useIncomingJoinRequests(myId)
  // Same shape again, for events I organize (migration 096). Before this, a
  // registration confirmed itself and the organizer was never asked.
  const eventRegistrations = useIncomingEventRegistrations(myId)
  const connectionRequests = usePendingRequests(myId)

  const collabMutations = useCollabInviteMutations()
  const projectMutations = useProjectMemberMutations()
  const joinRequestMutations = useProjectJoinRequestMutations()
  const registrationDecision = useEventRegistrationDecision()
  const connectionMutations = useConnectionMutations()

  const respondToCollab = (invite: CollabInvite, accept: boolean) => {
    collabMutations
      .respondToInvite({ invite, accept, responderName: myName })
      .then(() => {
        if (accept) navigate(RESOURCE_SPECS[invite.resource_type].href(invite.resource_id))
      })
      .catch(() => {})
  }

  const collabCount = collab.invites?.length ?? 0
  const projectCount = projectInvites.invites?.length ?? 0
  const joinRequestCount = joinRequests.requests?.length ?? 0
  const eventRegistrationCount = eventRegistrations.registrations?.length ?? 0
  const connectionCount = connectionRequests.requests?.length ?? 0
  const sentCount = (sent.invites?.length ?? 0) + (emailInvites.invites?.length ?? 0)
  const pendingTotal =
    collabCount + projectCount + joinRequestCount + eventRegistrationCount + connectionCount

  const loading =
    collab.loading ||
    projectInvites.loading ||
    joinRequests.loading ||
    eventRegistrations.loading ||
    connectionRequests.loading ||
    sent.loading

  return (
    <>
      <PageHero
        eyebrow="Your Network"
        title="Invitations"
        subtitle="Collaboration, project, event and connection requests waiting on you."
        imageSeed="invitations"
        compact
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Invitations' }]}
      />

      <div className="bg-ktip-sand-50 py-8 min-h-[50vh]">
        <div className="max-w-page-narrow mx-auto px-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl border border-ktip-sand-200 bg-ktip-cream animate-pulse" />
              ))}
            </div>
          ) : pendingTotal === 0 && sentCount === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Inbox size={32} className="text-ktip-sand-400" />
              </div>
              <h3 className="text-lg font-semibold text-ktip-sand-800 mb-1">No invitations</h3>
              <p className="text-sm text-ktip-sand-500">
                When someone invites you to collaborate, it will show up here.
              </p>
            </div>
          ) : (
            <div data-tutorial="invitations-list">
              <Section icon={Inbox} title="Collaboration invitations" count={collabCount}>
                {collab.invites?.map((invite) => {
                  const Icon = RESOURCE_ICON[invite.resource_type]
                  return (
                    <Row key={`${invite.resource_type}-${invite.id}`}>
                      <Avatar profile={invite.inviter} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ktip-sand-900">
                          <span className="font-semibold">
                            {invite.inviter?.display_name || 'Someone'}
                          </span>{' '}
                          invited you to the {invite.resource_type}{' '}
                          <span className="font-semibold">{invite.resource_title}</span>
                        </p>
                        <p className="flex items-center gap-2 text-xs text-ktip-sand-500 mt-1">
                          <Icon size={12} />
                          <span className="inline-flex items-center gap-1">
                            {invite.permission === 'edit' ? <Pencil size={11} /> : <Eye size={11} />}
                            {invite.permission === 'edit' ? 'Can edit' : 'View only'}
                          </span>
                          · {formatRelativeTime(invite.created_at)}
                        </p>
                      </div>
                      <AcceptDecline
                        disabled={collabMutations.loading}
                        onAccept={() => respondToCollab(invite, true)}
                        onDecline={() => respondToCollab(invite, false)}
                      />
                    </Row>
                  )
                })}
              </Section>

              <Section icon={FolderKanban} title="Project team invitations" count={projectCount}>
                {projectInvites.invites?.map((member: any) => (
                  <Row key={member.id}>
                    <div className="w-9 h-9 rounded-full bg-ktip-tropical-100 text-ktip-tropical-700 flex items-center justify-center shrink-0">
                      <FolderKanban size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ktip-sand-900">
                        You've been invited to join{' '}
                        <span className="font-semibold">
                          {member.project?.title || 'a project'}
                        </span>{' '}
                        as {member.role}
                      </p>
                      <p className="text-xs text-ktip-sand-500 mt-1">
                        {formatRelativeTime(member.created_at)}
                      </p>
                    </div>
                    <AcceptDecline
                      disabled={projectMutations.loading}
                      onAccept={() => {
                        projectMutations
                          .respondToInvite({ membershipId: member.id, accept: true })
                          .then(() => projectInvites.refetch())
                          .catch(() => {})
                      }}
                      onDecline={() => {
                        projectMutations
                          .respondToInvite({ membershipId: member.id, accept: false })
                          .then(() => projectInvites.refetch())
                          .catch(() => {})
                      }}
                    />
                  </Row>
                ))}
              </Section>

              <Section
                icon={FolderKanban}
                title="Requests to collaborate on your projects"
                count={joinRequestCount}
              >
                {joinRequests.requests?.map((req) => (
                  <Row key={req.id}>
                    <Avatar profile={req.requester} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ktip-sand-900">
                        <span className="font-semibold">
                          {req.requester?.display_name || 'Someone'}
                        </span>{' '}
                        wants to join{' '}
                        <span className="font-semibold">{req.project?.title || 'your project'}</span>
                      </p>
                      {req.message && (
                        <p className="mt-1 text-xs italic text-ktip-sand-600">"{req.message}"</p>
                      )}
                      <p className="text-xs text-ktip-sand-500 mt-1">
                        {formatRelativeTime(req.created_at)}
                      </p>
                    </div>
                    <AcceptDecline
                      disabled={joinRequestMutations.deciding}
                      onAccept={() => {
                        joinRequestMutations
                          .decideRequest({
                            requestId: req.id,
                            approve: true,
                            requesterId: req.requester_id,
                            projectId: req.project_id,
                            projectTitle: req.project?.title || 'your project',
                          })
                          .catch(() => {})
                      }}
                      onDecline={() => {
                        joinRequestMutations
                          .decideRequest({
                            requestId: req.id,
                            approve: false,
                            requesterId: req.requester_id,
                            projectId: req.project_id,
                            projectTitle: req.project?.title || 'your project',
                          })
                          .catch(() => {})
                      }}
                    />
                  </Row>
                ))}
              </Section>

              <Section
                icon={CalendarCheck}
                title="Registrations waiting on you"
                count={eventRegistrationCount}
              >
                {eventRegistrations.registrations?.map((reg) => (
                  <Row key={reg.id}>
                    <Avatar profile={reg.user} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ktip-sand-900">
                        <span className="font-semibold">
                          {reg.user?.display_name || 'Someone'}
                        </span>{' '}
                        wants to attend{' '}
                        <span className="font-semibold">{reg.event?.title || 'your event'}</span> as a{' '}
                        {(ATTENDANCE_TYPE_LABELS[reg.attendance_type] || 'participant').toLowerCase()}
                      </p>
                      <p className="text-xs text-ktip-sand-500 mt-1">
                        {formatRelativeTime(reg.created_at)}
                      </p>
                    </div>
                    <AcceptDecline
                      disabled={registrationDecision.deciding}
                      onAccept={() => {
                        registrationDecision
                          .decideRegistration({
                            rsvpId: reg.id,
                            approve: true,
                            registrantId: reg.user_id,
                            eventId: reg.event_id,
                            eventTitle: reg.event?.title || 'your event',
                          })
                          .catch(() => {})
                      }}
                      onDecline={() => {
                        registrationDecision
                          .decideRegistration({
                            rsvpId: reg.id,
                            approve: false,
                            registrantId: reg.user_id,
                            eventId: reg.event_id,
                            eventTitle: reg.event?.title || 'your event',
                          })
                          .catch(() => {})
                      }}
                    />
                  </Row>
                ))}
              </Section>

              <Section icon={UserPlus} title="Connection requests" count={connectionCount}>
                {connectionRequests.requests?.map((request) => (
                  <Row key={request.id}>
                    <Avatar profile={request.requester} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ktip-sand-900">
                        <span className="font-semibold">
                          {request.requester?.display_name || 'Someone'}
                        </span>{' '}
                        wants to connect with you
                      </p>
                      <p className="text-xs text-ktip-sand-500 mt-1">
                        {formatRelativeTime(request.created_at)}
                      </p>
                    </div>
                    <AcceptDecline
                      disabled={connectionMutations.loading}
                      onAccept={() => {
                        if (!myId) return
                        connectionMutations
                          .respondToRequest({
                            connectionId: request.id,
                            accept: true,
                            myId,
                            myName,
                            requesterId: request.requester_id,
                          })
                          .then(() => connectionRequests.refetch())
                          .catch(() => {})
                      }}
                      onDecline={() => {
                        if (!myId) return
                        connectionMutations
                          .respondToRequest({
                            connectionId: request.id,
                            accept: false,
                            myId,
                            myName,
                            requesterId: request.requester_id,
                          })
                          .then(() => connectionRequests.refetch())
                          .catch(() => {})
                      }}
                    />
                  </Row>
                ))}
              </Section>

              <Section icon={Send} title="Sent — awaiting a response" count={sentCount}>
                {sent.invites?.map((invite) => {
                  const Icon = RESOURCE_ICON[invite.resource_type]
                  return (
                    <Row key={`sent-${invite.resource_type}-${invite.id}`}>
                      <Avatar profile={invite.recipient} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ktip-sand-900">
                          <span className="font-semibold">
                            {invite.recipient?.display_name || 'Someone'}
                          </span>{' '}
                          hasn't answered yet
                        </p>
                        <p className="flex items-center gap-2 text-xs text-ktip-sand-500 mt-1">
                          <Icon size={12} />
                          {invite.resource_title} · {formatRelativeTime(invite.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          collabMutations.revokeInvite(invite).catch(() => {})
                        }}
                        disabled={collabMutations.loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ktip-sand-600 hover:bg-red-50 hover:text-red-600 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                      >
                        <X size={14} />
                        Withdraw
                      </button>
                    </Row>
                  )
                })}

                {emailInvites.invites?.map((invite) => (
                  <Row key={`email-${invite.id}`}>
                    <div className="w-9 h-9 rounded-full bg-ktip-sun-100 text-ktip-sun-700 flex items-center justify-center shrink-0">
                      <Mail size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ktip-sand-900 truncate">
                        Emailed <span className="font-semibold">{invite.email}</span>
                      </p>
                      <p className="text-xs text-ktip-sand-500 mt-1">
                        {invite.resource_title || 'KTIP invitation'} · expires{' '}
                        {formatRelativeTime(invite.expires_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        collabMutations.revokeEmailInvite(invite.id).catch(() => {})
                      }}
                      disabled={collabMutations.loading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ktip-sand-600 hover:bg-red-50 hover:text-red-600 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                    >
                      <X size={14} />
                      Revoke
                    </button>
                  </Row>
                ))}
              </Section>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
