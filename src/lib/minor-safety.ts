/**
 * The UI half of the adult/minor messaging boundary added in migration 091.
 *
 * Same standing as src/lib/venue-actions.ts, and worth repeating: nothing here
 * is a security control. The real boundary is can_direct_message() in the
 * database, enforced by a trigger on conversation_participants and by the
 * messages INSERT policy, and it recomputes minor status from the declared date
 * of birth on every call. This file exists so a button that the server will
 * refuse is never rendered in the first place.
 *
 * It reads `profiles.is_minor`, which is a cached boolean and can be a day stale
 * around a birthday. That is acceptable here and nowhere else: the worst case is
 * an affordance that briefly appears and then fails, which is the same failure
 * mode the feature had before the column existed.
 */

import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { Profile } from '../types'

type AgeAware = Pick<Profile, 'is_minor'> | null | undefined

/** Absent column (deploy ahead of migration) reads as adult, not as unknown. */
function isMinor(person: AgeAware): boolean {
  return person?.is_minor === true
}

/**
 * May these two hold a one-to-one conversation?
 *
 * An adult and a member under 18 may not. Two adults may, and so may two
 * minors — the restriction is about the asymmetry, not about age itself.
 *
 * The server additionally permits an adult who is verified staff at the minor's
 * own institution, and moderators. Neither is knowable from a profile row, so
 * this returns false for them and their button stays hidden; they reach the
 * conversation from the institution and moderation surfaces instead.
 */
export function canDmAcrossAges(viewer: AgeAware, target: AgeAware): boolean {
  return isMinor(viewer) === isMinor(target)
}

/** Why the button is missing. Null when it is not missing for this reason. */
export function dmBlockedReason(viewer: AgeAware, target: AgeAware): string | null {
  if (canDmAcrossAges(viewer, target)) return null
  return isMinor(viewer)
    ? i18n._(
        msg`Direct messages with adult members are turned off on accounts under 18. Group and event channels are open as usual.`
      )
    : i18n._(msg`This member is under 18. Direct messages are limited to supervised group and event channels.`)
}
