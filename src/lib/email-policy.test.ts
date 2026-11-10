import { describe, expect, it } from 'vitest'
import { looksLikeSchoolDomain, looksLikeSchoolEmail, secondaryEmailProblem } from './email-policy'

describe('looksLikeSchoolDomain', () => {
  it('matches the academic shapes migration 204 matches', () => {
    for (const domain of ['my.uwi.edu', 'salcc.edu.lc', 'Stmarys.Edu.Gd', 'ox.ac.uk', 'hill.sch.uk', 'pupils.k12.ny.us']) {
      expect(looksLikeSchoolDomain(domain), domain).toBe(true)
    }
  })

  it('leaves everything else alone', () => {
    for (const domain of ['gmail.com', 'oecs.int', 'gov.lc', 'education.gov.lc', 'edu.example.com', 'medu.com']) {
      expect(looksLikeSchoolDomain(domain), domain).toBe(false)
    }
  })

  it('reads the domain off an address', () => {
    expect(looksLikeSchoolEmail(' Pupil@SALCC.edu.lc ')).toBe(true)
    expect(looksLikeSchoolEmail('pupil@gmail.com')).toBe(false)
    expect(looksLikeSchoolEmail('no-at-sign')).toBe(false)
  })
})

describe('secondaryEmailProblem', () => {
  const check = (primary: string, secondary: string, flags: { primarySchool?: boolean; secondarySchool?: boolean } = {}) =>
    secondaryEmailProblem({ primary, secondary, ...flags })

  it('requires a secondary', () => {
    expect(check('a@gmail.com', '')).toBe('missing')
    expect(check('a@gmail.com', '   ')).toBe('missing')
  })

  it('requires a well-formed, different address', () => {
    expect(check('a@gmail.com', 'nope')).toBe('invalid')
    expect(check('a@gmail.com', ' A@Gmail.com ')).toBe('same')
  })

  it('accepts two personal addresses', () => {
    expect(check('a@gmail.com', 'b@outlook.com')).toBeUndefined()
  })

  it('accepts one school and one personal, either way round', () => {
    expect(check('a@salcc.edu.lc', 'a@gmail.com')).toBeUndefined()
    expect(check('a@gmail.com', 'a@salcc.edu.lc')).toBeUndefined()
  })

  it('refuses two school addresses', () => {
    expect(check('a@salcc.edu.lc', 'a@my.uwi.edu')).toBe('both_school')
  })

  it('takes the server’s word for domains the shape test cannot see', () => {
    // stjoseph.lc is only school because an institution lists it.
    expect(check('a@stjoseph.lc', 'a@my.uwi.edu')).toBeUndefined()
    expect(check('a@stjoseph.lc', 'a@my.uwi.edu', { primarySchool: true })).toBe('both_school')
    expect(check('a@my.uwi.edu', 'a@stjoseph.lc', { secondarySchool: true })).toBe('both_school')
  })
})
