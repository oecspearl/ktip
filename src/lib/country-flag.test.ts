import { describe, expect, it } from 'vitest'
import { countryCode, countryFlagUrl } from './country-flag'
import { OECS_COUNTRIES, WIDER_CARIBBEAN_COUNTRIES } from './countries'

describe('countryCode', () => {
  it('knows every OECS state', () => {
    for (const country of OECS_COUNTRIES) {
      expect(countryCode(country), `${country} must have a flag`).toBeTruthy()
    }
  })

  it('knows every wider-Caribbean country the form offers', () => {
    for (const country of WIDER_CARIBBEAN_COUNTRIES) {
      expect(countryCode(country), `${country} must have a flag`).toBeTruthy()
    }
  })

  it('returns null rather than guessing for a country we carry no flag for', () => {
    expect(countryCode('Kazakhstan')).toBeNull()
    expect(countryCode('Wakanda')).toBeNull()
  })

  it('is null-safe on an empty profile field', () => {
    expect(countryCode(null)).toBeNull()
    expect(countryCode(undefined)).toBeNull()
    expect(countryCode('')).toBeNull()
    expect(countryCode('   ')).toBeNull()
  })

  it('tolerates the whitespace and casing free text carries', () => {
    expect(countryCode('  Saint Lucia ')).toBe('lc')
    expect(countryCode('saint lucia')).toBe('lc')
    expect(countryCode('TRINIDAD AND TOBAGO')).toBe('tt')
  })

  it('keeps the accented spelling the country list uses', () => {
    expect(countryCode('Curaçao')).toBe('cw')
  })
})

describe('countryFlagUrl', () => {
  it('points at the vendored SVG', () => {
    expect(countryFlagUrl('Saint Lucia')).toBe('/flags/lc.svg')
  })

  it('is null for an unknown country, so nothing renders a broken image', () => {
    expect(countryFlagUrl('Kazakhstan')).toBeNull()
  })
})
