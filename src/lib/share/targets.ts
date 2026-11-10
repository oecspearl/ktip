import { t } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import type { ShareKind } from './draft-prompt'
import { X_LIMIT, X_LINK_CHARS } from './platforms'

/**
 * What the share sheet shares: the link, the title, and the message it opens
 * with before anyone asks the AI for one.
 *
 * The opening message is a template filled from the item's own fields, so it
 * is always correct and costs nothing. It reads in the sharer's language and
 * stays short enough that it and the link fit in one post on X.
 */
export interface ShareTarget {
  kind: ShareKind
  /** UUID for events, grants and projects; the slug for a business page. */
  id: string
  /** Absolute canonical URL, before per-app tagging. */
  url: string
  title: string
  message: string
  /** Picture for the preview card in the sheet; null shows the KTIP card. */
  image: string | null
  /** One line under the title in the preview card. */
  description: string | null
}

const TZ = 'America/St_Lucia'
/** Room left for the message once X has counted the link and the space before it. */
export const MESSAGE_BUDGET = X_LIMIT - X_LINK_CHARS - 1

/** The OECS writes dates day-first ("15 January"); bare "en" would give "January 15". */
const dateLocale = (locale: string) => (locale === 'en' || locale === 'pseudo' ? 'en-GB' : locale)

function day(iso: string | null | undefined, locale = i18n.locale): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(dateLocale(locale), { timeZone: TZ, day: 'numeric', month: 'long' }).format(d)
}

function dayRange(start: string, end: string | null | undefined, locale = i18n.locale): string | null {
  const a = new Date(start)
  if (Number.isNaN(a.getTime())) return null
  const f = new Intl.DateTimeFormat(dateLocale(locale), { timeZone: TZ, day: 'numeric', month: 'long' })
  const b = end ? new Date(end) : null
  if (!b || Number.isNaN(b.getTime()) || f.format(a) === f.format(b)) return f.format(a)
  return f.formatRange(a, b)
}

const PREFIX: Record<string, string> = { XCD: 'EC$', USD: 'US$', EUR: '€', GBP: '£' }

function money(amount: number, currency: string, locale = i18n.locale): string {
  const code = (currency || 'XCD').toUpperCase()
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)
  return PREFIX[code] ? `${PREFIX[code]}${n}` : `${code} ${n}`
}

/** Joins sentences and trims at a word so the whole message fits the budget. */
export function fit(parts: (string | null | undefined)[], budget = MESSAGE_BUDGET): string {
  const text = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  if ([...text].length <= budget) return text
  const cut = [...text].slice(0, budget - 1).join('').replace(/\s+\S*$/, '')
  return `${cut.replace(/[,;:.\s]+$/, '')}…`
}

const firstSentence = (s: string | null | undefined) => s?.trim().split(/(?<=[.!?])\s/)[0] ?? null

/** Event rows often say "Virtual" or "Online" in the location field; that is not a place. */
const realPlace = (place: string | null | undefined) => {
  const p = place?.trim()
  return p && !/^(virtual|online|remote|tbd|tba)$/i.test(p) ? p : null
}

export function eventTarget(
  e: {
    id: string
    title: string
    summary: string | null
    start_date: string
    end_date: string | null
    is_virtual: boolean
    location: string | null
    image_url?: string | null
  },
  url: string
): ShareTarget {
  const dates = dayRange(e.start_date, e.end_date)
  const place = realPlace(e.location)
  const where = e.is_virtual ? (place ? t`Online and in ${place}.` : t`Online.`) : place ? `${place}.` : null
  return {
    kind: 'event',
    id: e.id,
    url,
    title: e.title,
    message: fit([`${e.title}:`, dates ? `${dates}.` : null, where, firstSentence(e.summary)]),
    image: e.image_url ?? null,
    description: e.summary?.trim() || null,
  }
}

export function grantTarget(
  g: {
    id: string
    title: string
    summary: string | null
    amount_min: number | null
    amount_max: number | null
    currency: string
    deadline: string | null
    image_url?: string | null
  },
  url: string
): ShareTarget {
  const hi = g.amount_max
  const lo = g.amount_min
  const award =
    lo && hi && lo !== hi
      ? t`${money(lo, g.currency)} to ${money(hi, g.currency)} available.`
      : hi
        ? t`Up to ${money(hi, g.currency)}.`
        : lo
          ? t`From ${money(lo, g.currency)}.`
          : null
  const close = day(g.deadline)
  return {
    kind: 'grant',
    id: g.id,
    url,
    title: g.title,
    message: fit([
      t`${g.title} is open for applications.`,
      award,
      close ? t`Applications close ${close}.` : null,
      firstSentence(g.summary),
    ]),
    image: g.image_url ?? null,
    description: g.summary?.trim() || null,
  }
}

export function projectTarget(
  p: { id: string; title: string; summary: string | null; description: string | null; image_url?: string | null },
  url: string
): ShareTarget {
  return {
    kind: 'project',
    id: p.id,
    url,
    title: p.title,
    message: fit([`${p.title}:`, firstSentence(p.summary) ?? firstSentence(p.description)]),
    image: p.image_url ?? null,
    description: p.summary?.trim() || firstSentence(p.description),
  }
}

export function orgTarget(
  o: {
    slug: string
    legal_name: string
    trading_name: string | null
    industry: string | null
    description: string | null
    logo_url?: string | null
  },
  url: string
): ShareTarget {
  const name = o.trading_name || o.legal_name
  const industry = o.industry?.trim()
  return {
    kind: 'org',
    id: o.slug,
    url,
    title: name,
    message: fit([
      industry ? t`${name} (${industry}) is verified on KTIP.` : t`${name} is verified on KTIP.`,
      firstSentence(o.description),
    ]),
    image: o.logo_url ?? null,
    description: firstSentence(o.description),
  }
}
