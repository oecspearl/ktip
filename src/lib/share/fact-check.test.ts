import { describe, expect, it } from 'vitest'
import { numbersIn, unmatchedNumbers } from './fact-check'

const grant = {
  name: 'OECS Green Enterprise Fund, Round 3',
  maximum_award: 'EC$50,000',
  applications_close: '15 January 2027',
}

describe('numbersIn', () => {
  it('reads thousands written the English, French and Spanish ways as one number', () => {
    expect(numbersIn('EC$50,000')).toEqual(['50000'])
    expect(numbersIn('50 000 EC$')).toEqual(['50000'])
    expect(numbersIn('50 000 EC$')).toEqual(['50000'])
    expect(numbersIn('50.000 EC$')).toEqual(['50000'])
  })

  it('keeps separate numbers apart and drops leading zeros', () => {
    expect(numbersIn('4–6 Dec, teams of 2 to 5')).toEqual(['4', '6', '2', '5'])
    expect(numbersIn('2026-12-04')).toEqual(['2026', '12', '4'])
  })
})

describe('unmatchedNumbers', () => {
  it('passes a draft whose every number is in the record', () => {
    expect(unmatchedNumbers('Up to EC$50,000. Closes 15 January 2027.', grant)).toEqual([])
  })

  it('passes a French draft with a translated month and a spaced amount', () => {
    expect(unmatchedNumbers("Jusqu'à 50 000 EC$, clôture le 15 janvier 2027.", grant)).toEqual([])
  })

  it('lets a numeric date stand in for a named month', () => {
    expect(unmatchedNumbers('Closes 15/01/2027', grant)).toEqual([])
  })

  it('flags an invented amount and an invented time once each', () => {
    expect(unmatchedNumbers('Up to EC$60,000, info session at 10am, 10 spots', grant)).toEqual([
      '60000',
      '10',
    ])
  })

  it('passes a draft with no numbers at all', () => {
    expect(unmatchedNumbers('Small businesses, this one is for you.', grant)).toEqual([])
  })
})
