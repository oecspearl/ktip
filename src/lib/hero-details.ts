import { format } from 'date-fns'
import {
  EVENT_TYPE_LABELS,
  GRANT_TYPE_LABELS,
  PHASE_LABELS,
  PROJECT_CATEGORIES,
} from './constants'
import { fundingTypeLabel } from './funding-types'
import { formatCurrency } from './utils'
import type { DetailEntry, DetailItem, Event, Grant, Project } from '../types'

/**
 * Fallback "Additional Details" for the Discover hero.
 *
 * `details` (043) is only ever filled by hand through the create/admin forms, so
 * records that predate it — or that were posted without it — render no detail
 * block at all and the hero reads unevenly as the strip rotates. These helpers
 * synthesise the same DetailEntry shape from columns the record already has.
 * Hand-authored details always win; this is the empty-array fallback only.
 */

const DATE_FMT = 'MMM d, yyyy'

/** Hero rows must stay short — DetailsList does no clamping. */
function firstSentence(text: string): string {
  const trimmed = text.trim()
  const stop = trimmed.search(/\.\s|\.$/)
  return stop === -1 ? trimmed : trimmed.slice(0, stop + 1)
}

/** Drops every entry whose value never materialised. */
function items(pairs: [string, string | null | undefined][]): DetailItem[] {
  return pairs
    .filter(([, value]) => !!value)
    .map(([label, value]) => ({ id: `d-${label.toLowerCase()}`, label, value: value as string }))
}

function group(id: string, label: string, rows: DetailItem[]): DetailEntry[] {
  return rows.length > 0 ? [{ id, label, items: rows }] : []
}

function flat(id: string, label: string, value: string | null | undefined): DetailEntry[] {
  return value ? [{ id, label, value }] : []
}

function safeDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : format(d, DATE_FMT)
}

/** Matches GrantCard's min–max / "Up to" branching. */
function grantAmount(g: Grant): string | null {
  if (g.amount_min && g.amount_max) {
    return `${formatCurrency(g.amount_min, g.currency)} – ${formatCurrency(g.amount_max, g.currency)}`
  }
  if (g.amount_max) return `Up to ${formatCurrency(g.amount_max, g.currency)}`
  if (g.amount_min) return `From ${formatCurrency(g.amount_min, g.currency)}`
  return null
}

export function grantHeroDetails(g: Grant): DetailEntry[] {
  return [
    ...group(
      'd-funding',
      'Funding',
      items([
        ['Type', fundingTypeLabel(g.funding_type)],
        ['Focus', g.grant_type ? GRANT_TYPE_LABELS[g.grant_type] || g.grant_type : null],
        ['Amount', grantAmount(g)],
        ['Deadline', safeDate(g.deadline)],
      ])
    ),
    ...flat('d-eligibility', 'Eligibility', g.eligibility ? firstSentence(g.eligibility) : null),
  ]
}

export function projectHeroDetails(p: Project): DetailEntry[] {
  const category = p.category
    ? PROJECT_CATEGORIES.find((c) => c.value === p.category)?.label || p.category
    : null

  return [
    ...group(
      'd-project',
      'Project',
      items([
        ['Category', category],
        ['Phase', p.phase ? PHASE_LABELS[p.phase] || p.phase : null],
        ['Focus', p.is_climate_action ? 'Climate action' : null],
      ])
    ),
    ...flat('d-lead', 'Lead', p.owner?.display_name),
  ]
}

export function eventHeroDetails(e: Event): DetailEntry[] {
  const start = safeDate(e.start_date)
  const end = safeDate(e.end_date)
  const when = start && end && end !== start ? `${start} – ${end}` : start

  return [
    ...group(
      'd-event',
      'Event',
      items([
        ['Type', e.event_type ? EVENT_TYPE_LABELS[e.event_type] || e.event_type : null],
        ['When', when],
        ['Where', e.location || (e.is_virtual ? 'Virtual' : null)],
      ])
    ),
    ...flat('d-capacity', 'Capacity', e.capacity ? `${e.capacity.toLocaleString()} seats` : null),
  ]
}
