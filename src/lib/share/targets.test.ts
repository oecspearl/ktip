import { describe, expect, it } from 'vitest'
import { eventTarget, fit, grantTarget, MESSAGE_BUDGET, orgTarget } from './targets'

describe('fit', () => {
  it('joins parts and skips empty ones', () => {
    expect(fit(['One.', null, 'Two.'])).toBe('One. Two.')
  })

  it('trims at a word and stays inside the budget', () => {
    const out = fit(['word '.repeat(100)])
    expect([...out].length).toBeLessThanOrEqual(MESSAGE_BUDGET)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/wor…$/)
  })
})

describe('templates', () => {
  it('writes a grant with its range and deadline', () => {
    const g = grantTarget(
      {
        id: 'g1',
        title: 'Green Fund',
        summary: 'For small firms. More text here.',
        amount_min: 10000,
        amount_max: 50000,
        currency: 'XCD',
        deadline: '2027-01-15T16:00:00Z',
      },
      'https://ktip.oecs.int/grants/green-fund'
    )
    expect(g.message).toBe(
      'Green Fund is open for applications. EC$10,000 to EC$50,000 available. Applications close 15 January. For small firms.'
    )
  })

  it('writes an online-and-in-person event', () => {
    const e = eventTarget(
      {
        id: 'e1',
        title: 'Climate Hack',
        summary: null,
        start_date: '2026-12-04T14:00:00Z',
        end_date: '2026-12-06T20:00:00Z',
        is_virtual: true,
        location: 'Castries',
      },
      'https://ktip.oecs.int/events/climate-hack'
    )
    expect(e.message).toBe('Climate Hack: 4–6 December. Online and in Castries.')
  })

  it("does not treat \"Virtual\" in the location field as a place", () => {
    const e = eventTarget(
      {
        id: "e2",
        title: "Five-Floor Venue",
        summary: null,
        start_date: "2026-12-04T14:00:00Z",
        end_date: null,
        is_virtual: true,
        location: "Virtual",
      },
      "https://ktip.oecs.int/events/five-floor"
    )
    expect(e.message).toBe("Five-Floor Venue: 4 December. Online.")
  })

  it('names a business by its trading name', () => {
    const o = orgTarget(
      { slug: 'irf', legal_name: 'IRF Ltd', trading_name: 'Island Root Foods', industry: 'Food', description: null },
      'https://ktip.oecs.int/org/irf'
    )
    expect(o.id).toBe('irf')
    expect(o.message).toBe('Island Root Foods (Food) is verified on KTIP.')
  })
})
