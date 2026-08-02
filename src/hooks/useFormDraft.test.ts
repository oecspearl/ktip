import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { clearDraft, readDraft, useFormDraft } from './useFormDraft'

const KEY = 'ktip:test:draft'

beforeEach(() => sessionStorage.clear())
afterEach(() => sessionStorage.clear())

describe('useFormDraft', () => {
  it('writes the value so a later read gets it back', () => {
    renderHook(() => useFormDraft(KEY, { title: 'Climathon', capacity: 40 }))

    expect(readDraft<{ title: string; capacity: number }>(KEY)).toEqual({
      title: 'Climathon',
      capacity: 40,
    })
  })

  it('overwrites rather than merging, so a cleared field stays cleared', () => {
    const { rerender } = renderHook(({ value }) => useFormDraft(KEY, value), {
      initialProps: { value: { title: 'Climathon', summary: 'A weekend' } as Record<string, unknown> },
    })

    rerender({ value: { title: 'Climathon', summary: '' } })

    expect(readDraft(KEY)).toEqual({ title: 'Climathon', summary: '' })
  })

  it('clear() removes the draft', () => {
    const { result } = renderHook(() => useFormDraft(KEY, { title: 'Climathon' }))
    expect(readDraft(KEY)).toEqual({ title: 'Climathon' })

    result.current.clear()

    expect(readDraft(KEY)).toEqual({})
  })
})

describe('readDraft', () => {
  it('returns an empty object when nothing was stored', () => {
    expect(readDraft('ktip:test:absent')).toEqual({})
  })

  it('does not throw on a value that is not JSON', () => {
    sessionStorage.setItem(KEY, 'not json {{{')
    expect(readDraft(KEY)).toEqual({})
  })

  it('refuses a stored value that is not a plain object', () => {
    // Something else owning the key, or an older shape of this form
    sessionStorage.setItem(KEY, JSON.stringify(['a', 'b']))
    expect(readDraft(KEY)).toEqual({})

    sessionStorage.setItem(KEY, JSON.stringify('a string'))
    expect(readDraft(KEY)).toEqual({})

    sessionStorage.setItem(KEY, JSON.stringify(null))
    expect(readDraft(KEY)).toEqual({})
  })
})

describe('clearDraft', () => {
  it('is a no-op when there is nothing to clear', () => {
    expect(() => clearDraft('ktip:test:absent')).not.toThrow()
  })
})
