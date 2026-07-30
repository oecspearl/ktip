import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

const OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
]

afterEach(cleanup)

function renderSelect(value = '', onChange = vi.fn()) {
  render(
    <Select value={value} onChange={onChange} options={OPTIONS} ariaLabel="Filter by category" />
  )
  return { onChange, trigger: screen.getByRole('button', { name: 'Filter by category' }) }
}

describe('Select', () => {
  it('opens on click and commits the clicked option', async () => {
    const user = userEvent.setup()
    const { onChange, trigger } = renderSelect()

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'Healthcare' }))

    expect(onChange).toHaveBeenCalledWith('healthcare')
  })

  it('commits with the keyboard and clamps arrow keys at the ends', async () => {
    const user = userEvent.setup()
    const { onChange, trigger } = renderSelect('technology')

    // Opens on the selected option, so one step down lands on Healthcare
    await user.type(trigger, '{ArrowDown}')
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}') // clamps at the first option
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('jumps to an option by typing its first letters', async () => {
    const user = userEvent.setup()
    const { onChange, trigger } = renderSelect()

    await user.click(trigger)
    await user.keyboard('edu{Enter}')

    expect(onChange).toHaveBeenCalledWith('education')
  })

  it('closes on Escape without committing, and does not bubble it', async () => {
    const user = userEvent.setup()
    const onOuterKeyDown = vi.fn()
    const onChange = vi.fn()

    render(
      <div onKeyDown={onOuterKeyDown}>
        <Select value="" onChange={onChange} options={OPTIONS} ariaLabel="Filter by category" />
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Filter by category' }))
    expect(screen.getByRole('listbox')).toBeTruthy()

    await user.keyboard('{Escape}')

    // Unmounts only after the exit transition has had its turn
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
    expect(onOuterKeyDown).not.toHaveBeenCalled()
  })
})
