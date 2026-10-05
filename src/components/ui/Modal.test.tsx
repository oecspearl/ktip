import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Modal } from './Modal'

/**
 * The video player opens over a grant application that is itself in a Modal.
 * React bubbles events along the component tree, portals included, so the
 * inner dialog's Escape used to reach the outer one too — and the inner one
 * closing used to clear the body scroll lock the outer one still needed.
 */
function Stacked() {
  const [outer, setOuter] = useState(true)
  const [inner, setInner] = useState(false)
  return (
    <Modal open={outer} onClose={() => setOuter(false)} title="Outer">
      <button type="button" onClick={() => setInner(true)}>
        Open inner
      </button>
      <Modal open={inner} onClose={() => setInner(false)} title="Inner">
        <p>Inner body</p>
      </Modal>
    </Modal>
  )
}

describe('Modal stacking', () => {
  it('closes only the top dialog on Escape', () => {
    render(<Stacked />)
    fireEvent.click(screen.getByText('Open inner'))
    expect(screen.getByRole('dialog', { name: 'Inner' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByText('Inner body'), { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByText('Open inner'), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Outer' })).not.toBeInTheDocument()
  })

  it('keeps the page scroll-locked until the last dialog closes', () => {
    render(<Stacked />)
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByText('Open inner'))
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(screen.getByText('Inner body'), { key: 'Escape' })
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(screen.getByText('Open inner'), { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
  })
})
