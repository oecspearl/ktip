import type { EmployerEngagement } from '../types'

/**
 * Whether an organisation's own people may engage with an opportunity.
 *
 * THE AUTHORITY IS SQL. `member_engagement_allowed(user, employer_id, override)`
 * in migration 111 decides; row-level security and three triggers enforce it.
 * This file exists because RLS can only refuse — it cannot say that Acme Ltd is
 * the reason, and a hidden button with no explanation produces a support ticket
 * instead of the conversation the feature exists to enable.
 *
 * Keep the two in step. `src/lib/__tests__/engagement.test.ts` walks the same
 * rules as `supabase/tests/111_org_member_engagement_test.sql`; when one moves,
 * move both.
 */

/** The shape any gated item has to offer. Grants, projects and events all do. */
export interface EngagementSubject {
  employer_id: string | null
  allow_member_engagement: boolean | null
}

export type EngagementVerdict =
  | { allowed: true }
  | {
      allowed: false
      /**
       * `org_switch` — the actor's own organisation has switched engagement off
       * platform-wide. About the account.
       *
       * `item_closed` — this one call is closed to the publishing
       * organisation's own people. About the item, not the account. Collapsing
       * the two would tell someone excluded for conflict of interest that their
       * account is restricted, which is false and alarming.
       */
      reason: 'org_switch' | 'item_closed'
      employerName: string
    }

const ALLOWED: EngagementVerdict = { allowed: true }

/**
 * Resolve the rule for one item.
 *
 * Reading order is the design, and it is the same order as the SQL:
 *
 *   1. An override binds only members of the OWNING organisation. To everyone
 *      else the item is ordinary.
 *   2. FALSE on the item is absolute, and binds owners and admins too — an
 *      owner is the most conflicted person in the room.
 *   3. TRUE on the item lifts that organisation's master switch and nothing
 *      else. Someone who also belongs to a second, locked-down organisation
 *      stays locked down: org A does not get to vote away org B's policy by
 *      publishing an item.
 *   4. With no override in play, any organisation the actor belongs to that has
 *      switched engagement off blocks them. Restrictive wins.
 *   5. Owners and admins are exempt from the MASTER switch. It is a staff
 *      policy, and the people who can flip it are not the people it is for.
 */
export function resolveEngagement(
  memberships: EmployerEngagement[],
  item: EngagementSubject | null | undefined
): EngagementVerdict {
  // The overwhelmingly common case: nobody's employee, nothing to resolve.
  if (!memberships.length) return ALLOWED

  const override = item?.allow_member_engagement ?? null
  const owningId = item?.employer_id ?? null

  if (override !== null && owningId) {
    const ownMembership = memberships.find((m) => m.employer_id === owningId)
    if (ownMembership) {
      if (override === false) {
        return { allowed: false, reason: 'item_closed', employerName: ownMembership.legal_name }
      }
      // Rule 3: the override reopens THIS organisation only.
      const elsewhere = blockingMembership(memberships, owningId)
      return elsewhere
        ? { allowed: false, reason: 'org_switch', employerName: elsewhere.legal_name }
        : ALLOWED
    }
  }

  const blocking = blockingMembership(memberships, null)
  return blocking
    ? { allowed: false, reason: 'org_switch', employerName: blocking.legal_name }
    : ALLOWED
}

/** The first membership that blocks, ignoring `exemptEmployerId` if given. */
function blockingMembership(
  memberships: EmployerEngagement[],
  exemptEmployerId: string | null
): EmployerEngagement | undefined {
  return memberships.find(
    (m) =>
      !m.allow_member_engagement &&
      m.employer_id !== exemptEmployerId &&
      m.member_role !== 'owner' &&
      m.member_role !== 'admin'
  )
}
