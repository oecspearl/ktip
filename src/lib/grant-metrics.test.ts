import { describe, it, expect } from 'vitest'
import { sumByCurrency, formatMoneyTotals, isOpenCall, applicationTallies } from './grant-metrics'

interface Row {
  amount: number | null
  currency?: string | null
}

const amount = (row: Row) => row.amount
const currency = (row: Row) => row.currency

describe('sumByCurrency', () => {
  it('keeps currencies apart instead of adding them', () => {
    const totals = sumByCurrency(
      [
        { amount: 1000, currency: 'USD' },
        { amount: 500, currency: 'XCD' },
        { amount: 250, currency: 'USD' },
      ],
      amount,
      currency
    )

    expect(totals).toEqual([
      { currency: 'USD', total: 1250 },
      { currency: 'XCD', total: 500 },
    ])
  })

  it('orders by total descending', () => {
    const totals = sumByCurrency(
      [
        { amount: 10, currency: 'USD' },
        { amount: 900, currency: 'XCD' },
      ],
      amount,
      currency
    )

    expect(totals.map((entry) => entry.currency)).toEqual(['XCD', 'USD'])
  })

  it('skips null amounts rather than counting them as zero', () => {
    const totals = sumByCurrency(
      [
        { amount: null, currency: 'USD' },
        { amount: 400, currency: 'USD' },
      ],
      amount,
      currency
    )

    expect(totals).toEqual([{ currency: 'USD', total: 400 }])
  })

  it('returns an empty array when no row carries an amount', () => {
    expect(sumByCurrency([{ amount: null }, { amount: null }], amount, currency)).toEqual([])
  })

  it('returns an empty array for null and undefined input', () => {
    expect(sumByCurrency(null, amount, currency)).toEqual([])
    expect(sumByCurrency(undefined, amount, currency)).toEqual([])
  })

  it('falls back when the row has no currency, and normalises case', () => {
    const totals = sumByCurrency(
      [{ amount: 100 }, { amount: 100, currency: 'usd' }, { amount: 100, currency: '' }],
      amount,
      currency
    )

    expect(totals).toEqual([{ currency: 'USD', total: 300 }])
  })

  it('honours a non-USD fallback', () => {
    expect(sumByCurrency([{ amount: 100 }], amount, currency, 'XCD')).toEqual([
      { currency: 'XCD', total: 100 },
    ])
  })
})

describe('formatMoneyTotals', () => {
  it('joins one entry per currency', () => {
    const line = formatMoneyTotals([
      { currency: 'USD', total: 1250 },
      { currency: 'XCD', total: 500 },
    ])

    expect(line).toContain('1,250.00')
    expect(line).toContain('500.00')
    expect(line).toContain(' · ')
  })

  it('returns null when there is nothing recorded', () => {
    expect(formatMoneyTotals([])).toBeNull()
  })

  it('does not return null for a genuine zero', () => {
    expect(formatMoneyTotals([{ currency: 'USD', total: 0 }])).toBe('$0.00')
  })
})

describe('isOpenCall', () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  it('is open with a future deadline', () => {
    expect(isOpenCall({ is_active: true, deadline: future })).toBe(true)
  })

  it('is open with no deadline at all', () => {
    expect(isOpenCall({ is_active: true, deadline: null })).toBe(true)
  })

  it('is closed once the deadline has passed', () => {
    expect(isOpenCall({ is_active: true, deadline: past })).toBe(false)
  })

  it('is closed when the funder switched it off, deadline notwithstanding', () => {
    expect(isOpenCall({ is_active: false, deadline: future })).toBe(false)
  })
})

describe('applicationTallies', () => {
  it('counts each status and excludes drafts from submitted', () => {
    const tallies = applicationTallies([
      { status: 'draft' },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'under_review' },
      { status: 'approved' },
      { status: 'rejected' },
    ])

    expect(tallies).toEqual({
      submitted: 5,
      pending: 2,
      under_review: 1,
      approved: 1,
      rejected: 1,
      drafts: 1,
      awaitingDecision: 3,
    })
  })

  it('returns zeroes for null and empty input', () => {
    expect(applicationTallies(null).submitted).toBe(0)
    expect(applicationTallies([]).awaitingDecision).toBe(0)
  })
})
