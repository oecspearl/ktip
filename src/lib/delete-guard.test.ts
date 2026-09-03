import { describe, it, expect } from 'vitest'
import {
  describeEventDeletion,
  describeForumBoardDeletion,
  describeGrantDeletion,
  describeProjectDeletion,
  isDeleteConfirmed,
  type EventDeleteFacts,
  type GrantDeleteFacts,
  type ProjectDeleteFacts,
} from './delete-guard'

const event = (over: Partial<EventDeleteFacts> = {}): EventDeleteFacts => ({
  status: 'draft',
  rsvpCount: 0,
  hasVenue: false,
  hasChallenge: false,
  ...over,
})

const project = (over: Partial<ProjectDeleteFacts> = {}): ProjectDeleteFacts => ({
  isPublic: false,
  memberCount: 0,
  ...over,
})

describe('describeEventDeletion', () => {
  it('treats a private draft with no RSVPs as a low-friction delete', () => {
    const impact = describeEventDeletion(event())
    expect(impact.affectsOthers).toBe(false)
    expect(impact.requiresTitleConfirmation).toBe(false)
    expect(impact.warning).toBe(null)
  })

  it('requires the title once anyone has registered', () => {
    const impact = describeEventDeletion(event({ rsvpCount: 1 }))
    expect(impact.affectsOthers).toBe(true)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.warning).toContain('1 person has registered')
  })

  it('pluralises the attendee warning', () => {
    expect(describeEventDeletion(event({ rsvpCount: 4 })).warning).toContain('4 people have registered')
  })

  it('requires the title for a published event even with zero RSVPs', () => {
    const impact = describeEventDeletion(event({ status: 'published' }))
    expect(impact.affectsOthers).toBe(false)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.warning).toContain('Existing links')
  })

  it('treats a completed event as publicly visible', () => {
    expect(describeEventDeletion(event({ status: 'completed' })).requiresTitleConfirmation).toBe(true)
  })

  it('lets a cancelled event with no RSVPs be deleted without typing', () => {
    expect(describeEventDeletion(event({ status: 'cancelled' })).requiresTitleConfirmation).toBe(false)
  })

  // An unfetched count must never make the guard *less* careful.
  it('treats an unknown RSVP count as possibly non-zero', () => {
    const impact = describeEventDeletion(event({ status: 'published', rsvpCount: null }))
    expect(impact.affectsOthers).toBe(true)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.cascades.some((c) => c.includes('RSVP'))).toBe(true)
  })

  it('does not escalate an unknown count on a draft', () => {
    const impact = describeEventDeletion(event({ status: 'draft', rsvpCount: null }))
    expect(impact.affectsOthers).toBe(false)
    expect(impact.requiresTitleConfirmation).toBe(false)
  })

  it('omits the RSVP cascade line when the count is a known zero', () => {
    const impact = describeEventDeletion(event())
    expect(impact.cascades.some((c) => c.includes('RSVP'))).toBe(false)
  })

  it('names the venue and the challenge when the event has them', () => {
    const impact = describeEventDeletion(event({ hasVenue: true, hasChallenge: true }))
    expect(impact.cascades.some((c) => c.includes('venue'))).toBe(true)
    expect(impact.cascades.some((c) => c.includes('challenge brief'))).toBe(true)
  })

  it('never returns an empty cascade list', () => {
    expect(describeEventDeletion(event()).cascades.length).toBeGreaterThan(0)
  })
})

describe('describeProjectDeletion', () => {
  it('treats a private solo project as a low-friction delete', () => {
    const impact = describeProjectDeletion(project())
    expect(impact.affectsOthers).toBe(false)
    expect(impact.requiresTitleConfirmation).toBe(false)
    expect(impact.warning).toBe(null)
  })

  it('requires the title when the project is public', () => {
    const impact = describeProjectDeletion(project({ isPublic: true }))
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.affectsOthers).toBe(false)
  })

  it('requires the title and flags others when collaborators exist', () => {
    const impact = describeProjectDeletion(project({ memberCount: 2 }))
    expect(impact.affectsOthers).toBe(true)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.warning).toContain('2 collaborators')
  })

  it('pluralises a single collaborator', () => {
    expect(describeProjectDeletion(project({ memberCount: 1 })).warning).toContain('1 collaborator will')
  })

  it('prefers the collaborator warning over the public-links warning', () => {
    const impact = describeProjectDeletion(project({ isPublic: true, memberCount: 3 }))
    expect(impact.warning).toContain('3 collaborators')
  })

  it('lists team memberships only when there are members', () => {
    expect(describeProjectDeletion(project()).cascades.some((c) => c.includes('membership'))).toBe(false)
    expect(
      describeProjectDeletion(project({ memberCount: 1 })).cascades.some((c) => c.includes('membership'))
    ).toBe(true)
  })
})

const grant = (over: Partial<GrantDeleteFacts> = {}): GrantDeleteFacts => ({
  isActive: false,
  applicationCount: 0,
  ...over,
})

describe('describeGrantDeletion', () => {
  it('treats an inactive grant with no applications as a low-friction delete', () => {
    const impact = describeGrantDeletion(grant())
    expect(impact.affectsOthers).toBe(false)
    expect(impact.requiresTitleConfirmation).toBe(false)
    expect(impact.warning).toBe(null)
  })

  it('requires the title once anyone has applied', () => {
    const impact = describeGrantDeletion(grant({ applicationCount: 3 }))
    expect(impact.affectsOthers).toBe(true)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.warning).toContain('3 applications')
  })

  it('pluralises a single application', () => {
    expect(describeGrantDeletion(grant({ applicationCount: 1 })).warning).toContain('1 application will')
  })

  it('requires the title for a live grant with no applications', () => {
    const impact = describeGrantDeletion(grant({ isActive: true }))
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.warning).toContain('Existing links')
  })

  // Active plus uncounted is the case the admin table actually hits.
  it('treats an uncounted total on a live grant as possibly non-zero', () => {
    const impact = describeGrantDeletion(grant({ isActive: true, applicationCount: null }))
    expect(impact.affectsOthers).toBe(true)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.warning).toContain('Deactivating it instead')
  })

  it('does not escalate an uncounted total on an inactive grant', () => {
    const impact = describeGrantDeletion(grant({ isActive: false, applicationCount: null }))
    expect(impact.affectsOthers).toBe(false)
    expect(impact.requiresTitleConfirmation).toBe(false)
  })

  it('names applications in the cascade list unless the total is a known zero', () => {
    expect(describeGrantDeletion(grant()).cascades.some((c) => c.includes('application'))).toBe(false)
    expect(
      describeGrantDeletion(grant({ applicationCount: null })).cascades.some((c) =>
        c.includes('application')
      )
    ).toBe(true)
  })
})

describe('describeForumBoardDeletion', () => {
  it('treats an empty board as a low-friction delete', () => {
    const impact = describeForumBoardDeletion({ postCount: 0 })
    expect(impact.affectsOthers).toBe(false)
    expect(impact.requiresTitleConfirmation).toBe(false)
    expect(impact.warning).toBe(null)
  })

  it('requires the name back as soon as one discussion exists', () => {
    const impact = describeForumBoardDeletion({ postCount: 1 })
    expect(impact.affectsOthers).toBe(true)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.warning).toContain('1 discussion and')
  })

  it('pluralises a busy board', () => {
    expect(describeForumBoardDeletion({ postCount: 12 }).warning).toContain('12 discussions')
  })

  // Unknown is never treated as empty: the cascade takes other people's
  // writing, so the guard fails towards friction.
  it('treats an uncounted board as one that might not be empty', () => {
    const impact = describeForumBoardDeletion({ postCount: null })
    expect(impact.affectsOthers).toBe(true)
    expect(impact.requiresTitleConfirmation).toBe(true)
    expect(impact.cascades.some((c) => c.includes('reply'))).toBe(true)
  })
})

describe('isDeleteConfirmed', () => {
  const strict = { requiresTitleConfirmation: true }
  const lax = { requiresTitleConfirmation: false }

  it('confirms immediately when no title is required', () => {
    expect(isDeleteConfirmed(lax, '', 'Caribbean Climate Hack')).toBe(true)
  })

  it('accepts the exact title', () => {
    expect(isDeleteConfirmed(strict, 'Caribbean Climate Hack', 'Caribbean Climate Hack')).toBe(true)
  })

  it('rejects an empty box', () => {
    expect(isDeleteConfirmed(strict, '', 'Caribbean Climate Hack')).toBe(false)
  })

  it('rejects a near miss', () => {
    expect(isDeleteConfirmed(strict, 'Caribbean Climate Hac', 'Caribbean Climate Hack')).toBe(false)
  })

  it('ignores case', () => {
    expect(isDeleteConfirmed(strict, 'caribbean climate hack', 'Caribbean Climate Hack')).toBe(true)
  })

  it('ignores surrounding whitespace and collapses runs', () => {
    expect(isDeleteConfirmed(strict, '  Caribbean   Climate Hack  ', 'Caribbean Climate Hack')).toBe(true)
  })

  it('tolerates a doubled space in the stored title', () => {
    expect(isDeleteConfirmed(strict, 'Blue Economy Sprint', 'Blue  Economy Sprint')).toBe(true)
  })

  // Otherwise an untitled row would be confirmed by leaving the box empty.
  it('refuses to confirm when the stored title is blank', () => {
    expect(isDeleteConfirmed(strict, '', '')).toBe(false)
    expect(isDeleteConfirmed(strict, '   ', '   ')).toBe(false)
  })
})
