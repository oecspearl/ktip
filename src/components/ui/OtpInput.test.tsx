import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { OtpInput } from './OtpInput'

afterEach(cleanup)

/** Controlled wrapper — the component takes value/onChange, as its callers do. */
function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <OtpInput label="Verification code" value={value} onChange={setValue} onComplete={onComplete} />
  )
}

describe('OtpInput', () => {
  it('carries the attributes that make phone autofill work', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Verification code')
    // autoComplete="one-time-code" is what lets iOS Safari offer the code
    // straight from the Mail notification. Losing it is invisible in a browser
    // and very visible on a phone.
    expect(input.getAttribute('autocomplete')).toBe('one-time-code')
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('maxlength')).toBe('6')
  })

  it('keeps digits only', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Verification code') as HTMLInputElement

    await user.type(input, '1a2b3c')
    expect(input.value).toBe('123')
  })

  it('accepts a pasted code with the surrounding words', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    const input = screen.getByLabelText('Verification code') as HTMLInputElement

    await user.click(input)
    await user.paste('Your code is 123 456')

    expect(input.value).toBe('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('auto-submits exactly once', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    const input = screen.getByLabelText('Verification code')

    await user.type(input, '123456')
    // The parent is a mutation. Firing twice would double-spend an attempt
    // against the rate limiter, which is what the completion ref guards.
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('re-arms after the value is cleared, so a retry still submits', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    const input = screen.getByLabelText('Verification code')

    await user.type(input, '123456')
    await user.clear(input)
    await user.type(input, '654321')

    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith('654321')
  })
})
