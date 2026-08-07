import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MeshFlipCell, MeshVeil, useMeshFlip } from './MeshFlip'

/**
 * jsdom runs no CSS transitions, so the close lifecycle is driven by hand:
 * either a synthetic transitionend on the .mesh-flip element or the fallback
 * settle timer under fake timers.
 *
 * It also lays nothing out: every getBoundingClientRect is 0×0, and the cell
 * refuses to measure a zero-width rect — with no flight vars the portal never
 * mounts and there is no dialog to assert on. So the tiles are given a
 * plausible box below.
 *
 * The flight and the veil are both portalled to document.body, which is
 * outside render()'s container — hence the queries here run against the body.
 */

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  )
}

function Harness({
  pinning = false,
  onPin,
  disabled = false,
}: {
  pinning?: boolean
  onPin?: (id: string) => void
  disabled?: boolean
}) {
  const mesh = useMeshFlip()
  return (
    <div>
      <MeshFlipCell
        id="b1"
        open={mesh.activeId === 'b1'}
        mounted={mesh.mountedId === 'b1'}
        onActivate={(id) => (pinning ? onPin?.(id) : mesh.open(id))}
        onClose={mesh.close}
        onSettled={mesh.settle}
        label="Night Owl"
        disabled={disabled}
        front={<span>front face</span>}
        back={() => <span>showcase content</span>}
      />
      <MeshVeil shown={!!mesh.activeId} mounted={!!mesh.mountedId} onClose={mesh.close} />
    </div>
  )
}

const frontButton = () => screen.getByRole('button', { name: /front face/ })
const veil = () => document.body.querySelector('[data-capture-hide]')
const flipEl = () => document.body.querySelector('.mesh-flip') as HTMLElement

/** Plays the reverse flight the browser would: transform transition ends. */
const settleClose = () => fireEvent.transitionEnd(flipEl(), { propertyName: 'transform' })

/** A tile as the browser would lay it out — see the note at the top. */
const CELL_RECT = { left: 40, top: 120, width: 220, height: 180 }

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...CELL_RECT,
    right: CELL_RECT.left + CELL_RECT.width,
    bottom: CELL_RECT.top + CELL_RECT.height,
    x: CELL_RECT.left,
    y: CELL_RECT.top,
    toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.style.overflow = ''
})

describe('MeshFlipCell', () => {
  it('renders the front only, no dialog and no veil', () => {
    render(<Harness />)
    expect(screen.getByText('front face')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(veil()).not.toBeInTheDocument()
  })

  it('opens on click: dialog labelled with the badge name, veil shown, body locked', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(frontButton())

    expect(screen.getByRole('dialog', { name: 'Night Owl' })).toBeInTheDocument()
    expect(screen.getByText('showcase content')).toBeInTheDocument()
    expect(frontButton()).toHaveAttribute('aria-expanded', 'true')
    expect(veil()).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('Escape closes; the dialog unmounts after the return flight and focus lands on the tile', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(frontButton())

    fireEvent.keyDown(document, { key: 'Escape' })

    // Reverse transition running: aria collapsed but the back face is still
    // mounted so the card has something to show while flying home.
    expect(frontButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    settleClose()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(frontButton()).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('veil click closes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(frontButton())

    fireEvent.click(veil()!)
    settleClose()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking the open card closes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(frontButton())

    fireEvent.click(screen.getByRole('dialog'))
    settleClose()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('falls back to the settle timer when transitionend never fires', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(frontButton())

    vi.useFakeTimers()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reduced motion: close unmounts synchronously, no transitionend needed', async () => {
    stubReducedMotion(true)
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(frontButton())
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(frontButton()).toHaveFocus()
  })

  it('pinning mode: activation goes to the pin handler, nothing opens', async () => {
    const onPin = vi.fn()
    const user = userEvent.setup()
    render(<Harness pinning onPin={onPin} />)

    await user.click(frontButton())

    expect(onPin).toHaveBeenCalledWith('b1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pinning mode: unearned tiles are disabled', () => {
    render(<Harness pinning disabled />)
    expect(frontButton()).toBeDisabled()
  })
})
