import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, KanbanSquare, PenTool, Users } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../../../contexts/AuthContext'
import { useToast } from '../../../../contexts/ToastContext'
import { keys } from '../../../../queries/keys'
import { Button } from '../../../ui/Button'
import { DiamondAvatar } from '../../../ui/DiamondAvatar'
import { homebaseAccess, useCreateTeam, useEventTeams, useTeamChannel } from '../../../../hooks/useEventTeams'
import type { VenueRoom } from '../../../../types'
import { TeamTaskBoard } from './TeamTaskBoard'
import { TeamWhiteboard } from './TeamWhiteboard'
import { TeamFiles } from './TeamFiles'

type Tab = 'board' | 'whiteboard' | 'files'

interface Props {
  eventId: string
  room: VenueRoom
  isHost: boolean
}

/**
 * The middle of a Homebase: the team's task board, whiteboard and files, in
 * tabs. The call strip sits above it and the team chat beside it, both from
 * the room's ordinary panels, which is why they are not repeated here.
 *
 * An unclaimed team room shows how to claim one. A room that belongs to
 * another team never gets this far: the room page stops at the door.
 */
export function TeamWorkspacePanel({ eventId, room, isHost }: Props) {
  const { t } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { teams, loading } = useEventTeams(eventId)
  const { team, mine } = homebaseAccess(teams, room.id, user?.id, isHost)
  const [tab, setTab] = useState<Tab>('board')
  const createTeam = useCreateTeam(eventId)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')

  // One channel for the whole workspace. Teammates' board and file changes
  // arrive as pings (refetch what they touched); whiteboard diffs go straight
  // to the open whiteboard.
  const applyWb = useRef<((diff: any) => void) | null>(null)
  const onRemoteWb = useCallback((fn: ((diff: any) => void) | null) => {
    applyWb.current = fn
  }, [])
  const channel = useTeamChannel(team?.id, {
    wb: (diff: any) => applyWb.current?.(diff),
    tasks: () => queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'team-tasks', team?.id) }),
    files: () => queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'team-files', team?.id) }),
  })

  if (loading) return <div className="h-64 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />

  if (!team) {
    const myTeam = teams.find((x) => x.members.some((m) => m.user_id === user?.id))
    return (
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-ktip-sand-200 bg-white p-5">
        <h3 className="font-display text-xl font-bold text-ktip-sand-900">
          <Trans>This Homebase is free</Trans>
        </h3>
        {myTeam ? (
          <p className="text-sm text-ktip-sand-600">
            <Trans>You are already on {myTeam.name}. Each team gets one Homebase.</Trans>
          </p>
        ) : (
          <form
            className="flex max-w-lg flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim().length < 2) return
              createTeam.mutate(
                { name: name.trim(), tagline: tagline.trim() },
                {
                  onSuccess: () => toast.success(t`Team formed. Your Homebase is the next free team room.`),
                  onError: (err: any) => toast.error(err?.message || t`Could not form the team`),
                }
              )
            }}
          >
            <p className="text-sm text-ktip-sand-600">
              <Trans>Form a team to claim a Homebase. You become its captain, and teammates join you from the Team Finder.</Trans>
            </p>
            <label className="text-sm font-medium text-ktip-sand-800">
              <Trans>Team name</Trans>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                className="mt-1 w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-ktip-sand-800">
              <Trans>What you're building, in a line</Trans>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={160}
                className="mt-1 w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
              />
            </label>
            <div>
              <Button type="submit" loading={createTeam.isPending} icon={<Users size={16} aria-hidden="true" />}>
                <Trans>Form a team</Trans>
              </Button>
            </div>
          </form>
        )}
      </div>
    )
  }

  if (!mine && !isHost) return null

  const tabs: Array<{ id: Tab; label: string; icon: typeof KanbanSquare }> = [
    { id: 'board', label: t`Task board`, icon: KanbanSquare },
    { id: 'whiteboard', label: t`Whiteboard`, icon: PenTool },
    { id: 'files', label: t`Files`, icon: FolderOpen },
  ]

  return (
    <section className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-ktip-sand-200 bg-white p-4" aria-label={t`Team workspace`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold text-ktip-sand-900">{team.name}</h3>
          {team.tagline && <p className="truncate text-sm text-ktip-sand-600">{team.tagline}</p>}
        </div>
        <div className="flex items-center gap-1" aria-label={t`Team members`}>
          {team.members.map((m) => (
            <DiamondAvatar key={m.user_id} size={30} src={m.avatar_url} name={m.display_name || t`Teammate`} title={m.display_name || undefined} />
          ))}
          <span className="ml-1 text-xs text-ktip-sand-500">
            {team.members.length}/{team.max_size}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label={t`Workspace`} className="flex gap-1 overflow-x-auto border-b border-ktip-sand-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === id
                ? 'border-ktip-ocean-600 text-ktip-sand-900'
                : 'border-transparent text-ktip-sand-500 hover:text-ktip-sand-800'
            }`}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="min-w-0">
        {tab === 'board' && <TeamTaskBoard team={team} ping={() => channel.send('tasks', {})} />}
        {tab === 'whiteboard' && (
          <TeamWhiteboard teamId={team.id} send={channel.send} connected={channel.connected} onRemote={onRemoteWb} />
        )}
        {tab === 'files' && <TeamFiles teamId={team.id} ping={() => channel.send('files', {})} />}
      </div>
    </section>
  )
}
