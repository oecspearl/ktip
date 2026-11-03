import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Plus, Search, Send, UserPlus, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../../contexts/AuthContext'
import { useMemberPanel } from '../../../contexts/MemberPanelContext'
import { useToast } from '../../../contexts/ToastContext'
import { useEventTeams } from '../../../hooks/useEventTeams'
import type { EventTeam } from '../../../hooks/useEventTeams'
import { useUpdateVenueProfile, useVenueDiscoverable, useVenueRoster } from '../../../hooks/useVenue'
import {
  useApplyToTeam,
  useCloseOpening,
  useInviteToTeam,
  usePostOpening,
  useRespondToRequest,
  useTeamOpenings,
  useTeamRequests,
  useWithdrawRequest,
} from '../../../hooks/useTeamFinder'
import {
  OPENING_TITLE_MAX,
  REQUEST_MESSAGE_MAX,
  canJoinTeams,
  filterTeams,
  isCaptain,
  isFull,
  openingsByTeam,
  parseSkills,
  pendingBetween,
  splitRequests,
  teamOf,
} from '../../../lib/team-finder'
import type { TeamOpening, TeamRequest, TeamRequestStatus } from '../../../lib/team-finder'
import { cn } from '../../../lib/utils'
import { Button } from '../../ui/Button'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { RoomPanel, RoomPanelEmpty, panelScroll, panelShell } from './RoomPanel'
import type { VenueOccupant, VenueRole } from '../../../types'

type Tab = 'teams' | 'people' | 'requests'

const AVATAR = 26
const chip =
  'inline-flex items-center gap-1 rounded-full border border-ktip-sand-200 bg-ktip-sand-50 px-2 py-0.5 text-micro text-ktip-sand-700'
const field = 'w-full rounded-lg border border-ktip-sand-200 bg-white px-3 py-2 text-sm text-ktip-sand-900'

interface Props {
  eventId: string
  viewerRole: VenueRole
  isHost: boolean
  occupants: VenueOccupant[]
  fill?: boolean
}

/**
 * The Team Finder (migration 191): every team with what it is looking for,
 * everyone looking for a team, and the requests running between them.
 *
 * Venue-wide, like the "looking for a team" panel, because a team is formed
 * across the whole event and not among whoever is in this room. Spectators
 * and judges see the same lists with no buttons. The server enforces that
 * anyway; the buttons are hidden so nobody is offered an error.
 */
export function TeamFinderPanel({ eventId, viewerRole, isHost, occupants, fill }: Props) {
  const { t } = useLingui()
  const { user } = useAuth()
  const userId = user?.id
  const { teams, loading } = useEventTeams(eventId)
  const { openings } = useTeamOpenings(eventId)
  const myTeam = teamOf(teams, userId)
  const canJoin = canJoinTeams(viewerRole)
  const canAct = canJoin || !!myTeam
  const { requests } = useTeamRequests(eventId, canAct || isHost)
  const [tab, setTab] = useState<Tab>('teams')

  const { incoming, outgoing } = useMemo(
    () => splitRequests(requests, userId, myTeam?.id),
    [requests, userId, myTeam?.id]
  )
  const waiting = incoming.filter((r) => r.status === 'pending').length

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'teams', label: t`Teams` },
    { id: 'people', label: t`People looking` },
    ...(canAct ? [{ id: 'requests' as Tab, label: t`Requests`, badge: waiting || undefined }] : []),
  ]

  return (
    <RoomPanel title={t`Team Finder`} meta={teams.length || undefined} className={panelShell(fill)}>
      <div role="tablist" aria-label={t`Team Finder`} className="flex gap-1 overflow-x-auto border-b border-ktip-sand-100 px-3">
        {tabs.map(({ id, label, badge }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-sm font-semibold',
              tab === id
                ? 'border-ktip-ocean-600 text-ktip-sand-900'
                : 'border-transparent text-ktip-sand-500 hover:text-ktip-sand-800'
            )}
          >
            {label}
            {badge ? (
              <span className="rounded-full bg-ktip-ocean-600 px-1.5 text-micro font-bold text-white">{badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" className={panelScroll(fill, 'max-h-[32rem]')}>
        {loading ? (
          <div className="space-y-2 p-4">
            <div className="h-3 w-2/3 animate-pulse-soft rounded bg-ktip-sand-100" />
            <div className="h-3 w-1/2 animate-pulse-soft rounded bg-ktip-sand-100" />
          </div>
        ) : tab === 'teams' ? (
          <TeamsTab
            eventId={eventId}
            teams={teams}
            openings={openings}
            requests={requests}
            myTeam={myTeam}
            canJoin={canJoin}
            isHost={isHost}
            onSeeRequests={() => setTab('requests')}
          />
        ) : tab === 'people' ? (
          <PeopleTab
            eventId={eventId}
            teams={teams}
            requests={requests}
            myTeam={myTeam}
            canJoin={canJoin}
            occupants={occupants}
          />
        ) : (
          <RequestsTab
            eventId={eventId}
            teams={teams}
            incoming={incoming}
            outgoing={outgoing}
          />
        )}
      </div>
    </RoomPanel>
  )
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function TeamsTab({
  eventId,
  teams,
  openings,
  requests,
  myTeam,
  canJoin,
  isHost,
  onSeeRequests,
}: {
  eventId: string
  teams: EventTeam[]
  openings: TeamOpening[]
  requests: TeamRequest[]
  myTeam: EventTeam | null
  canJoin: boolean
  isHost: boolean
  onSeeRequests: () => void
}) {
  const { t } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [applyingTo, setApplyingTo] = useState<string | null>(null)
  const closeOpening = useCloseOpening(eventId)

  const byTeam = useMemo(() => openingsByTeam(openings), [openings])
  const shown = useMemo(() => filterTeams(teams, openings, query), [teams, openings, query])
  const captain = isCaptain(myTeam, user?.id)

  if (!teams.length) {
    return (
      <RoomPanelEmpty>
        <Trans>No teams yet. Form one from any free Homebase and it will show up here.</Trans>
      </RoomPanelEmpty>
    )
  }

  return (
    <div className="space-y-3 p-3">
      {captain && myTeam && <PostOpeningForm eventId={eventId} team={myTeam} />}

      <label className="relative block">
        <span className="sr-only">
          <Trans>Search teams</Trans>
        </span>
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t`Search teams and the roles they need`}
          className={cn(field, 'pl-8')}
        />
      </label>

      {shown.length === 0 ? (
        <p className="px-1 py-4 text-sm text-ktip-sand-500">
          <Trans>No team matches that search.</Trans>
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((team) => {
            const mine = team.id === myTeam?.id
            const teamOpenings = byTeam.get(team.id) ?? []
            const pending = pendingBetween(requests, team.id, user?.id)
            const full = isFull(team)
            const canClose = (mine && captain) || isHost

            return (
              <li key={team.id} className="rounded-xl border border-ktip-sand-100 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-sm font-bold text-ktip-sand-900">{team.name}</h3>
                      {mine && (
                        <span className="rounded-full bg-ktip-ocean-50 px-2 py-0.5 text-micro font-semibold text-ktip-ocean-700">
                          <Trans>Your team</Trans>
                        </span>
                      )}
                    </div>
                    {team.tagline && <p className="mt-0.5 text-xs text-ktip-sand-600">{team.tagline}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {team.members.map((m) => (
                      <DiamondAvatar
                        key={m.user_id}
                        size={AVATAR}
                        src={m.avatar_url}
                        name={m.display_name || t`Teammate`}
                        title={m.display_name || undefined}
                      />
                    ))}
                    <span
                      className={cn('ml-1 text-xs font-medium', full ? 'text-ktip-sand-400' : 'text-ktip-sand-600')}
                      aria-label={t`${team.members.length} of ${team.max_size} places taken`}
                    >
                      {team.members.length}/{team.max_size}
                    </span>
                  </div>
                </div>

                {teamOpenings.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t`Openings`}>
                    {teamOpenings.map((o) => (
                      <li key={o.id} className={cn(chip, 'border-ktip-ocean-200 bg-ktip-ocean-50 text-ktip-ocean-800')}>
                        <span className="font-semibold">{o.title}</span>
                        {o.skills.length > 0 && <span className="text-ktip-ocean-600">{o.skills.join(', ')}</span>}
                        {canClose && (
                          <button
                            type="button"
                            onClick={() =>
                              closeOpening.mutate(o.id, {
                                onSuccess: () => toast.success(t`Opening closed`),
                                onError: (err: any) => toast.error(err?.message || t`Could not close the opening`),
                              })
                            }
                            disabled={closeOpening.isPending}
                            aria-label={t`Close the opening for ${o.title}`}
                            title={t`Close this opening`}
                            className="-mr-1 rounded-full p-0.5 hover:bg-ktip-ocean-100"
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!mine && canJoin && !myTeam && (
                  <div className="mt-2">
                    {pending ? (
                      <button type="button" onClick={onSeeRequests} className={cn(chip, 'hover:border-ktip-ocean-300')}>
                        {pending.kind === 'apply' ? <Trans>You applied</Trans> : <Trans>They invited you</Trans>}
                      </button>
                    ) : full ? (
                      <span className={chip}>
                        <Trans>Full</Trans>
                      </span>
                    ) : applyingTo === team.id ? (
                      <ApplyForm
                        eventId={eventId}
                        team={team}
                        openings={teamOpenings}
                        onDone={() => setApplyingTo(null)}
                      />
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setApplyingTo(team.id)}>
                        <Trans>Apply</Trans>
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ApplyForm({
  eventId,
  team,
  openings,
  onDone,
}: {
  eventId: string
  team: EventTeam
  openings: TeamOpening[]
  onDone: () => void
}) {
  const { t } = useLingui()
  const toast = useToast()
  const apply = useApplyToTeam(eventId)
  const [message, setMessage] = useState('')
  const [openingId, setOpeningId] = useState('')

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        apply.mutate(
          { teamId: team.id, message, openingId: openingId || null },
          {
            onSuccess: () => {
              toast.success(t`Application sent to ${team.name}`)
              onDone()
            },
            onError: (err: any) => toast.error(err?.message || t`Could not send the application`),
          }
        )
      }}
    >
      {openings.length > 0 && (
        <label className="block text-xs font-medium text-ktip-sand-700">
          <Trans>Applying for</Trans>
          <select value={openingId} onChange={(e) => setOpeningId(e.target.value)} className={cn(field, 'mt-1')}>
            <option value="">{t`Any role`}</option>
            {openings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <MessageBox
        value={message}
        onChange={setMessage}
        label={t`A short note to the team`}
        placeholder={t`What you would bring to the team`}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={apply.isPending} icon={<Send size={14} aria-hidden="true" />}>
          <Trans>Send</Trans>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </form>
  )
}

function PostOpeningForm({ eventId, team }: { eventId: string; team: EventTeam }) {
  const { t } = useLingui()
  const toast = useToast()
  const post = usePostOpening(eventId)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [skills, setSkills] = useState('')

  if (!open) {
    return (
      <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setOpen(true)}>
        <Trans>Post an opening</Trans>
      </Button>
    )
  }

  return (
    <form
      className="space-y-2 rounded-xl border border-ktip-sand-100 bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim().length < 2) return
        post.mutate(
          { teamId: team.id, title: title.trim(), skills: parseSkills(skills) },
          {
            onSuccess: () => {
              toast.success(t`Opening posted`)
              setTitle('')
              setSkills('')
              setOpen(false)
            },
            onError: (err: any) => toast.error(err?.message || t`Could not post the opening`),
          }
        )
      }}
    >
      <label className="block text-xs font-medium text-ktip-sand-700">
        <Trans>Who you need</Trans>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={OPENING_TITLE_MAX}
          required
          placeholder={t`For example, UI designer`}
          className={cn(field, 'mt-1')}
        />
      </label>
      <label className="block text-xs font-medium text-ktip-sand-700">
        <Trans>Skills, separated by commas (optional)</Trans>
        <input
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          placeholder={t`Figma, accessibility`}
          className={cn(field, 'mt-1')}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={post.isPending}>
          <Trans>Post</Trans>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// People looking
// ---------------------------------------------------------------------------

function PeopleTab({
  eventId,
  teams,
  requests,
  myTeam,
  canJoin,
  occupants,
}: {
  eventId: string
  teams: EventTeam[]
  requests: TeamRequest[]
  myTeam: EventTeam | null
  canJoin: boolean
  occupants: VenueOccupant[]
}) {
  const { t } = useLingui()
  const { user } = useAuth()
  const { openMember } = useMemberPanel()
  const { discoverable } = useVenueDiscoverable(eventId)
  const [inviting, setInviting] = useState<string | null>(null)

  // looking_for_team is cleared when someone joins a team (191), but a row
  // can still be stale for a minute. Someone on a team is not looking.
  const onATeam = useMemo(() => new Set(teams.flatMap((x) => x.members.map((m) => m.user_id))), [teams])
  const live = useMemo(() => new Map(occupants.map((o) => [o.user_id, o])), [occupants])
  const people = discoverable.filter((m) => !onATeam.has(m.user_id))
  const canInvite = !!myTeam && !isFull(myTeam)

  return (
    <div>
      {canJoin && !myTeam && <LookingToggle eventId={eventId} />}

      {people.length === 0 ? (
        <RoomPanelEmpty>
          <Trans>Nobody is looking for a team right now.</Trans>
        </RoomPanelEmpty>
      ) : (
        <ul className="divide-y divide-ktip-sand-100">
          {people.map((member) => {
            const presence = live.get(member.user_id)
            const name = presence?.display_name || member.user?.display_name || t`Member`
            const avatar = presence?.avatar_url ?? member.user?.avatar_url ?? null
            const isSelf = member.user_id === user?.id
            const pending = myTeam ? pendingBetween(requests, myTeam.id, member.user_id) : null

            return (
              <li key={member.user_id} className="px-4 py-2.5">
                <div className="flex items-start gap-3">
                  <DiamondAvatar src={avatar} name={name} size={AVATAR} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openMember(member.user_id)}
                      className="truncate text-sm font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 hover:underline"
                    >
                      {name}
                    </button>
                    {isSelf && (
                      <span className="ml-1 text-micro text-ktip-sand-400">
                        <Trans>(you)</Trans>
                      </span>
                    )}
                    {(member.skills || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(member.skills || []).map((skill) => (
                          <span key={skill} className={chip}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canInvite && !isSelf && (
                    pending ? (
                      <span className={chip}>
                        {pending.kind === 'invite' ? <Trans>Invited</Trans> : <Trans>Applied to you</Trans>}
                      </span>
                    ) : inviting !== member.user_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<UserPlus size={14} aria-hidden="true" />}
                        onClick={() => setInviting(member.user_id)}
                      >
                        <Trans>Invite</Trans>
                      </Button>
                    ) : null
                  )}
                </div>
                {inviting === member.user_id && myTeam && (
                  <InviteForm
                    eventId={eventId}
                    team={myTeam}
                    userId={member.user_id}
                    name={name}
                    onDone={() => setInviting(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Your own "looking for a team" switch, so you can join the list from here. */
function LookingToggle({ eventId }: { eventId: string }) {
  const { t } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const { roster } = useVenueRoster(eventId)
  const { updateVenueProfile, loading } = useUpdateVenueProfile()
  const me = roster?.find((m) => m.user_id === user?.id)
  if (!me) return null
  const listed = me.looking_for_team && me.is_discoverable

  return (
    <label className="flex items-center gap-2 border-b border-ktip-sand-100 px-4 py-2.5 text-sm text-ktip-sand-700">
      <input
        type="checkbox"
        checked={listed}
        disabled={loading}
        onChange={(e) => {
          const on = e.target.checked
          updateVenueProfile(
            eventId,
            on ? { looking_for_team: true, is_discoverable: true } : { looking_for_team: false }
          ).catch((err: any) => toast.error(err?.message || t`Could not update your profile`))
        }}
      />
      <Trans>Show me here so teams can invite me</Trans>
    </label>
  )
}

function InviteForm({
  eventId,
  team,
  userId,
  name,
  onDone,
}: {
  eventId: string
  team: EventTeam
  userId: string
  name: string
  onDone: () => void
}) {
  const { t } = useLingui()
  const toast = useToast()
  const invite = useInviteToTeam(eventId)
  const [message, setMessage] = useState('')

  return (
    <form
      className="mt-2 space-y-2 pl-9"
      onSubmit={(e) => {
        e.preventDefault()
        invite.mutate(
          { teamId: team.id, userId, message },
          {
            onSuccess: () => {
              toast.success(t`Invitation sent to ${name}`)
              onDone()
            },
            onError: (err: any) => toast.error(err?.message || t`Could not send the invitation`),
          }
        )
      }}
    >
      <MessageBox
        value={message}
        onChange={setMessage}
        label={t`A short note to ${name}`}
        placeholder={t`Why you think they would fit`}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={invite.isPending} icon={<Send size={14} aria-hidden="true" />}>
          <Trans>Send invitation</Trans>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function RequestsTab({
  eventId,
  teams,
  incoming,
  outgoing,
}: {
  eventId: string
  teams: EventTeam[]
  incoming: TeamRequest[]
  outgoing: TeamRequest[]
}) {
  const { t } = useLingui()
  const toast = useToast()
  const respond = useRespondToRequest(eventId)
  const withdraw = useWithdrawRequest(eventId)
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name || t`A team`
  const personName = (r: TeamRequest) => r.person?.display_name || t`Someone`

  const answer = (r: TeamRequest, accept: boolean) =>
    respond.mutate(
      { requestId: r.id, accept },
      {
        onSuccess: () => toast.success(accept ? t`Accepted` : t`Declined`),
        onError: (err: any) => toast.error(err?.message || t`Could not answer the request`),
      }
    )

  const pull = (r: TeamRequest) =>
    withdraw.mutate(r.id, {
      onSuccess: () => toast.success(t`Withdrawn`),
      onError: (err: any) => toast.error(err?.message || t`Could not withdraw the request`),
    })

  const busy = respond.isPending || withdraw.isPending

  return (
    <div className="space-y-4 p-3">
      <RequestGroup title={t`Waiting on you`} empty={t`Nothing waiting on you.`}>
        {incoming.map((r) => {
          const person = personName(r)
          const team = teamName(r.team_id)
          return (
          <RequestRow
            key={r.id}
            request={r}
            headline={
              r.kind === 'apply' ? (
                <Trans>{person} wants to join your team</Trans>
              ) : (
                <Trans>{team} invited you</Trans>
              )
            }
            avatar={r.kind === 'apply' ? r.person : null}
            actions={
              r.status === 'pending' && (
                <>
                  <Button size="sm" disabled={busy} icon={<Check size={14} aria-hidden="true" />} onClick={() => answer(r, true)}>
                    <Trans>Accept</Trans>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => answer(r, false)}>
                    <Trans>Decline</Trans>
                  </Button>
                </>
              )
            }
          />
          )
        })}
      </RequestGroup>

      <RequestGroup title={t`Sent`} empty={t`You have not sent anything yet.`}>
        {outgoing.map((r) => {
          const person = personName(r)
          const team = teamName(r.team_id)
          return (
          <RequestRow
            key={r.id}
            request={r}
            headline={
              r.kind === 'apply' ? (
                <Trans>You applied to {team}</Trans>
              ) : (
                <Trans>Your team invited {person}</Trans>
              )
            }
            avatar={r.kind === 'invite' ? r.person : null}
            actions={
              r.status === 'pending' && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => pull(r)}>
                  <Trans>Withdraw</Trans>
                </Button>
              )
            }
          />
          )
        })}
      </RequestGroup>
    </div>
  )
}

function RequestGroup({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ktip-sand-500">{title}</h3>
      {children.length === 0 ? (
        <p className="text-sm text-ktip-sand-500">{empty}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  )
}

function RequestRow({
  request,
  headline,
  avatar,
  actions,
}: {
  request: TeamRequest
  headline: ReactNode
  avatar: TeamRequest['person']
  actions: ReactNode
}) {
  const { t } = useLingui()
  return (
    <li className="rounded-xl border border-ktip-sand-100 bg-white p-3">
      <div className="flex items-start gap-2.5">
        {avatar && <DiamondAvatar src={avatar.avatar_url} name={avatar.display_name || t`Member`} size={AVATAR} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-ktip-sand-900">{headline}</p>
            <StatusChip status={request.status} />
          </div>
          {request.message && (
            <p className="mt-1 whitespace-pre-line break-words text-sm text-ktip-sand-600">{request.message}</p>
          )}
        </div>
      </div>
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </li>
  )
}

function StatusChip({ status }: { status: TeamRequestStatus }) {
  const { t } = useLingui()
  const label: Record<TeamRequestStatus, string> = {
    pending: t`Waiting`,
    accepted: t`Accepted`,
    declined: t`Declined`,
    withdrawn: t`Withdrawn`,
  }
  const tone: Record<TeamRequestStatus, string> = {
    pending: 'border-ktip-sun-200 bg-ktip-sun-50 text-ktip-sun-800',
    accepted: 'border-ktip-tropical-200 bg-ktip-tropical-50 text-ktip-tropical-800',
    declined: '',
    withdrawn: '',
  }
  return <span className={cn(chip, tone[status])}>{label[status]}</span>
}

function MessageBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  placeholder: string
}) {
  return (
    <label className="block text-xs font-medium text-ktip-sand-700">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={REQUEST_MESSAGE_MAX}
        rows={3}
        placeholder={placeholder}
        className={cn(field, 'mt-1 resize-y')}
      />
      <span className="mt-0.5 block text-right text-micro text-ktip-sand-400">
        {value.length}/{REQUEST_MESSAGE_MAX}
      </span>
    </label>
  )
}
