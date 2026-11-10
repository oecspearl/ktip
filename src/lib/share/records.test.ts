import { describe, expect, it } from 'vitest'
import {
  eventRecord,
  formatAward,
  formatDayRange,
  grantRecord,
  isShareable,
  orgRecord,
  plainText,
  projectRecord,
} from './records'

describe('formatDayRange', () => {
  it('reads dates in OECS time, not UTC', () => {
    // 02:00 UTC on the 5th is still the 4th in Castries.
    expect(formatDayRange('2026-12-05T02:00:00Z', null)).toBe('4 December 2026')
  })

  it('shortens a range inside one month, and spans months and years', () => {
    expect(formatDayRange('2026-12-04T14:00:00Z', '2026-12-06T20:00:00Z')).toBe('4–6 December 2026')
    expect(formatDayRange('2026-11-30T14:00:00Z', '2026-12-02T20:00:00Z')).toBe('30 November – 2 December 2026')
    expect(formatDayRange('2026-12-31T14:00:00Z', '2027-01-02T20:00:00Z')).toBe(
      '31 December 2026 – 2 January 2027'
    )
  })
})

describe('formatAward', () => {
  it('writes ranges, ceilings and floors with the EC$ prefix for XCD', () => {
    expect(formatAward(10000, 50000, 'XCD')).toBe('EC$10,000 to EC$50,000')
    expect(formatAward(null, 50000, 'XCD')).toBe('Up to EC$50,000')
    expect(formatAward(5000, null, 'USD')).toBe('From US$5,000')
    expect(formatAward(null, 2000, 'BBD')).toBe('Up to BBD 2,000')
    expect(formatAward(null, null, 'XCD')).toBeNull()
  })
})

describe('plainText', () => {
  it('strips HTML and Markdown, and cuts long text at a word', () => {
    expect(plainText('<p>Hello <b>there</b> &amp; welcome</p><p>**Two**</p>')).toBe('Hello there & welcome\nTwo')
    expect(plainText('one two three four', 9)).toBe('one two…')
    expect(plainText('   ')).toBeNull()
  })
})

describe('record builders', () => {
  it('keeps an event to public, readable fields', () => {
    const r = eventRecord({
      title: 'Climate Hack',
      event_type: 'hackathon',
      start_date: '2026-12-04T14:00:00Z',
      end_date: '2026-12-06T20:00:00Z',
      is_virtual: true,
      location: 'Castries',
      registration_fields: [{ secret: true }],
      organizer_id: 'abc',
      capacity: null,
    })
    expect(r).toEqual({
      type: 'Hackathon',
      name: 'Climate Hack',
      dates: '4–6 December 2026',
      where: 'Online, and in person at Castries',
    })
  })

  it('never passes a grant contact or document field through', () => {
    const r = grantRecord({
      title: 'Green Fund',
      amount_max: 50000,
      currency: 'XCD',
      deadline: '2027-01-15T12:00:00Z',
      application_url: 'https://example.com/apply',
      required_documents: [{ name: 'Tax ID' }],
      funding_type: 'grant',
    })
    expect(r).toEqual({
      type: 'Funding (grant)',
      name: 'Green Fund',
      award: 'Up to EC$50,000',
      applications_close: '15 January 2027',
    })
  })

  it('leaves out a one-person team size and keeps the stage', () => {
    expect(projectRecord({ title: 'Sense', phase: 'prototype', member_count: 1 })).toEqual({
      type: 'Project',
      name: 'Sense',
      stage: 'Prototype',
    })
  })

  it('names a business by its trading name and never includes contact details', () => {
    const r = orgRecord({
      legal_name: 'IRF Ltd',
      trading_name: 'Island Root Foods',
      contact_email: 'owner@example.com',
      contact_phone: '+1 473 555 0100',
      country_code: 'GD',
    })
    expect(r.name).toBe('Island Root Foods')
    expect(r.based_in).toBe('Grenada')
    expect(JSON.stringify(r)).not.toContain('example.com')
    expect(JSON.stringify(r)).not.toContain('555')
  })
})

describe('isShareable', () => {
  it('allows only live, public items', () => {
    expect(isShareable('event', { status: 'published' })).toBe(true)
    expect(isShareable('event', { status: 'draft' })).toBe(false)
    expect(isShareable('event', { status: 'published', moderation_status: 'quarantined' })).toBe(false)
    expect(isShareable('grant', { is_active: true })).toBe(true)
    expect(isShareable('grant', { is_active: true, moderation_status: 'suspended' })).toBe(false)
    expect(isShareable('project', { is_public: false })).toBe(false)
    expect(isShareable('project', { is_public: true, status: 'removed' })).toBe(false)
    expect(isShareable('org', { verification_status: 'pending' })).toBe(false)
  })
})
