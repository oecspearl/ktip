import { describe, it, expect } from 'vitest'
import { canDirectMessage, canInviteToRoom, canViewProfile } from './venue-actions'
import type { DmContext } from './venue-actions'

function ctx(over: Partial<DmContext> = {}): DmContext {
  return {
    canInitiateDm: true,
    isSelf: false,
    targetRole: 'participant',
    targetIsLive: true,
    ...over,
  }
}

describe('canDirectMessage', () => {
  it('offers a DM between two participants who may initiate one', () => {
    expect(canDirectMessage(ctx())).toBe(true)
  })

  // The case this whole module exists for. Migration 064 denies dm:initiate to
  // the student role inside has_permission(), so a rendered button would fail
  // server-side — and a dangling affordance is worse than no affordance.
  it('offers nothing when the viewer lacks dm:initiate', () => {
    expect(canDirectMessage(ctx({ canInitiateDm: false }))).toBe(false)
  })

  // Suspension also zeroes every permission, so this covers that path too.
  it('stays false for a viewer without the permission regardless of the target', () => {
    for (const targetRole of ['participant', 'mentor', 'judge', 'organizer'] as const) {
      expect(canDirectMessage(ctx({ canInitiateDm: false, targetRole }))).toBe(false)
    }
  })

  it('does not offer to message yourself', () => {
    expect(canDirectMessage(ctx({ isSelf: true }))).toBe(false)
  })

  // A spectator is watching, not participating, and did not opt into being
  // contacted by a hundred people.
  it('never offers to message a spectator', () => {
    expect(canDirectMessage(ctx({ targetRole: 'spectator' }))).toBe(false)
  })

  it('offers a DM to mentors, judges and organizers', () => {
    for (const targetRole of ['mentor', 'judge', 'organizer'] as const) {
      expect(canDirectMessage(ctx({ targetRole }))).toBe(true)
    }
  })
})

describe('canViewProfile', () => {
  // Including your own: the drawer is how you check what everyone else sees.
  it('is always allowed', () => {
    expect(canViewProfile({ targetRole: 'spectator' })).toBe(true)
    expect(canViewProfile({ targetRole: 'participant' })).toBe(true)
  })
})

describe('canInviteToRoom', () => {
  it('invites a live participant', () => {
    expect(canInviteToRoom(ctx())).toBe(true)
  })

  // Pulling someone into a room only means anything if they are connected.
  it('does not invite a member who is only known from the DB mirror', () => {
    expect(canInviteToRoom(ctx({ targetIsLive: false }))).toBe(false)
  })

  it('does not invite yourself or a spectator', () => {
    expect(canInviteToRoom(ctx({ isSelf: true }))).toBe(false)
    expect(canInviteToRoom(ctx({ targetRole: 'spectator' }))).toBe(false)
  })

  // Unknown liveness is treated as live: the roster panel does not always know.
  it('treats an unspecified liveness as live', () => {
    expect(canInviteToRoom(ctx({ targetIsLive: undefined }))).toBe(true)
  })
})
