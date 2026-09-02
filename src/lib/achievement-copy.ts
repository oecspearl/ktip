import { msg, plural, t } from '@lingui/core/macro'
import type { I18n, MessageDescriptor } from '@lingui/core'

/**
 * Prose for the trophy showcase.
 *
 * The card used to say only what the badge did ("Posted 10 times in the
 * forums") and how many points it was worth. That answers what happened, and
 * nothing about why it mattered — which is the part a member actually reads
 * when they open a trophy they earned six weeks ago.
 *
 * Two things live here:
 *
 *   requirementText()  the bare metric behind the badge, per check_key. Derived
 *                      from real definition data, never invented.
 *   CATEGORY_MEANING   what earning something in this category says about the
 *                      member. Written per category rather than per badge: a
 *                      bespoke paragraph per badge would be one more thing to
 *                      keep true as the platform changes, and the badge's own
 *                      description already carries the specifics. Migration
 *                      126 cutting the catalog from 68 badges to 33 changed
 *                      nothing here, which is the argument for the choice —
 *                      all eleven categories survived the trim.
 *
 * Nothing here states a statistic about other members. There is no "held by
 * the top 8%" line, because the schema cannot support that number and a
 * fabricated one on a page members screenshot and share is not acceptable.
 */

/**
 * The metric behind a badge, as a plain phrase: "10 forum posts or replies".
 *
 * Uses the CORE `t` macro imported at the top of this module, which compiles
 * to `i18n._()` against the global singleton — the shape `validation.ts` and
 * `delete-guard.ts` already use for translated strings outside a component.
 *
 * It must not take `t` as a parameter. The Lingui macro only transforms a
 * tagged template when the tag resolves to a macro import or to a `useLingui()`
 * destructuring in the same scope; a parameter is neither, so the template
 * survives to runtime and `i18n._(TemplateStringsArray)` quietly returns an
 * empty string. That shipped once and rendered a detail grid with no labels,
 * with nothing failing anywhere to say so.
 *
 * `plural()` rather than an `n === 1` ternary: several of these are genuinely
 * reachable at 1 (first_project, funded, event_host), and a ternary only ever
 * produces English's two-form rule.
 *
 * Returns null for a key with no phrasing yet, and the caller drops the row.
 * That is the safe direction: a missing sentence is invisible, a wrong one is
 * a lie about how the badge is earned.
 */
export function requirementText(
  checkKey: string | null | undefined,
  n: number | null | undefined
): string | null {
  if (!checkKey || n == null) return null

  switch (checkKey) {
    // ---------- Projects ----------
    case 'projects_created':
      return plural(n, { one: '# project created', other: '# projects created' })
    case 'top_project_likes':
      return plural(n, { one: '# like on a single project', other: '# likes on a single project' })

    // ---------- Grants ----------
    case 'grant_applications':
      return plural(n, {
        one: '# grant application submitted',
        other: '# grant applications submitted',
      })
    case 'grants_approved':
      return plural(n, {
        one: '# grant application approved',
        other: '# grant applications approved',
      })
    case 'sponsorships_given':
      return plural(n, {
        one: '# student application sponsored',
        other: '# student applications sponsored',
      })

    // ---------- Events ----------
    case 'events_rsvpd':
      return plural(n, { one: '# event RSVP', other: '# event RSVPs' })
    case 'events_attended':
      return plural(n, { one: '# event checked in at', other: '# events checked in at' })
    case 'events_organized':
      return plural(n, { one: '# event organized', other: '# events organized' })

    // ---------- Community ----------
    case 'forum_activity':
      return plural(n, { one: '# forum post or reply', other: '# forum posts or replies' })

    // ---------- Network ----------
    case 'connections_accepted':
      return plural(n, { one: '# connection made', other: '# connections made' })

    // ---------- Collaboration ----------
    case 'documents_created':
      return plural(n, { one: '# document created', other: '# documents created' })
    case 'collab_shares':
      return plural(n, { one: '# piece of work shared', other: '# pieces of work shared' })

    // ---------- Knowledge ----------
    case 'resources_published':
      return plural(n, { one: '# resource published', other: '# resources published' })

    // ---------- Profile ----------
    case 'is_verified':
      return t`Identity verification completed`
    case 'profile_complete':
      return t`Every part of your profile filled in`

    // ---------- Dedication ----------
    case 'streak_days':
      return plural(n, { one: '# day active in a row', other: '# days active in a row' })

    // ---------- Meta ----------
    case 'total_points':
      return plural(n, {
        one: '# achievement point earned',
        other: '# achievement points earned',
      })

    // ---------- Hidden ----------
    case 'achievements_views':
      return plural(n, {
        one: 'The achievements gallery opened # time',
        other: 'The achievements gallery opened # times',
      })
    case 'directory_views':
      return plural(n, { one: '# member profile browsed', other: '# member profiles browsed' })

    default:
      return null
  }
}

/**
 * How many members hold a trophy, or null to omit the row.
 *
 * Lives here, next to requirementText, for the same reason: it must use the
 * core `t` macro. Written first as a helper inside TrophyCard that took `t` as
 * a parameter, which reproduced the empty-string bug this module's header
 * describes — the text came back as '', '' is falsy, and the row silently
 * vanished. TrophyCard.test.tsx catches that now.
 *
 * Leads with the fraction. A bare "top 3%" is the shape the reference designs
 * used, but it describes a distribution this data does not support, and across
 * a few dozen members it is noise dressed as a statistic. The percentage is
 * added only once the population can carry one.
 */
export function holderText(holders?: number, eligible?: number): string | null {
  if (holders == null || eligible == null || eligible <= 0) return null
  if (holders === 0) return t`No one yet`

  const pct = Math.round((holders / eligible) * 100)
  return eligible >= 20
    ? t`${holders} of ${eligible} members · ${pct}%`
    : t`${holders} of ${eligible} members`
}

/**
 * What earning something in this category says about the member.
 *
 * Written in the second person and in the present tense, because it is read on
 * a trophy the member is looking at rather than in a report about them.
 */
export const CATEGORY_MEANING: Record<string, MessageDescriptor> = {
  projects: msg`You put ideas into the open where other people can see them, use them and build on them. Every project on KTIP started as someone deciding it was worth writing down.`,
  grants: msg`You went after funding rather than waiting for it. Applications take real effort to write, and the ones that get written are the only ones that can be approved.`,
  events: msg`You turned up. Regional events only work because enough people commit to being in the room, and the ones who host carry everyone else.`,
  community: msg`You keep the conversation going. Forums are only worth reading because members answer each other's questions instead of leaving them to sit.`,
  network: msg`You built reach across the region. The connections you make are how opportunities travel between islands rather than staying on one.`,
  collaboration: msg`You worked in the open with other people. Shared documents, boards and snippets are how a good idea survives its author moving on.`,
  knowledge: msg`You wrote down what you know. Published resources outlast the conversation they came from and reach people you will never meet.`,
  profile: msg`You made yourself findable. A complete, verified profile is what lets collaborators, funders and employers reach you at all.`,
  dedication: msg`You kept coming back. Consistency is the least glamorous thing on this platform and the one that compounds the most.`,
  meta: msg`You have engaged with KTIP broadly rather than deeply in one place. Rank is earned across the whole platform, not by grinding a single number.`,
  hidden: msg`You went looking. Some of KTIP only rewards curiosity, and this is what that looks like.`,
}

export function categoryMeaning(i18n: I18n, category?: string | null): string | null {
  const descriptor = CATEGORY_MEANING[category || '']
  return descriptor ? i18n._(descriptor) : null
}
