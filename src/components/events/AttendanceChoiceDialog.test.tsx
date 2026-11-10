import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AttendanceChoiceDialog } from './AttendanceChoiceDialog'

function setup(props: Partial<Parameters<typeof AttendanceChoiceDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <AttendanceChoiceDialog
      open
      onClose={onClose}
      onConfirm={onConfirm}
      participantFull={false}
      hasChallenge
      {...props}
    />
  )
  return { onConfirm, onClose }
}

describe('AttendanceChoiceDialog', () => {
  it('asks the question and defaults to taking part', () => {
    const { onConfirm } = setup()
    expect(screen.getByRole('dialog', { name: 'How do you want to attend?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onConfirm).toHaveBeenCalledWith('participant')
  })

  it('returns spectator when that is picked', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByLabelText(/Spectator/))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onConfirm).toHaveBeenCalledWith('viewer')
  })

  it('leaves only spectating open when participant places are gone', () => {
    const { onConfirm } = setup({ participantFull: true })
    expect(screen.getByLabelText(/Participant/)).toBeDisabled()
    expect(screen.getByText('All participant places are taken.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onConfirm).toHaveBeenCalledWith('viewer')
  })

  it('uses the non-competition wording when there is no challenge', () => {
    setup({ hasChallenge: false })
    expect(screen.getByText('Watch and listen from the audience.')).toBeInTheDocument()
  })

  it('cancel closes without choosing', () => {
    const { onConfirm, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
