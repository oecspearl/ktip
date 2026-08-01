/**
 * Readable URLs for the public detail pages (migration 087).
 *
 * The slug lives in the database — grants.slug, profiles.username and friends —
 * and is assigned once, on insert. The client reads it off the row rather than
 * deriving it, which is why nothing here has to reproduce the SQL slugify()
 * character-for-character.
 *
 * Routes did not change. `/grants/:id` accepts either shape: a uuid-looking
 * segment is looked up by id, anything else by slug. That is what keeps every
 * uuid link ever sent working — including the notification rows written by the
 * triggers in supabase/migrations/051_submission_receipts.sql, which still mint
 * '/grants/' || grant_id.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Which column a route param should be looked up against. */
export function isUuid(value: string | undefined | null): boolean {
  return !!value && UUID_RE.test(value)
}

/**
 * Title → url segment. The database is authoritative; this exists for the two
 * cases where a slug is needed before a row comes back — an optimistic path and
 * the "your URL will look like this" preview on the employer onboarding form.
 */
export function slugify(text: string | null | undefined): string {
  const base = (text || '')
    // NFKD splits "é" into "e" + a combining accent, and the non-alphanumeric
    // pass below drops the accent — so "Café" slugs as "cafe", not "caf".
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'item'
}

/** Anything with an id, and optionally the slug the database gave it. */
export interface Sluggable {
  id: string
  slug?: string | null
}

/** A profile: same idea, but the column is `username`. */
export interface Nameable {
  id: string
  username?: string | null
}

const COLLECTION = {
  grant: 'grants',
  event: 'events',
  project: 'projects',
  resource: 'resources',
} as const

export type SlugEntity = keyof typeof COLLECTION

/**
 * The canonical path for a row. Falls back to the uuid whenever the slug is
 * missing — a row created before the backfill, or one whose slug was cleared to
 * force a regeneration — so a link is never broken by an absent slug.
 */
export function entityPath(entity: SlugEntity, row: Sluggable): string {
  return `/${COLLECTION[entity]}/${row.slug || row.id}`
}

/** /u/<username>, the form meant to be shared outside the app. */
export function memberPath(profile: Nameable): string {
  return `/user/${profile.username || profile.id}`
}

/** A thread inside a board: the board's own slug, then the post's. */
export function forumPostPath(boardSlug: string, post: Sluggable): string {
  return `/forums/${boardSlug}/${post.slug || post.id}`
}
