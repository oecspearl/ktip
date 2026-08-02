import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Stepper } from './Stepper'

const STEPS = ['Business type', 'Business detail', 'Your details', 'Verification']

afterEach(cleanup)

/** The <li> for a step, which is where aria-current lives. */
function itemFor(label: string) {
  return screen.getByText(label).closest('li') as HTMLElement
}

describe('Stepper', () => {
  it('marks only the current step with aria-current', () => {
    render(<Stepper steps={STEPS} currentStep={1} />)

    expect(itemFor('Business detail').getAttribute('aria-current')).toBe('step')
    expect(itemFor('Business type').getAttribute('aria-current')).toBeNull()
    expect(itemFor('Your details').getAttribute('aria-current')).toBeNull()
  })

  it('renders a step per entry and keeps their order', () => {
    render(<Stepper steps={STEPS} currentStep={0} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0].textContent).toContain('Business type')
    expect(items[3].textContent).toContain('Verification')
  })

  it('only lets you click back to a completed step', async () => {
    const user = userEvent.setup()
    const onStepClick = vi.fn()
    render(<Stepper steps={STEPS} currentStep={2} onStepClick={onStepClick} />)

    // Completed — goes through
    await user.click(screen.getByText('Business type'))
    expect(onStepClick).toHaveBeenCalledWith(0)

    onStepClick.mockClear()

    // The current step and anything ahead of it are disabled buttons
    await user.click(screen.getByText('Your details'))
    await user.click(screen.getByText('Verification'))
    expect(onStepClick).not.toHaveBeenCalled()
  })

  it('is not interactive without onStepClick', async () => {
    const user = userEvent.setup()
    render(<Stepper steps={STEPS} currentStep={3} />)

    // Nothing throws, nothing is enabled
    await user.click(screen.getByText('Business type'))
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('terminal="complete" retires the current step rather than leaving it in progress', () => {
    const { container } = render(
      <Stepper steps={STEPS} currentStep={3} terminal="complete" />
    )

    // No step is "here" any more once the run has finished
    expect(container.querySelector('[aria-current="step"]')).toBeNull()
  })

  it('terminal="rejected" paints the reached step red', () => {
    render(<Stepper steps={STEPS} currentStep={3} terminal="rejected" />)

    expect(itemFor('Verification').innerHTML).toContain('red-500')
    // Earlier steps stay on the normal completed treatment
    expect(itemFor('Business type').innerHTML).not.toContain('red-500')
  })

  it('renders a sublabel when one is given', () => {
    render(
      <Stepper
        steps={[{ label: 'Submitted', sublabel: 'Mar 3, 2026' }, 'Under review']}
        currentStep={1}
      />
    )

    expect(screen.getByText('Mar 3, 2026')).toBeTruthy()
  })

  it('compact drops the labels and the buttons, keeping the bars', () => {
    render(<Stepper steps={STEPS} currentStep={1} variant="compact" />)

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByText('Business type')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
