import { describe, expect, it } from 'vitest'
import { eventHeroDetails, grantHeroDetails, projectHeroDetails } from './hero-details'
import type { Event, Grant, Project } from '../types'

// Local-midday timestamps: `format` renders in the runner's zone, so a UTC
// midnight would slide to the previous day west of Greenwich.

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    id: 'g1',
    title: 'EdTech Caribbean Accelerator Grant',
    description: null,
    summary: null,
    amount_min: 10000,
    amount_max: 30000,
    currency: 'USD',
    deadline: '2026-10-14T12:00:00',
    eligibility: 'Ed-tech startups with at least an MVP. Must have a Caribbean co-founder.',
    application_url: null,
    grant_type: 'education',
    tags: [],
    is_active: true,
    is_climate_action: false,
    details: [],
    created_by: null,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('grantHeroDetails', () => {
  it('groups type, amount and deadline, then the eligibility sentence', () => {
    const [funding, eligibility] = grantHeroDetails(grant())

    expect(funding.label).toBe('Funding')
    expect(funding.items?.map((i) => [i.label, i.value])).toEqual([
      ['Type', 'Education'],
      ['Amount', '$10,000.00 – $30,000.00'],
      ['Deadline', 'Oct 14, 2026'],
    ])
    // Only the first sentence — hero rows are not clamped by DetailsList
    expect(eligibility).toEqual({
      id: 'd-eligibility',
      label: 'Eligibility',
      value: 'Ed-tech startups with at least an MVP.',
    })
  })

  it('takes the "Up to" branch when there is no minimum', () => {
    const [funding] = grantHeroDetails(grant({ amount_min: null }))
    expect(funding.items?.find((i) => i.label === 'Amount')?.value).toBe('Up to $30,000.00')
  })

  it('skips fields the record does not have', () => {
    const rows = grantHeroDetails(
      grant({ grant_type: null, amount_min: null, amount_max: null, deadline: null })
    )
    expect(rows.map((r) => r.label)).toEqual(['Eligibility'])
  })

  it('returns nothing when there is nothing to derive', () => {
    expect(
      grantHeroDetails(
        grant({
          grant_type: null,
          amount_min: null,
          amount_max: null,
          deadline: null,
          eligibility: null,
        })
      )
    ).toEqual([])
  })

  it('ignores an unparseable deadline rather than rendering "Invalid Date"', () => {
    const [funding] = grantHeroDetails(grant({ deadline: 'not-a-date' }))
    expect(funding.items?.some((i) => i.label === 'Deadline')).toBe(false)
  })
})

describe('projectHeroDetails', () => {
  const project = {
    id: 'p1',
    title: 'AgriSense',
    category: 'agriculture',
    phase: 'prototype',
    is_climate_action: true,
    owner: { display_name: 'Tariq Joseph' },
  } as unknown as Project

  it('labels category and phase from the shared vocabularies', () => {
    const [group, lead] = projectHeroDetails(project)
    expect(group.items?.map((i) => [i.label, i.value])).toEqual([
      ['Category', 'Agriculture'],
      ['Phase', 'Prototype'],
      ['Focus', 'Climate action'],
    ])
    expect(lead.value).toBe('Tariq Joseph')
  })

  it('drops Focus for non-climate projects and Lead when the owner is not joined', () => {
    const rows = projectHeroDetails({
      ...project,
      is_climate_action: false,
      owner: undefined,
    } as Project)
    expect(rows.map((r) => r.label)).toEqual(['Project'])
    expect(rows[0].items?.map((i) => i.label)).toEqual(['Category', 'Phase'])
  })
})

describe('eventHeroDetails', () => {
  const event = {
    id: 'e1',
    title: 'Blue Economy Hack',
    event_type: 'hackathon',
    start_date: '2026-09-01T12:00:00',
    end_date: '2026-09-03T12:00:00',
    location: 'Castries, Saint Lucia',
    is_virtual: false,
    capacity: 120,
  } as unknown as Event

  it('renders a date range, place and capacity', () => {
    const [group, capacity] = eventHeroDetails(event)
    expect(group.items?.map((i) => [i.label, i.value])).toEqual([
      ['Type', 'Hackathon'],
      ['When', 'Sep 1, 2026 – Sep 3, 2026'],
      ['Where', 'Castries, Saint Lucia'],
    ])
    expect(capacity.value).toBe('120 seats')
  })

  it('collapses a single-day event and falls back to Virtual', () => {
    const [group] = eventHeroDetails({
      ...event,
      end_date: '2026-09-01T12:00:00',
      location: null,
      is_virtual: true,
      capacity: null,
    } as Event)
    expect(group.items?.map((i) => [i.label, i.value])).toEqual([
      ['Type', 'Hackathon'],
      ['When', 'Sep 1, 2026'],
      ['Where', 'Virtual'],
    ])
  })
})
