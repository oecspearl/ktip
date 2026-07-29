import { describe, it, expect } from 'vitest'
import {
  PARTNER_EMPLOYER_SELECT,
  isShareable,
  isTombstone,
  toPartnerEmployer,
  toRemovedEmployer,
  type PartnerEmployerRow,
  type PartnerWindowRow,
} from './partner-payload'

/**
 * A row carrying every internal field that must never reach the partner, so a
 * regression shows up as a failing assertion rather than as a disclosure.
 */
function row(overrides: Partial<PartnerEmployerRow> = {}): PartnerEmployerRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'castries-tech-ltd',
    legal_name: 'Castries Tech Limited',
    trading_name: 'CasTech',
    industry: 'Information Technology',
    website_url: 'https://castries.tech',
    logo_url: 'https://cdn.example/logo.png',
    description: 'Software house.',
    country_code: 'LC',
    administrative_area: 'Castries',
    locality: 'Castries',
    address_line1: '12 Bridge Street',
    address_line2: '  ',
    postal_code: 'LC04 101',
    contact_email: 'hr@castries.tech',
    contact_email_verified_at: '2026-06-01T10:00:00Z',
    verification_status: 'verified',
    verification_method: 'document_review',
    registration_number: 'LC-2019-004412',
    verified_at: '2026-06-02T09:30:00Z',
    document_count: 2,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-06-02T09:30:00Z',
    country: { code: 'LC', name: 'Saint Lucia' },
    ...overrides,
  }
}

describe('toPartnerEmployer', () => {
  it('nests the address under its country', () => {
    const out = toPartnerEmployer(row())
    expect(out.address.country).toEqual({ code: 'LC', name: 'Saint Lucia' })
    expect(out.address.administrative_area).toBe('Castries')
    expect(out.address.line1).toBe('12 Bridge Street')
    expect(out.address.postal_code).toBe('LC04 101')
  })

  it('keeps the country code when the join returns no parent row', () => {
    const out = toPartnerEmployer(row({ country: null }))
    expect(out.address.country).toEqual({ code: 'LC', name: null })
  })

  it('reports verification evidence without exposing it', () => {
    const out = toPartnerEmployer(row())
    expect(out.verification).toEqual({
      status: 'verified',
      method: 'document_review',
      verified_at: '2026-06-02T09:30:00Z',
      registration_number: 'LC-2019-004412',
      evidence_document_count: 2,
    })
  })

  it('withholds the contact email until the address is confirmed', () => {
    const out = toPartnerEmployer(row({ contact_email_verified_at: null }))
    expect(out.contact_email).toBeNull()
    expect(out.contact_email_verified).toBe(false)

    const verified = toPartnerEmployer(row())
    expect(verified.contact_email).toBe('hr@castries.tech')
    expect(verified.contact_email_verified).toBe(true)
  })

  it('normalises whitespace-only optional fields to null', () => {
    const out = toPartnerEmployer(row({ trading_name: '   ', industry: '' }))
    expect(out.address.line2).toBeNull()
    expect(out.trading_name).toBeNull()
    expect(out.industry).toBeNull()
  })

  it('emits no skills field', () => {
    expect('skills' in toPartnerEmployer(row())).toBe(false)
  })

  // The point of the whole module.
  it('never emits internal fields, even when the row carries them', () => {
    const leaky = {
      ...row(),
      verification_note: 'Registry lookup inconclusive, accepted on invoice.',
      document_paths: ['abc/incorporation.pdf', 'abc/utility-bill.jpg'],
      verified_by: '99999999-9999-4999-8999-999999999999',
      created_by: '88888888-8888-4888-8888-888888888888',
      contact_phone: '+1-758-555-0100',
      share_externally: true,
      admin_note: 'do not contact directly',
    } as PartnerEmployerRow

    const serialised = JSON.stringify(toPartnerEmployer(leaky))

    for (const forbidden of [
      'verification_note',
      'document_paths',
      'incorporation.pdf',
      'utility-bill.jpg',
      'verified_by',
      'created_by',
      'contact_phone',
      '555-0100',
      'share_externally',
      'admin_note',
      'do not contact directly',
      '99999999-9999-4999-8999-999999999999',
    ]) {
      expect(serialised).not.toContain(forbidden)
    }
  })

  it('keeps the SELECT list and the internal denylist in agreement', () => {
    for (const forbidden of [
      'verification_note',
      'document_paths',
      'verified_by',
      'created_by',
      'contact_phone',
      'share_externally',
    ]) {
      expect(PARTNER_EMPLOYER_SELECT).not.toContain(forbidden)
    }
    // document_count is the generated stand-in for document_paths.
    expect(PARTNER_EMPLOYER_SELECT).toContain('document_count')
  })
})

describe('feed gating', () => {
  const win = (o: Partial<PartnerWindowRow> = {}): PartnerWindowRow => ({
    id: 'a',
    slug: 'a',
    verification_status: 'verified',
    share_externally: true,
    verified_at: '2026-06-02T09:30:00Z',
    updated_at: '2026-06-02T09:30:00Z',
    ...o,
  })

  it('requires both verification and consent', () => {
    expect(isShareable(win())).toBe(true)
    expect(isShareable(win({ share_externally: false }))).toBe(false)
    expect(isShareable(win({ verification_status: 'pending' }))).toBe(false)
  })

  it('tombstones a row that was verified and no longer qualifies', () => {
    expect(isTombstone(win({ verification_status: 'revoked' }))).toBe(true)
    expect(isTombstone(win({ share_externally: false }))).toBe(true)
  })

  it('does not tombstone a row the partner never received', () => {
    // Rejected before it was ever verified — the partner has nothing to delete,
    // and announcing it would leak the existence of a failed application.
    expect(isTombstone(win({ verification_status: 'rejected', verified_at: null }))).toBe(false)
    expect(isTombstone(win())).toBe(false)
  })
})

describe('toRemovedEmployer', () => {
  it('is a tombstone carrying no employer data', () => {
    const out = toRemovedEmployer({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'castries-tech-ltd',
      updated_at: '2026-07-01T00:00:00Z',
    })
    expect(out).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'castries-tech-ltd',
      removed: true,
      updated_at: '2026-07-01T00:00:00Z',
    })
    expect(Object.keys(out)).toHaveLength(4)
  })
})
