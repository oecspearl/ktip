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

import { i18n } from '@lingui/core'
import { msg, plural } from '@lingui/core/macro'
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

export interface GrantDeleteFacts {
  isActive: boolean
  /**
   * Submitted applications. `null` when not counted — the admin grants table
   * loads applications filtered by status, so it cannot produce an honest
   * per-grant total, and guessing zero would be the wrong way to be wrong.
   */
  applicationCount: number | null
}

export interface ForumBoardDeleteFacts {
  /**
   * Threads on the board. `null` when the count has not loaded — unknown is
   * treated as "might not be zero", the same way the event guard treats it.
   */
  postCount: number | null
}

/** Published and completed events are already public and already indexed. */
function isEventPubliclyVisible(status: EventStatus): boolean {
  return status === 'published' || status === 'completed'
}

export function describeEventDeletion(facts: EventDeleteFacts): DeleteImpact {
  const { status, rsvpCount, hasVenue, hasChallenge } = facts

  const cascades = [i18n._(msg`The event listing, schedule, speakers and page sections`)]

  if (rsvpCount === null || rsvpCount > 0) {
    cascades.push(i18n._(msg`Every RSVP and registration response`))
  }
  if (hasChallenge) {
    cascades.push(
      i18n._(
        msg`The challenge brief, its criteria, every solution participants submitted and the files attached to them`
      )
    )
  }
  cascades.push(i18n._(msg`Documents attached to the event`))
  if (hasVenue) {
    cascades.push(i18n._(msg`The virtual venue: rooms, room chat history and member records`))
  }
  cascades.push(i18n._(msg`Event updates, articles and calendar entries`))

  const attendeesAffected = rsvpCount === null ? isEventPubliclyVisible(status) : rsvpCount > 0

  let warning: string | null = null
  if (rsvpCount !== null && rsvpCount > 0) {
    warning = plural(rsvpCount, {
      one: '# person has registered. Their registration data will be destroyed and they will not be notified.',
      other: '# people have registered. Their registration data will be destroyed and they will not be notified.',
    })
  } else if (rsvpCount === null && isEventPubliclyVisible(status)) {
    warning = i18n._(
      msg`This event is public. Anyone who registered will lose their registration and will not be notified.`
    )
  } else if (isEventPubliclyVisible(status)) {
    warning = i18n._(msg`This event is public. Existing links to it will break.`)
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

  const cascades = [i18n._(msg`The project page and everything on it`)]
  if (memberCount > 0) {
    cascades.push(i18n._(msg`All team memberships and pending invitations`))
  }
  cascades.push(i18n._(msg`Comments, likes, follows and view history`))
  cascades.push(i18n._(msg`Documents and files attached to the project`))

  let warning: string | null = null
  if (memberCount > 0) {
    warning = plural(memberCount, {
      one: '# collaborator will lose access to this project and their comments. They will not be notified.',
      other: '# collaborators will lose access to this project and their comments. They will not be notified.',
    })
  } else if (isPublic) {
    warning = i18n._(msg`This project is public. Existing links to it will break.`)
  }

  return {
    cascades,
    affectsOthers: memberCount > 0,
    requiresTitleConfirmation: memberCount > 0 || isPublic,
    warning,
  }
}

export function describeGrantDeletion(facts: GrantDeleteFacts): DeleteImpact {
  const { isActive, applicationCount } = facts

  const cascades = [i18n._(msg`The grant listing and everything attached to it`)]
  if (applicationCount === null || applicationCount > 0) {
    cascades.push(i18n._(msg`Every application to this grant, including saved drafts`))
  }
  cascades.push(i18n._(msg`Uploaded documents and their extracted fields`))

  // An active grant is one people can still apply to, so an uncounted total is
  // more likely to be non-zero than zero. Deactivating first is the safe path
  // and the copy says so.
  const applicantsAffected = applicationCount === null ? isActive : applicationCount > 0

  let warning: string | null = null
  if (applicationCount !== null && applicationCount > 0) {
    warning = plural(applicationCount, {
      one: '# application will be destroyed along with any drafts. Applicants will not be notified.',
      other: '# applications will be destroyed along with any drafts. Applicants will not be notified.',
    })
  } else if (applicationCount === null && isActive) {
    warning = i18n._(
      msg`This grant is still accepting applications. Any application or saved draft against it will be destroyed, and applicants will not be notified. Deactivating it instead keeps the record.`
    )
  } else if (isActive) {
    warning = i18n._(msg`This grant is live. Existing links to it will break.`)
  }

  return {
    cascades,
    affectsOthers: applicantsAffected,
    requiresTitleConfirmation: applicantsAffected || isActive,
    warning,
  }
}

/**
 * Deleting a board is the most destructive delete a non-admin can reach: every
 * FK into forum_boards cascades (005), so the threads and replies of everyone
 * who ever posted there go with it. An empty board is the owner's own mistake
 * to undo; a board with a single thread on it already holds somebody else's
 * writing, which is why the threshold is one and not some larger number.
 */
export function describeForumBoardDeletion(facts: ForumBoardDeleteFacts): DeleteImpact {
  const { postCount } = facts

  const cascades = [i18n._(msg`The board and its description`)]
  if (postCount === null || postCount > 0) {
    cascades.push(i18n._(msg`Every discussion on it, and every reply to those discussions`))
  }

  const holdsOtherPeoplesWriting = postCount === null || postCount > 0

  let warning: string | null = null
  if (postCount !== null && postCount > 0) {
    warning = plural(postCount, {
      one: '# discussion and all of its replies will be destroyed. The people who wrote them will not be notified.',
      other: '# discussions and all of their replies will be destroyed. The people who wrote them will not be notified.',
    })
  } else if (postCount === null) {
    warning = i18n._(
      msg`The discussions on this board could not be counted. Anything posted here — by anyone — is destroyed with it and cannot be recovered.`
    )
  }

  return {
    cascades,
    affectsOthers: holdsOtherPeoplesWriting,
    requiresTitleConfirmation: holdsOtherPeoplesWriting,
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
