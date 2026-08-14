import { describe, it, expect } from 'vitest'
import { resolveEngagement } from '../engagement'
import type { EmployerEngagement, EmployerMemberRole } from '../../types'

/**
 * The authority is `member_engagement_allowed()` in migration 111. These cases
 * are the same ones asserted against the database in
 * supabase/tests/111_org_member_engagement_test.sql — the point of duplicating
 * them here is that the two implementations must not drift.
 */

const EMP_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const EMP_B = 'bbbbbbbb-0000-4000-8000-000000000002'

function membership(
  employer_id: string,
  allow: boolean,
  role: EmployerMemberRole = 'recruiter'
): EmployerEngagement {
  return {
    employer_id,
    legal_name: employer_id === EMP_A ? 'Employer A' : 'Employer B',
    slug: employer_id === EMP_A ? 'employer-a' : 'employer-b',
    member_role: role,
    allow_member_engagement: allow,
  }
}

/** Employer A's switch is on, B's is off. */
const IN_A = [membership(EMP_A, true)]
const IN_B = [membership(EMP_B, false)]
const IN_BOTH = [membership(EMP_A, true), membership(EMP_B, false)]
const OWNER_OF_B = [membership(EMP_B, false, 'owner')]

const ORDINARY = { employer_id: null, allow_member_engagement: null }

describe('resolveEngagement', () => {
  it('leaves everyone who belongs to no organisation alone', () => {
    // 99% of the platform. The main regression risk of the whole feature.
    expect(resolveEngagement([], ORDINARY)).toEqual({ allowed: true })
    expect(resolveEngagement([], { employer_id: EMP_B, allow_member_engagement: false })).toEqual({
      allowed: true,
    })
    expect(resolveEngagement([], null)).toEqual({ allowed: true })
  })

  it('applies the master switch platform-wide, not just to the org own postings', () => {
    const verdict = resolveEngagement(IN_B, ORDINARY)
    expect(verdict).toEqual({ allowed: false, reason: 'org_switch', employerName: 'Employer B' })
  })

  it('leaves an organisation with the switch on untouched', () => {
    expect(resolveEngagement(IN_A, ORDINARY)).toEqual({ allowed: true })
  })

  it('lets an organisation reopen its own item to its own staff', () => {
    expect(
      resolveEngagement(IN_B, { employer_id: EMP_B, allow_member_engagement: true })
    ).toEqual({ allowed: true })
  })

  it('binds an override only to members of the owning organisation', () => {
    // B closed its call. To A's recruiter this is an ordinary item.
    expect(
      resolveEngagement(IN_A, { employer_id: EMP_B, allow_member_engagement: false })
    ).toEqual({ allowed: true })
  })

  it('lets an open organisation close one call to its own people', () => {
    const verdict = resolveEngagement(IN_A, { employer_id: EMP_A, allow_member_engagement: false })
    expect(verdict).toEqual({ allowed: false, reason: 'item_closed', employerName: 'Employer A' })
  })

  it('does not let one organisation override another', () => {
    // A opened its item; the actor also works for B, whose switch is off.
    const verdict = resolveEngagement(IN_BOTH, {
      employer_id: EMP_A,
      allow_member_engagement: true,
    })
    expect(verdict).toEqual({ allowed: false, reason: 'org_switch', employerName: 'Employer B' })
  })

  it('exempts owners and admins from the master switch', () => {
    expect(resolveEngagement(OWNER_OF_B, ORDINARY)).toEqual({ allowed: true })
    expect(
      resolveEngagement([membership(EMP_B, false, 'admin')], ORDINARY)
    ).toEqual({ allowed: true })
  })

  it('binds owners to an explicit item-level FALSE', () => {
    // The conflict-of-interest case. An owner is the most conflicted person in
    // the room, so this one is absolute.
    const verdict = resolveEngagement(OWNER_OF_B, {
      employer_id: EMP_B,
      allow_member_engagement: false,
    })
    expect(verdict).toEqual({ allowed: false, reason: 'item_closed', employerName: 'Employer B' })
  })

  it('ignores an override that names no organisation', () => {
    // The database refuses this pair outright (CHECK constraint); if one ever
    // arrives, it must not block anybody.
    expect(
      resolveEngagement(IN_A, { employer_id: null, allow_member_engagement: false })
    ).toEqual({ allowed: true })
  })
})
