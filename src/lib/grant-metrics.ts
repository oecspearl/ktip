import { isPast } from 'date-fns'
import { formatCurrency } from './utils'
import type { Grant, GrantApplicationStatus } from '../types'

/**
 * The arithmetic behind the funding stat strips.
 *
 * Pure functions, no React and no Supabase, so the awkward parts — mixed
 * currencies, null amounts, what "open" means — are testable on their own and
 * stated once instead of per page.
 */

/** A sum that knows what currency it is in. Never a bare number. */
export interface MoneyTotal {
  currency: string
  total: number
}

/**
 * Sum by currency, one total per currency present, largest first.
 *
 * Deliberately NOT one number. Migration 133 says it on the column itself —
 * "stored in awarded_currency, never converted for reporting" — and the same
 * holds for the calls: a funder posting in USD and awarding in XCD has two
 * figures, and adding them needs an exchange rate that would be stale the day
 * after it was typed. Rows whose amount is null or not finite are skipped
 * entirely; a call with no ceiling contributes nothing rather than a zero.
 */
export function sumByCurrency<T>(
  rows: readonly T[] | null | undefined,
  amountOf: (row: T) => number | null | undefined,
  currencyOf: (row: T) => string | null | undefined,
  fallbackCurrency = 'USD'
): MoneyTotal[] {
  const totals = new Map<string, number>()

  for (const row of rows ?? []) {
    const amount = amountOf(row)
    if (amount == null || !Number.isFinite(Number(amount))) continue

    const currency = (currencyOf(row) || fallbackCurrency).trim().toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + Number(amount))
  }

  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency))
}

/**
 * Render totals as one line: `US$1,200,000.00 · XCD400,000.00`.
 *
 * Returns null rather than an empty string when there is nothing to show, so a
 * tile can fall through to its own em dash — "no figure recorded" and "zero
 * awarded" are different statements and should not look alike.
 */
export function formatMoneyTotals(totals: readonly MoneyTotal[]): string | null {
  if (!totals.length) return null
  return totals.map((entry) => formatCurrency(entry.total, entry.currency)).join(' · ')
}

/**
 * Whether a call is still taking applications.
 *
 * Two separate closures — the funder switching `is_active` off, and the
 * deadline passing — that every grant surface has to agree on. It was copied
 * into GrantsPage and MyGrantsPage independently before this.
 */
export function isOpenCall(grant: Pick<Grant, 'is_active' | 'deadline'>): boolean {
  if (grant.is_active === false) return false
  return !(grant.deadline && isPast(new Date(grant.deadline)))
}

export interface ApplicationTallies {
  /** Everything that is not a draft — what the funder can see at all. */
  submitted: number
  pending: number
  under_review: number
  approved: number
  rejected: number
  drafts: number
  /** pending + under_review: the pile that is waiting on somebody. */
  awaitingDecision: number
}

/** Count applications by status in one pass. */
export function applicationTallies(
  rows: readonly { status: GrantApplicationStatus | string }[] | null | undefined
): ApplicationTallies {
  const tallies: ApplicationTallies = {
    submitted: 0,
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    drafts: 0,
    awaitingDecision: 0,
  }

  for (const row of rows ?? []) {
    switch (row.status) {
      case 'draft':
        tallies.drafts += 1
        continue
      case 'pending':
        tallies.pending += 1
        break
      case 'under_review':
        tallies.under_review += 1
        break
      case 'approved':
        tallies.approved += 1
        break
      case 'rejected':
        tallies.rejected += 1
        break
    }
    tallies.submitted += 1
  }

  tallies.awaitingDecision = tallies.pending + tallies.under_review
  return tallies
}
