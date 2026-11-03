import { describe, expect, it } from 'vitest'
import {
  OPENING_SKILLS_MAX,
  canJoinTeams,
  filterTeams,
  isCaptain,
  isFull,
  parseSkills,
  pendingBetween,
  splitRequests,
  teamOf,
  type TeamOpening,
  type TeamRequest,
} from './team-finder'
import { defaultSectionIds, sectionsForRoom } from './venue-room-sections'
import type { EventTeam } from '../hooks/useEventTeams'

const team = (id: string, name: string, members: Array<[string, 'captain' | 'member']>, extra: Partial<EventTeam> = {}): EventTeam => ({
  id,
  event_id: 'e1',
  name,
  tagline: null,
  max_size: 3,
  homebase_room_id: null,
  members: members.map(([user_id, role]) => ({ user_id, role, display_name: user_id, avatar_url: null })),
  ...extra,
})

const opening = (team_id: string, title: string, skills: string[] = [], is_open = true): TeamOpening => ({
  id: `${team_id}-${title}`,
  team_id,
  event_id: 'e1',
  title,
  skills,
  is_open,
  created_at: '2026-11-01T00:00:00Z',
})

let seq = 0
const request = (r: Partial<TeamRequest> & Pick<TeamRequest, 'team_id' | 'user_id' | 'kind'>): TeamRequest => ({
  id: `r${++seq}`,
  event_id: 'e1',
  status: 'pending',
  message: null,
  opening_id: null,
  created_by: null,
  created_at: `2026-11-01T00:00:0${seq % 10}Z`,
  responded_at: null,
  person: null,
  ...r,
})

const alpha = team('t1', 'Alpha', [['ana', 'captain'], ['ben', 'member']], { tagline: 'Flood alerts by SMS' })
const beta = team('t2', 'Beta', [['cy', 'captain']])
const teams = [alpha, beta]

describe('who is on what', () => {
  it('finds the viewer’s team and captaincy', () => {
    expect(teamOf(teams, 'ben')?.id).toBe('t1')
    expect(teamOf(teams, 'zed')).toBeNull()
    expect(teamOf(teams, undefined)).toBeNull()
    expect(isCaptain(alpha, 'ana')).toBe(true)
    expect(isCaptain(alpha, 'ben')).toBe(false)
    expect(isCaptain(null, 'ana')).toBe(false)
  })

  it('counts a team as full at max_size', () => {
    expect(isFull(alpha)).toBe(false)
    expect(isFull(team('t3', 'Gamma', [['a', 'captain'], ['b', 'member'], ['c', 'member']]))).toBe(true)
  })

  it('keeps spectators and judges out, like the server', () => {
    expect(canJoinTeams('participant')).toBe(true)
    expect(canJoinTeams('mentor')).toBe(true)
    expect(canJoinTeams('spectator')).toBe(false)
    expect(canJoinTeams('judge')).toBe(false)
    expect(canJoinTeams(null)).toBe(false)
  })
})

describe('filterTeams', () => {
  const openings = [opening('t2', 'UI designer', ['Figma', 'React']), opening('t1', 'Backend', [], false)]

  it('returns everything for an empty query', () => {
    expect(filterTeams(teams, openings, '  ')).toEqual(teams)
  })

  it('matches name, tagline, opening title and skill', () => {
    expect(filterTeams(teams, openings, 'alpha').map((t) => t.id)).toEqual(['t1'])
    expect(filterTeams(teams, openings, 'sms').map((t) => t.id)).toEqual(['t1'])
    expect(filterTeams(teams, openings, 'designer').map((t) => t.id)).toEqual(['t2'])
    expect(filterTeams(teams, openings, 'figma').map((t) => t.id)).toEqual(['t2'])
  })

  it('needs every word to match somewhere', () => {
    expect(filterTeams(teams, openings, 'react designer').map((t) => t.id)).toEqual(['t2'])
    expect(filterTeams(teams, openings, 'react alpha')).toEqual([])
  })

  it('ignores closed openings', () => {
    expect(filterTeams(teams, openings, 'backend')).toEqual([])
  })
})

describe('splitRequests', () => {
  const apply = request({ team_id: 't1', user_id: 'zed', kind: 'apply' })
  const invite = request({ team_id: 't2', user_id: 'zed', kind: 'invite' })
  const ourInvite = request({ team_id: 't1', user_id: 'yan', kind: 'invite', status: 'declined' })
  const all = [apply, invite, ourInvite]

  it('gives a team member applications in and invitations out', () => {
    const { incoming, outgoing } = splitRequests(all, 'ben', 't1')
    expect(incoming.map((r) => r.id)).toEqual([apply.id])
    expect(outgoing.map((r) => r.id)).toEqual([ourInvite.id])
  })

  it('gives a free agent invitations in and applications out', () => {
    const { incoming, outgoing } = splitRequests(all, 'zed', null)
    expect(incoming.map((r) => r.id)).toEqual([invite.id])
    expect(outgoing.map((r) => r.id)).toEqual([apply.id])
  })

  it('puts pending before answered, newest first', () => {
    const old = request({ team_id: 't1', user_id: 'a', kind: 'apply', created_at: '2026-10-01T00:00:00Z' })
    const recent = request({ team_id: 't1', user_id: 'b', kind: 'apply', created_at: '2026-10-05T00:00:00Z' })
    const done = request({ team_id: 't1', user_id: 'c', kind: 'apply', status: 'accepted', created_at: '2026-10-09T00:00:00Z' })
    const { incoming } = splitRequests([done, old, recent], 'ana', 't1')
    expect(incoming.map((r) => r.id)).toEqual([recent.id, old.id, done.id])
  })

  it('returns nothing for a signed-out viewer', () => {
    expect(splitRequests(all, undefined, null)).toEqual({ incoming: [], outgoing: [] })
  })

  it('finds the pending request between a team and a person', () => {
    expect(pendingBetween(all, 't1', 'zed')?.id).toBe(apply.id)
    expect(pendingBetween(all, 't1', 'yan')).toBeNull()
  })
})

describe('parseSkills', () => {
  it('trims, drops blanks and de-duplicates without caring about case', () => {
    expect(parseSkills(' Figma, ,react, React ,  CSS ')).toEqual(['Figma', 'react', 'CSS'])
  })

  it('caps the count and the length like the server', () => {
    const many = Array.from({ length: 12 }, (_, i) => `skill${i}`).join(',')
    expect(parseSkills(many)).toHaveLength(OPENING_SKILLS_MAX)
    expect(parseSkills('x'.repeat(60))[0]).toHaveLength(40)
  })
})

describe('the team_finder section', () => {
  it('is on by default in a networking room, and never at a conference', () => {
    expect(defaultSectionIds('networking')).toContain('team_finder')
    expect(defaultSectionIds('networking', 'conference')).not.toContain('team_finder')
    const stored = [{ id: 'team_finder' }, { id: 'chat' }]
    expect(sectionsForRoom({ kind: 'networking', sections: stored }, 'participant', 'conference').map((s) => s.def.id)).toEqual(['chat'])
  })
})
