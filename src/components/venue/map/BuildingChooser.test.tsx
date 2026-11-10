import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BuildingChooser } from './BuildingChooser'
import { SCRATCH_BUILDING, planBuilding } from '../../../lib/venue-building'

function setup(value: string, scratchFloors = 1) {
  const onChange = vi.fn()
  const onShuffle = vi.fn()
  const onScratchFloorsChange = vi.fn()
  render(
    <BuildingChooser
      eventType="hackathon"
      value={value}
      onChange={onChange}
      scratchFloors={scratchFloors}
      onScratchFloorsChange={onScratchFloorsChange}
      plan={planBuilding(value, scratchFloors, 9, 'hackathon')}
      onShuffle={onShuffle}
    />
  )
  return { onChange, onShuffle, onScratchFloorsChange }
}

describe('BuildingChooser', () => {
  it('puts the hackathon buildings first and marks the one picked', () => {
    setup('hackathon-tower')
    const cards = screen.getAllByRole('button', { pressed: true })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('Hackathon Tower')
    expect(screen.getAllByText('5 floors, 28 rooms').length).toBeGreaterThan(0)
  })

  it('re-rolls a laid-out building', () => {
    const { onShuffle } = setup('hackathon-tower')
    fireEvent.click(screen.getByRole('button', { name: /Shuffle layout/ }))
    expect(onShuffle).toHaveBeenCalled()
  })

  it('has nothing to shuffle on a fixed single-floor layout', () => {
    setup('hackathon-hq')
    expect(screen.queryByRole('button', { name: /Shuffle layout/ })).toBeNull()
  })

  it('offers from scratch with a floor count', () => {
    const { onChange, onScratchFloorsChange } = setup('hackathon-tower')
    fireEvent.click(screen.getByRole('button', { name: /From scratch/ }))
    expect(onChange).toHaveBeenCalledWith(SCRATCH_BUILDING)
    expect(screen.queryByRole('combobox')).toBeNull()

    document.body.innerHTML = ''
    const next = setup(SCRATCH_BUILDING, 3)
    expect(screen.getByText('3 floors')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } })
    expect(next.onScratchFloorsChange).toHaveBeenCalledWith(5)
    expect(onScratchFloorsChange).not.toHaveBeenCalled()
  })
})
