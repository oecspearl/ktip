import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { SentryStatsPeriod } from '../../../types/sentry'
import { StatsPeriodSelect } from './StatsPeriodSelect'

afterEach(cleanup)

function ControlledPeriodSelect() {
  const [period, setPeriod] = useState<SentryStatsPeriod>('14d')
  return <StatsPeriodSelect value={period} onChange={setPeriod} />
}

describe('StatsPeriodSelect', () => {
  it('can change its controlled value repeatedly', async () => {
    const user = userEvent.setup()
    render(<ControlledPeriodSelect />)

    const select = screen.getByRole('combobox', { name: 'Time period' }) as HTMLSelectElement
    await user.selectOptions(select, '24h')
    expect(select.value).toBe('24h')

    await user.selectOptions(select, '30d')
    expect(select.value).toBe('30d')
  })
})
