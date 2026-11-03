/**
 * Team Finder rules that do not need a database (migration 191).
 *
 * The server decides everything that matters: who may answer, whether a team
 * is full, one team per person. These helpers only decide what the panel
 * shows and which buttons it offers, and they mirror the server's rules so a
 * button is not offered that would only produce an error.
 */

import type { EventTeam } from '../hooks/useEventTeams'
import type { VenueRole } from '../types'

export const REQUEST_MESSAGE_MAX = 500
export const OPENING_TITLE_MAX = 80
export const OPENING_SKILLS_MAX = 8
export const OPENING_SKILL_LENGTH = 40

export type TeamRequestKind = 'apply' | 'invite'
export type TeamRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

export interface TeamOpening {
  id: string
  team_id: string
  event_id: string
  title: string
  skills: string[]
  is_open: boolean
  created_at: string
}

export interface TeamRequest {
  id: string
  team_id: string
  event_id: string
  /** The person who would join, whichever way the request runs. */
  user_id: string
  kind: TeamRequestKind
  status: TeamRequestStatus
  message: string | null
  opening_id: string | null
  created_by: string | null
  created_at: string
  responded_at: string | null
  person: { display_name: string | null; avatar_url: string | null } | null
}

/** Mirrors can_join_event_team() in 191. Judges score teams, so they stay out. */
export function canJoinTeams(role: VenueRole | null | undefined): boolean {
  return !!role && role !== 'spectator' && role !== 'judge'
}

export function teamOf(teams: EventTeam[], userId: string | undefined): EventTeam | null {
  if (!userId) return null
  return teams.find((t) => t.members.some((m) => m.user_id === userId)) ?? null
}

export function isCaptain(team: EventTeam | null, userId: string | undefined): boolean {
  return !!team && !!userId && team.members.some((m) => m.user_id === userId && m.role === 'captain')
}

export function isFull(team: EventTeam): boolean {
  return team.members.length >= team.max_size
}

export function openingsByTeam(openings: TeamOpening[]): Map<string, TeamOpening[]> {
  const out = new Map<string, TeamOpening[]>()
  for (const o of openings) {
    if (!o.is_open) continue
    const list = out.get(o.team_id)
    if (list) list.push(o)
    else out.set(o.team_id, [o])
  }
  return out
}

/**
 * Search across a team's name, its tagline, and what its openings ask for.
 * Every word of the query has to match somewhere, so "react designer" finds
 * a team wanting a designer who knows React.
 */
export function filterTeams(
  teams: EventTeam[],
  openings: TeamOpening[],
  query: string
): EventTeam[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return teams
  const byTeam = openingsByTeam(openings)
  return teams.filter((team) => {
    const haystack = [
      team.name,
      team.tagline ?? '',
      ...(byTeam.get(team.id) ?? []).flatMap((o) => [o.title, ...o.skills]),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

/**
 * Split requests into the ones waiting on this viewer and the ones they sent.
 *
 * Incoming: applications to my team, invitations to me.
 * Outgoing: my applications, my team's invitations.
 * Pending first, then newest.
 */
export function splitRequests(
  requests: TeamRequest[],
  userId: string | undefined,
  myTeamId: string | null | undefined
): { incoming: TeamRequest[]; outgoing: TeamRequest[] } {
  const incoming: TeamRequest[] = []
  const outgoing: TeamRequest[] = []
  if (!userId) return { incoming, outgoing }

  for (const r of requests) {
    const toMyTeam = !!myTeamId && r.team_id === myTeamId
    const aboutMe = r.user_id === userId
    if (r.kind === 'apply') {
      if (toMyTeam && !aboutMe) incoming.push(r)
      else if (aboutMe) outgoing.push(r)
    } else {
      if (aboutMe) incoming.push(r)
      else if (toMyTeam) outgoing.push(r)
    }
  }
  return { incoming: incoming.sort(byPendingThenNewest), outgoing: outgoing.sort(byPendingThenNewest) }
}

function byPendingThenNewest(a: TeamRequest, b: TeamRequest): number {
  const pa = a.status === 'pending' ? 0 : 1
  const pb = b.status === 'pending' ? 0 : 1
  return pa - pb || b.created_at.localeCompare(a.created_at)
}

/** Pending requests between this person and this team, in either direction. */
export function pendingBetween(
  requests: TeamRequest[],
  teamId: string,
  userId: string | undefined
): TeamRequest | null {
  if (!userId) return null
  return (
    requests.find((r) => r.team_id === teamId && r.user_id === userId && r.status === 'pending') ?? null
  )
}

/** Comma-separated skills, trimmed and de-duplicated, capped like the server. */
export function parseSkills(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(',')) {
    const skill = raw.trim().slice(0, OPENING_SKILL_LENGTH)
    const key = skill.toLowerCase()
    if (!skill || seen.has(key)) continue
    seen.add(key)
    out.push(skill)
    if (out.length >= OPENING_SKILLS_MAX) break
  }
  return out
}
