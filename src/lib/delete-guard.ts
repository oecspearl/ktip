/**
 * Deleting your own event or project is a hard DELETE — every FK into `events`
 * and `projects` is `ON DELETE CASCADE` (verified across migrations 001–070),
 * so one row disappearing takes RSVPs, registrations, criteria, venue rooms,
 * comments, likes and team memberships with it. There is no soft-delete column
 * and no undo.
 *
 * That is fine for a draft nobody has seen. It is not fine for a published
 * event with forty registrations, because the data being destroyed belongs to
 * other people. So the *same* delete needs two different levels of friction,
 * and deciding which is a pure function of a handful of facts.
 *
 * The decision lives here rather than in the pages for two reasons: the event
 * detail page and the event edit page must never disagree about whether a
 * delete is dangerous, and the rule is much easier to trust when it is unit
 * tested than when it is spread across four JSX conditionals.
 *
 * This is a UX guard, not a security control. The real boundary is RLS —
 * `"Organizers can delete their events" USING (auth.uid() = organizer_id)`
 * (migration 002) and `"Users can delete own projects" USING (auth.uid() =
 * owner_id)` (migration 001). Nothing here can grant a delete the database
 * would refuse, and nothing here should be relied on to prevent one.
 */

import type { EventStatus } from '../types'

export interface DeleteImpact {
  /** What disappears with the parent row, phrased for a human. */
  cascades: string[]
  /** True when the row holds data belonging to people other than the owner. */
  affectsOthers: boolean
  /**
   * When true the dialog makes the user type the exact title back. Reserved
   * for deletes that destroy other people's data or remove something the
   * public has already seen — everything else gets a plain confirm.
   */
  requiresTitleConfirmation: boolean
  /** One line explaining why this delete is unusually consequential. */
  warning: string | null
}

export interface EventDeleteFacts {
  status: EventStatus
  /**
   * `null` means the count has not been fetched. Unknown is treated as
   * "might not be zero" — the guard never gets *less* careful for want of a
   * number it failed to load.
   */
  rsvpCount: number | null
  hasVenue: boolean
  hasChallenge: boolean
}

export interface ProjectDeleteFacts {
  isPublic: boolean
  /** Accepted collaborators other than the owner. */
  memberCount: number
}

/** Published and completed events are already public and already indexed. */
function isEventPubliclyVisible(status: EventStatus): boolean {
  return status === 'published' || status === 'completed'
}

export function describeEventDeletion(facts: EventDeleteFacts): DeleteImpact {
  const { status, rsvpCount, hasVenue, hasChallenge } = facts

  const cascades = ['The event listing, schedule, speakers and page sections']

  if (rsvpCount === null || rsvpCount > 0) {
    cascades.push('Every RSVP and registration response')
  }
  if (hasChallenge) {
    cascades.push('The challenge brief, its criteria and any submissions against them')
  }
  if (hasVenue) {
    cascades.push('The virtual venue: rooms, room chat history and member records')
  }
  cascades.push('Event updates, articles and calendar entries')

  const attendeesAffected = rsvpCount === null ? isEventPubliclyVisible(status) : rsvpCount > 0

  let warning: string | null = null
  if (rsvpCount !== null && rsvpCount > 0) {
    warning = `${rsvpCount} ${rsvpCount === 1 ? 'person has' : 'people have'} registered. Their registration data will be destroyed and they will not be notified.`
  } else if (rsvpCount === null && isEventPubliclyVisible(status)) {
    warning = 'This event is public. Anyone who registered will lose their registration and will not be notified.'
  } else if (isEventPubliclyVisible(status)) {
    warning = 'This event is public. Existing links to it will break.'
  }

  return {
    cascades,
    affectsOthers: attendeesAffected,
    requiresTitleConfirmation: attendeesAffected || isEventPubliclyVisible(status),
    warning,
  }
}

export function describeProjectDeletion(facts: ProjectDeleteFacts): DeleteImpact {
  const { isPublic, memberCount } = facts

  const cascades = ['The project page and everything on it']
  if (memberCount > 0) {
    cascades.push('All team memberships and pending invitations')
  }
  cascades.push('Comments, likes, follows and view history')
  cascades.push('Documents and files attached to the project')

  let warning: string | null = null
  if (memberCount > 0) {
    warning = `${memberCount} ${memberCount === 1 ? 'collaborator' : 'collaborators'} will lose access to this project and their comments. They will not be notified.`
  } else if (isPublic) {
    warning = 'This project is public. Existing links to it will break.'
  }

  return {
    cascades,
    affectsOthers: memberCount > 0,
    requiresTitleConfirmation: memberCount > 0 || isPublic,
    warning,
  }
}

/**
 * Titles get copy-pasted, and a stray trailing space or a doubled space
 * between words is not the mistake the typed confirmation is meant to catch.
 * Case is ignored for the same reason — the point is deliberate intent, not
 * transcription accuracy.
 */
function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function isDeleteConfirmed(
  impact: Pick<DeleteImpact, 'requiresTitleConfirmation'>,
  typed: string,
  title: string
): boolean {
  if (!impact.requiresTitleConfirmation) return true
  const expected = normalizeTitle(title)
  // An untitled row would otherwise be confirmed by an empty box.
  if (expected.length === 0) return false
  return normalizeTitle(typed) === expected
}
