import type { SupabaseClient } from '@supabase/supabase-js'
// `.js` on the relative imports: api/share-image.ts runs on Node as plain ES
// modules and loads this file too. The edge bundler resolves them either way.
import { eventRecord, grantRecord, isShareable, orgRecord, plainText, projectRecord } from '../../src/lib/share/records.js'

/**
 * Link previews for shared items.
 *
 * Facebook, LinkedIn, WhatsApp and the rest build their preview card from the
 * page's Open Graph tags, and their crawlers don't run JavaScript. KTIP is a
 * single-page app, so every path used to hand them index.html's fixed tags and
 * every shared link showed the same generic card. vercel.json now sends those
 * crawlers (and only those) to api/share.ts, which answers with the tags below,
 * and the card picture comes from api/share-image.ts.
 *
 * Only what the share sheet already shows goes out: title, a short line, the
 * item's photo. Anything that isn't live and public (drafts, private projects,
 * suspended grants, unverified businesses) gets the plain KTIP card, so a
 * preview never reveals more than the page would to a signed-out visitor.
 */

export type OgKind = 'event' | 'grant' | 'project' | 'org'
export const OG_KINDS: readonly OgKind[] = ['event', 'grant', 'project', 'org']

export const SITE_NAME = 'KTIP'
export const SITE_TITLE = 'KTIP - Knowledge, Technology and Innovation Platform'
export const SITE_DESCRIPTION = 'Caribbean innovators collaborate, connect, and grow.'
export const DEFAULT_IMAGE_PATH = '/og-default.jpg'
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630
/** Bump when the card's drawing changes, so crawlers fetch the new look. */
export const CARD_DESIGN = 'band-1'

const TABLE: Record<Exclude<OgKind, 'org'>, string> = {
  event: 'events',
  grant: 'grants',
  project: 'projects',
}

const PATH: Record<OgKind, string> = {
  event: '/events/',
  grant: '/grants/',
  project: '/projects/',
  org: '/org/',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/

type Row = Record<string, unknown>

/** A route segment the loader will look up, normalised, or null if it can't be one. */
export function cleanId(kind: OgKind, raw: string | null | undefined): string | null {
  const id = (raw || '').trim().toLowerCase()
  if (UUID.test(id)) return kind === 'org' ? null : id
  return SLUG.test(id) ? id : null
}

/**
 * The row behind a shared link, or null when there is none or it isn't public.
 * Takes the service-role client: crawlers have no session, so isShareable() is
 * the gate here rather than row-level security.
 */
export async function loadShareable(admin: SupabaseClient, kind: OgKind, id: string): Promise<Row | null> {
  let row: Row | null = null
  if (kind === 'org') {
    const { data, error } = await admin.rpc('public_employer', { p_slug: id })
    if (error) return null
    row = ((data as Row[] | null) || [])[0] ?? null
  } else {
    const { data, error } = await admin
      .from(TABLE[kind])
      .select('*')
      .eq(UUID.test(id) ? 'id' : 'slug', id)
      .maybeSingle()
    if (error) return null
    row = (data as Row | null) ?? null
  }
  return row && isShareable(kind, row) ? row : null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The picture a row carries: a photo for items, the logo for a business. */
export function rowImage(kind: OgKind, row: Row): string | null {
  return str(kind === 'org' ? row.logo_url : row.image_url)
}

/** Short, stable tag for an image URL, so a new photo gets a new card URL and crawlers refetch. */
export function imageVersion(url: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function clip(text: string, max = 200): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,;:.\s]+$/, '')}…` : t
}

const firstSentence = (s: string | null) => s?.split(/(?<=[.!?])\s/)[0] ?? null
/** Non-empty strings, first letter capitalised: categories are stored lower case ("education"). */
const strings = (...xs: unknown[]) =>
  xs
    .filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))

/** The word over the title on the card picture. */
export const KIND_LABEL: Record<OgKind, string> = {
  event: 'EVENT',
  grant: 'FUNDING',
  project: 'PROJECT',
  org: 'BUSINESS',
}

/**
 * The facts people decide on, shortest first: when and where for an event,
 * how much and until when for funding. Printed on the card picture and leading
 * the description, because Facebook shows the picture and title but not the
 * description.
 */
export function cardFacts(kind: OgKind, row: Row): string[] {
  switch (kind) {
    case 'event': {
      const r = eventRecord(row)
      return strings(r.dates, r.where)
    }
    case 'grant': {
      const r = grantRecord(row)
      return strings(r.award, r.applications_close ? `Closes ${r.applications_close}` : null)
    }
    case 'project': {
      const r = projectRecord(row)
      return strings(r.stage, r.category)
    }
    case 'org': {
      const r = orgRecord(row)
      return strings(r.sector, r.based_in)
    }
  }
}

/** One line under the title: the facts, then the summary. */
export function rowDescription(kind: OgKind, row: Row): string {
  const body =
    kind === 'org'
      ? firstSentence(plainText(row.description, 300))
      : (plainText(row.summary, 300) ?? firstSentence(plainText(row.description, 300)))
  const text = [cardFacts(kind, row).join(' · '), body].filter(Boolean).join('. ')
  return clip(text || SITE_DESCRIPTION)
}

export function rowTitle(kind: OgKind, row: Row): string {
  return (kind === 'org' ? str(row.trading_name) || str(row.legal_name) : str(row.title)) || SITE_TITLE
}

/** The canonical link: the slug when there is one, no tracking parameters. */
export function rowPath(kind: OgKind, row: Row): string {
  return `${PATH[kind]}${str(row.slug) || String(row.id)}`
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export interface OgCard {
  title: string
  description: string
  image: string
  imageAlt: string
  /** Absolute canonical URL; null for the plain site card. */
  url: string | null
  type: 'website' | 'article'
}

/** The page crawlers read. Every value is escaped; nothing here runs. */
export function ogHtml(card: OgCard): string {
  const e = escapeHtml
  const tags = [
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:type', card.type],
    ['property', 'og:title', card.title],
    ['property', 'og:description', card.description],
    ['property', 'og:image', card.image],
    ['property', 'og:image:secure_url', card.image],
    ['property', 'og:image:type', 'image/jpeg'],
    ['property', 'og:image:width', String(CARD_WIDTH)],
    ['property', 'og:image:height', String(CARD_HEIGHT)],
    ['property', 'og:image:alt', card.imageAlt],
    ...(card.url ? [['property', 'og:url', card.url]] : []),
    ['name', 'description', card.description],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', card.title],
    ['name', 'twitter:description', card.description],
    ['name', 'twitter:image', card.image],
    ['name', 'twitter:image:alt', card.imageAlt],
  ]
  const meta = tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${e(value)}" />`).join('\n')
  const canonical = card.url ? `<link rel="canonical" href="${e(card.url)}" />\n` : ''
  const link = card.url ?? '/'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${e(card.title)}</title>
${canonical}${meta}
</head>
<body>
<h1>${e(card.title)}</h1>
<p>${e(card.description)}</p>
<p><a href="${e(link)}">${e(link)}</a></p>
</body>
</html>
`
}

/** The fixed KTIP card, for the home page, every other page, and anything not public. */
export function siteCard(origin: string): OgCard {
  return {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    image: `${origin}${DEFAULT_IMAGE_PATH}`,
    imageAlt: SITE_TITLE,
    url: null,
    type: 'website',
  }
}

/** The card for one public item. */
export function itemCard(origin: string, kind: OgKind, row: Row): OgCard {
  const title = rowTitle(kind, row)
  const picture = rowImage(kind, row)
  const ref = str(row.slug) || String(row.id)
  // Every item gets a drawn card, with or without a photo, since the facts are
  // printed on it. The version covers everything drawn, so an edit is refetched.
  const version = imageVersion([CARD_DESIGN, picture ?? '', title, ...cardFacts(kind, row)].join('|'))
  const image = `${origin}/api/share-image?kind=${kind}&id=${encodeURIComponent(ref)}&v=${version}`
  return {
    title,
    description: rowDescription(kind, row),
    image,
    imageAlt: title,
    url: `${origin}${rowPath(kind, row)}`,
    type: kind === 'org' ? 'website' : 'article',
  }
}
